import { describe, expect, it } from "vitest";
import {
  activeAccounts,
  archiveAccount,
  confirmRecords,
  deleteAccount,
  demoState,
  hasAccountHistory,
  history,
  holdings,
  totals,
  type State,
} from "../src/model";

describe("account deletion and archival", () => {
  it("deletes only an empty account and preserves financial and import records", () => {
    const before = demoState();
    const after = deleteAccount(before, "rogers");
    expect(after.accounts.some((a) => a.id === "rogers")).toBe(false);
    expect(after.balances).toBe(before.balances);
    expect(after.positionSets).toBe(before.positionSets);
    expect(after.imports).toBe(before.imports);
    expect(history(after).map((p) => [p.date, p.net])).toEqual(
      history(before).map((p) => [p.date, p.net]),
    );
    expect(after.audit.at(-1)?.action).toContain("删除空账户");
  });
  it("refuses to delete accounts with any balance or position history, including replaced and unconfirmed rows", () => {
    const before = demoState();
    expect(() => deleteAccount(before, "cibc")).toThrow("只能归档");
    const onlyPositions = { ...before, balances: [] } satisfies State;
    expect(() => deleteAccount(onlyPositions, "ws")).toThrow("只能归档");
    const pending = {
      ...before,
      balances: before.balances.map((b) => ({
        ...b,
        confirmed: false,
        supersededBy: "replacement",
      })),
    };
    expect(hasAccountHistory(pending, "cibc")).toBe(true);
    expect(() => deleteAccount(pending, "cibc")).toThrow("只能归档");
  });
  it("excludes archived investment accounts now while preserving all past balances, holdings and net-worth points", () => {
    const before = demoState();
    const after = archiveAccount(
      before,
      "ws",
      "2026-10-18T14:00:00Z",
      "2026-10-18",
    );
    expect(totals(after).net).toBe(46500);
    expect(activeAccounts(after).some((a) => a.id === "ws")).toBe(false);
    expect(holdings(after).some((p) => p.account.id === "ws")).toBe(false);
    expect(history(after).map((p) => [p.date, p.net])).toEqual(
      history(before).map((p) => [p.date, p.net]),
    );
    const historicalRows = (s: State) =>
      holdings(s, "2026-10-07").map(({ account, ...position }) => ({
        ...position,
        accountId: account.id,
      }));
    expect(historicalRows(after)).toEqual(historicalRows(before));
    expect(after.balances).toBe(before.balances);
    expect(after.positionSets).toBe(before.positionSets);
    expect(after.imports).toBe(before.imports);
    expect(before.accounts.find((a) => a.id === "ws")?.status).toBe("active");
  });
  it("preserves archive-day historical snapshots and excludes the account from subsequent valuation dates", () => {
    const before = demoState();
    const sameDay = {
      ...before.balances[0],
      id: "same-day",
      date: "2026-10-18",
      createdAt: "2026-10-18T10:00:00Z",
      amount: 5000,
    };
    before.balances.push(sameDay);
    const after = archiveAccount(
      before,
      "cibc",
      "2026-10-18T14:00:00Z",
      "2026-10-18",
    );
    expect(history(after).map((p) => [p.date, p.net])).toEqual(
      history(before).map((p) => [p.date, p.net]),
    );
    expect(totals(after, "2026-10-18").net).toBe(
      totals(before, "2026-10-18").net,
    );
    expect(totals(after, "2026-10-19").net).toBe(
      totals(before, "2026-10-19").net - 5000,
    );
    const future = {
      ...before.balances.find((b) => b.accountId === "simplii")!,
      id: "future",
      date: "2026-10-19",
      createdAt: "2026-10-19T10:00:00Z",
      amount: 4000,
    };
    const next = confirmRecords(after, future, undefined, "replace");
    expect(history(next).at(-1)?.net).toBe(
      totals(before, "2026-10-19").net - 5000 + 160,
    );
  });
  it("prevents new snapshots on archived accounts and repeated archival without changing input state", () => {
    const before = demoState();
    const after = archiveAccount(before, "ws");
    const existing = after.balances.find((b) => b.accountId === "ws")!;
    expect(() =>
      confirmRecords(after, { ...existing, id: "new" }, undefined, "keep"),
    ).toThrow("已归档");
    expect(() => archiveAccount(after, "ws")).toThrow("已归档");
    expect(() => deleteAccount(before, "missing")).toThrow("不存在");
  });
});
