import {it,expect} from 'vitest';
import {streamBreaks} from './streamBreaks';
import {mergeStreamEvents} from '../components/cms/StreamInspector';
const start={key:'daterange:a:start',id:'a',type:'start',time:'2026-10-28T12:00:00Z',duration:120,source:'HLS DATERANGE'};
it('calculates expected finish and requires a matching end for confirmation',()=>{
 const b=streamBreaks([start],Date.parse('2026-10-28T12:03:00Z'))[0];expect(b.expected).toBe(Date.parse('2026-10-28T12:02:00Z'));expect(b.end).toBeNull();expect(b.status).toContain('unconfirmed');
 const confirmed=streamBreaks([start,{...start,key:'daterange:a:end',type:'end',time:'2026-10-28T12:02:02Z'}])[0];expect(confirmed.end).toBe(Date.parse('2026-10-28T12:02:02Z'));expect(confirmed.status).toBe('End signal received');
});
it('never substitutes receipt time for a missing broadcast time',()=>{const b=streamBreaks([{...start,time:null,observedAt:'2026-10-28T12:00:00Z',ptsSeconds:40}])[0];expect(b.start).toBeNull();expect(b.expected).toBeNull();expect(b.pts).toBe(40);});
it('does not pair unrelated sources or reuse a cue end across intervening starts',()=>{const cue=(id,type)=>({...start,key:`cue:${id}:${type}`,id:String(id),type});const b=streamBreaks([cue(1,'start'),cue(3,'start'),cue(5,'end'),{...start,key:'daterange:b:end',type:'end'}]);expect(b.find(x=>x.id==='1').end).toBeNull();expect(b.find(x=>x.id==='3').status).toBe('End signal received');});
it('updates declared duration while preserving the original observation',()=>{const b=mergeStreamEvents([{...start,observedAt:'first'}],[{...start,duration:125}],'second');expect(b[0].duration).toBe(125);expect(b[0].observedAt).toBe('first');});
