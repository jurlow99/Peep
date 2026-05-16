import { supabase } from "../supabase";

/**
 * Create a new carousel/section
 */
export async function createCarousel(carousel) {
  try {
    const { data, error } = await supabase
      .from("carousels")
      .insert([carousel])
      .select();

    if (error) throw error;
    return { data: data?.[0], error: null };
  } catch (error) {
    return { data: null, error: error.message };
  }
}

/**
 * Get all carousels ordered by position
 */
export async function getCarousels() {
  try {
    const { data, error } = await supabase
      .from("carousels")
      .select("*")
      .eq("enabled", true)
      .order("position", { ascending: true });

    if (error) throw error;
    return { data: data || [], error: null };
  } catch (error) {
    return { data: [], error: error.message };
  }
}

/**
 * Update a carousel
 */
export async function updateCarousel(id, updates) {
  try {
    const { data, error } = await supabase
      .from("carousels")
      .update(updates)
      .eq("id", id)
      .select();

    if (error) throw error;
    return { data: data?.[0], error: null };
  } catch (error) {
    return { data: null, error: error.message };
  }
}

/**
 * Delete a carousel
 */
export async function deleteCarousel(id) {
  try {
    const { error } = await supabase
      .from("carousels")
      .delete()
      .eq("id", id);

    if (error) throw error;
    return { error: null };
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * Reorder carousels
 */
export async function reorderCarousels(positions) {
  try {
    const updates = positions.map((id, idx) => ({ id, position: idx }));
    
    const { error } = await supabase
      .from("carousels")
      .upsert(updates, { onConflict: "id" });

    if (error) throw error;
    return { error: null };
  } catch (error) {
    return { error: error.message };
  }
}
