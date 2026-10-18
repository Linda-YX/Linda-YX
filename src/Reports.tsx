import { useRef, useState } from "react";
import {
  activeAccounts,
  cad,
  confirmRecords,
  id,
  today,
  type Balance,
  type FX,
  type ImportRecord,
  type Position,
  type PositionSet,
  type Source,
  type State,
} from "./model";
import {
  FIELD_LABELS,
  fingerprint,
  mapRows,
  parseCSV,
  parsePDF,
  validDate,
  type Extracted,
  type Field,
} from "./importers";
import { FxFields, PositionRows, newPosition, positionErrors } from "./Editors";
import {
  CancelButton,
  Empty,
  Modal,
  Section,
  money,
  signed,
  type Commit,
} from "./ui";
interface ReviewData {
  source: Source;
  filename: string;
  fingerprint?: string;
  extracted: Extracted;
  id: string;
}
const manualExtracted = (): Extracted => ({
  headers: [],
  data: [],
  mapping: {},
  positions: [newPosition()],
  text: "",
  warnings: [],
  detected: { institution: "", account: "", date: today() },
});
export function Reports({
  state,
  commit,
  onAddAccount,
}: {
  state: State;
  commit: Commit;
  onAddAccount: () => void;
}) {
  const [mode, setMode] = useState<"PDF" | "CSV" | "manual">("PDF"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [pending, setPending] = useState<ReviewData | null>(null),
    [review, setReview] = useState<ReviewData | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  async function readFile(file?: File) {
    if (!file) return;
    setError("");
    setPending(null);
    setBusy(true);
    try {
      if (file.size > 20 * 1024 * 1024)
        throw new Error("文件超过 20 MB，请拆分后重试。");
      const source = mode === "PDF" ? "PDF" : "CSV";
      if (
        (source === "PDF" && !file.name.toLowerCase().endsWith(".pdf")) ||
        (source === "CSV" && !file.name.toLowerCase().endsWith(".csv"))
      )
        throw new Error(`请选择 ${source} 文件。`);
      const [hash, extracted] = await Promise.all([
        fingerprint(file),
        source === "PDF"
          ? parsePDF(file)
          : Promise.resolve(parseCSV(await file.text())),
      ]);
      setPending({
        source,
        filename: file.name,
        fingerprint: hash,
        extracted,
        id: id(),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "读取文件失败，请检查文件。");
    } finally {
      setBusy(false);
    }
  }
  function beginReview(data: ReviewData) {
    const parsed =
      data.source === "CSV"
        ? mapRows(data.extracted)
        : { positions: data.extracted.positions, warnings: [] };
    const record: ImportRecord = {
      id: data.id,
      fingerprint: data.fingerprint,
      filename: data.filename,
      source: data.source,
      date: data.extracted.detected.date,
      createdAt: new Date().toISOString(),
      accountId: "",
      status: "review",
      rows: parsed.positions,
      exceptions: [...data.extracted.warnings, ...parsed.warnings],
    };
    if (
      commit({
        ...state,
        imports: [...state.imports.filter((i) => i.id !== record.id), record],
      })
    )
      setReview(data);
  }
  function cancelReview() {
    if (review) {
      commit(
        {
          ...state,
          imports: state.imports.map((i) =>
            i.id === review.id ? { ...i, status: "cancelled" } : i,
          ),
        },
        "已取消导入，未保存余额或持仓。",
      );
      setReview(null);
    }
  }
  const duplicate =
    pending?.fingerprint &&
    state.imports.find(
      (i) => i.status === "confirmed" && i.fingerprint === pending.fingerprint,
    );
  return (
    <>
      <Section
        title="报告与数据导入"
        note="用 PDF、CSV 或手动输入更新持仓；先核对，再保存"
      />
      <div className="import-layout">
        <section className="panel panelpad">
          <h2 className="panel-title">选择导入方式</h2>
          <div className="import-tabs">
            {(["PDF", "CSV", "manual"] as const).map((m) => (
              <button
                key={m}
                disabled={busy}
                className={mode === m ? "active" : ""}
                onClick={() => {
                  setMode(m);
                  setPending(null);
                  setError("");
                  if (fileRef.current) fileRef.current.value = "";
                }}
              >
                {m === "manual"
                  ? "手动输入"
                  : `${m} ${m === "PDF" ? "报告" : "文件"}`}
              </button>
            ))}
          </div>
          {mode === "manual" ? (
            <div className="manual-intro">
              <span className="manual-icon">✎</span>
              <h3>逐笔记录你的投资持仓</h3>
              <p>
                选择账户，填写证券和市值。支持多笔持仓、原币金额，以及有来源的行业和地区分类。
              </p>
              <div className="toast">
                现金、信用卡与贷款的余额，请使用右上角“记录余额”。
              </div>
            </div>
          ) : (
            <>
              <div
                className={`upload ${busy ? "loading" : ""}`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (!busy) void readFile(e.dataTransfer.files[0]);
                }}
              >
                <div className="arrow">{busy ? "◌" : "↑"}</div>
                <strong>
                  {busy
                    ? "正在本地提取，请稍候…"
                    : mode === "PDF"
                      ? "选择 iA Mobile 或 Wealthsimple 的报告 PDF"
                      : "选择 CSV 持仓文件"}
                </strong>
                <span>
                  {mode === "PDF"
                    ? "上传后尝试识别平台、账户和报告日期；无法确认时由你选择。"
                    : "自动匹配常见中英文列名，也可以在核对时手动匹配。"}
                </span>
                <input
                  type="file"
                  ref={fileRef}
                  accept={
                    mode === "PDF" ? ".pdf,application/pdf" : ".csv,text/csv"
                  }
                  hidden
                  onChange={(e) => void readFile(e.target.files?.[0])}
                />
                <div style={{ marginTop: 13 }}>
                  <button
                    className="btn"
                    disabled={busy}
                    onClick={() => fileRef.current?.click()}
                  >
                    {busy ? "读取中…" : "选择文件"}
                  </button>
                </div>
                {pending && (
                  <div className="selected-file">✓ {pending.filename}</div>
                )}
                <div className="file-footnote">
                  也可拖放文件 · 最大 20 MB · 文件仅在浏览器处理
                </div>
              </div>
              {mode === "CSV" && (
                <a
                  className="smalllink"
                  href={`${import.meta.env.BASE_URL}samples/holdings.csv`}
                  download
                >
                  ↓ 下载 CSV 示例模板
                </a>
              )}
              {duplicate && (
                <div className="warning">
                  该文件已于 {duplicate.createdAt.slice(0, 10)}{" "}
                  导入过。再次导入时请核对账户、日期，并选择替换或保留。
                </div>
              )}
              <div className="toast">
                上传不等于保存。只有在核对页点击“确认导入”后，账户和持仓才会更新。
              </div>
            </>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <button
              className="btn primary"
              disabled={busy || (mode !== "manual" && !pending)}
              onClick={() =>
                beginReview(
                  mode === "manual"
                    ? {
                        source: "manual",
                        filename: "手动录入",
                        extracted: manualExtracted(),
                        id: id(),
                      }
                    : pending!,
                )
              }
            >
              继续到核对　→
            </button>
          </div>
        </section>
        <section className="panel panelpad">
          <h2 className="panel-title">导入会经过这几步</h2>
          <div className="steps">
            {[
              ["选择 PDF、CSV 或手动输入", "使用投资平台报告或持仓文件。"],
              ["确认平台和具体账户", "系统尝试识别，不确定时由你匹配账户。"],
              ["核对持仓并确认", "检查证券、数量、币种、市值与报告日期。"],
            ].map(([title, note], i) => (
              <div className="step" key={title}>
                <span className="stepnum">{i + 1}</span>
                <div>
                  <strong>{title}</strong>
                  <p>{note}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="method">
            PDF 支持提取文本及有限的结构化持仓行；暂不支持扫描件
            OCR。机构报告版式尚需用脱敏样本验证，无法识别时请改用 CSV
            或手动录入。
          </div>
          <div className="method">
            确认后只保留核对数据、来源页 / 行和文件指纹，不保存原始报告。
          </div>
        </section>
      </div>
      <Section title="最近导入" note="待核对的记录不参与财务计算" />
      <section className="panel panelpad">
        {state.imports.length ? (
          [...state.imports]
            .reverse()
            .slice(0, 20)
            .map((record) => {
              const account = state.accounts.find(
                (a) => a.id === record.accountId,
              );
              return (
                <div className="history-row" key={record.id}>
                  <div>
                    {account
                      ? `${account.institution} · ${account.name}`
                      : record.filename}
                    <small>
                      {record.source === "manual" ? "手动" : record.source} ·{" "}
                      {record.date || "日期待确认"} · {record.rows.length} 行 ·{" "}
                      {record.createdAt.slice(0, 10)}
                    </small>
                    {record.status === "review" && (
                      <button
                        className="smalllink"
                        onClick={() =>
                          setReview({
                            id: record.id,
                            source: record.source,
                            filename: record.filename,
                            fingerprint: record.fingerprint,
                            extracted: {
                              ...manualExtracted(),
                              positions: record.rows,
                              warnings: record.exceptions,
                              detected: {
                                institution: account?.institution || "",
                                account: account?.name || "",
                                date: record.date,
                              },
                            },
                          })
                        }
                      >
                        继续核对 →
                      </button>
                    )}
                  </div>
                  <span
                    className={`tag ${record.status !== "confirmed" ? "neutral" : ""}`}
                  >
                    {record.status === "confirmed"
                      ? "已确认"
                      : record.status === "review"
                        ? "待核对"
                        : "已取消"}
                  </span>
                </div>
              );
            })
        ) : (
          <Empty>还没有导入记录。你的第一份报告将从这里开始。</Empty>
        )}
      </section>
      {review && (
        <ImportReview
          key={review.id}
          data={review}
          state={state}
          commit={commit}
          onClose={cancelReview}
          onDone={() => {
            setReview(null);
            setPending(null);
            if (fileRef.current) fileRef.current.value = "";
          }}
          onAddAccount={onAddAccount}
        />
      )}
    </>
  );
}
function ImportReview({
  data,
  state,
  commit,
  onClose,
  onDone,
  onAddAccount,
}: {
  data: ReviewData;
  state: State;
  commit: Commit;
  onClose: () => void;
  onDone: () => void;
  onAddAccount: () => void;
}) {
  const [initial] = useState(() =>
    data.source === "CSV" && data.extracted.data.length
      ? mapRows(data.extracted)
      : { positions: data.extracted.positions, warnings: [] },
  );
  const [extracted, setExtracted] = useState(data.extracted),
    [rows, setRows] = useState<Position[]>(initial.positions),
    [rowWarnings, setRowWarnings] = useState(initial.warnings);
  const accounts = activeAccounts(state);
  const candidates = accounts.filter(
    (a) =>
      a.type === "investment" &&
      a.institution.toLowerCase() ===
        data.extracted.detected.institution.toLowerCase() &&
      (!data.extracted.detected.account ||
        a.name.toLowerCase() === data.extracted.detected.account.toLowerCase()),
  );
  const [accountId, setAccountId] = useState(
      candidates.length === 1 ? candidates[0].id : "",
    ),
    [date, setDate] = useState(data.extracted.detected.date || ""),
    [total, setTotal] = useState(""),
    [cash, setCash] = useState("0"),
    [fx, setFx] = useState<FX>({}),
    [mode, setMode] = useState<"replace" | "keep">("replace"),
    [checked, setChecked] = useState(false),
    [error, setError] = useState("");
  const selected = accounts.find((a) => a.id === accountId);
  const conflicts = [...state.balances, ...state.positionSets].filter(
    (r) =>
      r.accountId === accountId &&
      r.date === date &&
      !r.supersededBy &&
      r.confirmed,
  );
  const duplicate =
    data.fingerprint &&
    state.imports.some(
      (i) => i.status === "confirmed" && i.fingerprint === data.fingerprint,
    );
  const currentValue = rows.reduce(
    (sum, p) => sum + (cad(p.value, p.currency, p) ?? 0),
    0,
  );
  const cashCAD = selected ? cad(Number(cash), selected.currency, fx) : null;
  const totalCAD =
    selected && total !== "" ? cad(Number(total), selected.currency, fx) : null;
  const mismatch =
    rows.every((p) => cad(p.value, p.currency, p) !== null) &&
    totalCAD !== null &&
    cashCAD !== null
      ? totalCAD - currentValue - cashCAD
      : null;
  const blockingSource = [...data.extracted.warnings, ...rowWarnings].filter(
    (w) =>
      w.includes("结构不完整") ||
      w.includes("多个账户") ||
      w.includes("多个金融机构") ||
      w.includes("多个报告日期"),
  );
  function updateMapping(field: Field, column: string) {
    const next = {
      ...extracted,
      mapping: { ...extracted.mapping, [field]: column || undefined },
    };
    setExtracted(next);
    const mapped = mapRows(next);
    setRows(mapped.positions);
    setRowWarnings(mapped.warnings);
    setChecked(false);
  }
  function confirm(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!selected) {
      setError("请选择报告对应的投资账户。");
      return;
    }
    if (!validDate(date) || date > today()) {
      setError("请确认有效的报告日期，不能晚于今天。");
      return;
    }
    if (!rows.length) {
      setError("请至少添加一笔持仓。未识别出持仓时，不能直接保存。");
      return;
    }
    const errors = positionErrors(rows);
    if (errors.length) {
      setError(errors.slice(0, 4).join("；"));
      return;
    }
    if (blockingSource.length) {
      setError(
        "原文件包含错列、多个账户或多个日期，请修正或拆分文件后重新导入。",
      );
      return;
    }
    if (!checked) {
      setError("请先核对持仓和来源，并勾选确认。");
      return;
    }
    if (
      !Number.isFinite(Number(cash)) ||
      Number(cash) < 0 ||
      (total !== "" && (!Number.isFinite(Number(total)) || Number(total) < 0))
    ) {
      setError("账户总额与现金必须为非负数字。");
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
      setError("账户汇率信息需要完整填写或全部留空。");
      return;
    }
    const now = new Date().toISOString();
    const base = {
      accountId,
      date,
      createdAt: now,
      source: data.source,
      importId: data.id,
      confirmed: true,
      ...fx,
    };
    const set: PositionSet = {
      ...base,
      id: id(),
      positions: rows,
      cash: Number(cash),
      currency: selected.currency,
    };
    const balance: Balance | undefined =
      total !== ""
        ? {
            ...base,
            id: id(),
            amount: Number(total),
            currency: selected.currency,
          }
        : undefined;
    const record: ImportRecord = {
      id: data.id,
      fingerprint: data.fingerprint,
      filename: data.filename,
      source: data.source,
      date,
      createdAt: state.imports.find((i) => i.id === data.id)?.createdAt || now,
      accountId,
      status: "confirmed",
      rows,
      exceptions: [
        ...data.extracted.warnings,
        ...rowWarnings,
        ...(mismatch !== null && Math.abs(mismatch) > 0.01
          ? [`账户总额与持仓及现金相差 ${mismatch} CAD`]
          : []),
      ],
    };
    if (
      commit(
        confirmRecords(state, balance, set, mode, record),
        "导入已确认；原始文件未保存。",
      )
    )
      onDone();
  }
  return (
    <Modal
      title="核对并确认导入"
      subtitle={`${data.filename} · 确认前不会更新余额和持仓`}
      onClose={onClose}
      dirty={
        data.source !== "manual" ||
        JSON.stringify(rows) !== JSON.stringify(initial.positions)
      }
      wide
    >
      <form
        onSubmit={confirm}
        onChangeCapture={(e) => {
          if (
            (e.target instanceof HTMLInputElement ? e.target.type : "") !==
            "checkbox"
          )
            setChecked(false);
        }}
      >
        <div className="review-intro">
          <span className="stepnum">2</span>
          <div>
            <strong>先确认账户与报告日期</strong>
            <p>
              识别结果只是建议，请对照报告确认。每次导入一个账户的一份快照。
            </p>
          </div>
        </div>
        <div className="formgrid">
          <label>
            报告对应的投资账户
            <select
              aria-label="报告对应的投资账户"
              required
              value={accountId}
              onChange={(e) => {
                setAccountId(e.target.value);
                const a = accounts.find((a) => a.id === e.target.value);
                setRows(
                  rows.map((p) => ({
                    ...p,
                    currency: p.currency || a?.currency || "",
                  })),
                );
              }}
            >
              <option value="">请选择投资账户</option>
              {accounts
                .filter((a) => a.type === "investment")
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.institution} · {a.name} ({a.currency})
                  </option>
                ))}
            </select>
          </label>
          <label>
            报告日期
            <input
              type="date"
              required
              value={date}
              max={today()}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
        </div>
        <button type="button" className="smalllink" onClick={onAddAccount}>
          ＋ 新建投资账户
        </button>
        {(data.extracted.detected.institution ||
          data.extracted.detected.account) && (
          <div className="data-note">
            尝试识别：{data.extracted.detected.institution} ·{" "}
            {data.extracted.detected.account || "账户待确认"}
          </div>
        )}
        {extracted.headers.length > 0 && (
          <details
            className="mapping"
            open={
              !extracted.mapping.value ||
              (!extracted.mapping.name && !extracted.mapping.ticker)
            }
          >
            <summary>CSV 列匹配（修改后会重新生成核对行）</summary>
            <div className="formgrid mapping-grid">
              {Object.entries(FIELD_LABELS).map(([key, label]) => (
                <label key={key}>
                  {label}
                  <select
                    value={extracted.mapping[key as Field] || ""}
                    onChange={(e) =>
                      updateMapping(key as Field, e.target.value)
                    }
                  >
                    <option value="">不使用此列</option>
                    {extracted.headers.map((h) => (
                      <option key={h}>{h}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </details>
        )}
        {data.extracted.warnings.map((warning, i) => (
          <div className="warning" key={i}>
            {warning}
          </div>
        ))}
        {rowWarnings.length > 0 && (
          <details className="disclosure">
            <summary>{rowWarnings.length} 条提取提示（请在下方修正）</summary>
            {rowWarnings.map((w, i) => (
              <p key={i}>{w}</p>
            ))}
          </details>
        )}
        {data.extracted.text && (
          <details className="disclosure">
            <summary>对照 PDF 提取原文与页码</summary>
            <pre className="pdf-text">{data.extracted.text}</pre>
          </details>
        )}
        <Section
          title="逐项核对持仓"
          note="保留源行，修改提取错误；未填写有来源的分类将显示为未知"
        />
        <PositionRows
          rows={rows}
          onChange={setRows}
          defaultCurrency={selected?.currency}
        />
        <div className="formgrid review-totals">
          <label>
            报告账户总额（{selected?.currency || "账户原币"}，选填）
            <input
              type="number"
              min="0"
              step="any"
              value={total}
              placeholder="有报告总额时填写，避免重复计入"
              onChange={(e) => setTotal(e.target.value)}
            />
          </label>
          <label>
            账户内现金（{selected?.currency || "账户原币"}）
            <input
              type="number"
              min="0"
              step="any"
              value={cash}
              onChange={(e) => setCash(e.target.value)}
              required
            />
          </label>
        </div>
        {selected?.currency !== "CAD" && selected && (
          <FxFields value={fx} onChange={setFx} />
        )}
        <div className="review-summary">
          <span>已知汇率持仓合计</span>
          <strong>{money(currentValue)} CAD</strong>
        </div>
        {rows.some((p) => cad(p.value, p.currency, p) === null) && (
          <div className="warning">
            部分持仓的市值或汇率不完整；没有账户总额时，该账户将无法完整计入净资产。
          </div>
        )}
        {mismatch !== null && Math.abs(mismatch) > 0.01 && (
          <div className="warning">
            报告账户总额与持仓及现金相差 {signed(mismatch)}{" "}
            CAD。请核对：保存后以账户总额计算净资产，持仓不会再次相加。
          </div>
        )}
        {conflicts.length > 0 && (
          <div className="warning">
            <strong>此账户在 {date} 已有快照</strong>
            <p>同日快照不会累加。替换会保留旧记录及审计。</p>
            <label>
              处理方式
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as "replace" | "keep")}
              >
                <option value="replace">
                  替换本次对应的余额 / 持仓，保留旧记录
                </option>
                <option value="keep">保留两份，使用最新确认记录</option>
              </select>
            </label>
          </div>
        )}
        {duplicate && (
          <div className="warning">
            文件指纹与已确认导入相同。请确认确实需要再次导入。
          </div>
        )}
        {blockingSource.length > 0 && (
          <div className="form-error">
            {blockingSource.join("；")} 请修正原文件后重新导入。
          </div>
        )}
        <label className="checkline">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            onClick={(e) => e.stopPropagation()}
          />
          我已核对账户、日期、证券、币种和金额，确认保存这些数据。
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions sticky-actions">
          <CancelButton>取消导入</CancelButton>
          <button
            className="btn primary"
            disabled={!rows.length || !checked || blockingSource.length > 0}
          >
            确认导入 {rows.length} 项持仓
          </button>
        </div>
      </form>
    </Modal>
  );
}
