import {expect,it} from 'vitest';
import {contentReadiness,contentPlacements,discoveryGaps} from './publicationStatus';
it('distinguishes missing assets, unknown episodes and approved playback',()=>{
 expect(contentReadiness({poster:'p',url:''},'movie').label).toBe('Missing video');
 expect(contentReadiness({poster:'p'},'show',undefined).label).toBe('Check episodes');
 expect(contentReadiness({poster:'p'},'show',[{url:'u',status:'pending'}]).tone).toBe('warning');
 expect(contentReadiness({poster:'p'},'show',[{url:'u',status:'approved'}]).label).toBe('Assets ready');
});
it('reports category/tag, type-safe handpicked and all-content placements without disabled/personalized rows',()=>{
 const movie={id:'1',category:'Documentary',tags:['Comedy']};
 const rows=[{title:'Laugh',type:'category',filter_value:' comedy ',pages:'home, shorts'},
 {title:'Series only',type:'custom',content_type:'shows'},
 {title:'Picked',type:'handpicked',filter_value:'[{"id":1,"type":"movie"}]'},
 {title:'Wrong type',type:'handpicked',filter_value:'[{"id":1,"type":"show"}]'},
 {title:'Disabled',type:'custom',enabled:false},{title:'Personalized',type:'recommended'},
 {title:'Broken',type:'handpicked',filter_value:'broken'}];
 expect(contentPlacements(movie,'movie',rows).map(p=>p.title)).toEqual(['Laugh','Laugh','Picked']);
});
it('flags titles that genre rows, search and related titles cannot surface',()=>{
 expect(discoveryGaps({category:'',tags:'',description:''})).toEqual(['category or tags','description']);
 expect(discoveryGaps({category:' ',tags:'[]',description:'d'})).toEqual(['category or tags']);
 expect(discoveryGaps({tags:'Comedy, Family',description:'d'})).toEqual([]);
 expect(discoveryGaps({category:'Drama',tags:null,description:'d'})).toEqual([]);
});
