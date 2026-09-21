/**
 * Client-side API helpers for the Super Admin admin-team & role-permission
 * surfaces. These wrap the Express routes that persist Supabase-first with a
 * MongoDB fallback (see lib/adminTeamConfig.ts). Every function is defensive:
 * a network/parse failure resolves to a null/empty result rather than throwing.
 */

import type { AdminRolePermission, AdminTeamMember } from '../types';

async function safeJson<T>(res: Response): Promise<T | null> {
  try {
    const text = await res.text();
    if (!text || text.trimStart().startsWith('<')) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** Load the admin team roster from Supabase + MongoDB. */
export async function fetchAdminTeam(): Promise<AdminTeamMember[]> {
  try {
    const res = await fetch('/api/admin/team', { headers: { Accept: 'application/json' } });
    const data = await safeJson<{ ok: boolean; team: AdminTeamMember[] }>(res);
    return Array.isArray(data?.team) ? data.team : [];
  } catch (err) {
    console.warn('[adminTeamApi] fetchAdminTeam failed:', err);
    return [];
  }
}

/** Upsert one admin team member to the database. */
export async function saveAdminMember(
  member: AdminTeamMember,
  adminUser = 'Super Admin'
): Promise<boolean> {
  try {
    const res = await fetch('/api/admin/team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member, adminUser }),
    });
    const data = await safeJson<{ ok: boolean }>(res);
    return Boolean(data?.ok);
  } catch (err) {
    console.warn('[adminTeamApi] saveAdminMember failed:', err);
    return false;
  }
}

/** Delete an admin team member from the database. */
export async function deleteAdminMember(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/admin/team/${encodeURIComponent(id)}`, { method: 'DELETE' });
    const data = await safeJson<{ ok: boolean }>(res);
    return Boolean(data?.ok);
  } catch (err) {
    console.warn('[adminTeamApi] deleteAdminMember failed:', err);
    return false;
  }
}

/** Load the role→allowedTabs permission matrix from the database. */
export async function fetchRolePermissions(): Promise<AdminRolePermission[]> {
  try {
    const res = await fetch('/api/admin/role-permissions', { headers: { Accept: 'application/json' } });
    const data = await safeJson<{ ok: boolean; roles: AdminRolePermission[] }>(res);
    return Array.isArray(data?.roles) ? data.roles : [];
  } catch (err) {
    console.warn('[adminTeamApi] fetchRolePermissions failed:', err);
    return [];
  }
}

/** Persist the role→allowedTabs permission matrix to the database. */
export async function saveRolePermissions(
  roles: AdminRolePermission[],
  adminUser = 'Super Admin'
): Promise<boolean> {
  try {
    const res = await fetch('/api/admin/role-permissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roles, adminUser }),
    });
    const data = await safeJson<{ ok: boolean }>(res);
    return Boolean(data?.ok);
  } catch (err) {
    console.warn('[adminTeamApi] saveRolePermissions failed:', err);
    return false;
  }
}

export default {
  fetchAdminTeam,
  saveAdminMember,
  deleteAdminMember,
  fetchRolePermissions,
  saveRolePermissions,
};
