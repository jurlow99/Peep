import {expect,it} from 'vitest';
import {snapshotTimes,snapshotScore} from './videoThumbnail';
const pixels=(values:number[])=>new Uint8ClampedArray(values.flatMap(n=>[n,n,n,255]));
it('samples across the episode while staying away from the ending',()=>{
 expect(snapshotTimes(100)).toEqual([8,16,24,32,40]);
 expect(snapshotTimes(NaN)).toEqual([]);expect(snapshotTimes(Infinity)).toEqual([]);
 for(const duration of [0.02,1,1800])for(const time of snapshotTimes(duration))expect(time).toBeLessThan(duration);
});
it('rejects black, white and flat frames and prefers visible detailed snapshots',()=>{
 for(const value of [0,4,128,255])expect(snapshotScore(pixels(Array(64).fill(value)),8)).toBe(-Infinity);
 const detailed=snapshotScore(pixels(Array.from({length:64},(_,i)=>i%2?190:50)),8);
 expect(Number.isFinite(detailed)).toBe(true);
 expect(detailed).toBeGreaterThan(snapshotScore(pixels(Array.from({length:64},(_,i)=>120+i%8)),8));
});
