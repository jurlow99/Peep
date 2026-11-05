// crypto.randomUUID exists only on secure pages (https, localhost). Opened over plain
// http from another machine (http://192.168.x.x:5173) it's missing, so fill it in with
// a v4 UUID from crypto.getRandomValues, which works everywhere. Imported first in main.jsx.
export function uuidFromBytes(bytes) {
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

if (typeof globalThis.crypto?.getRandomValues === 'function' && typeof globalThis.crypto.randomUUID !== 'function') {
  globalThis.crypto.randomUUID = () => uuidFromBytes(globalThis.crypto.getRandomValues(new Uint8Array(16)));
}
