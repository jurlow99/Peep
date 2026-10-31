export function normalizeSearch(value){
 return String(value||'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
}
export function catalogSearchScore(item,query){
 const q=normalizeSearch(String(query||'').slice(0,256));if(!q)return null;
 let tags=item.tags;
 if(typeof tags==='string'){try{tags=JSON.parse(tags);}catch{tags=tags.split(',');}}
 tags=Array.isArray(tags)?tags.filter(t=>typeof t==='string'):[];
 const title=normalizeSearch(item.title),category=normalizeSearch(item.category),tag=tags.map(normalizeSearch).join(' '),description=normalizeSearch(item.description);
 const fields=[title,category,tag,description].join(' ');
 if(!q.split(' ').every(term=>fields.includes(term)))return null;
 if(title===q)return 500;
 if(title.startsWith(q))return 400;
 if(title.includes(q))return 300;
 if(category===q||tags.some(t=>normalizeSearch(t)===q))return 200;
 if(category.includes(q)||tag.includes(q))return 100;
 return 10;
}
export function searchCatalog(items,query,type='all'){
 return items.filter(item=>type==='all'||item._type===type).map(item=>({item,score:catalogSearchScore(item,query)})).filter(result=>result.score!==null)
  .sort((a,b)=>b.score-a.score||String(a.item.title||'').localeCompare(String(b.item.title||''),undefined,{sensitivity:'base'})||String(a.item.id).localeCompare(String(b.item.id)))
  .map(result=>result.item);
}
