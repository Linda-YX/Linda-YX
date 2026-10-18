import { useEffect, useId, useRef, type ReactNode } from "react";
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
  "#5185d5",
  "#69b69d",
  "#e2b452",
  "#a08bc8",
  "#8aa6be",
  "#bdc7d4",
];
export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    label = useId();
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`dialog ${wide ? "wide" : ""}`}
      aria-labelledby={label}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
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
            onClick={onClose}
            aria-label="关闭"
          >
            ×
          </button>
        </div>
        {children}
      </div>
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
