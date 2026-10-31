import { expect, it } from 'vitest';
import { parseIMDbID, metadataFields } from './titleMetadata';
it('accepts IMDb titles only, rejecting foreign hosts and script URLs',()=>{
 expect(parseIMDbID('https://www.imdb.com/title/tt0133093/?ref_=test')).toBe('tt0133093');
 expect(parseIMDbID('tt12345678')).toBe('tt12345678');
 for (const input of ['https://imdb.com.evil/title/tt0133093','javascript:alert(1)','https://www.imdb.com/name/nm1234567','https://evil/title/tt0133093']) expect(parseIMDbID(input)).toBeNull();
});
it('imports only supported metadata, never playback, access or missing values',()=>{
 const data={title:'Movie',year:'1999',duration:'136 min',description:'N/A',url:'evil',is_premium:true,tags:'Action'};
 expect(metadataFields(data,'movie')).toEqual({title:'Movie',year:'1999',duration:'136 min',tags:'Action'});
 expect(metadataFields(data,'series')).not.toHaveProperty('duration');
 expect(metadataFields(data,'episode')).toEqual({title:'Movie',duration:'136 min'});
});
