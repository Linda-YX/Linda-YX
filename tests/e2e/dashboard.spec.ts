import { test, expect, type Page } from "@playwright/test";
const key = "finances-local-v1";
async function navigate(page: Page, name: string) {
  name =
    (
      {
        总览: "财务总览",
        账户: "我的账户",
        投资组合: "投资分析",
        报告导入: "数据导入",
      } as Record<string, string>
    )[name] || name;
  await page
    .getByRole("navigation")
    .getByRole("button", { name, exact: true })
    .click();
}
async function saved(page: Page) {
  return page.evaluate(
    (k) => JSON.parse(localStorage.getItem(k) || "null"),
    key,
  );
}
async function uploadCSV(page: Page, text: string) {
  await navigate(page, "报告导入");
  await page.getByRole("button", { name: "CSV 文件", exact: true }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "fictional.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(text),
  });
  await expect(page.getByText("✓ fictional.csv")).toBeVisible();
  await page.getByRole("button", { name: "继续到核对" }).click();
}
const csv =
  "security_name,ticker,type,units,price,market_value,currency,report_date,institution,account\nFictional fund,DEMO,ETF,100,50,5000,CAD,2026-10-08,Wealthsimple,TFSA";
test.beforeEach(async ({ page }) => {
  await page.goto("/");
});
test("matches demo totals, navigates, toggles periods, and filters holdings", async ({
  page,
}) => {
  await expect(page.getByTestId("net-worth")).toHaveText("$72,640");
  await navigate(page, "投资组合");
  await expect(
    page.getByRole("heading", { name: "投资组合", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "季度", exact: true }).click();
  await expect(
    page.getByText("+$1,800", { exact: false }).first(),
  ).toBeVisible();
  await page.getByLabel("平台筛选").selectOption("iA Mobile");
  await page.getByLabel("证券类别筛选").selectOption("共同基金");
  const table = page
    .locator("section")
    .filter({
      has: page.locator("summary", { hasText: "证券分类、汇率与来源说明" }),
    })
    .locator("tbody");
  await expect(table.locator("tr")).toHaveCount(2);
  await expect(table).not.toContainText("示例宽基");
  await navigate(page, "账户");
  await expect(page.getByText("Rogers · Mastercard")).toBeVisible();
  await expect(page.getByTestId("net-worth")).toHaveText("$72,640");
});
test("saves manual snapshots, survives reload, and preserves replacement history", async ({
  page,
}) => {
  await page.getByRole("button", { name: "＋ 记录余额", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("账户", { exact: true }).selectOption("cibc");
  await dialog.getByLabel("余额（CAD）").fill("5000");
  await dialog.getByLabel("余额日期").fill("2026-10-08");
  await dialog.getByRole("button", { name: "确认保存余额" }).click();
  await expect(page.getByTestId("net-worth")).toHaveText("$73,360");
  await page.reload();
  await expect(page.getByTestId("net-worth")).toHaveText("$73,360");
  await page.getByRole("button", { name: "＋ 记录余额", exact: true }).click();
  await dialog.getByLabel("余额（CAD）").fill("6000");
  await dialog.getByLabel("余额日期").fill("2026-10-08");
  await expect(dialog.getByText("同日已有 1 条余额快照")).toBeVisible();
  await dialog.getByRole("button", { name: "确认保存余额" }).click();
  await expect(page.getByTestId("net-worth")).toHaveText("$74,360");
  const s = await saved(page);
  const same = s.balances.filter(
    (b: any) => b.accountId === "cibc" && b.date === "2026-10-08",
  );
  expect(same).toHaveLength(2);
  expect(same[0].supersededBy).toBeTruthy();
  expect(s.audit.length).toBe(2);
});
test("CSV preview leaves totals unchanged until confirmation; duplicate import warns", async ({
  page,
}) => {
  await uploadCSV(page, csv);
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("证券名称 1", { exact: true })).toHaveValue(
    "Fictional fund",
  );
  expect((await saved(page)).imports[0].status).toBe("review");
  expect((await saved(page)).positionSets).toHaveLength(8);
  await dialog.getByLabel(/报告账户总额/).fill("5200");
  await dialog.getByLabel(/账户内现金/).fill("200");
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "确认导入 1 项持仓" }).click();
  await expect(dialog).not.toBeVisible();
  await navigate(page, "总览");
  await expect(page.getByTestId("net-worth")).toHaveText("$51,700");
  await page.reload();
  await expect(page.getByTestId("net-worth")).toHaveText("$51,700");
  await navigate(page, "报告导入");
  await page.getByRole("button", { name: "CSV 文件", exact: true }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "again.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await expect(page.getByText(/该文件已于/)).toBeVisible();
  const s = await saved(page);
  expect(s.imports[0].fingerprint).toHaveLength(64);
  expect(s.imports[0]).not.toHaveProperty("file");
  expect(s.positionSets.at(-1).positions[0].sourceRow).toContain("CSV");
});
test("cancelling an import does not change confirmed holdings", async ({
  page,
}) => {
  await uploadCSV(page, csv);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "取消导入" })
    .click();
  await page
    .getByRole("dialog", { name: "放弃未保存的内容？", exact: true })
    .getByRole("button", { name: "放弃更改并关闭" })
    .click();
  const s = await saved(page);
  expect(s.positionSets).toHaveLength(8);
  expect(s.imports[0].status).toBe("cancelled");
  await navigate(page, "总览");
  await expect(page.getByTestId("net-worth")).toHaveText("$72,640");
});
test("extracts a real text PDF with source page, then confirms its holding", async ({
  page,
}) => {
  await navigate(page, "报告导入");
  await page
    .locator("input[type=file]")
    .setInputFiles("tests/fixtures/holdings.pdf");
  await expect(page.getByText("✓ holdings.pdf")).toBeVisible({
    timeout: 15000,
  });
  await page.getByRole("button", { name: "继续到核对" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("证券名称 1", { exact: true })).toHaveValue(
    "Fictional fund",
  );
  await expect(dialog.getByText(/来源：PDF 第 1 页/)).toBeVisible();
  await expect(dialog.getByLabel("报告日期", { exact: true })).toHaveValue(
    "2026-10-08",
  );
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "确认导入 1 项持仓" }).click();
  await expect(dialog).not.toBeVisible();
  expect((await saved(page)).imports[0].source).toBe("PDF");
});
test("starts from empty data, adds a liability account and exports/deletes records", async ({
  page,
}) => {
  await page.getByRole("button", { name: "清空示例，开始使用 →" }).click();
  await page.getByRole("button", { name: "确认删除全部数据" }).click();
  await expect(page.getByTestId("net-worth")).toHaveText("$0");
  await navigate(page, "账户");
  await page.getByRole("button", { name: "＋ 添加账户", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("金融机构", { exact: true }).fill("Example Bank");
  await dialog.getByLabel("账户昵称").fill("Card");
  await dialog.getByLabel("账户类型").selectOption("credit");
  await dialog.getByRole("button", { name: "添加账户", exact: true }).click();
  await expect(page.getByTestId("net-worth")).toHaveText("$0");
  await page.getByRole("button", { name: "记录余额", exact: true }).click();
  await dialog.getByLabel("欠款（正数）（CAD）").fill("350");
  await dialog.getByRole("button", { name: "确认保存余额" }).click();
  await expect(page.getByTestId("net-worth")).toHaveText("-$350");
  const download = page.waitForEvent("download");
  await page
    .locator(".sidefoot")
    .getByRole("button", { name: "↓ 导出备份" })
    .click();
  expect((await download).suggestedFilename()).toMatch(/finances-backup/);
  await page
    .locator(".sidefoot")
    .getByRole("button", { name: "清空数据", exact: true })
    .click();
  await page.getByRole("button", { name: "确认删除全部数据" }).click();
  const s = await saved(page);
  expect(s.accounts).toHaveLength(0);
  expect(s.audit).toHaveLength(0);
  expect(s.imports).toHaveLength(0);
});
test("manual holdings support review, classifications, and unknown exposure", async ({
  page,
}) => {
  await navigate(page, "报告导入");
  await page.getByRole("button", { name: "手动输入", exact: true }).click();
  await page.getByRole("button", { name: "继续到核对" }).click();
  const d = page.getByRole("dialog");
  await d.getByLabel("报告对应的投资账户").selectOption("ws");
  await d.getByLabel("证券名称 1", { exact: true }).fill("Manual test fund");
  await d.getByLabel("市值 1", { exact: true }).fill("100");
  await d.getByRole("checkbox").check();
  await d.getByRole("button", { name: "确认导入 1 项持仓" }).click();
  await navigate(page, "投资组合");
  await expect(
    page.getByRole("cell", { name: /^Manual test fund/ }).first(),
  ).toBeVisible();
  expect(
    (await saved(page)).positionSets.at(-1).positions[0].classification,
  ).toBeUndefined();
});
test("mobile pages fit the screen and dialogs remain usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const tab of ["总览", "账户", "投资组合", "报告导入"]) {
    await navigate(page, tab);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await page.getByRole("button", { name: "＋ 记录余额", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.screenshot({ path: "/tmp/finances-mobile.png", fullPage: true });
});
test("does not overwrite unreadable saved data", async ({ page }) => {
  await page.evaluate((k) => localStorage.setItem(k, "invalid-json"), key);
  await page.reload();
  await expect(page.getByRole("alert").first()).toBeVisible();
  await page.getByRole("button", { name: "＋ 记录余额", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "＋ 添加账户" })
    .click();
  const d = page.getByRole("dialog");
  await d.getByLabel("金融机构", { exact: true }).fill("Example");
  await d.getByLabel("账户昵称").fill("Checking");
  await d.getByRole("button", { name: "添加账户", exact: true }).click();
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBe(
    "invalid-json",
  );
});
test("foreign-currency balances require dated FX metadata before entering CAD totals", async ({
  page,
}) => {
  await navigate(page, "账户");
  await page.getByRole("button", { name: "＋ 添加账户", exact: true }).click();
  let d = page.getByRole("dialog");
  await d.getByLabel("金融机构", { exact: true }).fill("Example USD");
  await d.getByLabel("账户昵称").fill("Savings");
  await d.getByLabel("币种", { exact: true }).fill("USD");
  await d.getByRole("button", { name: "添加账户", exact: true }).click();
  const card = page
    .locator(".account-line")
    .filter({ hasText: "Example USD · Savings" });
  await card.getByRole("button", { name: "记录余额" }).click();
  await d.getByLabel("余额（USD）").fill("100");
  await d.getByRole("button", { name: "确认保存余额" }).click();
  await expect(page.getByTestId("net-worth")).toHaveText("$72,640");
  await expect(card.getByText("缺少汇率：未计入 CAD 合计")).toBeVisible();
  await card.getByRole("button", { name: "记录余额" }).click();
  await d.getByLabel("余额（USD）").fill("100");
  await d.getByLabel("兑 CAD 汇率", { exact: true }).fill("1.4");
  await d.getByLabel("汇率日期", { exact: true }).fill("2026-10-07");
  await d.getByLabel("汇率来源", { exact: true }).fill("Fictional FX source");
  await d.getByRole("button", { name: "确认保存余额" }).click();
  await expect(page.getByTestId("net-worth")).toHaveText("$72,780");
  await page.reload();
  await expect(page.getByTestId("net-worth")).toHaveText("$72,780");
});
