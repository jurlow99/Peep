import { supabase } from "../supabase";
import { SUPABASE_URL } from "./config";

const BUCKET_NAME = "peep-media";

/**
 * Uploads an image to Supabase Storage
 * @param {File} file - Image file to upload
 * @param {string} folder - Folder path in storage (e.g., "thumbnails", "images")
 * @returns {Promise<{url: string, path: string, error: string|null}>}
 */
export async function uploadImage(file, folder = "thumbnails") {
  try {
    if (!file) throw new Error("No file provided");
    
    // Create unique filename
    const timestamp = Date.now();
    const filename = `${timestamp}-${file.name.replace(/\s+/g, "-")}`;
    const path = `${folder}/${filename}`;

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });

    if (error) throw error;

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(path);

    return {
      url: urlData.publicUrl,
      path: path,
      error: null,
    };
  } catch (error) {
    return {
      url: null,
      path: null,
      error: error.message,
    };
  }
}

/**
 * Deletes an image from Supabase Storage
 * @param {string} path - Path of image to delete
 * @returns {Promise<{error: string|null}>}
 */
export async function deleteImage(path) {
  try {
    if (!path) throw new Error("No path provided");
    
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([path]);

    if (error) throw error;
    return { error: null };
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * Lists all images in a folder
 * @param {string} folder - Folder path
 * @returns {Promise<{files: Array, error: string|null}>}
 */
export async function listImages(folder = "") {
  try {
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .list(folder, {
        limit: 100,
        offset: 0,
        sortBy: { column: "created_at", order: "desc" },
      });

    if (error) throw error;
    return { files: data || [], error: null };
  } catch (error) {
    return { files: [], error: error.message };
  }
}

/**
 * Gets public URL for a file
 * @param {string} path - File path
 * @returns {string}
 */
export function getPublicUrl(path) {
  const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(path);
  return data?.publicUrl || "";
}

/**
 * Uploads a video file to Supabase Storage with progress tracking
 * @param {File} file - Video file to upload
 * @param {string} path - Full storage path (e.g. "episodes/creator-id/show-id/ep-1.mp4")
 * @param {function} onProgress - Progress callback (0-100)
 * @returns {Promise<{url: string, path: string, error: string|null}>}
 */
export async function uploadVideo(file, path, onProgress) {
  return new Promise(async (resolve) => {
    try {
      if (!file) throw new Error("No file provided");

      // Get the current session token for auth
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${BUCKET_NAME}/${path}`;

      const xhr = new XMLHttpRequest();
      xhr.open("POST", uploadUrl);
      xhr.setRequestHeader("Authorization", `Bearer ${session.access_token}`);
      xhr.setRequestHeader("Content-Type", file.type || "video/mp4");
      xhr.setRequestHeader("x-upsert", "false");

      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      });

      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(path);
          resolve({ url: data.publicUrl, path, error: null });
        } else {
          let msg = "Upload failed";
          try { msg = JSON.parse(xhr.responseText)?.error || msg; } catch {}
          resolve({ url: null, path: null, error: msg });
        }
      });

      xhr.addEventListener("error", () => {
        resolve({ url: null, path: null, error: "Network error during upload" });
      });

      xhr.send(file);
    } catch (err) {
      resolve({ url: null, path: null, error: err.message });
    }
  });
}
