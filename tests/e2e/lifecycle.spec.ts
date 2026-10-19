import { expect, test, type Page } from "@playwright/test";
import {
  demoState,
  history,
  holdings,
  STORAGE_KEY,
  totals,
  type State,
} from "../../src/model";
type Kind = "balance" | "account" | "import";
type Close = "X" | "cancel" | "Esc";
const titles = {
  balance: "手动记录余额",
  account: "添加账户",
  import: "核对并确认导入",
};
const saved = (page: Page): Promise<State> =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);
const financial = (s: State) => ({
  accounts: s.accounts,
  balances: s.balances,
  positionSets: s.positionSets,
  audit: s.audit,
});
async function open(page: Page, kind: Kind) {
  if (kind === "balance")
    await page
      .getByRole("button", { name: "＋ 记录余额", exact: true })
      .click();
  else if (kind === "account") {
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "我的账户", exact: true })
      .click();
    await page
      .getByRole("button", { name: "＋ 添加账户", exact: true })
      .click();
  } else {
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "数据导入", exact: true })
      .click();
    await page.getByRole("button", { name: "手动输入", exact: true }).click();
    await page.getByRole("button", { name: "继续到核对" }).click();
  }
  return page.getByRole("dialog", { name: titles[kind], exact: true });
}
async function close(page: Page, kind: Kind, method: Close) {
  const d = page.getByRole("dialog", { name: titles[kind], exact: true });
  if (method === "Esc") await page.keyboard.press("Escape");
  else
    await d
      .getByRole("button", {
        name: method === "X" ? "关闭" : kind === "import" ? "取消导入" : "取消",
        exact: true,
      })
      .click();
}
test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ({ key, seed }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(seed));
    },
    { key: STORAGE_KEY, seed: demoState() },
  );
  await page.goto("/");
});
for (const kind of ["balance", "account", "import"] as Kind[])
  for (const method of ["X", "cancel", "Esc"] as Close[]) {
    test(`${kind} clean ${method} closes without saving`, async ({ page }) => {
      const d = await open(page, kind);
      const before = await saved(page);
      await close(page, kind, method);
      await expect(d).not.toBeVisible();
      expect(financial(await saved(page))).toEqual(financial(before));
    });
    test(`${kind} dirty ${method} handles unsaved contents without submitting`, async ({
      page,
    }) => {
      const d = await open(page, kind);
      const before = await saved(page);
      if (kind === "balance") await d.getByLabel("余额（CAD）").fill("123.45");
      else if (kind === "account") {
        await d
          .getByLabel("金融机构", { exact: true })
          .fill("Fictional Test Bank");
        await d.getByLabel("账户昵称").fill("Unsaved account");
      } else {
        await d.getByLabel("报告对应的投资账户").selectOption("ws");
        await d
          .getByLabel("证券名称 1", { exact: true })
          .fill("Fictional Unsaved Fund");
        await d.getByLabel("市值 1", { exact: true }).fill("20");
        await d.getByRole("checkbox").check();
      }
      const prompt = page.getByRole("dialog", {
        name: "放弃未保存的内容？",
        exact: true,
      });
      await close(page, kind, method);
      await expect(prompt).toBeVisible();
      expect(financial(await saved(page))).toEqual(financial(before));
      await page.keyboard.press("Escape");
      await expect(prompt).not.toBeVisible();
      await expect(d).toBeVisible();
      await close(page, kind, method);
      await prompt.getByRole("button", { name: "继续编辑" }).click();
      await expect(d).toBeVisible();
      if (kind === "balance")
        await expect(d.getByLabel("余额（CAD）")).toHaveValue("123.45");
      await close(page, kind, method);
      await prompt.getByRole("button", { name: "放弃更改并关闭" }).click();
      await expect(d).not.toBeVisible();
      expect(financial(await saved(page))).toEqual(financial(before));
      if (kind === "balance") {
        const reopened = await open(page, kind);
        await expect(reopened.getByLabel("余额（CAD）")).toBeEmpty();
      }
      if (kind === "import")
        expect((await saved(page)).imports.at(-1)?.rows[0].name).toBe("");
    });
  }
