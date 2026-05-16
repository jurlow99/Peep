import { supabase } from "../supabase";

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
