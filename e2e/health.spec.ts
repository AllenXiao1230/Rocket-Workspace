import { expect, test } from "@playwright/test";

test("health endpoint reports database and object storage readiness", async ({ request }) => {
  const response = await request.get("/api/health");
  await expect(response).toBeOK();
  await expect(response.json()).resolves.toEqual({
    status: "ok",
    checks: { database: "ok", objectStorage: "ok" },
  });
});
