// The Feeds workspace: one page per feed that walks an operator from "where does
// the video come from" to "which channel plays it". Pure helpers live here so the
// step logic and validation are unit-tested without the panel.
import { PUSH_SOURCE_TYPE, PULL_SOURCE_TYPE } from './feedIngest';

// Phrased the way providers talk: who dials whom.
export const ARRIVALS = [
  { value: PUSH_SOURCE_TYPE, title: 'Provider is the caller',
    hint: 'They connect to our Cloudflare address and send the stream. Nothing runs on our side. Ask for this first.' },
  { value: PULL_SOURCE_TYPE, title: 'Provider is the listener',
    hint: 'They give us a host, port and passphrase; our relay connects to them and forwards to Cloudflare. Needs the relay online.' },
];

export const EMPTY_FEED_FORM = { name: '', source_type: PUSH_SOURCE_TYPE, source_host: '', source_port: '', source_stream_id: '', source_latency: 200, passphrase: '', notes: '', enabled: true };

export function slugify(name) {
  return String(name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// First blocker for saving the source section, or null when it can be saved.
export function sourceProblem(form) {
  if (!String(form.name || '').trim()) return 'Give the feed a name.';
  if (form.source_type !== PULL_SOURCE_TYPE) return null;
  if (!String(form.source_host || '').trim()) return 'Enter the host or IP the provider gave you.';
  const port = Number(form.source_port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return 'Enter the port (1–65535).';
  const latency = Number(form.source_latency);
  if (form.source_latency !== '' && (!Number.isInteger(latency) || latency < 0)) return 'Latency must be a whole number of milliseconds.';
  return null;
}

// What has been done for this feed, and which step the operator is on now.
export function feedSteps(feed, channel) {
  const push = feed?.source_type === PUSH_SOURCE_TYPE;
  const connected = feed?.cloudflare_status === 'live' || feed?.playback_status === 'available';
  const steps = [
    { key: 'source', label: 'Source', done: !!feed?.id },
    { key: 'cloudflare', label: 'Cloudflare input', done: !!feed?.cloudflare_live_input_uid },
    push ? { key: 'provider', label: 'Provider connected', done: connected }
         : { key: 'relay', label: 'Relay running', done: feed?.relay_status === 'running' },
    { key: 'channel', label: 'Channel', done: !!channel },
  ];
  const current = steps.findIndex(step => !step.done);
  return steps.map((step, index) => ({ ...step, current: index === current }));
}

export function arrivalLabel(feed) {
  return feed?.source_type === PUSH_SOURCE_TYPE ? 'Caller · sends to Cloudflare' : 'Listener · relay pulls';
}
