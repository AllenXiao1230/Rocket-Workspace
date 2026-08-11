import { jwtVerify } from "jose";
import { afterEach, expect, test, vi } from "vitest";

const originalAuthSecret = process.env.AUTH_SECRET;
const originalRedisUrl = process.env.REDIS_URL;

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  restoreEnv("AUTH_SECRET", originalAuthSecret);
  restoreEnv("REDIS_URL", originalRedisUrl);
  vi.resetModules();
});

test("signs collaboration tokens with the document and user identity", async () => {
  process.env.AUTH_SECRET = "test-collaboration-secret";
  vi.resetModules();
  const { createCollaborationToken } = await import("@/lib/collaboration-token");

  const token = await createCollaborationToken("user-123", "document-456");
  const { payload, protectedHeader } = await jwtVerify(
    token,
    new TextEncoder().encode(process.env.AUTH_SECRET),
  );

  expect(protectedHeader.alg).toBe("HS256");
  expect(payload.sub).toBe("user-123");
  expect(payload.documentId).toBe("document-456");
  expect(payload.exp).toBeGreaterThan(payload.iat!);
});

test("limits local login attempts and clears a successful login", async () => {
  delete process.env.REDIS_URL;
  vi.resetModules();
  const { clearFailedLogins, failedLogin, loginAllowed } = await import(
    "@/lib/login-rate-limit"
  );
  const email = `coverage-${Date.now()}@example.com`;

  expect(await loginAllowed(email, 1)).toBe(true);
  await failedLogin(email, 1);
  expect(await loginAllowed(email, 1)).toBe(false);
  await clearFailedLogins(email);
  expect(await loginAllowed(email, 1)).toBe(true);
});
