// Dialog (frosted scrim + square white panel, drift shadow, rise 12px) and
// Toasts, plus a promise-based confirm() used by every delete.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { X, Check, CircleAlert, Info, Trash2 } from 'lucide-react';
import { Button, IconButton, Icon } from './ui.jsx';

export function Dialog({ open, title, children, actions, onClose }) {
  const panel = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    panel.current?.querySelector('button:not(.ol-dialog__close button)')?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="ol-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="ol-dialog" role="dialog" aria-modal="true" aria-label={title} ref={panel}>
        <div className="ol-dialog__close">
          <IconButton icon={X} size={36} label="Close" onClick={onClose} />
        </div>
        {title && <h2 className="ol-dialog__title">{title}</h2>}
        <div className="ol-dialog__body">{children}</div>
        {actions && <div className="ol-dialog__actions">{actions}</div>}
      </div>
    </div>
  );
}

const TONES = {
  success: { icon: Check, bg: 'var(--green-50)', fg: 'var(--success)' },
  danger: { icon: CircleAlert, bg: 'var(--red-50)', fg: 'var(--danger)' },
  info: { icon: Info, bg: 'var(--ice-100)', fg: 'var(--ice-700)' },
  accent: { icon: Trash2, bg: 'var(--carrot-50)', fg: 'var(--accent)' },
};

function Toast({ tone = 'success', title, children, onClose }) {
  const t = TONES[tone] || TONES.success;
  return (
    <div className="ol-toast" role="status">
      <span className="ol-toast__mark" style={{ background: t.bg, color: t.fg }}>
        <Icon icon={t.icon} size={16} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        {title && <p className="ol-toast__title">{title}</p>}
        {children && <p className="ol-toast__body">{children}</p>}
      </div>
      <IconButton icon={X} size={28} label="Dismiss" onClick={onClose} />
    </div>
  );
}

const OverlayContext = createContext(null);

export function OverlayProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirmState] = useState(null);
  const [busy, setBusy] = useState(false);

  const toast = useCallback((t) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((list) => [...list, { ...t, id }]);
    setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), t.ms ?? 5000);
  }, []);

  /** confirm({title, body, what, items, confirmLabel}) -> Promise<boolean> */
  const confirm = useCallback(
    (opts) =>
      new Promise((resolve) => {
        setConfirmState({ ...opts, resolve });
      }),
    [],
  );

  const close = (result) => {
    confirmState?.resolve(result);
    setConfirmState(null);
    setBusy(false);
  };

  return (
    <OverlayContext.Provider value={{ toast, confirm }}>
      {children}
      <Dialog
        open={Boolean(confirmState)}
        title={confirmState?.title}
        onClose={() => close(false)}
        actions={
          <>
            <Button variant="outline" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              iconLeft={confirmState?.icon === null ? null : Trash2}
              disabled={busy}
              onClick={() => {
                setBusy(true);
                close(true);
              }}
            >
              {confirmState?.confirmLabel || 'Delete'}
            </Button>
          </>
        }
      >
        {confirmState?.body && <p style={{ margin: 0 }}>{confirmState.body}</p>}
        {confirmState?.what && <div className="what-goes">{confirmState.what}</div>}
        {confirmState?.items?.length > 0 && (
          <ul className="dialog-list">
            {confirmState.items.map((it, i) => (
              <li key={i}>{it}</li>
            ))}
          </ul>
        )}
        {confirmState?.note && (
          <p className="small muted" style={{ margin: '14px 0 0' }}>
            {confirmState.note}
          </p>
        )}
      </Dialog>
      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <Toast key={t.id} tone={t.tone} title={t.title} onClose={() => setToasts((l) => l.filter((x) => x.id !== t.id))}>
            {t.body}
          </Toast>
        ))}
      </div>
    </OverlayContext.Provider>
  );
}

export function useOverlay() {
  return useContext(OverlayContext);
}
