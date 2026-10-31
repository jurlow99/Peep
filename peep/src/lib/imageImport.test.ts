import { describe, it, expect, vi } from 'vitest';
import { imageFileFromURL } from './imageImport';
const baseURL = 'http://127.0.0.1:5173/admin';
describe('image URL import', () => {
  it('imports a local image without forwarding credentials', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, url: 'http://127.0.0.1:5173/demo.jpg', blob: async () => new Blob(['image'], { type: 'image/jpeg' }) }));
    const file = await imageFileFromURL('/demo.jpg', { baseURL, fetchImpl });
    expect(file.type).toBe('image/jpeg');
    expect(file.size).toBe(5);
    expect(fetchImpl.mock.calls[0][1].credentials).toBe('omit');
  });
  it('rejects credential-bearing and unrelated insecure URLs before fetching', async () => {
    const fetchImpl = vi.fn();
    for (const url of ['http://other.invalid/a.jpg', 'https://user:pass@example.invalid/a.jpg', 'file:///tmp/a.jpg', 'data:image/png,x']) {
      await expect(imageFileFromURL(url, { baseURL, fetchImpl })).rejects.toThrow();
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('rejects non-image content and failed requests', async () => {
    await expect(imageFileFromURL('/bad', { baseURL, fetchImpl: async () => ({ ok: true, blob: async () => new Blob(['html'], { type: 'text/html' }) }) })).rejects.toThrow('JPEG');
    await expect(imageFileFromURL('/missing', { baseURL, fetchImpl: async () => ({ ok: false }) })).rejects.toThrow('Could not fetch');
  });
});
