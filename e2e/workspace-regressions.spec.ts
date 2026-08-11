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

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("電子郵件").fill(email);
  await page.getByLabel("密碼").fill(password);
  await page.getByRole("button", { name: "登入" }).click();
  await page.waitForURL("/");
}

test.describe("workspace regressions", () => {
  test.skip(
    !email || !password || process.env.E2E_MUTATION_TESTS !== "1",
    "requires bootstrap credentials and E2E_MUTATION_TESTS=1",
  );

  test("selecting a database opens its database view", async ({ page }) => {
    await signIn(page);

    await page.getByRole("button", { name: "▦ Mission tracker" }).click();

    await expect(page.locator(".database-page .database-title")).toHaveValue(
      "Mission tracker",
    );
    await expect(page.getByRole("textbox", { name: "資料庫名稱" })).toBeVisible();
    await expect(
      page.locator("[contenteditable][aria-label='協作文件內容']"),
    ).toHaveCount(0);

    await page.setViewportSize({ width: 720, height: 900 });
    await expect(page.getByText("更多操作", { exact: true })).toBeVisible();
    await expect(page.getByText("更多操作", { exact: true })).toHaveCSS(
      "min-height",
      "44px",
    );

    await page.setViewportSize({ width: 390, height: 844 });
    const closedMetrics = await page
      .locator(".database-page")
      .evaluate((databasePage) => {
        const buttons = [...databasePage.querySelectorAll("button")].filter(
          (button) => button.getClientRects().length > 0,
        );
        return {
          pageOverflows: document.documentElement.scrollWidth > window.innerWidth,
          undersizedButtons: buttons.filter((button) => {
            const rect = button.getBoundingClientRect();
            return rect.width < 44 || rect.height < 44;
          }).length,
        };
      });
    expect(closedMetrics).toEqual({ pageOverflows: false, undersizedButtons: 0 });

    await page.getByText("更多操作", { exact: true }).click();
    const openMetrics = await page.locator(".database-page").evaluate((databasePage) => {
      const themeToggle = document
        .querySelector(".theme-toggle")
        ?.getBoundingClientRect();
      const overlapsThemeToggle = [...databasePage.querySelectorAll("button")]
        .filter((button) => button.getClientRects().length > 0)
        .some((button) => {
          if (!themeToggle) return false;
          const rect = button.getBoundingClientRect();
          return (
            rect.left < themeToggle.right &&
            rect.right > themeToggle.left &&
            rect.top < themeToggle.bottom &&
            rect.bottom > themeToggle.top
          );
        });
      return { overlapsThemeToggle };
    });
    expect(openMetrics).toEqual({ overlapsThemeToggle: false });
  });

  test("deleting a document asks for confirmation only once", async ({ page }) => {
    const title = `驗收回歸文件 ${Date.now()}`;
    let created = false;

    await signIn(page);
    try {
      await page.getByRole("button", { name: "＋ 新增頁面" }).click();
      const createDialog = page.getByRole("dialog");
      await createDialog.getByLabel("名稱").fill(title);
      await createDialog.getByRole("button", { name: "建立頁面" }).click();
      created = true;

      const pageButton = page.getByRole("button", { name: `📄 ${title}` });
      await expect(pageButton).toBeVisible();
      await pageButton.click();
      await expect(page.getByLabel("文件標題")).toHaveValue(title);
      await page.getByRole("button", { name: "刪除頁面" }).click();
      const confirmation = page.getByRole("dialog");
      await expect(confirmation).toBeVisible();
      await confirmation.getByRole("button", { name: "移至回收桶" }).click();

      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(page.getByRole("alertdialog")).toHaveCount(0);
    } finally {
      if (created) {
        const editorConfirmation = page.getByRole("alertdialog");
        if (await editorConfirmation.count())
          await editorConfirmation.getByRole("button", { name: "移至回收桶" }).click();
        const duplicateConfirmation = page.getByRole("dialog");
        if (await duplicateConfirmation.count())
          await duplicateConfirmation.getByRole("button", { name: "移至回收桶" }).click();
      }
    }
  });
});
