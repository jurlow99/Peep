import {expect,it} from 'vitest';
import {feedSteps,slugify,sourceProblem,arrivalLabel,EMPTY_FEED_FORM} from './feedWorkflow';

it('defaults to the provider calling us and only demands relay details when they listen',()=>{
  expect(EMPTY_FEED_FORM.source_type).toBe('push');
  expect(sourceProblem({...EMPTY_FEED_FORM})).toBe('Give the feed a name.');
  expect(sourceProblem({...EMPTY_FEED_FORM,name:'Rally'})).toBeNull();
  expect(sourceProblem({...EMPTY_FEED_FORM,name:'Rally',source_type:'srt'})).toContain('host');
  expect(sourceProblem({...EMPTY_FEED_FORM,name:'Rally',source_type:'srt',source_host:'h',source_port:'70000'})).toContain('port');
  expect(sourceProblem({...EMPTY_FEED_FORM,name:'Rally',source_type:'srt',source_host:'h',source_port:'9000',source_latency:'abc'})).toContain('Latency');
  expect(sourceProblem({...EMPTY_FEED_FORM,name:'Rally',source_type:'srt',source_host:'h',source_port:'9000'})).toBeNull();
});

it('walks a push feed from source to channel and stops at the first unfinished step',()=>{
  const none=feedSteps(null,null);
  expect(none.map(s=>s.done)).toEqual([false,false,false,false]);
  expect(none[0].current).toBe(true);
  const saved={id:'f',source_type:'push'};
  expect(feedSteps(saved,null)[1].current).toBe(true);
  const withInput={...saved,cloudflare_live_input_uid:'u'};
  expect(feedSteps(withInput,null)[2]).toMatchObject({key:'provider',done:false,current:true});
  expect(feedSteps({...withInput,cloudflare_status:'live'},null)[3].current).toBe(true);
  expect(feedSteps({...withInput,playback_status:'available'},{id:1}).every(s=>s.done)).toBe(true);
});

it('uses the relay step for listener feeds and labels arrivals plainly',()=>{
  const pull={id:'f',source_type:'srt',cloudflare_live_input_uid:'u',relay_status:'stopped'};
  expect(feedSteps(pull,null)[2]).toMatchObject({key:'relay',done:false,current:true});
  expect(feedSteps({...pull,relay_status:'running'},null)[2].done).toBe(true);
  expect(arrivalLabel({source_type:'push'})).toContain('Caller');
  expect(arrivalLabel({source_type:'srt'})).toContain('Listener');
  expect(slugify('  Rally TV East! ')).toBe('rally-tv-east');
});
