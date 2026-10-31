import {useEffect, useId, useRef} from 'react';
import './Drawer.css';

// Shared centered editor; keep each form's existing save/cancel behavior.
export default function Drawer({onClose, title, children}) {
  const panel = useRef(null);
  const closeAction = useRef(onClose);
  closeAction.current = onClose;
  const titleID = useId();
  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current.querySelector('button')?.focus();
    function keydown(event) {
      const editors = document.querySelectorAll('.admin-editor');
      if (editors[editors.length - 1] !== panel.current) return;
      if (event.key === 'Escape') { event.preventDefault(); closeAction.current(); }
      if (event.key !== 'Tab') return;
      const controls = [...panel.current.querySelectorAll('button, input, select, textarea, a[href], [tabindex]')]
        .filter(node => !node.disabled && node.tabIndex >= 0 && node.getClientRects().length > 0);
      const first = controls[0], last = controls[controls.length - 1];
      if (!first) { event.preventDefault(); panel.current.focus(); }
      else if (event.shiftKey && (document.activeElement === first || !panel.current.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !panel.current.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('keydown', keydown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);
  return (
    <div className="admin-editor-shell" onClick={event => {if (event.target === event.currentTarget) onClose();}}>
      <section ref={panel} className="admin-editor" role="dialog" aria-modal="true" aria-labelledby={titleID} tabIndex={-1}>
        <header className="admin-editor-header">
          <h2 id={titleID}>{title}</h2>
          <button type="button" className="admin-editor-close" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="admin-editor-body">{children}</div>
      </section>
    </div>
  );
}
