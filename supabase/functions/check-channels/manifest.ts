export function isHLSManifest(text: string): boolean {
 return /^\uFEFF?\s*#EXTM3U(?:\r?\n|$)/.test(text) && /#EXT(?:INF:|-X-(?:STREAM-INF:|TARGETDURATION:|MEDIA:|VERSION:))/.test(text);
}

export function httpCheckResult(code: number): {status:'dead'|'unknown';reason:string} {
 if(code===401||code===403)return {status:'unknown',reason:`Source blocked the check (HTTP ${code})`};
 if(code===429)return {status:'unknown',reason:'Source rate-limited the check (HTTP 429)'};
 if(code===404||code===410)return {status:'dead',reason:`Playlist URL not found (HTTP ${code})`};
 return {status:'unknown',reason:`Source returned HTTP ${code}; retry the check`};
}
