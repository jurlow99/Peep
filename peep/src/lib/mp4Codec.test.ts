import { describe, expect, it } from 'vitest';
import { detectMP4VideoCodec, mp4CodecProblem, sniffMP4VideoCodec } from './mp4Codec';

const bytes = (text: string) => new Uint8Array([...text].map(c => c.charCodeAt(0)));

describe('MP4 video codec sniffing', () => {
  it('names the first sample description it finds', () => {
    expect(sniffMP4VideoCodec(bytes('....ftypisom....moov....stsd....avc1....'))).toBe('h264');
    expect(sniffMP4VideoCodec(bytes('....stsd....av01....av1C....mp4a'))).toBe('av1');
    expect(sniffMP4VideoCodec(bytes('....hvc1....'))).toBe('hevc');
    expect(sniffMP4VideoCodec(bytes('....mdat....'))).toBeNull();
  });

  it('looks at the tail when the header is at the end of the file', async () => {
    const file = new File([bytes('mdat' + 'x'.repeat(100) + 'moov..stsd..av01')], 'late.mp4');
    expect(await detectMP4VideoCodec(file, 16)).toBe('av1');
    expect(await detectMP4VideoCodec(new File([bytes('ftyp..avc1' + 'x'.repeat(50))], 'ok.mp4'), 16)).toBe('h264');
  });

  it('only complains about codecs Peep cannot play', () => {
    expect(mp4CodecProblem('h264')).toBe('');
    expect(mp4CodecProblem(null)).toBe('');
    expect(mp4CodecProblem('av1')).toContain('AV1');
    expect(mp4CodecProblem('hevc')).toContain('Convert to H.264');
  });
});
