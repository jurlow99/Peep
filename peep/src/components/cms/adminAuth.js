import { supabase } from "../../supabase";

// Bearer token for admin-only edge functions. Calls getUser() first so an
// expired session is validated and refreshed before the token is read.
export async function getAdminToken() {
  await supabase.auth.getUser();
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}
