import { useEffect, useRef } from 'react';
import './extras.css';

const FOCUSABLE = 'input,select,textarea,button,a[href],[tabindex]:not([tabindex="-1"])';

export function Modal({ open, title, onClose, children, footer, headerAction, size = 'md', closeOnOverlayClick = true }) {
  const modalRef = useRef(null);
  // Keep the latest onClose in a ref so the focus effect does NOT depend on it.
  // (Callers pass an inline arrow, so a dependency here would re-run the effect
  // on every keystroke and steal focus from the field being typed in.)
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const prevFocus = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; // lock background scroll

    // Move focus into the dialog once, on open — prefer the first form field.
    const el = modalRef.current;
    const firstField = el?.querySelector('input,select,textarea');
    (firstField ?? el)?.focus?.();

    const onKey = (e) => {
      if (e.key === 'Escape') {
        onCloseRef.current?.();
        return;
      }
      if (e.key === 'Tab' && el) {
        const items = [...el.querySelectorAll(FOCUSABLE)].filter((n) => !n.disabled && n.offsetParent !== null);
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus?.(); // restore focus to the trigger
    };
  }, [open]); // only on open/close transitions — never on re-render

  if (!open) return null;

  return (
    <div className="modal__overlay" onMouseDown={(e) => closeOnOverlayClick && e.target === e.currentTarget && onClose?.()}>
      <div ref={modalRef} className={`modal modal--${size}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
        <div className="modal__header">
          <span className="modal__title">{title}</span>
          <div className="modal__header-actions">
            {headerAction}
            <button type="button" className="modal__close" aria-label="Close" onClick={onClose}>
              ×
            </button>
          </div>
        </div>
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__footer">{footer}</div>}
      </div>
    </div>
  );
}
