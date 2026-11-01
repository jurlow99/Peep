import { describe, expect, it } from 'vitest';
import { allowedTarget, canAssign, canEditMember, effectiveStaffRole, navForRole } from './staff';

describe('staff roles', () => {
  it('treats legacy admins as admins and non-staff as nobody', () => {
    expect(effectiveStaffRole({ role: 'admin', is_admin: true, staff_role: 'owner' })).toBe('owner');
    expect(effectiveStaffRole({ role: 'admin', is_admin: true, staff_role: null })).toBe('admin');
    expect(effectiveStaffRole({ role: 'admin', is_admin: false, staff_role: 'editor' })).toBe('editor');
    expect(effectiveStaffRole({ role: 'viewer', is_admin: false, staff_role: 'owner' })).toBeNull();
    expect(effectiveStaffRole(null)).toBeNull();
  });

  it('shows editors only content, curation and live TV', () => {
    expect(navForRole('editor').map(g => g.key)).toEqual(['content', 'curation', 'live']);
    expect(navForRole('admin').length).toBeGreaterThan(3);
    expect(navForRole('owner').some(g => g.key === 'platform')).toBe(true);
  });

  it('redirects an editor away from screens they cannot see', () => {
    expect(allowedTarget('editor', { tab: 'settings' })).toEqual({ tab: 'storage' });
    expect(allowedTarget('editor', { tab: 'content', videoSubTab: 'series' })).toBeNull();
    expect(allowedTarget('admin', { tab: 'settings' })).toBeNull();
  });

  it('lets owners manage everyone, admins manage admins and editors, editors nobody', () => {
    expect(canAssign('owner', 'owner')).toBe(true);
    expect(canAssign('admin', 'owner')).toBe(false);
    expect(canAssign('admin', 'admin')).toBe(true);
    expect(canAssign('editor', 'editor')).toBe(false);
    expect(canEditMember('admin', { role: 'owner', you: false })).toBe(false);
    expect(canEditMember('admin', { role: 'editor', you: false })).toBe(true);
    expect(canEditMember('owner', { role: 'owner', you: true })).toBe(false);
  });
});
