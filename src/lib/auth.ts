export type ProfileRole = "viewer" | "creator" | "admin";

export const OWNER_EMAIL = "jacob.furlow@outlook.com";

export function isOwnerEmail(email: string | null | undefined): boolean {
  return email?.toLowerCase() === OWNER_EMAIL.toLowerCase();
}

export function isAdminRole(role: string | null | undefined): boolean {
  return role === "admin";
}

/** DB may still have legacy is_admin boolean — treat either as admin. */
export function isAdminProfile(profile: {
  role?: string | null;
  is_admin?: boolean | null;
} | null | undefined): boolean {
  if (!profile) return false;
  return isAdminRole(profile.role) || profile.is_admin === true;
}
