import { existsSync, readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

function configuredValue(name: string) {
  if (process.env[name]) return process.env[name] || "";
  if (!existsSync(".env")) return "";
  const line = readFileSync(".env", "utf8").match(new RegExp(`^${name}=(.*)$`, "m"));
  return (line?.[1] || "").trim().replace(/^['\"]|['\"]$/g, "");
}

const email = configuredValue("BOOTSTRAP_ADMIN_EMAIL");
const password = configuredValue("BOOTSTRAP_ADMIN_PASSWORD");
const settings = {
  workspace: { id: "test-workspace", name: "Test workspace", slug: "test-workspace" },
  project: { id: "test-project", name: "Test project", code: "TEST", description: null },
  backup: { intervalHours: 1, retentionDays: 14, lastSuccess: null, lastFailure: null },
  security: {
    collaborationEnabled: true,
    attachmentsEnabled: true,
    markdownDownloadEnabled: true,
    accountProvisioningEnabled: false,
    forcePasswordChangeOnNewAccount: false,
    minimumPasswordLength: 12,
    loginRateLimitEnabled: false,
    loginMaxAttempts: 5,
    loginWindowMinutes: 15,
  },
  ai: {
    enabled: false,
    provider: "OPENAI_COMPATIBLE",
    baseUrl: "",
    model: "",
    apiKeyConfigured: false,
  },
  integrations: {
    githubEnabled: false,
    githubRepository: "",
    githubTokenConfigured: false,
    webhookEnabled: false,
    webhookUrl: "",
    webhookSecretConfigured: false,
  },
  canManage: true,
  canManageHost: true,
};

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("電子郵件").fill(email);
  await page.getByLabel("密碼").fill(password);
  await page.getByRole("button", { name: "登入" }).click();
  await page.waitForURL("/");
}

test.describe("settings save", () => {
  test.skip(!email || !password, "requires bootstrap credentials");
  test.setTimeout(90_000);

  test("preserves rate-limit values when its controls are disabled", async ({ page }) => {
    let submitted: Record<string, unknown> | null = null;

    await page.route("**/api/projects/*/settings", async (route) => {
      const request = route.request();
      if (request.method() === "GET") {
        await route.fulfill({ json: settings });
        return;
      }
      submitted = JSON.parse(request.postData() || "{}") as Record<string, unknown>;
      const security = submitted.security as Record<string, unknown> | undefined;
      const invalidRateLimit =
        typeof security?.loginMaxAttempts !== "number" ||
        security.loginMaxAttempts < 1 ||
        typeof security.loginWindowMinutes !== "number" ||
        security.loginWindowMinutes < 1;
      await route.fulfill({
        status: invalidRateLimit ? 400 : 200,
        contentType: "application/json",
        body: JSON.stringify(
          invalidRateLimit
            ? { error: "Number must be greater than or equal to 1" }
            : settings,
        ),
      });
    });

    await signIn(page);
    await page.getByRole("button", { name: "設定中心", exact: true }).click();
    const maxAttempts = page.locator("input[name=loginMaxAttempts]");
    const windowMinutes = page.locator("input[name=loginWindowMinutes]");
    await expect(maxAttempts).toBeDisabled({ timeout: 30_000 });
    await expect(windowMinutes).toBeDisabled({ timeout: 30_000 });

    await page.getByRole("button", { name: "儲存全部設定", exact: true }).click();

    await expect.poll(() => submitted).not.toBeNull();
    const savedSecurity = settings.security;
    const submittedPayload = submitted as Record<string, unknown> | null;
    if (!submittedPayload) throw new Error("設定儲存請求未送出");
    const submittedSecurity = submittedPayload.security as Record<string, unknown>;
    expect(submittedSecurity.loginMaxAttempts).toBe(savedSecurity.loginMaxAttempts);
    expect(submittedSecurity.loginWindowMinutes).toBe(savedSecurity.loginWindowMinutes);
    await expect(
      page.getByText("Number must be greater than or equal to 1", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText("設定已儲存；安全開關會立即套用於新的操作。"),
    ).toBeVisible();
  });
});
