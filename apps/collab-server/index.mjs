import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { WebSocketServer } from "ws";
import { setupWSConnection, getYDoc, setContentInitializor, docs } from "y-websocket/bin/utils";
import { jwtVerify } from "jose";
import { createClient } from "redis";

// y-websocket itself owns the Yjs document instance. Resolve both protocol
// packages from that package to avoid loading a second Yjs constructor.
const websocketRequire = createRequire(new URL("../../node_modules/y-websocket/package.json", import.meta.url));
const Y = websocketRequire("yjs");
const awarenessProtocol = websocketRequire("y-protocols/awareness");

const port = Number(process.env.COLLABORATION_PORT || 1234);
const secret = new TextEncoder().encode(process.env.AUTH_SECRET);
const allowedOrigins = new Set((process.env.COLLABORATION_ALLOWED_ORIGINS || process.env.NEXTAUTH_URL || "").split(",").map((origin) => origin.trim().replace(/\/$/, "")).filter(Boolean));
const replicationEnabled = process.env.COLLABORATION_REDIS_ENABLED !== "false" && Boolean(process.env.REDIS_URL);
const replicaId = process.env.COLLABORATION_INSTANCE_ID || randomUUID();
const streamLimit = Math.max(1000, Number(process.env.COLLABORATION_REDIS_STREAM_MAXLEN || 10000));
const updateChannel = "rocket-workspace:collab:updates";
const awarenessChannel = "rocket-workspace:collab:awareness";
const streamKey = (room) => `rocket-workspace:collab:stream:${room}`;
const redisOrigin = Symbol("redis-replication");
const replayOrigin = Symbol("redis-replay");
const configuredDocs = new WeakSet();
let publisher = null;
let subscriber = null;

async function configureRedisReplication() {
  if (!replicationEnabled) return;
  try {
    publisher = createClient({ url: process.env.REDIS_URL });
    subscriber = publisher.duplicate();
    publisher.on("error", (error) => console.error("Collaboration Redis publisher error", error.message));
    subscriber.on("error", (error) => console.error("Collaboration Redis subscriber error", error.message));
    await Promise.all([publisher.connect(), subscriber.connect()]);
    await subscriber.subscribe(updateChannel, applyRemoteUpdate);
    await subscriber.subscribe(awarenessChannel, applyRemoteAwareness);
    console.log(`Collaboration Redis replication enabled (${replicaId})`);
  } catch (error) {
    console.error("Collaboration Redis replication unavailable; using this instance only", error instanceof Error ? error.message : error);
    await Promise.allSettled([publisher?.disconnect(), subscriber?.disconnect()]);
    publisher = null; subscriber = null;
  }
}

function publish(channel, payload) {
  if (!publisher) return;
  void publisher.publish(channel, JSON.stringify({ replicaId, ...payload })).catch((error) => console.error("Collaboration Redis publish error", error.message));
}

function applyRemoteUpdate(raw) {
  try {
    const message = JSON.parse(raw);
    if (message.replicaId === replicaId || !message.room || !message.update) return;
    const document = docs.get(message.room);
    if (document) Y.applyUpdate(document, Buffer.from(message.update, "base64"), redisOrigin);
  } catch (error) { console.error("Collaboration Redis update error", error instanceof Error ? error.message : error); }
}

function applyRemoteAwareness(raw) {
  try {
    const message = JSON.parse(raw);
    if (message.replicaId === replicaId || !message.room || !message.update) return;
    const document = docs.get(message.room);
    if (document) awarenessProtocol.applyAwarenessUpdate(document.awareness, Buffer.from(message.update, "base64"), redisOrigin);
  } catch (error) { console.error("Collaboration Redis awareness error", error instanceof Error ? error.message : error); }
}

setContentInitializor(async (document) => {
  if (!publisher) return;
  try {
    const entries = await publisher.xRange(streamKey(document.name), "-", "+", { COUNT: streamLimit });
    for (const entry of entries) {
      const update = entry.message.update;
      if (typeof update === "string") Y.applyUpdate(document, Buffer.from(update, "base64"), replayOrigin);
    }
  } catch (error) { console.error(`Unable to replay collaboration stream for ${document.name}`, error instanceof Error ? error.message : error); }
});

function configureSharedDocument(room) {
  const document = getYDoc(room);
  if (configuredDocs.has(document) || !publisher) return document;
  configuredDocs.add(document);
  document.on("update", (update, origin) => {
    if (origin === redisOrigin || origin === replayOrigin) return;
    const encoded = Buffer.from(update).toString("base64");
    void publisher.sendCommand(["XADD", streamKey(room), "MAXLEN", "~", String(streamLimit), "*", "update", encoded]).catch((error) => console.error("Collaboration Redis stream error", error.message));
    publish(updateChannel, { room, update: encoded });
  });
  document.awareness.on("update", ({ added, updated, removed }, origin) => {
    if (origin === redisOrigin || origin === replayOrigin) return;
    const clients = [...added, ...updated, ...removed];
    if (clients.length) publish(awarenessChannel, { room, update: Buffer.from(awarenessProtocol.encodeAwarenessUpdate(document.awareness, clients)).toString("base64") });
  });
  return document;
}

await configureRedisReplication();

const server = createServer((_, response) => { response.writeHead(200); response.end("Rocket Workspace collaboration server"); });
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", async (request, socket, head) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host}`);
    const token = url.searchParams.get("token"); const room = url.pathname.slice(1);
    if (!token || !room.startsWith("document-")) throw new Error("missing collaboration token");
    const { payload } = await jwtVerify(token, secret);
    const origin = request.headers.origin?.replace(/\/$/, "");
    if (origin && allowedOrigins.size && !allowedOrigins.has(origin)) throw new Error("untrusted collaboration origin");
    const roomDocumentId = room.slice("document-".length).replace(/-notion-markdown-v2$/, "");
    if (payload.documentId !== roomDocumentId) throw new Error("document token mismatch");
    configureSharedDocument(room);
    wss.handleUpgrade(request, socket, head, (ws) => {
      setupWSConnection(ws, request, { gc: true });
      const remaining = Math.max(1_000, (payload.exp || Math.floor(Date.now() / 1_000) + 600) * 1_000 - Date.now());
      const expiryTimer = setTimeout(() => ws.close(4001, "Collaboration token expired"), remaining);
      ws.once("close", () => clearTimeout(expiryTimer));
    });
  } catch { socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n"); socket.destroy(); }
});
server.listen(port, () => console.log(`Collaboration server listening on :${port}`));
