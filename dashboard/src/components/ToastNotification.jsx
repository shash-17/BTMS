import { createContext, useContext, useState, useCallback, useRef } from "react";

const ToastContext = createContext(null);

const ICONS = {
  critical: "🔴",
  warning:  "🟡",
  success:  "🟢",
  info:     "⚫",
};

const DEFAULT_DURATION = 4000;

let _idCounter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef({});

  const dismiss = useCallback((id) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, dismissing: true } : t))
    );
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 220);
  }, []);

  const addToast = useCallback(
    ({ type = "info", title, message, duration = DEFAULT_DURATION }) => {
      const id = ++_idCounter;
      setToasts((prev) => [...prev, { id, type, title, message, duration, dismissing: false }]);

      if (duration > 0) {
        timersRef.current[id] = setTimeout(() => dismiss(id), duration);
      }

      return id;
    },
    [dismiss]
  );

  const clearAll = useCallback(() => {
    Object.values(timersRef.current).forEach(clearTimeout);
    timersRef.current = {};
    setToasts([]);
  }, []);

  return (
    <ToastContext.Provider value={{ addToast, dismiss, clearAll }}>
      {children}
      <div className="toast-container" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast toast-${t.type}${t.dismissing ? " dismissing" : ""}`}
            onClick={() => dismiss(t.id)}
            role="alert"
          >
            <span className="toast-icon" aria-hidden="true">
              {ICONS[t.type] ?? "⚫"}
            </span>
            <div className="toast-body">
              {t.title && <div className="toast-title">{t.title}</div>}
              {t.message && <div className="toast-message">{t.message}</div>}
            </div>
            <button
              className="toast-dismiss"
              onClick={(e) => { e.stopPropagation(); dismiss(t.id); }}
              aria-label="Dismiss notification"
            >
              ✕
            </button>
            {t.duration > 0 && (
              <div
                className="toast-progress"
                style={{ animationDuration: `${t.duration}ms` }}
              />
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}
