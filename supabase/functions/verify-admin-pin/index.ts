import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type" },
    });
  }

  try {
    const { pin } = await req.json();
    if (!pin) throw new Error("PIN required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SERVICE_ROLE_KEY")!
    );

    const [{ data: adminRow }, { data: bossRow }] = await Promise.all([
      supabase.from("app_settings").select("value").eq("key", "admin_pin").maybeSingle(),
      supabase.from("app_settings").select("value").eq("key", "boss_pin").maybeSingle(),
    ]);

    const isAdmin = adminRow?.value && pin === adminRow.value;
    const isBoss = bossRow?.value && pin === bossRow.value;

    if (!isAdmin && !isBoss) {
      return new Response(JSON.stringify({ valid: false }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    return new Response(JSON.stringify({ valid: true, role: isBoss ? "boss" : "admin" }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ valid: false, error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
});
