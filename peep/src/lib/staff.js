// Staff roles for the admin. Every staff member passes the server's admin check;
// the role decides which admin screens they see and who they may manage.
import { ADMIN_NAV, activeAdminLocation } from '../components/cms/adminSections';
import { isAdminProfile } from './auth';

export const STAFF_ROLES = [
  { key: 'owner', label: 'Owner', summary: 'Everything, including other owners' },
  { key: 'admin', label: 'Admin', summary: 'Everything except owners' },
  { key: 'editor', label: 'Editor', summary: 'Content, curation and Live TV only' },
];
const RANK = { owner: 3, admin: 2, editor: 1 };
export const EDITOR_GROUPS = ['content', 'curation', 'live'];

export function roleLabel(role) { return STAFF_ROLES.find(r => r.key === role)?.label || 'Staff'; }

// Legacy admins without a staff_role behave as admins so nobody is locked out.
export function effectiveStaffRole(profile) {
  if (!isAdminProfile(profile)) return null;
  return RANK[profile.staff_role] ? profile.staff_role : 'admin';
}

export function navForRole(role, nav = ADMIN_NAV) {
  return role === 'editor' ? nav.filter(group => EDITOR_GROUPS.includes(group.key)) : nav;
}

// Editors who land on a screen they can't see are sent to the first one they can.
export function allowedTarget(role, state, nav = ADMIN_NAV) {
  const visible = navForRole(role, nav);
  const { group } = activeAdminLocation(state, nav);
  return visible.some(g => g.key === group.key) ? null : visible[0].sections[0].target;
}

export const canManageStaff = role => role === 'owner' || role === 'admin';
// Owners may hand out any role; admins may hand out admin and editor.
export const canAssign = (actor, target) => canManageStaff(actor) && RANK[target] <= RANK[actor];
// Nobody edits themselves; owners are only touched by owners.
export const canEditMember = (actor, member) => canManageStaff(actor) && !member.you && RANK[member.role] <= RANK[actor];
