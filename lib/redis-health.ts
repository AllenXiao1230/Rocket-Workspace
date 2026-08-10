import { createClient } from "redis";

const createRedisClient = () => createClient({ url: process.env.REDIS_URL });
type RedisClient = ReturnType<typeof createRedisClient>;

let clientPromise: Promise<RedisClient> | null = null;

function client() {
  if (!clientPromise) {
    clientPromise = (async () => {
      const next = createRedisClient();
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
