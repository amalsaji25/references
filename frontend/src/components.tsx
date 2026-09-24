import { useEffect, useRef, useId } from "react";
import type { ReactNode } from "react";
import {
  X,
  Check,
  Clock3,
  ShieldCheck,
  AlertTriangle,
  ScanEye,
} from "lucide-react";
export const labels: Record<string, string> = {
  ACCEPT: "Accepted",
  SELF_CHECKED: "Self-checked",
  REVIEW: "Needs review",
  REJECT: "Rejected",
  PENDING: "Pending",
  COMPLETED: "Completed",
  RUNNING: "Running",
  QUEUED: "Queued",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
  BUDGET_STOPPED: "Budget stopped",
  INTERRUPTED: "Interrupted",
};
export function Badge({ value }: { value: string }) {
  const Icon = ["ACCEPT", "COMPLETED", "CORRECT"].includes(value)
    ? Check
    : ["REJECT", "FAILED", "INCORRECT"].includes(value)
      ? AlertTriangle
      : value === "SELF_CHECKED"
        ? ScanEye
        : Clock3;
  return (
    <span className={`badge ${value.toLowerCase()}`}>
      <Icon size={12} />
      {labels[value] || value.toLowerCase().replaceAll("_", " ")}
    </span>
  );
}
export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current!;
    d.showModal();
    return () => d.close();
  }, []);
  return (
    <dialog
      aria-labelledby={titleId}
      ref={ref}
      className={`modal ${wide ? "wide" : ""}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <header>
        <div>
          <span className="eyebrow">LINGUA WORKSPACE</span>
          <h2 id={titleId}>{title}</h2>
        </div>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
export function Empty({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <ShieldCheck size={38} />
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  );
}
