import { useCallback, useEffect, useState } from 'react';
import { SUPABASE_URL } from '../../lib/config';
import { getAdminToken } from './adminAuth';
import { STAFF_ROLES, canAssign, canEditMember, canManageStaff, roleLabel } from '../../lib/staff';
import './StaffPanel.css';

async function call(body) {
  const token = await getAdminToken();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/manage-staff`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

const when = iso => (iso ? new Date(iso).toLocaleDateString() : '');

// Platform → Staff: who can get into admin and what they can see.
export default function StaffPanel({ staffRole, showToast, logAudit }) {
  const [members, setMembers] = useState(null);
  const [error, setError] = useState('');
  const [invite, setInvite] = useState({ email: '', name: '', role: 'editor' });
  const [busy, setBusy] = useState('');
  const [link, setLink] = useState('');
  const [reloads, setReloads] = useState(0);
  const manager = canManageStaff(staffRole);

  useEffect(() => {
    let live = true;
    call({ action: 'list' })
      .then(data => { if (live) { setMembers(data.members); setError(''); } })
      .catch(e => { if (live) { setError(e.message); setMembers([]); } });
    return () => { live = false; };
  }, [reloads]);
  const load = useCallback(() => setReloads(n => n + 1), []);

  async function run(label, body, done) {
    setBusy(label); setError(''); setLink('');
    try {
      const data = await call(body);
      done?.(data);
      load();
    } catch (e) { setError(e.message); }
    finally { setBusy(''); }
  }

  function sendInvite(e) {
    e.preventDefault();
    run('invite', { action: 'invite', ...invite }, data => {
      logAudit?.('invite', 'staff', data.user_id, `${invite.email} as ${invite.role}`);
      if (data.email_sent) showToast?.(`Invitation sent to ${invite.email}`);
      else { showToast?.(`Added, but the email didn't send: ${data.email_error}. Copy the link below.`, 'error'); setLink(data.link || ''); }
      setInvite({ email: '', name: '', role: 'editor' });
    });
  }

  return (
    <div className="staff">
      <div className="staff-head">
        <div><h2>Staff</h2><p>Who can sign in to admin, and what they can see.</p></div>
      </div>

      {manager && (
        <form className="staff-invite" onSubmit={sendInvite}>
          <input type="email" required placeholder="Email" value={invite.email} onChange={e => setInvite(i => ({ ...i, email: e.target.value }))} disabled={!!busy} />
          <input placeholder="Name (optional)" value={invite.name} onChange={e => setInvite(i => ({ ...i, name: e.target.value }))} disabled={!!busy} />
          <select value={invite.role} onChange={e => setInvite(i => ({ ...i, role: e.target.value }))} disabled={!!busy}>
            {STAFF_ROLES.filter(r => canAssign(staffRole, r.key)).map(r => <option key={r.key} value={r.key}>{r.label} · {r.summary}</option>)}
          </select>
          <button type="submit" className="staff-primary" disabled={!!busy || !invite.email.trim()}>{busy === 'invite' ? 'Sending…' : 'Invite'}</button>
        </form>
      )}
      {link && <p className="staff-link">Invite link: <code>{link}</code></p>}
      {error && <p className="staff-error" role="alert">{error}</p>}

      {members === null ? <p className="staff-muted">Loading…</p> : (
        <table className="staff-table">
          <tbody>
            {members.map(m => {
              const editable = canEditMember(staffRole, m);
              return (
                <tr key={m.id}>
                  <td>
                    <strong>{m.name || m.email}</strong>{m.you && <span className="staff-you">you</span>}
                    <small>{m.name ? m.email : ''}{m.pending ? ` · invited ${when(m.invited_at)}, hasn't signed in yet` : m.last_sign_in_at ? ` · last signed in ${when(m.last_sign_in_at)}` : ''}</small>
                  </td>
                  <td className="staff-role">
                    {editable ? (
                      <select value={m.role} disabled={!!busy} onChange={e => run(m.id, { action: 'set_role', user_id: m.id, role: e.target.value }, () => { logAudit?.('update', 'staff', m.id, `role → ${e.target.value}`); showToast?.(`${m.email} is now ${roleLabel(e.target.value)}`); })}>
                        {STAFF_ROLES.filter(r => canAssign(staffRole, r.key)).map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
                      </select>
                    ) : <span className="staff-chip">{roleLabel(m.role)}</span>}
                  </td>
                  <td className="staff-actions">
                    {editable && m.pending && <button type="button" disabled={!!busy} onClick={() => run(m.id, { action: 'resend', user_id: m.id }, d => { if (d.email_sent) showToast?.('Invitation sent again'); else { showToast?.(`Email didn't send: ${d.email_error}`, 'error'); setLink(d.link || ''); } })}>Resend</button>}
                    {editable && <button type="button" className="staff-danger" disabled={!!busy} onClick={() => { if (window.confirm(`Remove ${m.email} from admin?`)) run(m.id, { action: 'remove', user_id: m.id }, () => { logAudit?.('remove', 'staff', m.id, m.email); showToast?.(`${m.email} removed`); }); }}>Remove</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <details className="staff-help">
        <summary>What each role can do</summary>
        <ul>{STAFF_ROLES.map(r => <li key={r.key}><strong>{r.label}</strong> · {r.summary}</li>)}</ul>
        <p>Invited people get an email with a one-time link. New accounts set a password first; existing Peep accounts are signed straight in. Peep always keeps at least one owner.</p>
      </details>
    </div>
  );
}
