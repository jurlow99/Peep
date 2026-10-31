export const VOD_SOURCE_BUCKET = 'vod-sources';
export const VOD_SOURCE_LIMIT = 50 * 1024 ** 2;
export const VOD_ROLES = ['masters', 'trailers', 'artwork', 'captions'];
const UUID = /^[a-f0-9-]{36}$/;
const ID = /^\d+$/;
export function vodFolder({type, id, episodeID, role}) {
  if (episodeID && type !== 'series') throw new Error('Episodes must belong to a series.');
  if (!VOD_ROLES.includes(role)) throw new Error('Choose a VOD asset type.');
  if (type === 'movies' || type === 'inbox') {
    if (!UUID.test(String(id))) throw new Error('Choose a movie or an inbox upload.');
  } else if (type === 'series') {
    if (!ID.test(String(id)) || (episodeID && !ID.test(String(episodeID)))) throw new Error('Choose a series and a valid episode.');
    if (role === 'masters' && !episodeID) throw new Error('Choose an episode for the series master.');
  } else throw new Error('Choose a VOD collection.');
  return `${type}/${id}${episodeID ? `/episodes/${episodeID}` : ''}/${role}`;
}
export function vodFilePath(selection, filename, version = crypto.randomUUID()) {
  if (!/^[a-zA-Z0-9_-]+$/.test(version)) throw new Error('Invalid upload version.');
  const clean = filename.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/^\.+/,'').slice(-160).replace(/\.([^.]+)$/, (_, extension) => '.' + extension.toLowerCase());
  if (!clean) throw new Error('Choose a file with a valid name.');
  return `${vodFolder(selection)}/${version}-${clean}`;
}
export function vodFileType(name, role) {
  const extension = name.split('.').pop().toLowerCase();
  const types = role === 'artwork' ? {jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp'} :
    role === 'captions' ? {vtt:'text/vtt',srt:'application/x-subrip'} :
    {mp4:'video/mp4',mov:'video/quicktime',webm:'video/webm',mkv:'video/x-matroska'};
  if (!types[extension]) throw new Error(`Unsupported file for ${role}. Choose ${Object.keys(types).join(', ')}.`);
  return types[extension];
}
// Pagination and recursive prefixes are required for per-title and episode folders.
export async function listVODSources(storage, prefix = '', bucket = VOD_SOURCE_BUCKET) {
  const files = [];
  async function scan(folder, depth) {
    if (depth > 6) throw new Error('Unexpected VOD folder depth.');
    const folders = [];
    for (let offset = 0; ; offset += 100) {
      const {data, error} = await storage.from(bucket).list(folder,{limit:100,offset,sortBy:{column:'name',order:'asc'}});
      if (error) throw error;
      for (const file of data || []) {
        const path = folder ? `${folder}/${file.name}` : file.name;
        if (!file.id) folders.push(path);
        else files.push({...file,path});
      }
      if ((data || []).length < 100) break;
    }
    for (const subfolder of folders) await scan(subfolder, depth + 1);
  }
  await scan(prefix,0);
  return files;
}

export const VOD_PLAYBACK_BUCKET = 'vod-playback';
export function protectedMediaReference(url, projectURL) {
  if (!url) return null;
  let parsed;
  try { parsed = new URL(url); } catch { return null; }
  const base = new URL(projectURL);
  if (parsed.origin !== base.origin) return null;
  for (const bucket of [VOD_PLAYBACK_BUCKET, VOD_SOURCE_BUCKET]) {
    const prefix = `/storage/v1/object/authenticated/${bucket}/`;
    if (parsed.pathname.startsWith(prefix)) {
      const path = decodeURIComponent(parsed.pathname.slice(prefix.length));
      if (!path || path.split('/').includes('..')) throw new Error('Invalid private media reference.');
      return {bucket,path};
    }
  }
  return null;
}
export function protectedVODPath(url, projectURL) {
  const reference = protectedMediaReference(url,projectURL);
  return reference?.bucket === VOD_PLAYBACK_BUCKET ? reference.path : null;
}
export async function resolveVODPlayback(client, url, projectURL, expiresIn = 6*60*60) {
  const parsed = new URL(url,projectURL), base = new URL(projectURL);
  const r2Match=parsed.origin===base.origin&&parsed.pathname.match(/^\/functions\/v1\/r2-vod\/play\/([a-f0-9-]{36})$/);
  if(r2Match){
    const {data,error}=await client.functions.invoke('r2-vod',{body:{action:'playback',id:r2Match[1],expiresIn}});
    if(error||!data?.signedURL)throw new Error('Your account cannot play this R2 video.');
    let signed;try{signed=new URL(data.signedURL);}catch{throw new Error('Invalid R2 playback response.');}
    if(signed.protocol!=='https:'||!signed.hostname.endsWith('.r2.cloudflarestorage.com')||!signed.searchParams.get('X-Amz-Signature'))throw new Error('Invalid R2 playback response.');
    return signed.href;
  }
  const reference = protectedMediaReference(url,projectURL);
  if (!reference) return url;
  const {data,error} = await client.storage.from(reference.bucket).createSignedUrl(reference.path,expiresIn);
  if (error || !data?.signedUrl) throw new Error('Sign in with an account that has access to this video.');
  return data.signedUrl;
}
export function isHeroTrailer(path) {
  return /^(movies\/[a-f0-9-]{36}|series\/\d+(\/episodes\/\d+)?|inbox\/[a-f0-9-]{36})\/trailers\/[^/]+\.mp4$/.test(path);
}
