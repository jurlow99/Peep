import {matchesCatalogGenre} from './catalogGenres';
import {normalizeTags} from './recommendations';
const has = value => typeof value === 'string' && value.trim().length > 0;
export function contentReadiness(item, type, episodes) {
  const missing=[];
  if(!has(item.poster)) missing.push('poster');
  if(type==='movie' && !has(item.url)) missing.push('video');
  if(type==='show' && episodes != null && !episodes.some(e=>has(e.url)&&['approved','published'].includes(e.status))) missing.push('approved episode');
  if(missing.length) return {tone:'warning',label:`Missing ${missing.join(' + ')}`};
  if(type==='show' && episodes == null) return {tone:'neutral',label:'Check episodes'};
  return {tone:'ready',label:'Assets ready'};
}
export function contentPlacements(item,type,rows) {
  return rows.filter(row=>{
    if(row.enabled===false) return false;
    if(row.content_type==='shows' && type!=='show') return false;
    if(row.content_type==='shorts' && type!=='movie') return false;
    if(row.type==='category') return matchesCatalogGenre(item,row.filter_value);
    if(row.type==='handpicked') {
      try {return JSON.parse(row.filter_value||'[]').some(p=>p.type===type && String(p.id)===String(item.id));}catch{return false;}
    }
    return ['custom','trending'].includes(row.type);
  }).flatMap(row=>(row.pages||'home').split(',').map(p=>({page:p.trim(),title:row.title,tier:row.visibility_tier||'production'})));
}

// Category and tags feed genre rows, search and "More like this" on web and Apple TV;
// a title without either is invisible to all of them, so flag it rather than block it.
// Tags are stored as text: a JSON array or a comma list.
function tagList(tags) {
  if(typeof tags === 'string') { try { const parsed=JSON.parse(tags); if(Array.isArray(parsed)) return normalizeTags(parsed); } catch { /* comma list */ } }
  return normalizeTags(tags);
}
export function discoveryGaps(item) {
  const gaps=[];
  if(!has(item.category) && !tagList(item.tags).length) gaps.push('category or tags');
  if(!has(item.description)) gaps.push('description');
  return gaps;
}
