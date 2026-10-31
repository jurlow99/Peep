import {expect,it} from 'vitest';
import {matchesCatalogGenre} from './catalogGenres';
it('matches category or complete tags across current and legacy formats',()=>{
 expect(matchesCatalogGenre({category:'Documentary',tags:[' Comedy ']},'comedy')).toBe(true);
 expect(matchesCatalogGenre({category:' Comedy ',tags:null},'COMEDY')).toBe(true);
 expect(matchesCatalogGenre({tags:'["Comedy"]'},'Comedy')).toBe(true);
 expect(matchesCatalogGenre({tags:'Drama, Comedy'},'Comedy')).toBe(true);
 expect(matchesCatalogGenre({tags:['Dark Comedy']},'Comedy')).toBe(false);
 expect(matchesCatalogGenre({tags:null},'')).toBe(false);
 expect(matchesCatalogGenre({tags:'null'},'Comedy')).toBe(false);
});
