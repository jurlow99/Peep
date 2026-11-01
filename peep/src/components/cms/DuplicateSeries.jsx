import { useState } from 'react';
import './DuplicateSeries.css';

// Series that share a title: pick the one to keep, the others fold into it
// (episodes, My List, rows). groups come from lib/duplicateShows.
export default function DuplicateSeries({ groups, onMerge }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null); // id of the series being kept while merging
  if (!groups.length) return null;
  const count = groups.length;

  async function keep(group, member) {
    setBusy(member.id);
    try { await onMerge(member.id, group.members.filter(m => m.id !== member.id).map(m => m.id)); }
    finally { setBusy(null); }
  }

  return (
    <>
      <div className="dupe-banner" role="status">
        <strong>{count === 1 ? `Two series are called “${groups[0].title}”` : `${count} titles have duplicate series`}</strong>
        <button type="button" className="dupe-primary" onClick={() => setOpen(true)}>Resolve</button>
      </div>
      {open && (
        <div className="dupe-scrim" onClick={() => !busy && setOpen(false)}>
          <div className="dupe-modal" role="dialog" aria-label="Resolve duplicate series" onClick={e => e.stopPropagation()}>
            <div className="dupe-head">
              <h3>Resolve duplicates</h3>
              <button type="button" onClick={() => setOpen(false)} disabled={!!busy}>Close</button>
            </div>
            <p className="dupe-hint">Keep one. Its twin’s episodes, My List saves and row placements move across, then the twin is deleted.</p>
            {groups.map(group => (
              <section key={group.title} className="dupe-group">
                <h4>{group.title}</h4>
                <div className="dupe-members">
                  {group.members.map(member => (
                    <div key={member.id} className={`dupe-card${member.id === group.keep.id ? ' suggested' : ''}`}>
                      {member.poster ? <img src={member.poster} alt="" /> : <div className="dupe-poster-empty">No poster</div>}
                      <div className="dupe-card-body">
                        <strong>{member.episodes} episode{member.episodes === 1 ? '' : 's'}</strong>
                        <small>#{member.id}{member.created_at ? ` · added ${new Date(member.created_at).toLocaleDateString()}` : ''}{member.description ? ' · has description' : ''}</small>
                        {member.id === group.keep.id && <span className="dupe-tag">Suggested</span>}
                      </div>
                      <button type="button" className={member.id === group.keep.id ? 'dupe-primary' : ''} disabled={!!busy} onClick={() => keep(group, member)}>
                        {busy === member.id ? 'Merging…' : 'Keep this one'}
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
