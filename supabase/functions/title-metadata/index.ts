import { handleCors, errorResponse, jsonResponse } from '../_shared/cors.ts';
import { getServiceClient, requireAdmin } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  const cors = handleCors(req); if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('POST required', 405);
  try { await requireAdmin(req, getServiceClient()); }
  catch { return errorResponse('Admin access required', 403); }
  let body;
  try { body = await req.json(); } catch { return errorResponse('Invalid request', 400); }
  const { imdbID, type } = body;
  if (!/^tt\d{7,12}$/.test(imdbID || '') || !['movie','series','episode'].includes(type)) return errorResponse('Invalid IMDb title or content type', 400);
  const token = Deno.env.get('TMDB_READ_ACCESS_TOKEN');
  if (!token) return errorResponse('Metadata import needs setup: configure TMDB_READ_ACCESS_TOKEN on the server.', 503);
  // Provider token never leaves this function. Only fixed TMDB endpoints are fetched.
  async function get(path: string) {
    const res = await fetch(`https://api.themoviedb.org/3/${path}`, {headers:{Authorization:`Bearer ${token}`}, signal:AbortSignal.timeout(12000)});
    if (!res.ok) throw new Error('provider');
    return await res.json();
  }
  try {
    const found = await get(`find/${imdbID}?external_source=imdb_id`);
    const matches = found[type === 'movie' ? 'movie_results' : type === 'series' ? 'tv_results' : 'tv_episode_results'] || [];
    if (matches.length !== 1) return errorResponse('No unique matching title of this type was found. Check the IMDb link.', 404);
    const match = matches[0];
    const path = type === 'movie' ? `movie/${match.id}` : type === 'series' ? `tv/${match.id}` : `tv/${match.show_id}/season/${match.season_number}/episode/${match.episode_number}`;
    const data = await get(path);
    return jsonResponse({ metadata: {
      title:data.title || data.name || '',
      description:data.overview || '',
      year:(data.release_date || data.first_air_date || data.air_date || '').slice(0,4),
      duration:data.runtime > 0 ? `${data.runtime} min` : '',
      tags:(data.genres || []).map((g: {name:string})=>g.name).join(', '),
    }, source:'TMDB', sourceURL:`https://www.themoviedb.org/${path}`, imdbID });
  } catch { return errorResponse('Metadata provider unavailable. Try again later.', 502); }
});
