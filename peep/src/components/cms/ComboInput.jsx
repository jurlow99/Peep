import { useEffect, useId, useRef, useState } from 'react';
import './ComboInput.css';

// Text input with a suggestion list we draw ourselves. The browser's own
// <datalist> popup is unstyleable and shows white-on-white in Safari.
export default function ComboInput({ value, onChange, options = [], placeholder, disabled, className = '', id, ...rest }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const root = useRef(null);
  const listID = useId();
  const typed = String(value || '').trim().toLowerCase();
  const matches = options.filter(o => !typed || String(o).toLowerCase().includes(typed)).slice(0, 12);

  useEffect(() => {
    if (!open) return;
    const away = e => { if (!root.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  function pick(option) { onChange(option); setOpen(false); setActive(-1); }
  function onKeyDown(e) {
    if (!open || !matches.length) { if (e.key === 'ArrowDown') setOpen(true); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => (i + 1) % matches.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => (i - 1 + matches.length) % matches.length); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(matches[active]); }
    else if (e.key === 'Escape') setOpen(false);
  }

  return (
    <div ref={root} className={`combo ${className}`.trim()}>
      <input
        {...rest} id={id} value={value} placeholder={placeholder} disabled={disabled} autoComplete="off"
        role="combobox" aria-expanded={open && matches.length > 0} aria-controls={listID} aria-autocomplete="list"
        onChange={e => { onChange(e.target.value); setOpen(true); setActive(-1); }}
        onFocus={() => setOpen(true)} onKeyDown={onKeyDown}
      />
      {open && matches.length > 0 && (
        <ul id={listID} role="listbox" className="combo-list">
          {matches.map((option, index) => (
            <li key={option} role="option" aria-selected={index === active} className={index === active ? 'active' : ''}
              onMouseDown={e => { e.preventDefault(); pick(option); }} onMouseEnter={() => setActive(index)}>{option}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
