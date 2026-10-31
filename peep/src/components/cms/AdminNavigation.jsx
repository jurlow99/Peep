import { ADMIN_NAV, activeAdminLocation } from './adminSections';

const button = { border: '1px solid transparent', borderRadius: 8, padding: '10px 13px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, whiteSpace: 'nowrap' };

export default function AdminNavigation({ state, onNavigate, pendingReports = 0, padding = '24px' }) {
  const { group, page } = activeAdminLocation(state);
  return (
    <div style={{ borderBottom: '1px solid #e2e8f0', background: '#fff', padding: `14px ${padding} 18px` }}>
      <nav aria-label="Admin sections" style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {ADMIN_NAV.map(item => (
          <button key={item.key} type="button" aria-current={group.key === item.key ? 'true' : undefined}
            onClick={() => onNavigate(item.sections[0].target)}
            style={{ ...button, fontWeight: 700, background: group.key === item.key ? '#4f46e5' : 'transparent', color: group.key === item.key ? '#fff' : '#475569' }}>
            {item.label}{item.key === 'audience' && pendingReports > 0 ? ` (${pendingReports})` : ''}
          </button>
        ))}
      </nav>
      <nav aria-label={`${group.label} tools`} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12, paddingTop: 12, borderTop: '1px solid #f1f5f9' }}>
        {group.sections.map(item => (
          <button key={item.key} type="button" aria-current={page.key === item.key ? 'page' : undefined}
            onClick={() => onNavigate(item.target)}
            style={{ ...button, fontWeight: page.key === item.key ? 700 : 500, borderColor: page.key === item.key ? '#c7d2fe' : '#e2e8f0', background: page.key === item.key ? '#eef2ff' : '#fff', color: page.key === item.key ? '#4338ca' : '#475569' }}>
            {item.label}{item.key === 'moderation' && pendingReports > 0 ? ` (${pendingReports})` : ''}
          </button>
        ))}
      </nav>
      <p style={{ margin: '14px 0 0', fontSize: 12, lineHeight: 1.5, color: '#64748b' }}>
        <strong style={{ color: '#334155' }}>{group.label} / {page.label}</strong><span style={{ marginLeft: 12 }}>{group.description}</span>
      </p>
    </div>
  );
}
