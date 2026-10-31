// Entry breaks (movie, episode, channel, multiview). Thin names over the shared
// ad-break player and the device-wide entry-ad clock in adPolicy.
import { playAdBreak } from './adBreak';
import { allowsEntryAd, recordAdStart } from './adPolicy';

export function allowsPreroll(now = Date.now()) { return allowsEntryAd(now); }
export function recordPrerollStart(now = Date.now()) { recordAdStart(now); }
export function startPreroll(options) { return playAdBreak({ ...options, placement: 'pre_roll' }); }
