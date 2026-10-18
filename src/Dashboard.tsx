import { useId, useState } from "react";
import {
  accountAt,
  activeAccounts,
  hasAccountHistory,
  change,
  combinedHoldings,
  comparisonDate,
  exposure,
  history,
  holdings,
  isDebt,
  securityKey,
  totals,
  TYPES,
  type Account,
  type State,
} from "./model";
import {
  COLORS,
  Empty,
  FxNote,
  Section,
  Toggle,
  money,
  percent,
  signed,
} from "./ui";
type Props = { state: State };
export function Trend({
  points,
  label,
}: {
  points: {
    date: string;
    net: number;
    missing?: unknown[];
    stale?: unknown[];
  }[];
  label: string;
}) {
  const gradient = useId().replaceAll(":", "");
  if (!points.length)
    return <Empty>记录第一笔余额后，这里会显示真实的快照历史。</Empty>;
  const min = Math.min(...points.map((p) => p.net)),
    max = Math.max(...points.map((p) => p.net)),
    range = max - min || Math.abs(max) * 0.1 || 1;
  const start = Date.parse(points[0].date),
    end = Date.parse(points.at(-1)!.date);
  const coords = points.map((p) => ({
    x:
      start === end
        ? 240
        : 10 + ((Date.parse(p.date) - start) / (end - start)) * 460,
    y: 120 - ((p.net - min) / range) * 95,
    p,
  }));
  const path = coords.map((c) => `${c.x},${c.y}`).join(" ");
  return (
    <>
      <div className="chart">
        <svg
          viewBox="0 0 480 145"
          preserveAspectRatio="none"
          role="img"
          aria-label={label}
        >
          <defs>
            <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#5c8ddd" stopOpacity=".22" />
              <stop offset="1" stopColor="#5c8ddd" stopOpacity="0" />
            </linearGradient>
          </defs>
          <line className="axis" x1="0" y1="130" x2="480" y2="130" />
          <line className="axis" x1="0" y1="76" x2="480" y2="76" />
          {coords.length > 1 && (
            <>
              <polygon
                points={`${coords[0].x},140 ${path} ${coords.at(-1)!.x},140`}
                fill={`url(#${gradient})`}
              />
              <polyline points={path} className="line" />
            </>
          )}
          {coords.map(({ x, y, p }) => (
            <circle
              key={p.date}
              cx={x}
              cy={y}
              r="3.5"
              fill="#427bd6"
              stroke="#fff"
              strokeWidth="1.5"
            >
              <title>
                {p.date} · {money(p.net)}
                {p.missing?.length ? " · 部分账户缺少数据" : ""}
              </title>
            </circle>
          ))}
        </svg>
      </div>
      <div className="chart-labels">
        <span>{points[0].date}</span>
        <span>{points.length} 个已保存快照日期</span>
        <span>{points.at(-1)!.date}</span>
      </div>
      <details className="disclosure">
        <summary>查看快照数值与完整性</summary>
        <div className="history-values">
          {points.map((p) => (
            <div key={p.date}>
              {p.date}
              <strong>{money(p.net)}</strong>
              <small>
                {p.missing?.length
                  ? `${p.missing.length} 个账户无可用余额`
                  : "所有账户有余额"}
                {p.stale?.length
                  ? ` · ${p.stale.length} 个账户数据超过 30 天`
                  : ""}{" "}
                · 按该日及之前最近记录汇总
              </small>
            </div>
          ))}
        </div>
      </details>
    </>
  );
}
export function NetWorth({ state }: Props) {
  const t = totals(state),
    h = history(state),
    current = h.at(-1),
    previous = h.length > 1 ? h.at(-2) : null;
  const scopeChanged = [current, previous].some(
    (point) =>
      point &&
      point.accounts.some(
        (a) => !t.accounts.some((b) => b.account.id === a.account.id),
      ),
  );
  const delta =
    current && previous && !scopeChanged ? current.net - previous.net : null;
  return (
    <>
      <div className="panel hero">
        <div>
          <div className="hero-label">
            净资产 <span className="currency-badge">CAD</span>
          </div>
          <div className="hero-value" data-testid="net-worth">
            {money(t.net)}
          </div>
          <div className={delta !== null && delta < 0 ? "negative" : "change"}>
            {scopeChanged
              ? "归档已调整当前统计范围"
              : delta === null
                ? "记录快照，开始追踪变化"
                : `${signed(delta)}`}
            <span className="period">
              {scopeChanged
                ? "历史图表保留原快照"
                : previous
                  ? `较 ${previous.date} 快照`
                  : "暂无可比较历史"}
            </span>
          </div>
          <div className="balance-split">
            <div>
              <div className="split-label">总资产</div>
              <div className="split-value">{money(t.assets)}</div>
            </div>
            <div>
              <div className="split-label">总负债</div>
              <div className="split-value debt">−{money(t.liabilities)}</div>
            </div>
          </div>
        </div>
        <div>
          <div className="hero-label">净资产变化 · 已确认快照</div>
          <Trend points={h} label="净资产历史：仅连接已确认的快照日期" />
        </div>
      </div>
      <Quality state={state} />
    </>
  );
}
export function Quality({ state }: Props) {
  const t = totals(state);
  const dated = t.accounts.filter((a) => a.date);
  const stale = dated.filter(
    (a) =>
      a.date! < new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
  );
  const mismatch = dated.filter(
    (a) => a.discrepancy !== null && Math.abs(a.discrepancy) > 0.01,
  );
  return (
    <div className="data-note">
      <span className="status-dot" />
      {t.dates.length > 1
        ? `合计使用不同日期的快照（${t.dates[0]} 至 ${t.dates.at(-1)}）`
        : t.dates.length
          ? `快照日期 ${t.dates[0]}`
          : "尚无已确认数据"}
      {t.missing.length > 0 &&
        ` · ${t.missing.length} 个账户未录入或缺少汇率，未计入合计`}
      {stale.length > 0 && ` · ${stale.length} 个账户超过 30 天未更新`}
      {state.accounts.some((a) => a.status === "archived") &&
        " · 已归档账户不计入当前合计，历史按归档日期保留"}
      {mismatch.length > 0 && (
        <span className="negative">
          {" "}
          · {mismatch.length} 个投资账户总额与持仓不一致，请在账户页核对
        </span>
      )}
    </div>
  );
}
export function AccountLine({
  state,
  account,
  onEdit,
  onManage,
}: {
  state: State;
  account: Account;
  onEdit?: (a: Account) => void;
  onManage?: (a: Account) => void;
}) {
  const a = accountAt(state, account),
    debt = isDebt(account);
  const logo: Record<string, string> = {
    CIBC: "CIBC",
    "Manulife Bank": "M",
    Desjardins: "D",
    Simplii: "S",
    Wealthsimple: "WS",
    "iA Mobile": "iA",
    "American Express": "AMEX",
    Federal: "FED",
    Alberta: "AB",
    Quebec: "QC",
    Rogers: "R",
  };
  const record = a.record;
  return (
    <div className="account-line">
      <div className="account-id">
        <span className={`logo logo-${account.type}`}>
          {logo[account.institution] ||
            account.institution.slice(0, 3).toUpperCase()}
        </span>
        <div>
          <div className="account-name">
            {account.institution} · {account.name}{" "}
            {account.status === "closed" && (
              <span className="method-badge">已关闭</span>
            )}
            {account.status === "archived" && (
              <span className="tag neutral">已归档</span>
            )}
          </div>
          <div className="account-sub">
            {account.currency} ·{" "}
            {record
              ? `${record.date} · ${record.source === "manual" ? "手动" : record.source}`
              : "待录入 · 不计入合计"}
            {record && Date.now() - Date.parse(record.date) > 30 * 86400000 && (
              <span className="stale-label"> · 已过期（超过 30 天）</span>
            )}
          </div>
          {record && <FxNote {...record} currency={account.currency} />}
        </div>
      </div>
      <div>
        <div className={`amount ${debt ? "debt" : ""}`}>
          {a.value === null ? "—" : `${debt ? "−" : ""}${money(a.value)}`}
        </div>
        {account.currency !== "CAD" && a.balance && (
          <div className="account-sub right">
            原币 {money(a.balance.amount, a.balance.currency)}
          </div>
        )}
        {onEdit && (
          <button
            className="smalllink edit-link"
            onClick={() => onEdit(account)}
          >
            记录余额
          </button>
        )}
        {onManage && (
          <button
            type="button"
            className="smalllink edit-link negative"
            aria-label={`${hasAccountHistory(state, account.id) ? "归档" : "删除"}账户 ${account.institution} · ${account.name}`}
            onClick={() => onManage(account)}
          >
            {hasAccountHistory(state, account.id) ? "归档账户" : "删除账户"}
          </button>
        )}
      </div>
    </div>
  );
}
export function Overview({
  state,
  go,
}: {
  state: State;
  go: (page: string) => void;
}) {
  const currentAccounts = activeAccounts(state);
  const t = totals(state),
    [period, setPeriod] = useState<"quarter" | "year">("year");
  const top = combinedHoldings(state).slice(0, 3);
  const latest = holdings(state)
    .map((p) => p.date)
    .sort()
    .at(-1);
  const cut = latest ? comparisonDate(latest, period) : "";
  const previous = combinedHoldings(state, cut);
  const investment = currentAccounts
    .filter((a) => a.type === "investment")
    .reduce((s, a) => s + (accountAt(state, a).value ?? 0), 0);
  return (
    <>
      <NetWorth state={state} />
      <Section
        title="账户概览"
        note="资产与负债分组显示"
        action={
          <button className="smalllink" onClick={() => go("accounts")}>
            查看全部账户　→
          </button>
        }
      />
      <div className="overviewgrid">
        <section className="panel panelpad">
          <div className="snapshot-total">
            <span>资产账户</span>
            <strong>{money(t.assets)}</strong>
          </div>
          {currentAccounts
            .filter((a) => a.type === "cash")
            .map((a) => (
              <AccountLine key={a.id} state={state} account={a} />
            ))}
          {currentAccounts.some((a) => a.type === "investment") && (
            <div className="account-line">
              <div className="account-id">
                <span className="logo">INV</span>
                <div>
                  <div className="account-name">
                    投资账户　
                    {
                      currentAccounts.filter((a) => a.type === "investment")
                        .length
                    }{" "}
                    个
                  </div>
                  <div className="account-sub">按账户总额计入一次</div>
                </div>
              </div>
              <div className="amount">{money(investment)}</div>
            </div>
          )}
          {!currentAccounts.length && (
            <Empty>添加现金或投资账户，开始建立资产概览。</Empty>
          )}
        </section>
        <section className="panel panelpad">
          <div className="snapshot-total">
            <span>负债账户</span>
            <strong className="amount debt">−{money(t.liabilities)}</strong>
          </div>
          {[
            { label: "信用卡欠款", types: ["credit"] },
            { label: "学生贷款", types: ["federal", "alberta", "quebec"] },
            { label: "其他贷款", types: ["loan"] },
          ].map((group) => {
            const accounts = currentAccounts.filter((a) =>
              group.types.includes(a.type),
            );
            return (
              accounts.length > 0 && (
                <div className="debt-block" key={group.label}>
                  <div className="debt-heading">
                    <span>{group.label}</span>
                    <strong>
                      −
                      {money(
                        accounts.reduce(
                          (s, a) => s + (accountAt(state, a).value ?? 0),
                          0,
                        ),
                      )}
                    </strong>
                  </div>
                  {accounts.map((a) => (
                    <AccountLine key={a.id} state={state} account={a} />
                  ))}
                </div>
              )
            );
          })}
          {!currentAccounts.some(isDebt) && (
            <Empty>信用卡与学生贷款会在这里分开统计。</Empty>
          )}
          <div className="legendnote">负债按正数记录欠款，在净资产中扣除。</div>
        </section>
      </div>
      <Section
        title="主要投资标的"
        note="跨平台合并，按当前市值列出主要持仓"
        action={
          <button className="smalllink" onClick={() => go("investments")}>
            查看全部投资　→
          </button>
        }
      />
      <section className="panel panelpad">
        <div className="holding-period">
          <div>
            <div className="hero-label">组合总市值 · CAD</div>
            <div className="invest-total">{money(investment)}</div>
          </div>
          <Toggle value={period} onChange={setPeriod} />
        </div>
        {!top.length ? (
          <Empty>导入或手动添加持仓后，查看市值最大的 3 项。</Empty>
        ) : (
          <div className="table-scroll">
            <table className="table holding-table">
              <thead>
                <tr>
                  <th>主要持仓</th>
                  <th className="right">当前市值</th>
                  <th className="right">金额变化</th>
                  <th className="right">变化率</th>
                </tr>
              </thead>
              <tbody>
                {top.map((p) => {
                  const prev = previous.find((x) => x.key === p.key);
                  const delta = change(
                    p.unknownFX ? null : p.value,
                    prev && !prev.unknownFX ? prev.value : null,
                  );
                  return (
                    <tr key={p.key}>
                      <td>
                        {p.name}
                        <span className="holding-type">
                          {p.type} · 持仓市值变化
                        </span>
                      </td>
                      <td className="right">
                        {p.unknownFX ? "缺少汇率" : money(p.value)}
                      </td>
                      <td
                        className={`right ${delta.amount !== null && delta.amount < 0 ? "negative" : "holding-change"}`}
                      >
                        {signed(delta.amount)}
                      </td>
                      <td className="right">{percent(delta.percent)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="holding-foot">
          仅展示市值最大的 3 项；金额变化包含买卖和存取款，不代表投资回报。
          {cut && `比较基准：${cut} 当日或之前最近的已确认持仓。`}
        </div>
      </section>
    </>
  );
}

function AccountHistory({
  state,
  account: a,
}: {
  state: State;
  account: Account;
}) {
  return (
    <details className="disclosure account-history">
      <summary>{TYPES[a.type]} · 查看余额 / 持仓快照历史</summary>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>日期</th>
              <th>来源</th>
              <th className="right">原币金额</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            {[
              ...state.balances
                .filter((r) => r.accountId === a.id)
                .map((r) => ({
                  ...r,
                  description: money(r.amount, r.currency),
                })),
              ...state.positionSets
                .filter((r) => r.accountId === a.id)
                .map((r) => ({
                  ...r,
                  description: `${r.positions.length} 笔持仓 + ${money(r.cash, r.currency)} 现金`,
                })),
            ]
              .sort(
                (x, y) =>
                  y.date.localeCompare(x.date) ||
                  y.createdAt.localeCompare(x.createdAt),
              )
              .map((r) => (
                <tr key={r.id}>
                  <td>{r.date}</td>
                  <td>{r.source}</td>
                  <td className="right">{r.description}</td>
                  <td>
                    <span className={`tag ${r.supersededBy ? "neutral" : ""}`}>
                      {r.supersededBy ? "已替换 · 保留审计" : "已确认"}
                    </span>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
export function Accounts({
  state,
  onAdd,
  onEdit,
  onManage,
}: {
  state: State;
  onAdd: () => void;
  onEdit: (a: Account) => void;
  onManage: (a: Account) => void;
}) {
  const currentAccounts = activeAccounts(state);
  const archived = state.accounts.filter((a) => a.status === "archived");
  const groups = [
    { label: "现金与存款", types: ["cash"] },
    { label: "投资账户", types: ["investment"] },
    { label: "信用卡", types: ["credit"] },
    { label: "学生贷款", types: ["federal", "alberta", "quebec"] },
    { label: "其他贷款", types: ["loan"] },
  ];
  return (
    <>
      <NetWorth state={state} />
      <Section
        title="全部账户"
        note="保留每次确认的快照；未录入余额的账户不会计入合计"
        action={
          <button className="btn" onClick={onAdd}>
            ＋ 添加账户
          </button>
        }
      />
      {!currentAccounts.length && (
        <section className="panel">
          <Empty>
            还没有账户。点击“添加账户”，只需昵称和机构，无需账号或银行卡号。
          </Empty>
        </section>
      )}
      {groups.map((g) => {
        const accounts = currentAccounts.filter((a) =>
          g.types.includes(a.type),
        );
        return (
          accounts.length > 0 && (
            <section key={g.label} className="panel panelpad account-group">
              <h2 className="panel-title">
                {g.label}
                <span className="group-total">
                  {isDebt(accounts[0]) ? "−" : ""}
                  {money(
                    accounts.reduce(
                      (s, a) => s + (accountAt(state, a).value ?? 0),
                      0,
                    ),
                  )}
                </span>
              </h2>
              {accounts.map((a) => {
                const info = accountAt(state, a);
                return (
                  <div
                    key={a.id}
                    className="account-entry"
                    data-account-id={a.id}
                  >
                    <AccountLine
                      state={state}
                      account={a}
                      onEdit={onEdit}
                      onManage={onManage}
                    />
                    {info.discrepancy !== null &&
                      Math.abs(info.discrepancy) > 0.01 && (
                        <div className="performance-note">
                          总额与持仓及现金相差 {signed(info.discrepancy)}
                          ；净资产使用账户总额，不会重复相加。
                        </div>
                      )}
                    <AccountHistory state={state} account={a} />
                  </div>
                );
              })}
            </section>
          )
        );
      })}
      {archived.length > 0 && (
        <section className="panel panelpad archived-accounts">
          <h2 className="panel-title">已归档账户 · {archived.length}</h2>
          <p className="invest-meta">
            下列为保留的历史余额，不计入当前合计；历史图表保留归档当日及之前的快照。
          </p>
          {archived.map((a) => (
            <div key={a.id} className="account-entry" data-account-id={a.id}>
              <AccountLine state={state} account={a} />
              <div className="account-sub">
                归档日期：{a.archivedOn || a.archivedAt?.slice(0, 10)}
              </div>
              <AccountHistory state={state} account={a} />
            </div>
          ))}
        </section>
      )}
      <div className="legendnote">
        净资产 = 现金与存款 + 投资账户 − 信用卡欠款 − 学生贷款及其他贷款。
      </div>
    </>
  );
}
export function Investments({
  state,
  onImport,
}: {
  state: State;
  onImport: () => void;
}) {
  const [period, setPeriod] = useState<"quarter" | "year">("year"),
    [platform, setPlatform] = useState("all"),
    [type, setType] = useState("all");
  const accounts = activeAccounts(state).filter((a) => a.type === "investment");
  const dated = accounts.map((a) => accountAt(state, a)).filter((a) => a.date);
  const end = dated
    .map((a) => a.date!)
    .sort()
    .at(-1);
  const start = end ? comparisonDate(end, period) : "";
  const current = accounts.map((a) => ({
    a,
    current: accountAt(state, a),
    prev: start ? accountAt(state, a, start) : null,
  }));
  const total = current.reduce((s, a) => s + (a.current.value ?? 0), 0);
  const prior = current.every(
    (a) => a.prev?.value !== null && a.prev?.value !== undefined,
  )
    ? current.reduce((s, a) => s + (a.prev?.value ?? 0), 0)
    : null;
  const diff = change(
    current.every((a) => a.current.value !== null) ? total : null,
    prior,
  );
  const investmentIds = new Set(
    state.accounts.filter((a) => a.type === "investment").map((a) => a.id),
  );
  const investmentDates = [
    ...new Set(
      [...state.balances, ...state.positionSets]
        .filter(
          (r) =>
            investmentIds.has(r.accountId) && r.confirmed && !r.supersededBy,
        )
        .map((r) => r.date),
    ),
  ].sort();
  const all = holdings(state),
    rows = all.filter(
      (p) =>
        (platform === "all" || p.account.institution === platform) &&
        (type === "all" || p.type === type),
    );
  const sector = exposure(state, "sectors"),
    geo = exposure(state, "regions");
  let cumulative = 0;
  const gradient = geo.items
    .map((p, i) => {
      const from = cumulative;
      cumulative += p.percent;
      return `${p.label === "未分类" ? "#bdc7d4" : COLORS[i % COLORS.length]} ${from}% ${cumulative}%`;
    })
    .join(",");
  return (
    <>
      <div className="panel hero">
        <div>
          <div className="hero-label">
            投资组合总市值 <span className="currency-badge">CAD</span>
          </div>
          <div className="hero-value">{money(total)}</div>
          <div
            className={
              diff.amount !== null && diff.amount < 0 ? "negative" : "change"
            }
          >
            {signed(diff.amount)}　{percent(diff.percent)}{" "}
            <span className="period">
              {period === "year" ? "过去一年" : "过去一季度"}金额变化
            </span>
          </div>
          <div className="balance-split">
            <div>
              <div className="split-label">账户数</div>
              <div className="split-value">{accounts.length} 个</div>
            </div>
            <div>
              <div className="split-label">最近报告日期</div>
              <div className="split-value">{end || "暂无"}</div>
            </div>
          </div>
        </div>
        <div>
          <div className="performance-head">
            <div className="hero-label">投资账户金额变化</div>
            <Toggle value={period} onChange={setPeriod} />
          </div>
          <Trend
            points={investmentDates
              .filter((date) => !start || date >= start)
              .map((date) => ({
                date,
                net: activeAccounts(state, date)
                  .filter((a) => a.type === "investment")
                  .reduce(
                    (s, a) => s + (accountAt(state, a, date).value ?? 0),
                    0,
                  ),
                missing: activeAccounts(state, date)
                  .filter((a) => a.type === "investment")
                  .filter((a) => accountAt(state, a, date).value === null),
              }))}
            label="投资账户已确认金额历史"
          />
        </div>
      </div>
      <Quality state={state} />
      <Section
        title="各账户金额变化"
        note="期初与期末市值差额；缺少基准快照时不计算变化"
        action={
          <span className="method-badge">不是扣除存取款后的投资回报</span>
        }
      />
      <section className="panel panelpad">
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>投资账户</th>
                <th className="right">期初金额</th>
                <th className="right">现在金额</th>
                <th className="right">金额变化</th>
                <th className="right">变化率</th>
              </tr>
            </thead>
            <tbody>
              {current.map(({ a, current, prev }) => {
                const diff = change(current.value, prev?.value ?? null);
                return (
                  <tr key={a.id}>
                    <td>
                      {a.institution} · {a.name}
                      <small className="cell-note">
                        基准 {prev?.date || "无记录"} →{" "}
                        {current.date || "无记录"}
                      </small>
                    </td>
                    <td className="right">{money(prev?.value ?? null)}</td>
                    <td className="right">{money(current.value)}</td>
                    <td
                      className={`right ${diff.amount !== null && diff.amount < 0 ? "negative" : "change"}`}
                    >
                      {signed(diff.amount)}
                    </td>
                    <td className="right">{percent(diff.percent)}</td>
                  </tr>
                );
              })}
              <tr className="total-row">
                <td>
                  <strong>组合合计</strong>
                </td>
                <td className="right">{money(prior)}</td>
                <td className="right">{money(total)}</td>
                <td className="right">{signed(diff.amount)}</td>
                <td className="right">{percent(diff.percent)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="performance-note">
          金额变化包含存取款和买卖，不等于实际投资回报。
          {start &&
            `期初使用 ${start} 当日或之前最近的快照；各账户实际日期见上表。`}
        </div>
      </section>
      <Section
        title="投资敞口"
        note="按已知汇率的当前持仓市值加权；账户现金不参与持仓分类"
      />
      <div className="investgrid">
        <section className="panel panelpad">
          <h2 className="panel-title">行业分布</h2>
          {sector.items.length ? (
            sector.items.map((p, i) => (
              <div className="chartbar" key={p.label}>
                <span>{p.label}</span>
                <div className="bar">
                  <span
                    style={{
                      width: `${p.percent}%`,
                      background:
                        p.label === "未分类"
                          ? "#bdc7d4"
                          : COLORS[i % COLORS.length],
                    }}
                  />
                </div>
                <b>{p.percent.toFixed(1)}%</b>
              </div>
            ))
          ) : (
            <Empty>暂无可分类持仓</Empty>
          )}
          <div className="legendnote">
            未分类 {money(sector.unknown)} ·{" "}
            {sector.total
              ? ((sector.unknown / sector.total) * 100).toFixed(1)
              : "0"}
            %
          </div>
        </section>
        <section className="panel panelpad">
          <h2 className="panel-title">地区分布</h2>
          {geo.items.length ? (
            <div className="donut-wrap">
              <div
                className="donut-chart dynamic-donut"
                style={{ background: `conic-gradient(${gradient})` }}
                role="img"
                aria-label={geo.items
                  .map((p) => `${p.label} ${p.percent.toFixed(1)}%`)
                  .join("，")}
              >
                <div>
                  <strong>{money(geo.total)}</strong>
                  <small>已知汇率的持仓</small>
                </div>
              </div>
              <div className="donut-legend">
                {geo.items.map((p, i) => (
                  <div key={p.label}>
                    <span
                      style={
                        {
                          "--legend-color":
                            p.label === "未分类"
                              ? "#bdc7d4"
                              : COLORS[i % COLORS.length],
                        } as React.CSSProperties
                      }
                    >
                      {p.label}
                    </span>
                    <strong>{p.percent.toFixed(1)}%</strong>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <Empty>暂无地区分类数据</Empty>
          )}
          <div className="method">
            仅使用有来源、日期并已确认的分类；未知部分单独显示。ETF
            穿透是分类方法，不作为额外资产计入。
          </div>
        </section>
      </div>
      <Section
        title="持仓明细"
        note="保留每笔来源记录；市值统一展示 CAD"
        action={
          <div className="filters">
            <select
              className="btn"
              aria-label="平台筛选"
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
            >
              <option value="all">所有平台</option>
              {[...new Set(all.map((p) => p.account.institution))].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
            <select
              className="btn"
              aria-label="证券类别筛选"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="all">所有类别</option>
              {[...new Set(all.map((p) => p.type))].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </div>
        }
      />
      <section className="panel panelpad">
        {rows.length ? (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>证券</th>
                  <th>平台 / 账户</th>
                  <th>证券类别</th>
                  <th>行业特征</th>
                  <th className="right">市值 CAD</th>
                  <th className="right">占组合</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={`${p.account.id}-${p.id}`}>
                    <td>
                      {p.name}
                      <small className="cell-note">
                        {p.ticker || "无代码"} · {p.date}
                      </small>
                    </td>
                    <td>
                      {p.account.institution} · {p.account.name}
                    </td>
                    <td>{p.type}</td>
                    <td>
                      {p.classification?.sectors
                        .map((s) => s.label)
                        .join(" / ") || "未分类"}
                    </td>
                    <td className="right">
                      {money(p.cadValue)}
                      <small className="cell-note">
                        {p.currency !== "CAD" ? money(p.value, p.currency) : ""}
                      </small>
                    </td>
                    <td className="right">
                      {p.cadValue !== null && total
                        ? `${((p.cadValue / total) * 100).toFixed(1)}%`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>
            暂无匹配持仓。
            <button className="smalllink" onClick={onImport}>
              导入文件或手动添加 →
            </button>
          </Empty>
        )}
        <details className="disclosure">
          <summary>证券分类、汇率与来源说明</summary>
          <p>
            组合总额采用账户快照；持仓与账户总额有差异时，持仓占比合计可能不等于
            100%。缺少汇率的记录不会计入 CAD 金额。
          </p>
          {all.map((p) => (
            <div className="classification-note" key={p.id}>
              <strong>
                {p.name} · {p.account.institution}
              </strong>
              <span>
                {p.classification
                  ? `${p.classification.source} · ${p.classification.date} · ${p.classification.status === "confirmed" ? "已确认" : "不确定"}`
                  : "未分类，无可验证分类来源"}
              </span>
              <span>
                {p.date} · {p.source} · {p.sourceRow}
              </span>
              <FxNote {...p} />
            </div>
          ))}
        </details>
      </section>
    </>
  );
}
