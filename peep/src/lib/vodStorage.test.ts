import { expect,it,vi } from 'vitest';
import { vodFolder,vodFilePath,vodFileType,listVODSources,protectedVODPath,resolveVODPlayback } from './vodStorage';
const movie='12345678-1234-1234-1234-123456789abc';
it('organizes versioned assets by catalog ID and rejects unsafe paths or unsupported formats',()=>{
  expect(vodFolder({type:'movies',id:movie,role:'masters'})).toBe(`movies/${movie}/masters`);
  expect(vodFolder({type:'series',id:8,episodeID:12,role:'masters'})).toBe('series/8/episodes/12/masters');
  expect(vodFolder({type:'series',id:8,role:'artwork'})).toBe('series/8/artwork');
  expect(()=>vodFolder({type:'series',id:8,role:'masters'})).toThrow('episode');
  expect(()=>vodFolder({type:'movies',id:'../x',role:'masters'})).toThrow();
  expect(vodFilePath({type:'movies',id:movie,role:'masters'},'My Film (2026).mp4','version')).toBe(`movies/${movie}/masters/version-My-Film-2026-.mp4`);
  expect(vodFilePath({type:'movies',id:movie,role:'masters'},'film.MP4','v1')).toContain('film.mp4');
  expect(vodFileType('film.MP4','masters')).toBe('video/mp4');
  expect(vodFileType('captions.vtt','captions')).toBe('text/vtt');
  expect(()=>vodFileType('script.html','artwork')).toThrow();
});
it('paginates nested episode folders without duplicating files or masking denied requests',async()=>{
  const list=vi.fn(async(folder:string,{offset}:any)=>({data:folder===''?[{name:'series',id:null}]:folder==='series'?[{name:'8',id:null}]:folder==='series/8'?[{name:'episodes',id:null}]:folder==='series/8/episodes'?[{name:'12',id:null}]:folder==='series/8/episodes/12'?[{name:'masters',id:null}]:Array.from({length:offset===0?100:1},(_,i)=>({id:`${offset+i}`,name:`${offset+i}.mp4`})),error:null}));
  const rows=await listVODSources({from:()=>({list})});expect(rows).toHaveLength(101);
  expect(rows[100].path).toBe('series/8/episodes/12/masters/100.mp4');
  await expect(listVODSources({from:()=>({list:async()=>({data:null,error:new Error('denied')})})})).rejects.toThrow('denied');
});
it('signs only this project’s protected playback references and fails closed on denied access',async()=>{
  const base='https://dev.supabase.co',path=`movies/${movie}/playback/v1.mp4`,url=`${base}/storage/v1/object/authenticated/vod-playback/${path}`;
  expect(protectedVODPath(url,base)).toBe(path);
  expect(protectedVODPath(url,'https://other.supabase.co')).toBeNull();
  const createSignedUrl=vi.fn(async()=>({data:{signedUrl:'https://dev.supabase.co/signed?token=test'},error:null}));
  const client={storage:{from:vi.fn(()=>({createSignedUrl}))}};
  expect(await resolveVODPlayback(client,url,base)).toContain('token=test');expect(createSignedUrl).toHaveBeenCalledWith(path,21600);
  createSignedUrl.mockClear();expect(await resolveVODPlayback(client,'https://stream.invalid/film.m3u8',base)).toBe('https://stream.invalid/film.m3u8');expect(createSignedUrl).not.toHaveBeenCalled();
  createSignedUrl.mockResolvedValue({data:null,error:new Error('denied')} as any);
  await expect(resolveVODPlayback(client,url,base)).rejects.toThrow('Sign in');
});
it('resolves R2 references through the entitlement function and rejects unsigned or foreign responses',async()=>{
 const base='https://dev.supabase.co',id='12345678-1234-1234-1234-123456789abc',reference=`${base}/functions/v1/r2-vod/play/${id}`;
 const invoke=vi.fn(async()=>({data:{signedURL:'https://account.r2.cloudflarestorage.com/private/video.mp4?X-Amz-Signature=test'},error:null}));
 const client={functions:{invoke}};
 expect(await resolveVODPlayback(client,reference,base)).toContain('X-Amz-Signature=test');
 expect(invoke).toHaveBeenCalledWith('r2-vod',{body:{action:'playback',id,expiresIn:21600}});
 for(const signedURL of ['https://evil.test/video.mp4?X-Amz-Signature=x','https://account.r2.cloudflarestorage.com/private/video.mp4']){
  invoke.mockResolvedValueOnce({data:{signedURL},error:null});await expect(resolveVODPlayback(client,reference,base)).rejects.toThrow('Invalid R2');
 }
 invoke.mockResolvedValueOnce({data:null,error:new Error('denied')} as any);await expect(resolveVODPlayback(client,reference,base)).rejects.toThrow('cannot play');
});
