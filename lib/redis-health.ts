import { createClient, type RedisClientType } from "redis";

let clientPromise: Promise<RedisClientType> | null = null;

function client() {
  if (!clientPromise) {
    clientPromise = (async () => {
      const next = createClient({ url: process.env.REDIS_URL });
      next.on("error", () => undefined);
      await next.connect();
      return next;
    })().catch((error) => {
      clientPromise = null;
      throw error;
    });
  }
  return clientPromise;
}

export async function checkRedis() {
  const result = await (await client()).ping();
  if (result !== "PONG") throw new Error("Redis health check failed");
}
