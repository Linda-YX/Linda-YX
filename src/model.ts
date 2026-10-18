export type AccountType =
  | "cash"
  | "investment"
  | "credit"
  | "federal"
  | "alberta"
  | "quebec"
  | "loan";
export type Source = "manual" | "CSV" | "PDF";
export type Currency = string;
export interface Account {
  id: string;
  name: string;
  institution: string;
  type: AccountType;
  currency: Currency;
  status: "active" | "closed" | "archived";
  archivedAt?: string;
  archivedOn?: string;
}
export interface FX {
  rate?: number;
  rateDate?: string;
  rateSource?: string;
}
export interface RecordBase extends FX {
  id: string;
  accountId: string;
  date: string;
  createdAt: string;
  source: Source;
  importId?: string;
  supersededBy?: string;
  confirmed: boolean;
}
export interface Balance extends RecordBase {
  amount: number;
  currency: Currency;
}
export interface ExposurePart {
  label: string;
  weight: number;
}
export interface Classification {
  sectors: ExposurePart[];
  regions: ExposurePart[];
  source: string;
  date: string;
  status: "confirmed" | "uncertain";
}
export interface Position extends FX {
  id: string;
  name: string;
  ticker: string;
  type: string;
  units?: number;
  price?: number;
  value: number;
  currency: Currency;
  sourceRow: string;
  classification?: Classification;
}
export interface PositionSet extends RecordBase {
  positions: Position[];
  cash: number;
  currency: Currency;
}
export interface ImportRecord {
  id: string;
  fingerprint?: string;
  filename: string;
  source: Source;
  date: string;
  createdAt: string;
  accountId: string;
  status: "review" | "confirmed" | "cancelled";
  rows: Position[];
  exceptions: string[];
}
export interface Audit {
  id: string;
  at: string;
  action: string;
  recordIds: string[];
}
export interface State {
  version: 1;
  demo: boolean;
  accounts: Account[];
  balances: Balance[];
  positionSets: PositionSet[];
  imports: ImportRecord[];
  audit: Audit[];
}
export const TYPES: Record<AccountType, string> = {
  cash: "现金 / 存款",
  investment: "投资账户",
  credit: "信用卡",
  federal: "Federal 学生贷款",
  alberta: "Alberta 学生贷款",
  quebec: "Quebec 学生贷款",
  loan: "其他贷款",
};
export const id = () => crypto.randomUUID();
export const today = () => new Date().toLocaleDateString("en-CA");
export const isDebt = (a: Account) => !["cash", "investment"].includes(a.type);
export const emptyState = (): State => ({
  version: 1,
  demo: false,
  accounts: [],
  balances: [],
  positionSets: [],
  imports: [],
  audit: [],
});
// Date-only history keeps the archive day's saved valuations. Current totals
// exclude an archived account immediately; later valuation dates exclude it too.
export function activeAccounts(state: State, date = "9999-12-31") {
  return state.accounts.filter(
    (a) =>
      a.status !== "archived" ||
      date <= (a.archivedOn || a.archivedAt?.slice(0, 10) || ""),
  );
}
export function hasAccountHistory(state: State, accountId: string) {
  return (
    state.balances.some((r) => r.accountId === accountId) ||
    state.positionSets.some((r) => r.accountId === accountId)
  );
}
export function deleteAccount(state: State, accountId: string): State {
  const account = state.accounts.find((a) => a.id === accountId);
  if (!account) throw new Error("账户不存在，请刷新后重试。");
  if (hasAccountHistory(state, accountId))
    throw new Error("此账户已有历史记录，只能归档，不能删除。");
  return {
    ...state,
    accounts: state.accounts.filter((a) => a.id !== accountId),
    audit: [
      ...state.audit,
      {
        id: id(),
        at: new Date().toISOString(),
        action: `删除空账户：${account.institution} · ${account.name}`,
        recordIds: [accountId],
      },
    ],
  };
}
export function archiveAccount(
  state: State,
  accountId: string,
  at = new Date().toISOString(),
  on = today(),
): State {
  const account = state.accounts.find((a) => a.id === accountId);
  if (!account) throw new Error("账户不存在，请刷新后重试。");
  if (account.status === "archived") throw new Error("此账户已归档。");
  return {
    ...state,
    accounts: state.accounts.map((a) =>
      a.id === accountId
        ? { ...a, status: "archived", archivedAt: at, archivedOn: on }
        : a,
    ),
    audit: [
      ...state.audit,
      {
        id: id(),
        at,
        action: `归档账户：${account.institution} · ${account.name}`,
        recordIds: [accountId],
      },
    ],
  };
}
export function cad(amount: number, currency: string, fx: FX): number | null {
  if (!Number.isFinite(amount)) return null;
  if (currency === "CAD" || amount === 0) return amount;
  return fx.rate &&
    Number.isFinite(fx.rate) &&
    fx.rate > 0 &&
    fx.rateDate &&
    fx.rateSource?.trim()
    ? amount * fx.rate
    : null;
}
function latest<T extends RecordBase>(
  records: T[],
  date: string,
): T | undefined {
  return records
    .filter((r) => r.confirmed && !r.supersededBy && r.date <= date)
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        b.createdAt.localeCompare(a.createdAt) ||
        b.id.localeCompare(a.id),
    )[0];
}
export function accountAt(state: State, account: Account, date = "9999-12-31") {
  const balance = latest(
    state.balances.filter((b) => b.accountId === account.id),
    date,
  );
  const set = latest(
    state.positionSets.filter((b) => b.accountId === account.id),
    date,
  );
  const setValue = set
    ? set.positions.reduce<number | null>(
        (sum, p) => {
          const v = cad(p.value, p.currency, p);
          return sum === null || v === null ? null : sum + v;
        },
        cad(set.cash, set.currency, set),
      )
    : null;
  const useBalance = !!balance && (!set || balance.date >= set.date);
  const record = useBalance ? balance : set;
  const value = useBalance
    ? cad(balance!.amount, balance!.currency, balance!)
    : setValue;
  const discrepancy =
    balance &&
    set &&
    balance.date === set.date &&
    setValue !== null &&
    cad(balance.amount, balance.currency, balance) !== null
      ? cad(balance.amount, balance.currency, balance)! - setValue
      : null;
  return {
    account,
    balance,
    set,
    record,
    value,
    date: record?.date,
    discrepancy,
  };
}
export function totals(state: State, date = "9999-12-31") {
  const accounts = activeAccounts(state, date).map((a) =>
    accountAt(state, a, date),
  );
  const assets = accounts
    .filter((a) => !isDebt(a.account))
    .reduce((s, a) => s + (a.value ?? 0), 0);
  const liabilities = accounts
    .filter((a) => isDebt(a.account))
    .reduce((s, a) => s + (a.value ?? 0), 0);
  return {
    assets,
    liabilities,
    net: assets - liabilities,
    accounts,
    missing: accounts.filter((a) => a.value === null),
    dates: [
      ...new Set(accounts.flatMap((a) => (a.date ? [a.date] : []))),
    ].sort(),
  };
}
export function history(state: State) {
  const dates = [
    ...new Set(
      [...state.balances, ...state.positionSets]
        .filter((r) => r.confirmed && !r.supersededBy)
        .map((r) => r.date),
    ),
  ].sort();
  return dates.map((date) => {
    const t = totals(state, date);
    return {
      date,
      ...t,
      stale: t.accounts.filter(
        (a) => a.date && Date.parse(date) - Date.parse(a.date) > 30 * 86400000,
      ),
    };
  });
}
export function comparisonDate(date: string, period: "quarter" | "year") {
  const d = new Date(date + "T12:00:00Z");
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - (period === "quarter" ? 3 : 12));
  const last = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}
