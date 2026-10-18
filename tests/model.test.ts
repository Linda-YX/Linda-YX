import { describe, it, expect } from "vitest";
import {
  accountAt,
  cad,
  change,
  combinedHoldings,
  comparisonDate,
  confirmRecords,
  demoState,
  emptyState,
  exposure,
  history,
  totals,
  type Account,
  type Balance,
  type PositionSet,
  type State,
} from "../src/model";
const account: Account = {
  id: "a",
  name: "TFSA",
  institution: "Example",
  type: "investment",
  currency: "CAD",
  status: "active",
};
const balance = (amount = 100, date = "2026-10-07", extra = {}): Balance => ({
  id: "b",
  accountId: "a",
  amount,
  date,
  currency: "CAD",
  createdAt: date + "T12:00:00Z",
  source: "manual",
  confirmed: true,
  ...extra,
});
const positions = (value = 90, extra = {}): PositionSet => ({
  id: "s",
  accountId: "a",
  date: "2026-10-07",
  createdAt: "2026-10-07T12:00:00Z",
  source: "CSV",
  confirmed: true,
  positions: [
    {
      id: "p",
      name: "Example",
      ticker: "EX",
      value,
      currency: "CAD",
      type: "ETF",
      sourceRow: "CSV row 2",
    },
  ],
  cash: 0,
  currency: "CAD",
  ...extra,
});
const state = (extra: Partial<State> = {}): State => ({
  ...emptyState(),
  accounts: [account],
  ...extra,
});
describe("net worth and record selection", () => {
  it("reproduces the reference totals from fictional source snapshots", () => {
    const t = totals(demoState());
    expect(t.assets).toBe(91420);
    expect(t.liabilities).toBe(18780);
    expect(t.net).toBe(72640);
    expect(t.missing.map((a) => a.account.id)).toEqual(["rogers"]);
  });
  it("counts an investment total once and flags a position mismatch", () => {
    const s = state({ balances: [balance()], positionSets: [positions()] });
    expect(totals(s).net).toBe(100);
    expect(accountAt(s, account).discrepancy).toBe(10);
  });
  it("uses confirmed positions plus cash when no balance exists", () => {
    expect(
      totals(state({ positionSets: [positions(90, { cash: 10 })] })).net,
    ).toBe(100);
  });
  it("uses a newer holdings snapshot over a stale account total", () => {
    expect(
      totals(
        state({
          balances: [balance(100, "2026-07-07")],
          positionSets: [positions(120)],
        }),
      ).net,
    ).toBe(120);
  });
  it("subtracts positive liabilities and ignores unconfirmed data", () => {
    const debt = { ...account, id: "debt", type: "credit" as const };
    const s = state({
      accounts: [account, debt],
      balances: [
        balance(100),
        balance(30, "2026-10-07", { id: "d", accountId: "debt" }),
        balance(500, "2026-10-08", { confirmed: false }),
      ],
    });
    expect(totals(s).net).toBe(70);
  });
  it("does not invent intermediate chart dates and carries previous data with provenance", () => {
    const s = state({
      balances: [
        balance(100, "2026-07-07"),
        balance(120, "2026-10-07", { id: "b2" }),
      ],
    });
    expect(history(s).map((p) => p.date)).toEqual(["2026-07-07", "2026-10-07"]);
    expect(accountAt(s, account, "2026-08-01").date).toBe("2026-07-07");
  });
  it("keeps same-day source history while replacing only the supplied record type", () => {
    const s = state({ balances: [balance()], positionSets: [positions()] });
    const b = balance(110, "2026-10-07", {
      id: "new",
      createdAt: "2026-10-08T12:00:00Z",
    });
    const updated = confirmRecords(s, b, undefined, "replace");
    expect(updated.balances[0].supersededBy).toBe("new");
    expect(updated.positionSets[0].supersededBy).toBeUndefined();
    expect(updated.audit).toHaveLength(1);
    expect(accountAt(updated, account).value).toBe(110);
  });
  it("keep both does not add same-day snapshots together", () => {
    const b = balance(120, "2026-10-07", {
      id: "new",
      createdAt: "2026-10-08T12:00:00Z",
    });
    const updated = confirmRecords(
      state({ balances: [balance()] }),
      b,
      undefined,
      "keep",
    );
    expect(updated.balances).toHaveLength(2);
    expect(totals(updated).net).toBe(120);
    expect(updated.balances[0].supersededBy).toBeUndefined();
  });
});
describe("currency, classification and comparisons", () => {
  it("requires rate, date and source; does not silently equate USD and CAD", () => {
    expect(cad(10, "USD", {})).toBeNull();
    expect(cad(10, "USD", { rate: 1.4 })).toBeNull();
    expect(
      cad(10, "USD", {
        rate: 1.4,
        rateDate: "2026-10-07",
        rateSource: "Example",
      }),
    ).toBe(14);
    expect(cad(0, "USD", {})).toBe(0);
  });
  it("marks a whole position-derived account incomplete if a holding lacks FX", () => {
    const set = positions();
    set.positions[0].currency = "USD";
    expect(accountAt(state({ positionSets: [set] }), account).value).toBeNull();
  });
  it("weights classification by value and retains unknown coverage", () => {
    const set = positions(100);
    set.positions[0].classification = {
      sectors: [{ label: "Tech", weight: 0.6 }],
      regions: [],
      source: "Example",
      date: "2026-10-07",
      status: "confirmed",
    };
    const e = exposure(state({ positionSets: [set] }), "sectors");
    expect(e.unknown).toBe(40);
    expect(e.items.find((i) => i.label === "Tech")?.percent).toBe(60);
  });
  it("does not use uncertain or unsourced classification", () => {
    const set = positions();
    set.positions[0].classification = {
      sectors: [{ label: "Tech", weight: 1 }],
      regions: [],
      source: "",
      date: "2026-10-07",
      status: "confirmed",
    };
    expect(exposure(state({ positionSets: [set] }), "sectors").unknown).toBe(
      90,
    );
  });
  it("combines identical securities across accounts without mutating source rows", () => {
    const a2 = { ...account, id: "a2" };
    const p2 = positions(10, { id: "s2", accountId: "a2" });
    const s = state({
      accounts: [account, a2],
      positionSets: [positions(90), p2],
    });
    expect(combinedHoldings(s)).toHaveLength(1);
    expect(combinedHoldings(s)[0].value).toBe(100);
    expect(s.positionSets).toHaveLength(2);
  });
  it("handles leap dates, missing baseline and zero denominator", () => {
    expect(comparisonDate("2024-02-29", "year")).toBe("2023-02-28");
    expect(comparisonDate("2026-05-31", "quarter")).toBe("2026-02-28");
    expect(change(10, null).amount).toBeNull();
    expect(change(10, 0).percent).toBeNull();
    expect(change(120, 100)).toEqual({ amount: 20, percent: 20 });
  });
});
