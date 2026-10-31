import {expect,it} from 'vitest';
import {formatPushDetails,isPushFeed} from './feedIngest';

it('tells push feeds apart from relay-pulled ones',()=>{
  expect(isPushFeed({source_type:'push'})).toBe(true);
  expect(isPushFeed({source_type:'srt'})).toBe(false);
  expect(isPushFeed(undefined)).toBe(false);
});

it('formats what a provider needs to push, with the secret kept exact and URL-safe on the one-liner',()=>{
  const text=formatPushDetails({feedName:'Rally East',srt:{url:'srt://live.cloudflare.com:778',streamId:'abc123',passphrase:'p&ss word'},rtmps:{url:'rtmps://live.cloudflare.com:443/live/',streamKey:'key'}});
  expect(text).toContain('Peep live feed: Rally East');
  expect(text).toContain('Stream ID:  abc123');
  expect(text).toContain('Passphrase: p&ss word');
  expect(text).toContain('srt://live.cloudflare.com:778?streamid=abc123&passphrase=p%26ss%20word&latency=2000');
  expect(text).toContain('Stream key: key');
  expect(text).toContain('nothing is recorded');
});

it('leaves out blocks Cloudflare did not return',()=>{
  const text=formatPushDetails({feedName:'X',srt:null,rtmps:null,latency:1500});
  expect(text).not.toContain('SRT (preferred)');
  expect(text).not.toContain('RTMPS');
});
