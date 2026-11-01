import { handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { getServiceClient, requireUser } from "../_shared/supabase.ts";

// Staff accounts: list, invite, change role, remove. Owners manage everyone;
// admins manage admins and editors; nobody changes their own access; the last
// owner can't be removed. Roles are written here only (service role), never
// from the browser.
type Role = "owner" | "admin" | "editor";
const ROLES: Role[] = ["owner", "admin", "editor"];
const RANK: Record<Role, number> = { owner: 3, admin: 2, editor: 1 };
const LABEL: Record<Role, string> = { owner: "Owner", admin: "Admin", editor: "Editor" };

type Profile = { id: string; email: string | null; full_name: string | null; role: string; is_admin: boolean; staff_role: Role | null };
const staffRoleOf = (p: Profile | null): Role | null => (p && (p.role === "admin" || p.is_admin) ? (p.staff_role ?? "admin") : null);

function assertCanAssign(actor: Role, target: Role) {
  if (!["owner", "admin"].includes(actor)) throw new Error("Only owners and admins can manage staff");
  if (RANK[target] > RANK[actor]) throw new Error(`Only an owner can make someone an ${LABEL[target].toLowerCase()}`);
}
function assertCanTouch(actor: Role, current: Role | null) {
  if (!["owner", "admin"].includes(actor)) throw new Error("Only owners and admins can manage staff");
  if (current && RANK[current] > RANK[actor]) throw new Error("Only an owner can change another owner");
}

function siteFor(req: Request) {
  const origin = req.headers.get("origin") || "";
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) || /^https:\/\/(admin\.)?watchpeep\.tv$/.test(origin)) return origin;
  return (Deno.env.get("SITE_URL") || "https://admin.watchpeep.tv").replace(/\/$/, "");
}