for (const method of ["X", "cancel", "Esc"] as Close[])
  test(`mobile balance ${method} can discard and close`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const before = financial(await saved(page));
    const d = await open(page, "balance");
    await d.getByLabel("余额（CAD）").fill("50");
    await close(page, "balance", method);
    await page
      .getByRole("dialog", { name: "放弃未保存的内容？", exact: true })
      .getByRole("button", { name: "放弃更改并关闭" })
      .click();
    await expect(d).not.toBeVisible();
    expect(financial(await saved(page))).toEqual(before);
  });
test("empty account deletion requires confirmation and preserves all financial history", async ({
  page,
}) => {
  const before = await saved(page);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "我的账户", exact: true })
    .click();
  const entry = page.locator('[data-account-id="rogers"]');
  await entry.getByRole("button", { name: /删除账户/ }).click();
  const d = page.getByRole("dialog", { name: "删除账户", exact: true });
  await d.getByRole("button", { name: "取消", exact: true }).click();
  await expect(entry).toBeVisible();
  expect((await saved(page)).accounts).toEqual(before.accounts);
  await entry.getByRole("button", { name: /删除账户/ }).click();
  await d.getByRole("button", { name: "确认删除账户" }).click();
  await expect(entry).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("已删除");
  const after = await saved(page);
  expect(after.balances).toEqual(before.balances);
  expect(after.positionSets).toEqual(before.positionSets);
  expect(after.imports).toEqual(before.imports);
  expect(history(after).map((p) => [p.date, p.net])).toEqual(
    history(before).map((p) => [p.date, p.net]),
  );
  await page.reload();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "我的账户", exact: true })
    .click();
  await expect(entry).toHaveCount(0);
});
test("archiving a funded investment preserves its history and removes it from current views and entry options", async ({
  page,
}) => {
  const before = await saved(page);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "我的账户", exact: true })
    .click();
  const entry = page.locator('.account-group [data-account-id="ws"]');
  await expect(entry.getByRole("button", { name: /删除账户/ })).toHaveCount(0);
  await entry.getByRole("button", { name: /归档账户/ }).click();
  const d = page.getByRole("dialog", { name: "归档账户", exact: true });
  await page.keyboard.press("Escape");
  await expect(entry).toBeVisible();
  await entry.getByRole("button", { name: /归档账户/ }).click();
  await d.getByRole("button", { name: "确认归档账户" }).click();
  await expect(entry).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("已归档");
  await expect(page.getByTestId("net-worth")).toHaveText("$46,500");
  const archived = page.locator('.archived-accounts [data-account-id="ws"]');
  await expect(archived.getByText("已归档", { exact: true })).toBeVisible();
  await expect(archived.getByRole("button")).toHaveCount(0);
  await archived.locator("summary").click();
  await expect(archived.locator("tbody tr")).toHaveCount(8);
  const after = await saved(page);
  expect(after.balances).toEqual(before.balances);
  expect(after.positionSets).toEqual(before.positionSets);
  expect(history(after).map((p) => [p.date, p.net])).toEqual(
    history(before).map((p) => [p.date, p.net]),
  );
  expect(holdings(after).some((p) => p.account.id === "ws")).toBe(false);
  expect(totals(after, "2026-10-07").net).toBe(72640);
  const balance = await open(page, "balance");
  await expect(
    balance.getByRole("option", {
      name: "Wealthsimple · TFSA (CAD)",
      exact: true,
    }),
  ).toHaveCount(0);
  await close(page, "balance", "X");
  const review = await open(page, "import");
  await expect(
    review.getByRole("option", {
      name: "Wealthsimple · TFSA (CAD)",
      exact: true,
    }),
  ).toHaveCount(0);
  await close(page, "import", "cancel");
  await page.reload();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "我的账户", exact: true })
    .click();
  await expect(page.getByTestId("net-worth")).toHaveText("$46,500");
  await expect(archived).toBeVisible();
});
