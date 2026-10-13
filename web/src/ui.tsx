import { createContext, useContext, useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { Check, CircleAlert, LoaderCircle, Sunrise, X } from "lucide-react";
import { dictionaries, type Copy, type Lang } from "./i18n";

export type Toast = { message: string; error?: boolean; action?: () => void; label?: string };
export const Ui = createContext({
  t: dictionaries.en as Copy,
  lang: "en" as Lang,
  setLang: (_lang: Lang) => {},
  notify: (_toast: Toast) => {},
});
export const useUi = () => useContext(Ui);
export function message(error: unknown, t: Copy) {
  const key = error instanceof Error ? error.message : String(error);
  return t.errors[key as keyof typeof t.errors] || t.errors.request_failed;
}
export function Spinner({ size = 17 }: { size?: number }) {
  return <LoaderCircle size={size} className="spin" aria-hidden="true" />;
}
export function Logo() {
  const { t } = useUi();
  return (
    <div className="brand">
      <span className="brand-symbol" aria-hidden="true">
        <Sunrise size={19} strokeWidth={1.9} />
      </span>
      <span>{t.appName}</span>
    </div>
  );
}
export function Language() {
  const { lang, setLang, t } = useUi();
  return (
    <div className="language" role="group" aria-label={t.language}>
      {(["en", "pt"] as Lang[]).map((l) => (
        <button key={l} onClick={() => setLang(l)} aria-pressed={lang === l} lang={l}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
export function Dialog({
  children,
  onClose,
  label,
  className = "",
}: {
  children: ReactNode;
  onClose: () => void;
  label: string;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const { t } = useUi();
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className={className}
      aria-label={label}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target !== ref.current) return;
        const rect = ref.current!.getBoundingClientRect();
        if (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        )
          onClose();
      }}
    >
      <button className="icon-button dialog-close" aria-label={t.close} onClick={onClose}>
        <X size={20} />
      </button>
      {children}
    </dialog>
  );
}
export function Empty({ icon, title, body, children }: { icon: ReactNode; title: string; body: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-symbol">{icon}</span>
      <h3>{title}</h3>
      <p>{body}</p>
      {children}
    </div>
  );
}
export function ToastMessage({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const { t } = useUi();
  useLayoutEffect(() => {
    // Modal dialogs live in the top layer; re-entering it keeps each message visible.
    const element = ref.current;
    if (!element?.showPopover) return;
    if (element.matches(":popover-open")) element.hidePopover();
    element.showPopover();
  }, [toast]);
  return (
    <div ref={ref} popover="manual" className={`toast ${toast.error ? "toast-error" : ""}`} role="status">
      {toast.error ? <CircleAlert size={18} /> : <Check size={18} />}
      <span>{toast.message}</span>
      {toast.action && (
        <button
          onClick={() => {
            toast.action?.();
            onClose();
          }}
        >
          {toast.label}
        </button>
      )}
      <button aria-label={t.close} onClick={onClose}>
        <X size={15} />
      </button>
    </div>
  );
}
