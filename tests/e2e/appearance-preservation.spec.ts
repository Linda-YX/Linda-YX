import { expect, test, type Page } from "@playwright/test";
import {
  demoState,
  emptyState,
  STORAGE_KEY,
  type State,
} from "../../src/model";

const tabs = [
  ["财务总览", "总览"],
  ["我的账户", "账户"],
  ["投资分析", "投资组合"],
  ["数据导入", "报告导入"],
];
async function seed(page: Page, state: State) {
  await page.addInitScript(
    ({ key, value }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, value);
    },
    { key: STORAGE_KEY, value: JSON.stringify(state) },
  );
  await page.goto("/");
}
async function navigate(page: Page, name: string) {
  await page
    .getByRole("navigation")
    .getByRole("button", { name, exact: true })
    .click();
}
const stored = (page: Page) =>
  page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);

test("green navigation retains page headings and existing local records across reload", async ({
  page,
}) => {
  const state = demoState();
  state.demo = false;
  state.accounts[0].name = "Fictional saved account";
  await seed(page, state);
  for (const [label, heading] of tabs) {
    await navigate(page, label);
    await expect(
      page.getByRole("heading", { name: heading, exact: true, level: 1 }),
    ).toBeVisible();
    const selected = page
      .getByRole("navigation")
      .getByRole("button", { name: label });
    await expect(selected).toHaveAttribute("aria-current", "page");
    await expect(selected.locator("svg")).toBeVisible();
    expect(await stored(page)).toBe(JSON.stringify(state));
  }
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(
    page.getByText("本地模式　·　数据仅保存在当前浏览器"),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("net-worth")).toHaveText("$72,640");
  await expect(page.getByText("CIBC · Fictional saved account")).toBeVisible();
  expect(await stored(page)).toBe(JSON.stringify(state));
});

test("empty state retains guidance and import controls on all four pages", async ({
  page,
}) => {
  const state = emptyState();
  await seed(page, state);
  await expect(
    page.getByText("添加现金或投资账户，开始建立资产概览。"),
  ).toBeVisible();
  await expect(
    page.getByText("信用卡与学生贷款会在这里分开统计。"),
  ).toBeVisible();
  await navigate(page, "我的账户");
  await expect(
    page.getByRole("button", { name: "＋ 添加账户", exact: true }),
  ).toBeVisible();
  await navigate(page, "投资分析");
  await expect(
    page.getByText("不是扣除存取款后的投资回报", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("暂无可分类持仓", { exact: true })).toBeVisible();
  await expect(
    page.getByText("暂无地区分类数据", { exact: true }),
  ).toBeVisible();
  await navigate(page, "数据导入");
  for (const name of ["PDF 报告", "CSV 文件", "手动输入"])
    await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
  await expect(
    page.getByText("还没有导入记录。你的第一份报告将从这里开始。"),
  ).toBeVisible();
  expect(await stored(page)).toBe(JSON.stringify(state));
});

test("missing FX, stale data and missing comparison baselines remain explicit", async ({
  page,
}) => {
  const state = emptyState();
  state.accounts = [
    {
      id: "fx",
      institution: "Fictional FX",
      name: "Savings",
      type: "cash",
      currency: "USD",
      status: "active",
    },
    {
      id: "fund",
      institution: "Fictional Fund",
      name: "Portfolio",
      type: "investment",
      currency: "CAD",
      status: "active",
    },
  ];
  state.balances = [
    {
      id: "b1",
      accountId: "fx",
      date: "2020-01-01",
      createdAt: "2020-01-01T00:00:00Z",
      source: "manual",
      confirmed: true,
      amount: 100,
      currency: "USD",
    },
    {
      id: "b2",
      accountId: "fund",
      date: "2020-01-01",
      createdAt: "2020-01-01T00:00:00Z",
      source: "manual",
      confirmed: true,
      amount: 200,
      currency: "CAD",
    },
  ];
  await seed(page, state);
  await expect(page.getByTestId("net-worth")).toHaveText("$200");
  await expect(page.locator(".data-note")).toContainText("缺少汇率");
  await expect(page.locator(".data-note")).toContainText("超过 30 天未更新");
  await navigate(page, "我的账户");
  await expect(page.getByText("缺少汇率：未计入 CAD 合计")).toBeVisible();
  const entry = page.locator('[data-account-id="fx"]');
  await entry.getByText("查看余额 / 持仓快照历史", { exact: false }).click();
  await expect(
    entry.getByText("2020-01-01", { exact: true }).first(),
  ).toBeVisible();
  await navigate(page, "投资分析");
  const row = page
    .getByRole("row")
    .filter({ hasText: "Fictional Fund · Portfolio" });
  await expect(row.getByRole("cell").nth(1)).toContainText("—");
  await expect(
    page.getByText("金额变化包含存取款和买卖，不等于实际投资回报", {
      exact: false,
    }),
  ).toBeVisible();
  expect(await stored(page)).toBe(JSON.stringify(state));
});

test("oversize upload rejects safely and pending review survives reload without financial changes", async ({
  page,
}) => {
  const state = demoState();
  await seed(page, state);
  await navigate(page, "数据导入");
  await page.getByRole("button", { name: "CSV 文件", exact: true }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "fictional-oversize.csv",
    mimeType: "text/csv",
    buffer: Buffer.alloc(20 * 1024 * 1024 + 1),
  });
  await expect(page.getByRole("alert")).toContainText(
    "文件超过 20 MB，请拆分后重试。",
  );
  expect(await stored(page)).toBe(JSON.stringify(state));
  await page.locator("input[type=file]").setInputFiles({
    name: "fictional-pending.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "security_name,market_value,currency,report_date\nFictional Pending Fund,123,CAD,2026-10-08",
    ),
  });
  await page.getByRole("button", { name: "继续到核对" }).click();
  await expect(
    page.getByRole("dialog", { name: "核对并确认导入", exact: true }),
  ).toBeVisible();
  await page.reload();
  await navigate(page, "数据导入");
  await expect(page.getByText("待核对", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "继续核对 →", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "核对并确认导入",
    exact: true,
  });
  await expect(dialog.getByLabel("证券名称 1", { exact: true })).toHaveValue(
    "Fictional Pending Fund",
  );
  const after = JSON.parse((await stored(page))!);
  expect(after.balances).toEqual(state.balances);
  expect(after.positionSets).toEqual(state.positionSets);
  expect(after.audit).toEqual(state.audit);
  await page.keyboard.press("Escape");
  const discard = page.getByRole("dialog", {
    name: "放弃未保存的内容？",
    exact: true,
  });
  await expect(discard).toBeVisible();
  await discard
    .getByRole("button", { name: "放弃更改并关闭", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText("已取消", { exact: true })).toBeVisible();
});
