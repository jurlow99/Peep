// Upload one finished MP4 to the private inbox (R2 when configured, else
// Supabase Storage). Shared by the series folder importer and Replace video.
// Resolves with what the save/replace RPCs need; `task` lets a caller abort.
import { createVODUpload } from './vodUpload';
import { createR2VODUpload } from './r2VOD';
import { VOD_PLAYBACK_BUCKET, vodFilePath } from './vodStorage';

export function uploadToInbox({ file, r2Ready, onProgress, onTask }) {
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const options = { file, id, onProgress, onError: reject };
    (async () => {
      try {
        let task;
        if (r2Ready) {
          task = await createR2VODUpload({ ...options, onSuccess: ({ path }) => resolve({ id, path, provider: 'r2' }) });
        } else {
          const path = vodFilePath({ type: 'inbox', id, role: 'playback' }, file.name);
          task = await createVODUpload({ ...options, bucket: VOD_PLAYBACK_BUCKET, path, contentType: 'video/mp4', onSuccess: () => resolve({ id, path, provider: 'supabase' }) });
        }
        onTask?.(task);
        task.start();
      } catch (error) { reject(error); }
    })();
  });
}
