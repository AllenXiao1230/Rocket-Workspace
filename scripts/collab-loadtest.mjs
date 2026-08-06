import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { WebsocketProvider } from "y-websocket";
import WebSocket from "ws";
import * as Y from "yjs";

const urls = (process.env.COLLAB_URLS || "").split(",").map((value) => value.trim().replace(/\/$/, "")).filter(Boolean);
const clients = Math.max(2, Math.min(250, Number(process.env.COLLAB_LOADTEST_CLIENTS || 36)));
const timeoutMs = Math.max(5_000, Math.min(120_000, Number(process.env.COLLAB_LOADTEST_TIMEOUT_MS || 30_000)));
const maxP95Ms = Math.max(100, Math.min(120_000, Number(process.env.COLLAB_LOADTEST_MAX_P95_MS || 3_000)));
const secret = process.env.AUTH_SECRET;

// y-websocket attaches one shutdown listener per client. This is intentional
// for a bounded test run, not an application listener leak.
process.setMaxListeners(Math.max(100, clients + 10));

function percentile(values, fraction) { if (!values.length) return 0; const sorted = [...values].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)]; }
function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function until(predicate, label) { const deadline = Date.now() + timeoutMs; while (Date.now() < deadline) { if (predicate()) return; await wait(25); } throw new Error(`${label}（逾時 ${timeoutMs}ms）`); }

if (!secret) throw new Error("AUTH_SECRET 必須設定後才能執行協作壓測");
if (urls.length < 2) throw new Error("COLLAB_URLS 至少必須指定兩個不同的協作節點網址");

const runId = randomUUID();
const room = `document-loadtest-${runId}`;
const signingKey = new TextEncoder().encode(secret);
const nodesUsed = new Set();
const instances = [];
const latencies = [];
const observed = new Set();
const startedAt = Date.now();

try {
  for (let index = 0; index < clients; index += 1) {
    const url = urls[index % urls.length]; nodesUsed.add(url);
    const token = await new SignJWT({ documentId: `loadtest-${runId}` }).setProtectedHeader({ alg: "HS256" }).setSubject(`loadtest-client-${index}`).setIssuedAt().setExpirationTime("15m").sign(signingKey);
    const doc = new Y.Doc();
    const provider = new WebsocketProvider(url, room, doc, { params: { token }, WebSocketPolyfill: WebSocket });
    const map = doc.getMap("pressure");
    map.observe((event) => {
      for (const key of event.keysChanged) {
        const value = map.get(key);
        if (!value || value.writer === index || observed.has(`${index}:${key}`)) continue;
        observed.add(`${index}:${key}`); latencies.push(Date.now() - value.sentAt);
      }
    });
    instances.push({ index, doc, provider, map, synced: false });
    provider.on("sync", (synced) => { if (synced) instances[index].synced = true; });
  }

  await until(() => instances.every((instance) => instance.synced || instance.provider.synced), "所有客戶端完成 Yjs 初始同步");
  const connectedMs = Date.now() - startedAt;
  for (const instance of instances) instance.map.set(`writer-${instance.index}`, { writer: instance.index, sentAt: Date.now() });
  await until(() => instances.every((instance) => instance.map.size === clients), "所有節點都收到全部跨客戶端更新");
  const expectedDeliveries = clients * (clients - 1);
  await until(() => observed.size >= expectedDeliveries, "所有遠端更新延遲均已收集");
  const p50 = percentile(latencies, 0.5); const p95 = percentile(latencies, 0.95); const max = Math.max(...latencies);
  const summary = { result: p95 <= maxP95Ms ? "PASS" : "FAIL", runId, nodes: [...nodesUsed], clients, expectedRemoteDeliveries: expectedDeliveries, observedRemoteDeliveries: observed.size, connectionMs: connectedMs, propagation: { p50Ms: p50, p95Ms: p95, maxMs: max }, threshold: { maxP95Ms }, durationMs: Date.now() - startedAt };
  console.log(JSON.stringify(summary));
  if (summary.result !== "PASS") process.exitCode = 2;
} finally {
  for (const instance of instances) { instance.provider.destroy(); instance.doc.destroy(); }
}
