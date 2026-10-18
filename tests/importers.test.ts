import { describe, it, expect } from "vitest";
import { mapRows, numeric, parseCSV, validDate } from "../src/importers";
describe("CSV extraction", () => {
  it("handles BOM, quoted commas, currency, and source logical rows", () => {
    const e = parseCSV(
      '\uFEFFsecurity_name,market_value,currency\n"Example, fund","1,234.50",CAD',
    );
    const r = mapRows(e);
    expect(r.positions[0].name).toBe("Example, fund");
    expect(r.positions[0].value).toBe(1234.5);
    expect(r.positions[0].sourceRow).toContain("2");
  });
  it("supports Chinese headers and does not invent currency or classification", () => {
    const r = mapRows(parseCSV("证券名称,市值\n样例基金,100"));
    expect(r.positions[0].currency).toBe("");
    expect(r.positions[0].classification).toBeUndefined();
  });
  it("allows user column mapping and flags invalid amounts instead of using zero", () => {
    const e = parseCSV("custom_title,custom_amount\nExample,abc");
    e.mapping = { name: "custom_title", value: "custom_amount" };
    const r = mapRows(e);
    expect(Number.isNaN(r.positions[0].value)).toBe(true);
    expect(r.warnings).toHaveLength(1);
  });
  it("warns on multiple accounts and dates so they can be blocked at confirmation", () => {
    const r = mapRows(
      parseCSV(
        "name,value,account,date\nA,10,TFSA,2026-10-07\nB,20,RRSP,2026-10-08",
      ),
    );
    expect(r.warnings.some((w) => w.includes("多个账户"))).toBe(true);
    expect(r.warnings.some((w) => w.includes("多个报告日期"))).toBe(true);
  });
  it("reports malformed CSV rows", () => {
    const e = parseCSV("name,value\nA,10,EXTRA");
    expect(e.warnings.some((w) => w.includes("结构不完整"))).toBe(true);
  });
  it("requires valid dates and strictly parses numeric amounts", () => {
    expect(validDate("2026-02-30")).toBe(false);
    expect(validDate("2026-10-07")).toBe(true);
    expect(numeric("1oops")).toBeUndefined();
    expect(numeric("")).toBeUndefined();
    expect(numeric("($1,200.50)")).toBe(-1200.5);
  });
});
