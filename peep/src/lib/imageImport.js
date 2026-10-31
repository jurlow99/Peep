// Fetch image bytes without forwarding the admin session to the source host.
export async function imageFileFromURL(raw, { baseURL = window.location.href, fetchImpl = fetch } = {}) {
  const base = new URL(baseURL);
  const url = new URL(raw.trim(), base);
  const allowed = candidate => !candidate.username && !candidate.password &&
    (candidate.protocol === 'https:' || (candidate.protocol === 'http:' && candidate.origin === base.origin));
  if (!allowed(url)) throw new Error('Use an HTTPS image URL or an image on this local site.');
  const response = await fetchImpl(url.href, { credentials: 'omit', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('Could not fetch that image. Check its URL and cross-origin access.');
  if (response.url && !allowed(new URL(response.url))) throw new Error('The image redirected to an unsupported URL.');
  const blob = await response.blob();
  const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  const extension = extensions[blob.type];
  if (!extension) throw new Error('Import a JPEG, PNG, or WebP image.');
  if (!blob.size || blob.size > 5 * 1024 * 1024) throw new Error('Use an image smaller than 5 MB.');
  return new File([blob], `imported-hero.${extension}`, { type: blob.type });
}
