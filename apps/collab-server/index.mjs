import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { setupWSConnection } from "y-websocket/bin/utils";
import { jwtVerify } from "jose";

const port = Number(process.env.COLLABORATION_PORT || 1234);
const secret = new TextEncoder().encode(process.env.AUTH_SECRET);
const allowedOrigins = new Set((process.env.COLLABORATION_ALLOWED_ORIGINS || process.env.NEXTAUTH_URL || "").split(",").map((origin) => origin.trim().replace(/\/$/, "")).filter(Boolean));
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
    wss.handleUpgrade(request, socket, head, (ws) => {
      setupWSConnection(ws, request, { gc: true });
      // Membership is checked before a token is issued. Closing the socket at the
      // token expiry bounds the window in which a removed member could keep editing.
      const remaining = Math.max(1_000, (payload.exp || Math.floor(Date.now() / 1_000) + 600) * 1_000 - Date.now());
      const expiryTimer = setTimeout(() => ws.close(4001, "Collaboration token expired"), remaining);
      ws.once("close", () => clearTimeout(expiryTimer));
    });
  } catch { socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n"); socket.destroy(); }
});
server.listen(port, () => console.log(`Collaboration server listening on :${port}`));
