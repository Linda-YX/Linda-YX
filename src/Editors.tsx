import { useState } from "react";
import {
  TYPES,
  confirmRecords,
  id,
  isDebt,
  today,
  type Account,
  type AccountType,
  type Balance,
  type FX,
  type Position,
  type State,
} from "./model";
import { validDate } from "./importers";
import { Modal, type Commit, money } from "./ui";
export function FxFields({
  value,
  onChange,
}: {
  value: FX;
  onChange: (fx: FX) => void;
}) {
  return (
    <div className="formgrid fx-fields">
      <label>
        兑 CAD 汇率
        <input
          aria-label="兑 CAD 汇率"
          type="number"
          min="0.00000001"
          step="any"
          placeholder="例如 1.37"
          value={value.rate ?? ""}
          onChange={(e) =>
            onChange({
              ...value,
              rate: e.target.value ? Number(e.target.value) : undefined,
            })
          }
        />
      </label>
      <label>
        汇率日期
        <input
          type="date"
          value={value.rateDate || ""}
          onChange={(e) => onChange({ ...value, rateDate: e.target.value })}
        />
      </label>
      <label className="span2">
        汇率来源
        <input
          placeholder="例如 Bank of Canada"
          value={value.rateSource || ""}
          onChange={(e) => onChange({ ...value, rateSource: e.target.value })}
        />
      </label>
    </div>
  );
}
export function AccountEditor({
  state,
  commit,
  onClose,
  onCreated,
}: {
  state: State;
  commit: Commit;
  onClose: () => void;
  onCreated?: (a: Account) => void;
}) {
  const [error, setError] = useState("");
  return (
    <Modal
      title="添加账户"
      subtitle="仅保存账户昵称；不要填写完整账号或银行卡号"
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const institution = String(f.get("institution")).trim(),
            name = String(f.get("name")).trim(),
            currency = String(f.get("currency")).trim().toUpperCase();
          if (!institution || !name || !/^[A-Z]{3}$/.test(currency)) {
            setError("请填写机构、昵称和三位币种代码。");
            return;
          }
          if (
            state.accounts.some(
              (a) =>
                a.institution.toLowerCase() === institution.toLowerCase() &&
                a.name.toLowerCase() === name.toLowerCase(),
            )
          ) {
            setError("已有同名账户，请使用不同昵称。");
            return;
          }
          const a: Account = {
            id: id(),
            institution,
            name,
            type: f.get("type") as AccountType,
            currency,
            status: "active",
          };
          if (
            commit(
              {
                ...state,
                accounts: [...state.accounts, a],
                audit: [
                  ...state.audit,
                  {
                    id: id(),
                    at: new Date().toISOString(),
                    action: "添加账户",
                    recordIds: [a.id],
                  },
                ],
              },
              "已添加账户；录入余额后才会计入合计。",
            )
          ) {
            onCreated?.(a);
            onClose();
          }
        }}
      >
        <div className="formgrid">
          <label>
            金融机构
            <input
              name="institution"
              required
              maxLength={80}
              placeholder="例如 Wealthsimple"
              autoFocus
            />
          </label>
          <label>
            账户昵称
            <input
              name="name"
              required
              maxLength={80}
              placeholder="例如 TFSA"
            />
          </label>
          <label>
            账户类型
            <select name="type" aria-label="账户类型">
              {Object.entries(TYPES).map(([v, label]) => (
                <option value={v} key={v}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            币种
            <input
              name="currency"
              required
              pattern="[A-Za-z]{3}"
              maxLength={3}
              defaultValue="CAD"
            />
          </label>
        </div>
        <div className="toast">
          账户可以先创建，稍后再添加余额。未录入的账户不按零余额参与计算。
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            取消
          </button>
          <button className="btn primary">添加账户</button>
        </div>
      </form>
    </Modal>
  );
}
export function BalanceEditor({
  state,
  account,
  commit,
  onClose,
  onAdd,
}: {
  state: State;
  account?: Account;
  commit: Commit;
  onClose: () => void;
  onAdd: () => void;
}) {
  const [accountId, setAccountId] = useState(
      account?.id || state.accounts[0]?.id || "",
    ),
    [date, setDate] = useState(today()),
    [fx, setFx] = useState<FX>({}),
    [error, setError] = useState(""),
    [mode, setMode] = useState<"replace" | "keep">("replace");
  const selected = state.accounts.find((a) => a.id === accountId);
  const existing = state.balances.filter(
    (b) =>
      b.accountId === accountId &&
      b.date === date &&
      b.confirmed &&
      !b.supersededBy,
  );
  return (
    <Modal
      title="手动记录余额"
      subtitle="保存为新的已确认快照，保留历史记录"
      onClose={onClose}
    >
      {!state.accounts.length ? (
        <>
          <div className="toast">先添加一个账户，再记录余额。</div>
          <div className="modal-actions">
            <button className="btn primary" onClick={onAdd}>
              ＋ 添加账户
            </button>
          </div>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget),
              amount = Number(f.get("amount"));
            if (
              !selected ||
              !Number.isFinite(amount) ||
              amount < 0 ||
              !validDate(date) ||
              date > today()
            ) {
              setError("请检查账户、非负余额和有效日期。");
              return;
            }
            if (
              selected.currency !== "CAD" &&
              (fx.rate || fx.rateDate || fx.rateSource) &&
              (!fx.rate ||
                fx.rate <= 0 ||
                !validDate(fx.rateDate || "") ||
                !fx.rateSource?.trim())
            ) {
              setError("汇率、汇率日期和来源需要完整填写，或全部留空。");
              return;
            }
            const balance: Balance = {
              id: id(),
              accountId,
              amount,
              currency: selected.currency,
              date,
              createdAt: new Date().toISOString(),
              source: "manual",
              confirmed: true,
              ...fx,
            };
            if (
              commit(
                confirmRecords(state, balance, undefined, mode),
                "余额快照已保存。",
              )
            )
              onClose();
          }}
        >
          <div className="formgrid">
            <label className="span2">
              账户
              <select
                aria-label="账户"
                value={accountId}
                onChange={(e) => {
                  setAccountId(e.target.value);
                  setFx({});
                }}
              >
                {state.accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.institution} · {a.name} ({a.currency})
                  </option>
                ))}
              </select>
            </label>
            <label>
              {selected && isDebt(selected) ? "欠款（正数）" : "余额"}（
              {selected?.currency}）
              <input
                name="amount"
                type="number"
                min="0"
                max="100000000000000"
                step="0.01"
                required
                placeholder="0.00"
                autoFocus
              />
            </label>
            <label>
              余额日期
              <input
                type="date"
                required
                max={today()}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
          </div>
          {selected && selected.currency !== "CAD" && (
            <>
              <div className="toast">
                未提供完整汇率时，保留原币记录，但不计入 CAD 合计。
              </div>
              <FxFields value={fx} onChange={setFx} />
            </>
          )}
          {existing.length > 0 && (
            <div className="warning">
              <strong>同日已有 {existing.length} 条余额快照</strong>
              <p>
                最近记录：{money(existing.at(-1)!.amount, selected?.currency)}
                。同日记录不会重复累加。
              </p>
              <label>
                处理方式
                <select
                  value={mode}
                  onChange={(e) =>
                    setMode(e.target.value as "replace" | "keep")
                  }
                >
                  <option value="replace">替换原快照，保留审计记录</option>
                  <option value="keep">保留两份，最新确认记录用于统计</option>
                </select>
              </label>
            </div>
          )}
          <div className="toast">
            {selected && isDebt(selected)
              ? "信用卡与贷款按正数保存欠款，净资产会自动扣除。"
              : "投资账户余额不会与持仓重复相加。"}{" "}
            保存后可在账户历史中查看来源和日期。
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <button className="btn" type="button" onClick={onClose}>
              取消
            </button>
            <button className="btn primary" disabled={!selected}>
              确认保存余额
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
export const newPosition = (currency = "CAD"): Position => ({
  id: id(),
  name: "",
  ticker: "",
  type: "ETF",
  value: NaN,
  currency,
  sourceRow: "手动录入",
});
export function positionErrors(rows: Position[]) {
  const errors: string[] = [];
  rows.forEach((p, i) => {
    const prefix = `第 ${i + 1} 项`;
    if (!p.name.trim()) errors.push(`${prefix}缺少证券名称`);
    if (!Number.isFinite(p.value) || p.value < 0)
      errors.push(`${prefix}市值必须是非负数字`);
    if (!/^[A-Z]{3}$/.test(p.currency))
      errors.push(`${prefix}需要三位币种代码`);
    if (p.units !== undefined && (!Number.isFinite(p.units) || p.units < 0))
      errors.push(`${prefix}数量无效`);
    if (p.price !== undefined && (!Number.isFinite(p.price) || p.price < 0))
      errors.push(`${prefix}单价无效`);
    if (
      p.currency !== "CAD" &&
      (p.rate || p.rateDate || p.rateSource) &&
      (!p.rate ||
        p.rate <= 0 ||
        !validDate(p.rateDate || "") ||
        !p.rateSource?.trim())
    )
      errors.push(`${prefix}汇率信息不完整`);
    const c = p.classification;
    if (
      c &&
      (c.sectors.length || c.regions.length) &&
      (!c.source.trim() || !validDate(c.date))
    )
      errors.push(`${prefix}分类需要来源与有效日期`);
  });
  return errors;
}
export function PositionRows({
  rows,
  onChange,
  defaultCurrency = "CAD",
}: {
  rows: Position[];
  onChange: (rows: Position[]) => void;
  defaultCurrency?: string;
}) {
  const update = (index: number, patch: Partial<Position>) =>
    onChange(rows.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  return (
    <div className="position-editor">
      {rows.map((p, i) => (
        <div className="position-card" key={p.id}>
          <div className="position-card-head">
            <strong>持仓 {i + 1}</strong>
            <button
              type="button"
              className="smalllink negative"
              onClick={() => onChange(rows.filter((_, index) => index !== i))}
            >
              移除
            </button>
          </div>
          <div className="formgrid position-grid">
            <label>
              证券名称
              <input
                aria-label={`证券名称 ${i + 1}`}
                value={p.name}
                required
                maxLength={160}
                onChange={(e) => update(i, { name: e.target.value })}
              />
            </label>
            <label>
              证券代码
              <input
                value={p.ticker}
                maxLength={32}
                onChange={(e) => update(i, { ticker: e.target.value })}
              />
            </label>
            <label>
              证券类别
              <select
                value={
                  ["ETF", "共同基金", "股票", "债券", "现金", "其他"].includes(
                    p.type,
                  )
                    ? p.type
                    : "其他"
                }
                onChange={(e) => update(i, { type: e.target.value })}
              >
                {["ETF", "共同基金", "股票", "债券", "现金", "其他"].map(
                  (t) => (
                    <option key={t}>{t}</option>
                  ),
                )}
              </select>
            </label>
            <label>
              市值
              <input
                aria-label={`市值 ${i + 1}`}
                type="number"
                min="0"
                step="any"
                required
                value={Number.isFinite(p.value) ? p.value : ""}
                onChange={(e) =>
                  update(i, {
                    value: e.target.value ? Number(e.target.value) : NaN,
                  })
                }
              />
            </label>
            <label>
              币种
              <input
                aria-label={`币种 ${i + 1}`}
                value={p.currency}
                pattern="[A-Z]{3}"
                maxLength={3}
                required
                onChange={(e) =>
                  update(i, { currency: e.target.value.toUpperCase() })
                }
              />
            </label>
            <label>
              数量（选填）
              <input
                type="number"
                min="0"
                step="any"
                value={p.units ?? ""}
                onChange={(e) =>
                  update(i, {
                    units: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
              />
            </label>
            <label>
              单价（选填）
              <input
                type="number"
                min="0"
                step="any"
                value={p.price ?? ""}
                onChange={(e) =>
                  update(i, {
                    price: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
              />
            </label>
          </div>
          <div className="source-row">来源：{p.sourceRow}</div>
          {p.currency !== "CAD" && (
            <FxFields value={p} onChange={(fx) => update(i, fx)} />
          )}
          <details className="disclosure">
            <summary>行业 / 地区分类（选填，未知时留空）</summary>
            <div className="formgrid">
              {(["sectors", "regions"] as const).map((key) => (
                <label key={key}>
                  {key === "sectors" ? "行业" : "地区"}
                  <input
                    placeholder="未知时留空"
                    value={
                      p.classification?.[key].map((s) => s.label).join(" / ") ||
                      ""
                    }
                    onChange={(e) => {
                      const current = p.classification || {
                        sectors: [],
                        regions: [],
                        source: "",
                        date: "",
                        status: "confirmed" as const,
                      };
                      update(i, {
                        classification: {
                          ...current,
                          [key]: e.target.value.trim()
                            ? [{ label: e.target.value, weight: 1 }]
                            : [],
                        },
                      });
                    }}
                  />
                </label>
              ))}
              <label>
                分类来源
                <input
                  value={p.classification?.source || ""}
                  placeholder="报告或基金资料来源"
                  onChange={(e) =>
                    update(i, {
                      classification: {
                        sectors: [],
                        regions: [],
                        date: "",
                        status: "confirmed",
                        ...p.classification,
                        source: e.target.value,
                      },
                    })
                  }
                />
              </label>
              <label>
                分类日期
                <input
                  type="date"
                  value={p.classification?.date || ""}
                  onChange={(e) =>
                    update(i, {
                      classification: {
                        sectors: [],
                        regions: [],
                        source: "",
                        status: "confirmed",
                        ...p.classification,
                        date: e.target.value,
                      },
                    })
                  }
                />
              </label>
            </div>
          </details>
        </div>
      ))}
      <button
        type="button"
        className="btn"
        onClick={() => onChange([...rows, newPosition(defaultCurrency)])}
      >
        ＋ 添加一笔持仓
      </button>
    </div>
  );
}
