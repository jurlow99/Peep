import {expect,it} from 'vitest';
import {formatBytes,formatDuration,formatTimeLeft,recordSample,uploadEstimate} from './uploadProgress';

it('formats sizes the way the admin reads them',()=>{
  expect(formatBytes(0)).toBe('1 KB');
  expect(formatBytes(512*1024)).toBe('512 KB');
  expect(formatBytes(2.5*1024**2)).toBe('2.5 MB');
  expect(formatBytes(280*1024**2)).toBe('280 MB');
  expect(formatBytes(1.5*1024**3)).toBe('1.50 GB');
  expect(formatBytes(undefined as any)).toBe('');
});

it('formats runtimes to match the catalog convention',()=>{
  expect(formatDuration(1500)).toBe('25 min');
  expect(formatDuration(5520)).toBe('1 h 32 min');
  expect(formatDuration(3600)).toBe('1 h');
  expect(formatDuration(40)).toBe('40 sec');
  expect(formatDuration(NaN)).toBe('');
});

it('rounds time left into reassuring steps',()=>{
  expect(formatTimeLeft(4)).toBe('a few seconds left');
  expect(formatTimeLeft(33)).toBe('about 40 sec left');
  expect(formatTimeLeft(400)).toBe('about 7 min left');
  expect(formatTimeLeft(4000)).toBe('about 1 h 7 min left');
});

it('estimates from the recent window and ignores stalls',()=>{
  let samples:any[]=[];
  samples=recordSample(samples,0,0);
  samples=recordSample(samples,10_000_000,10_000);
  const estimate=uploadEstimate(samples,50_000_000)!;
  expect(estimate.rate).toBe(1_000_000);
  expect(estimate.secondsLeft).toBe(40);
  expect(uploadEstimate([{at:0,bytes:5}],100)).toBeNull();
  // A stalled sample lowers the rate instead of being ignored, so the estimate stays honest.
  expect(uploadEstimate(recordSample(samples,10_000_000,10_500),50_000_000)?.rate).toBeCloseTo(10_000_000/10.5,0);
});

it('keeps only the newest samples',()=>{
  let samples:any[]=[];
  for(let i=0;i<60;i++)samples=recordSample(samples,i,i);
  expect(samples).toHaveLength(40);
  expect(samples[0].bytes).toBe(20);
});
