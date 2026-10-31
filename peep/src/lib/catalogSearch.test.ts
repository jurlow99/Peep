import {expect,it} from 'vitest';
import {searchCatalog,catalogSearchScore} from './catalogSearch';
const items=[{id:'a',_type:'movie',title:'Another title',tags:'["Full Force"]'}, {id:'b',_type:'movie',title:'Full Force',category:'Documentary',tags:['Comedy']}, {id:'c',_type:'show',title:'The Full Force Show'}];
it('ranks titles ahead of tags, keeps type filters and matches all search terms',()=>{
 expect(searchCatalog(items,'full force').map(i=>i.id)).toEqual(['b','c','a']);
 expect(searchCatalog(items,'full force','show').map(i=>i.id)).toEqual(['c']);
 expect(searchCatalog(items,'full documentary').map(i=>i.id)).toEqual(['b']);
 expect(searchCatalog(items,'full sports')).toEqual([]);
 expect(searchCatalog(items,'comedy').map(i=>i.id)).toEqual(['b']);
});
it('ignores accents, punctuation and whitespace and handles empty/legacy tags',()=>{
 expect(catalogSearchScore({title:'Café: Life!'},' CAFE life ')).toBe(500);
 expect(catalogSearchScore({tags:'Drama, Comedy'},'comedy')).toBe(200);
 expect(searchCatalog(items,' -- ')).toEqual([]);
 expect(catalogSearchScore({title:'A',tags:'null'},'comedy')).toBeNull();
});
