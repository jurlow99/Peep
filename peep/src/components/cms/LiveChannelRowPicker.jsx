import { useState } from 'react';
import { channelCategories, liveRowChannels } from '../../lib/liveRows';

export default function LiveChannelRowPicker({ value = '', onChange, channels = [] }) {
  const [search, setSearch] = useState('');
  const [categoryEditing, setCategoryEditing] = useState(false);
  const manual = value.trim().startsWith('[');
  const category = !manual && (categoryEditing || !!value);
  const picks = manual ? liveRowChannels(value, channels) : [];
  const categories = [...new Map(channels.flatMap(c => channelCategories(c.category)).map(c => [c.toLowerCase(), c])).values()].sort((a,b) => a.localeCompare(b));
  const save = next => onChange(JSON.stringify(next.map(c => ({ id: c.id, type: 'channel' }))));
  const button = { background:'#fff', border:'1px solid #cbd5e1', borderRadius:6, padding:'8px 10px', cursor:'pointer', color:'#334155' };
  const matches = channels.filter(c => `${c.name} ${c.category || ''}`.toLowerCase().includes(search.toLowerCase()) && !picks.some(p => String(p.id) === String(c.id)));
  return <div style={{marginTop:6,padding:14,background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:8}}>
    <strong>Which channels?</strong>
    <div style={{display:'flex',gap:8,margin:'10px 0'}}>
      {[['all','All live channels'],['category','By category'],['manual','Choose channels']].map(([mode,label]) => <button type="button" key={mode} aria-pressed={mode === (manual ? 'manual' : category ? 'category' : 'all')} style={button} onClick={() => { setCategoryEditing(mode === 'category'); onChange(mode === 'manual' ? '[]' : ''); }}>{label}</button>)}
    </div>
    {category && <>
      <input aria-label="Channel category" placeholder="Search existing channel categories…" value={value} onChange={e => onChange(e.target.value)} style={{width:'100%',padding:10,boxSizing:'border-box'}} />
      <div role="listbox" aria-label="Matching channel categories" style={{display:'flex',flexWrap:'wrap',gap:6,marginTop:8}}>
        {categories.filter(c => c.toLowerCase().includes(value.toLowerCase())).map(c => <button type="button" role="option" aria-selected={c.toLowerCase() === value.toLowerCase()} key={c} style={button} onClick={() => onChange(c)}>{c}</button>)}
      </div>
    </>}
    {manual && <>
      <p style={{fontSize:12}}>Choose channels in the order viewers should see them.</p>
      {picks.map((c,i) => <div key={c.id} style={{display:'flex',gap:6,alignItems:'center',marginBottom:6}}>
        <span style={{flex:1}}>{i+1}. {c.name}</span>
        <button type="button" style={button} disabled={i===0} aria-label={`Move ${c.name} up`} onClick={() => { const next=[...picks]; [next[i-1],next[i]]=[next[i],next[i-1]]; save(next); }}>↑</button>
        <button type="button" style={button} disabled={i===picks.length-1} aria-label={`Move ${c.name} down`} onClick={() => { const next=[...picks]; [next[i+1],next[i]]=[next[i],next[i+1]]; save(next); }}>↓</button>
        <button type="button" style={button} onClick={() => save(picks.filter(p => p.id !== c.id))}>Remove</button>
      </div>)}
      <input aria-label="Search channels to add" placeholder="Search channels by name or category…" value={search} onChange={e => setSearch(e.target.value)} style={{width:'100%',padding:10,boxSizing:'border-box'}} />
      <div style={{maxHeight:240,overflowY:'auto',marginTop:8}}>{matches.map(c => <button type="button" key={c.id} style={{...button,display:'block',width:'100%',textAlign:'left',marginBottom:5}} onClick={() => save([...picks,c])}>+ {c.name} · {c.category || 'General'}{c.is_active === false ? ' (inactive)' : ''}</button>)}</div>
    </>}
    <p style={{fontSize:12,color:'#64748b',marginBottom:0}}>{liveRowChannels(value,channels).filter(c => c.is_active !== false).length} active channels match. Inactive or restricted channels remain hidden from viewers.</p>
  </div>;
}
