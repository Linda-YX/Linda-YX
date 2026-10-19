import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { State } from "./model";
export type Commit = (next: State, message?: string) => boolean;
export const money = (n: number | null, currency = "CAD") =>
  n === null
    ? "—"
    : new Intl.NumberFormat("en-CA", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
        minimumFractionDigits: 0,
      }).format(n);
export const percent = (n: number | null) =>
  n === null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
export const signed = (n: number | null) =>
  n === null ? "—" : `${n > 0 ? "+" : n < 0 ? "−" : ""}${money(Math.abs(n))}`;
export const COLORS = [
  "#267b43",
  "#78ad85",
  "#b4cdb0",
  "#dce5d6",
  "#9db8a3",
  "#7d8e7c",
];
const CloseModal = createContext<(() => void) | undefined>(undefined);
export function CancelButton({ children = "取消" }: { children?: ReactNode }) {
  const close = useContext(CloseModal);
  return (
    <button type="button" className="btn" onClick={close}>
      {children}
    </button>
  );
}
export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
  dirty = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  dirty?: boolean;
}) {
  const [edited, setEdited] = useState(false);
  const [discardPrompt, setDiscardPrompt] = useState(false);
  const ref = useRef<HTMLDialogElement>(null),
    label = useId();
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  function requestClose() {
    if (dirty || edited) setDiscardPrompt(true);
    else onClose();
  }
  return (
    <dialog
      ref={ref}
      className={`dialog ${wide ? "wide" : ""}`}
      aria-labelledby={label}
      onCancel={(e) => {
        e.preventDefault();
        e.stopPropagation();
        requestClose();
      }}
      onInputCapture={() => setEdited(true)}
      onChangeCapture={() => setEdited(true)}
      onClick={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div className="modalbox">
        <div className="modalhead">
          <div>
            <h2 id={label}>{title}</h2>
            {subtitle && <div className="invest-meta">{subtitle}</div>}
          </div>
          <button
            type="button"
            className="close"
            onClick={requestClose}
            aria-label="关闭"
          >
            ×
          </button>
        </div>
        <CloseModal.Provider value={requestClose}>
          {children}
        </CloseModal.Provider>
      </div>
      {discardPrompt && (
        <Modal
          title="放弃未保存的内容？"
          onClose={() => setDiscardPrompt(false)}
        >
          <p className="warning">
            这些内容尚未保存或提交。选择“放弃更改并关闭”会丢弃本次输入，不会保存余额、账户或持仓。
          </p>
          <div className="modal-actions">
            <button
              type="button"
              className="btn"
              autoFocus
              onClick={() => setDiscardPrompt(false)}
            >
              继续编辑
            </button>
            <button type="button" className="btn danger" onClick={onClose}>
              放弃更改并关闭
            </button>
          </div>
        </Modal>
      )}
    </dialog>
  );
}
export function Section({
  title,
  note,
  action,
}: {
  title: string;
  note?: string;
  action?: ReactNode;
}) {
  return (
    <div className="sectionhead">
      <div>
        <h2>{title}</h2>
        {note && <p>{note}</p>}
      </div>
      {action}
    </div>
  );
}
export function Toggle({
  value,
  onChange,
}: {
  value: "quarter" | "year";
  onChange: (v: "quarter" | "year") => void;
}) {
  return (
    <div className="period-toggle" aria-label="比较期间">
      {(["quarter", "year"] as const).map((v) => (
        <button
          key={v}
          type="button"
          className={value === v ? "active" : ""}
          aria-pressed={value === v}
          onClick={() => onChange(v)}
        >
          {v === "quarter" ? "季度" : "一年"}
        </button>
      ))}
    </div>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="empty">
      <span>◌</span>
      <p>{children}</p>
    </div>
  );
}
export function FxNote({
  currency,
  rate,
  rateDate,
  rateSource,
}: {
  currency: string;
  rate?: number;
  rateDate?: string;
  rateSource?: string;
}) {
  if (currency === "CAD") return null;
  return (
    <span className="fx-note">
      {rate && rateDate && rateSource
        ? `1 ${currency} = ${rate} CAD · ${rateDate} · ${rateSource}`
        : "缺少汇率：未计入 CAD 合计"}
    </span>
  );
}
