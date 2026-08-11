import { expect, test } from "@playwright/test";

test("health endpoint reports every required service readiness", async ({ request }) => {
  const response = await request.get("/api/health");
  await expect(response).toBeOK();
  const body = await response.json();
  expect(body).toMatchObject({
    status: "ok",
    checks: {
      database: "ok",
      objectStorage: "ok",
      redis: "ok",
      collaboration: "ok",
      scheduler: "ok",
      backup: { status: "ok" },
    },
  });
  expect(body.checks.migration).toMatch(/^\d{14}_.+/);
  expect(body.checks.backup.id).toMatch(/^\d{8}T\d{6}Z$/);
  expect(body.checks.backup.ageMinutes).toEqual(expect.any(Number));
});

test("liveness endpoint stays independent of readiness dependencies", async ({
  request,
}) => {
  const response = await request.get("/api/health/live");
  await expect(response).toBeOK();
  await expect(response.json()).resolves.toEqual({ status: "ok" });
});

test("login screen is usable and protected attachment API rejects anonymous requests", async ({
  page,
  request,
}) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "進入任務控制台" })).toBeVisible();
  await expect(page.getByLabel("電子郵件")).toBeEditable();
  await expect(page.getByLabel("密碼")).toBeEditable();
  await expect(page.getByRole("button", { name: "登入" })).toBeEnabled();

  const response = await request.get("/api/attachments?documentId=not-a-document");
  expect(response.status()).toBe(401);
});
