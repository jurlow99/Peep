import {expect,it} from 'vitest';
import {deliveryReviewChecks} from './DeliveryReview';
it('flags missing episode destination/numbering and unfinished uploads',()=>{
 const d={title:'Episode',details:{type:'episode',rights_note:'Agreement',series_ref:'series:1',season:1,episode_number:0}};
 expect(deliveryReviewChecks(d,[{asset_role:'video',state:'uploading'}]).filter(c=>!c.ready).map(c=>c.label)).toEqual(['Finished video','Series and episode numbering']);
 expect(deliveryReviewChecks({...d,details:{...d.details,episode_number:2}},[{asset_role:'video',state:'ready'}]).every(c=>c.ready)).toBe(true);
});
