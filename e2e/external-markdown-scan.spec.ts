import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const email = process.env.E2E_ADMIN_EMAIL || "";
const password = process.env.E2E_ADMIN_PASSWORD || "";
const contentRoot = process.env.E2E_WORKSPACE_CONTENT_DIR || "";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("電子郵件").fill(email);
  await page.getByLabel("密碼").fill(password);
  await page.getByRole("button", { name: "登入" }).click();
  await page.waitForURL("/");
}

test.describe("external Markdown scan", () => {
  test.skip(
    !email || !password || !contentRoot || process.env.E2E_MUTATION_TESTS !== "1",
    "requires an isolated full-stack environment",
  );

  test("scanning 23 existing files adds every document to the current list without duplication", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const runId = `${Date.now()}-${process.pid}`;
    const documentsRoot = path.join(contentRoot, "documents");
    const fixtures = Array.from({ length: 23 }, (_, index) => {
      const sequence = String(index + 1).padStart(2, "0");
      return {
        filename: `e2e-scan-${runId}-${sequence}.md`,
        title: `全端掃描 ${runId} ${sequence}`,
      };
    });

    await mkdir(documentsRoot, { recursive: true });
    await Promise.all(
      fixtures.map(({ filename, title }) =>
        writeFile(path.join(documentsRoot, filename), `# ${title}\n\n既有文件內容\n`, {
          flag: "wx",
        }),
      ),
    );

    try {
      await signIn(page);
      const projectId = await page.getByLabel("切換專案").inputValue();
      const baselineCreated = await page.evaluate(
        async ({ id, prefix }) => {
          const responses = await Promise.all(
            Array.from({ length: 48 }, (_, index) =>
              fetch(`/api/projects/${encodeURIComponent(id)}/documents`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: `${prefix} ${index + 1}` }),
              }),
            ),
          );
          return responses.every((response) => response.ok);
        },
        { id: projectId, prefix: `分頁基準 ${runId}` },
      );
      expect(baselineCreated).toBe(true);
      await page.reload();
      await expect(
        page
          .locator(".desktop-library .tree")
          .getByRole("button", { name: "載入更多文件" }),
      ).toBeVisible();

      await page.getByRole("button", { name: "設定中心", exact: true }).click();
      await page.getByRole("button", { name: "掃描外部文件" }).click();

      await expect(
        page.getByText(/已加入 23 份外部文件；略過 \d+ 份既有文件。/),
      ).toBeVisible();
      const desktopTree = page.locator(".desktop-library .tree");
      for (const { title } of fixtures)
        await expect(
          desktopTree.getByRole("button", { name: `📄 ${title}`, exact: true }),
        ).toBeVisible();

      await page.getByRole("button", { name: "掃描外部文件" }).click();
      await expect(
        page.getByText(/已加入 0 份外部文件；略過 \d+ 份既有文件。/),
      ).toBeVisible();
      for (const { title } of fixtures)
        await expect(
          desktopTree.getByRole("button", { name: `📄 ${title}`, exact: true }),
        ).toHaveCount(1);
    } finally {
      await Promise.all(
        fixtures.map(({ filename }) =>
          unlink(path.join(documentsRoot, filename)).catch(() => undefined),
        ),
      );
    }
  });
});