async function sendInvite(email: string, role: Role, link: string, name: string, existing: boolean) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return { sent: false, reason: "RESEND_API_KEY not set" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Peep <noreply@watchpeep.tv>",
      to: email,
      subject: `You've been added to Peep admin as ${LABEL[role]}`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:40px 24px;background:#0a0a0a;color:#fff;">
          <h1 style="font-size:32px;color:#facc15;margin:0 0 24px;">peep.</h1>
          <h2 style="font-size:20px;font-weight:600;margin:0 0 12px;">${name ? `Hi ${name}, you` : "You"}'re on the Peep team</h2>
          <p style="color:#888;font-size:14px;margin:0 0 16px;line-height:1.6;">You've been given <strong style="color:#fff">${LABEL[role]}</strong> access to the Peep admin.</p>
          <p style="color:#888;font-size:14px;margin:0 0 28px;line-height:1.6;">${existing ? "Click below to open admin. You're signed in automatically the first time." : "Click below to set your password, then you're in."}</p>
          <a href="${link}" style="display:inline-block;background:#facc15;color:#0a0a0a;font-weight:700;font-size:15px;padding:14px 28px;border-radius:10px;text-decoration:none;">${existing ? "Open admin →" : "Set your password →"}</a>
          <p style="color:#444;font-size:12px;margin:32px 0 0;line-height:1.6;">This link works once and expires. If it has expired, ask the person who invited you to send it again.</p>
        </div>`,
    }),
  });
  const result = await res.json();
  if (result.error) return { sent: false, reason: result.error.message || JSON.stringify(result.error) };
  return { sent: true };
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  try {
    const supabase = getServiceClient();
    const user = await requireUser(req, supabase);
    const { data: me } = await supabase.from("profiles").select("id,email,full_name,role,is_admin,staff_role").eq("id", user.id).maybeSingle();
    const actor = staffRoleOf(me as Profile | null);
    if (!actor) throw new Error("Admin access required");

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "list");

    if (action === "list") {
      const { data: rows, error } = await supabase.from("profiles").select("id,email,full_name,role,is_admin,staff_role,created_at")
        .or("role.eq.admin,is_admin.eq.true,staff_role.not.is.null").order("created_at");
      if (error) throw new Error(error.message);
      const { data: invites } = await supabase.from("staff_invitations").select("id,email,role,invited_by,user_id,created_at,accepted_at").order("created_at");
      const members = [];
      for (const row of rows || []) {
        const { data: au } = await supabase.auth.admin.getUserById(row.id);
        const lastSignIn = au?.user?.last_sign_in_at ?? null;
        const invite = (invites || []).find((i) => i.user_id === row.id);
        if (invite && !invite.accepted_at && lastSignIn) await supabase.from("staff_invitations").update({ accepted_at: lastSignIn }).eq("id", invite.id);
        members.push({ id: row.id, email: row.email, name: row.full_name, role: staffRoleOf(row as Profile), last_sign_in_at: lastSignIn, invited_at: invite?.created_at ?? null, pending: !!invite && !lastSignIn, you: row.id === user.id });
      }
      return jsonResponse({ members, actor });
    }

    if (action === "invite") {
      const email = String(body.email || "").trim().toLowerCase();
      const role = String(body.role || "editor") as Role;
      const name = String(body.name || "").trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email address");
      if (!ROLES.includes(role)) throw new Error("Pick a role");
      assertCanAssign(actor, role);
      const { data: existing } = await supabase.from("profiles").select("id,email,full_name,role,is_admin,staff_role").eq("email", email).maybeSingle();
      if (existing && staffRoleOf(existing as Profile)) throw new Error(`${email} is already on the team as ${LABEL[staffRoleOf(existing as Profile)!]}`);
      const site = siteFor(req);
      const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink(
        existing
          ? { type: "magiclink", email, options: { redirectTo: `${site}/admin` } }
          : { type: "invite", email, options: { redirectTo: `${site}/set-password?next=/admin`, data: name ? { full_name: name } : {} } },
      );
      if (linkErr) throw new Error(linkErr.message);
      const userId = linkData.user.id;
      const { error: upErr } = await supabase.from("profiles").upsert({ id: userId, email, full_name: existing?.full_name || name || null, role: "admin", is_admin: true, staff_role: role }, { onConflict: "id" });
      if (upErr) throw new Error(upErr.message);
      await supabase.from("staff_invitations").delete().eq("user_id", userId);
      await supabase.from("staff_invitations").insert({ email, role, invited_by: user.id, user_id: userId });
      const mail = await sendInvite(email, role, linkData.properties.action_link, name || existing?.full_name || "", !!existing);
      return jsonResponse({ success: true, user_id: userId, email_sent: mail.sent, email_error: mail.sent ? null : mail.reason, link: mail.sent ? null : linkData.properties.action_link });
    }

    if (action === "resend") {
      const targetId = String(body.user_id || "");
      const { data: target } = await supabase.from("profiles").select("id,email,full_name,role,is_admin,staff_role").eq("id", targetId).maybeSingle();
      const role = staffRoleOf(target as Profile | null);
      if (!target || !role) throw new Error("That person isn't on the team");
      assertCanTouch(actor, role);
      const site = siteFor(req);
      const { data: au } = await supabase.auth.admin.getUserById(targetId);
      const fresh = !au?.user?.last_sign_in_at;
      const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink(
        fresh ? { type: "invite", email: target.email!, options: { redirectTo: `${site}/set-password?next=/admin` } } : { type: "magiclink", email: target.email!, options: { redirectTo: `${site}/admin` } },
      );
      if (linkErr) throw new Error(linkErr.message);
      const mail = await sendInvite(target.email!, role, linkData.properties.action_link, target.full_name || "", !fresh);
      return jsonResponse({ success: true, email_sent: mail.sent, email_error: mail.sent ? null : mail.reason, link: mail.sent ? null : linkData.properties.action_link });
    }

    if (action === "set_role" || action === "remove") {
      const targetId = String(body.user_id || "");
      if (targetId === user.id) throw new Error("You can't change your own access");
      const { data: target } = await supabase.from("profiles").select("id,email,full_name,role,is_admin,staff_role").eq("id", targetId).maybeSingle();
      const current = staffRoleOf(target as Profile | null);
      if (!target || !current) throw new Error("That person isn't on the team");
      assertCanTouch(actor, current);
      if (current === "owner") {
        const { count } = await supabase.from("profiles").select("id", { count: "exact", head: true }).eq("staff_role", "owner");
        if ((count ?? 0) <= 1) throw new Error("Peep needs at least one owner");
      }
      if (action === "set_role") {
        const role = String(body.role || "") as Role;
        if (!ROLES.includes(role)) throw new Error("Pick a role");
        assertCanAssign(actor, role);
        const { error } = await supabase.from("profiles").update({ role: "admin", is_admin: true, staff_role: role }).eq("id", targetId);
        if (error) throw new Error(error.message);
        return jsonResponse({ success: true, role });
      }
      const { error } = await supabase.from("profiles").update({ role: "viewer", is_admin: false, staff_role: null }).eq("id", targetId);
      if (error) throw new Error(error.message);
      const { data: au } = await supabase.auth.admin.getUserById(targetId);
      const { data: invite } = await supabase.from("staff_invitations").select("id").eq("user_id", targetId).maybeSingle();
      await supabase.from("staff_invitations").delete().eq("user_id", targetId);
      // An invited account that never signed in leaves no trace behind.
      if (invite && !au?.user?.last_sign_in_at) await supabase.auth.admin.deleteUser(targetId);
      return jsonResponse({ success: true, removed: true });
    }

    throw new Error(`Unknown action '${action}'`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return errorResponse(message, message === "Unauthorized" ? 401 : 400);
  }
});