export function change(current: number | null, previous: number | null) {
  return {
    amount: current !== null && previous !== null ? current - previous : null,
    percent:
      current !== null && previous !== null && previous !== 0
        ? ((current - previous) / previous) * 100
        : null,
  };
}
export const securityKey = (p: Position) =>
  (p.ticker.trim() || p.name.trim()).normalize("NFKC").toLocaleUpperCase();
export function holdings(state: State, date = "9999-12-31") {
  return activeAccounts(state, date)
    .filter((a) => a.type === "investment")
    .flatMap((a) => {
      const set = accountAt(state, a, date).set;
      return set
        ? set.positions.map((p) => ({
            ...p,
            account: a,
            date: set.date,
            source: set.source,
            importId: set.importId,
            cadValue: cad(p.value, p.currency, p),
          }))
        : [];
    });
}
export function combinedHoldings(state: State, date = "9999-12-31") {
  const map = new Map<
    string,
    {
      key: string;
      name: string;
      type: string;
      value: number;
      unknownFX: boolean;
    }
  >();
  for (const p of holdings(state, date)) {
    const key = securityKey(p);
    const prev = map.get(key) || {
      key,
      name: p.name,
      type: p.type,
      value: 0,
      unknownFX: false,
    };
    prev.value += p.cadValue ?? 0;
    prev.unknownFX ||= p.cadValue === null;
    map.set(key, prev);
  }
  return [...map.values()].sort((a, b) => b.value - a.value);
}
export function exposure(state: State, kind: "sectors" | "regions") {
  const map = new Map<string, number>();
  let total = 0,
    unknown = 0;
  for (const p of holdings(state)) {
    if (p.cadValue === null) continue;
    total += p.cadValue;
    const c = p.classification;
    const parts =
      c?.status === "confirmed" && c.source.trim() && c.date ? c[kind] : [];
    let covered = 0;
    for (const part of parts) {
      const weight = Math.min(Math.max(part.weight, 0), 1 - covered);
      map.set(part.label, (map.get(part.label) || 0) + p.cadValue * weight);
      covered += weight;
    }
    unknown += p.cadValue * (1 - covered);
  }
  if (unknown > 0) map.set("未分类", unknown);
  return {
    total,
    unknown,
    items: [...map]
      .map(([label, value]) => ({
        label,
        value,
        percent: total ? (value / total) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value),
  };
}
export function confirmRecords(
  state: State,
  balance: Balance | undefined,
  set: PositionSet | undefined,
  mode: "replace" | "keep",
  importRecord?: ImportRecord,
): State {
  if (!balance && !set) throw new Error("没有可保存的记录");
  const record = balance || set!;
  const account = state.accounts.find((a) => a.id === record.accountId);
  if (!account || account.status === "archived")
    throw new Error("账户不存在或已归档，不能添加快照。");
  const prior = [
    ...(balance ? state.balances : []),
    ...(set ? state.positionSets : []),
  ].filter(
    (r) =>
      r.accountId === record.accountId &&
      r.date === record.date &&
      !r.supersededBy,
  );
  const supersede = <T extends RecordBase>(r: T): T =>
    mode === "replace" && prior.some((p) => p.id === r.id)
      ? { ...r, supersededBy: record.id }
      : r;
  return {
    ...state,
    balances: [...state.balances.map(supersede), ...(balance ? [balance] : [])],
    positionSets: [...state.positionSets.map(supersede), ...(set ? [set] : [])],
    imports: importRecord
      ? [
          ...state.imports.filter((i) => i.id !== importRecord.id),
          { ...importRecord, status: "confirmed" },
        ]
      : state.imports,
    audit: [
      ...state.audit,
      {
        id: id(),
        at: record.createdAt,
        action:
          mode === "replace"
            ? "确认并替换快照（保留旧记录）"
            : "确认快照（保留同日记录）",
        recordIds: [
          ...prior.map((p) => p.id),
          ...(balance ? [balance.id] : []),
          ...(set ? [set.id] : []),
        ],
      },
    ],
  };
}
export const STORAGE_KEY = "finances-local-v1";
export function loadState(): State {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return demoState();
  let s: State;
  try {
    s = JSON.parse(raw) as State;
  } catch {
    throw new Error("本地数据无法读取。原数据未被覆盖，请先导出备份。");
  }
  if (
    !s ||
    s.version !== 1 ||
    !Array.isArray(s.accounts) ||
    !Array.isArray(s.balances) ||
    !Array.isArray(s.positionSets) ||
    !Array.isArray(s.imports) ||
    !Array.isArray(s.audit)
  )
    throw new Error("本地数据格式不兼容。请导出备份后处理，原数据未被覆盖。");
  return s;
}
export function demoState(): State {
  const s = emptyState();
  s.demo = true;
  const defs: [string, string, AccountType, string, number][] = [
    ["cibc", "CIBC", "cash", "日常账户", 4280],
    ["manulife", "Manulife Bank", "cash", "储蓄", 18000],
    ["desjardins", "Desjardins", "cash", "储蓄", 9500],
    ["simplii", "Simplii", "cash", "日常账户", 3840],
    ["wscash", "Wealthsimple", "cash", "Cash", 13000],
    ["ws", "Wealthsimple", "investment", "TFSA", 26140],
    ["ia", "iA Mobile", "investment", "投资账户", 16660],
    ["cibccard", "CIBC", "credit", "信用卡", 480],
    ["amex", "American Express", "credit", "信用卡", 640],
    ["federal", "Federal", "federal", "学生贷款", 9000],
    ["alberta", "Alberta", "alberta", "学生贷款", 4000],
    ["quebec", "Quebec", "quebec", "学生贷款", 4660],
  ];
  s.accounts = defs.map(([id, institution, type, name]) => ({
    id,
    institution,
    type,
    name,
    currency: "CAD",
    status: "active",
  }));
  s.accounts.push({
    id: "rogers",
    institution: "Rogers",
    name: "Mastercard",
    type: "credit",
    currency: "CAD",
    status: "active",
  });
  for (const date of ["2025-10-07", "2026-07-07", "2026-09-07", "2026-10-07"]) {
    const idx = [
      "2025-10-07",
      "2026-07-07",
      "2026-09-07",
      "2026-10-07",
    ].indexOf(date);
    for (const [aid, , , , amount] of defs) {
      const value =
        aid === "ws"
          ? [21300, 25000, 25500, 26140][idx]
          : aid === "ia"
            ? [14700, 16000, 16020, 16660][idx]
            : amount;
      s.balances.push({
        id: `demo-${aid}-${date}`,
        accountId: aid,
        amount: value,
        currency: "CAD",
        date,
        createdAt: date + "T12:00:00.000Z",
        source: "manual",
        confirmed: true,
      });
    }
    const vals = [
      [13500, 7800, 7000, 7700],
      [15600, 9400, 8900, 7100],
      [15800, 9700, 9200, 6820],
      [16000, 10140, 9500, 7160],
    ][idx];
    for (const aid of ["ws", "ia"]) {
      const positions = (aid === "ws" ? [0, 1] : [2, 3]).map(
        (i): Position => ({
          id: `demo-p-${i}-${date}`,
          name: [
            "示例宽基 ETF",
            "示例科技 ETF",
            "示例平衡基金",
            "示例股票基金",
          ][i],
          ticker: ["DEMO-WIDE", "DEMO-TECH", "DEMO-BAL", "DEMO-EQ"][i],
          type: i < 2 ? "ETF" : "共同基金",
          value: vals[i],
          currency: "CAD",
          sourceRow: "虚构样例",
          classification: {
            sectors:
              i === 1
                ? [{ label: "信息科技", weight: 1 }]
                : [
                    { label: "金融", weight: 0.3 },
                    { label: "医疗保健", weight: 0.25 },
                    { label: "工业", weight: 0.2 },
                    { label: "信息科技", weight: 0.15 },
                  ],
            regions: [
              { label: "美国", weight: 0.48 },
              { label: "加拿大", weight: 0.21 },
              { label: "其他发达市场", weight: 0.18 },
              { label: "新兴市场", weight: 0.08 },
            ],
            source: "虚构示例分类（非真实基金数据）",
            date,
            status: "confirmed",
          },
        }),
      );
      s.positionSets.push({
        id: `demo-set-${aid}-${date}`,
        accountId: aid,
        date,
        createdAt: date + "T12:00:00.000Z",
        source: "manual",
        confirmed: true,
        positions,
        cash: 0,
        currency: "CAD",
      });
    }
  }
  return s;
}
