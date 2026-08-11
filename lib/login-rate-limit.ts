import { createHash } from "node:crypto";
import { createClient } from "redis";

type Entry = { attempts: number; expiresAt: number };
const local = new Map<string, Entry>();
type Client = ReturnType<typeof createClient>;
let redisPromise: Promise<Client | null> | null = null;

async function redis() {
  if (!process.env.REDIS_URL) return null;
  if (!redisPromise)
    redisPromise = (async () => {
      try {
        const client = createClient({ url: process.env.REDIS_URL });
        client.on("error", () => undefined);
        await client.connect();
        return client;
      } catch {
        return null;
      }
    })();
  return redisPromise;
}
const keyFor = (email: string) =>
  `rocket-workspace:login:${createHash("sha256").update(email.trim().toLowerCase()).digest("hex")}`;

export async function loginAllowed(email: string, maxAttempts: number) {
  const key = keyFor(email);
  const client = await redis();
  if (client) return Number((await client.get(key)) || 0) < maxAttempts;
  const entry = local.get(key);
  if (!entry || entry.expiresAt <= Date.now()) {
    local.delete(key);
    return true;
  }
  return entry.attempts < maxAttempts;
}
export async function failedLogin(email: string, windowMinutes: number) {
  const key = keyFor(email);
  const seconds = windowMinutes * 60;
  const client = await redis();
  if (client) {
    const count = await client.incr(key);
    if (count === 1) await client.expire(key, seconds);
    return;
  }
  const previous = local.get(key);
  const active =
    previous && previous.expiresAt > Date.now()
      ? previous
      : { attempts: 0, expiresAt: Date.now() + seconds * 1_000 };
  local.set(key, { ...active, attempts: active.attempts + 1 });
}
export async function clearFailedLogins(email: string) {
  const key = keyFor(email);
  const client = await redis();
  if (client) {
    await client.del(key);
    return;
  }
  local.delete(key);
}
