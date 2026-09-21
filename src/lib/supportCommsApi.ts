/**
 * Client-side API helpers for the Super Admin "Support & Communication" module.
 *
 * These wrap the Express routes that persist to Supabase-first / MongoDB-fallback
 * (see lib/supportComms.ts). Every function is defensive: a network or parse
 * failure resolves to a null/empty result rather than throwing, so a dashboard
 * render never breaks because a comms endpoint is unreachable.
 */

import type { BroadcastMessage, PlatformAnnouncement, SupportTicket } from '../types';

async function safeJson<T>(res: Response): Promise<T | null> {
  try {
    const text = await res.text();
    if (!text || text.trimStart().startsWith('<')) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** Load active merchant support tickets from Supabase + MongoDB. */
export async function fetchSupportTickets(): Promise<SupportTicket[]> {
  try {
    const res = await fetch('/api/admin/support-tickets', { headers: { Accept: 'application/json' } });
    const data = await safeJson<{ ok: boolean; tickets: SupportTicket[] }>(res);
    return Array.isArray(data?.tickets) ? data.tickets : [];
  } catch (err) {
    console.warn('[supportCommsApi] fetchSupportTickets failed:', err);
    return [];
  }
}

/** Upsert one support ticket (reply, status change) to the database. */
export async function saveSupportTicket(
  ticket: SupportTicket,
  adminUser = 'Super Admin'
): Promise<boolean> {
  try {
    const res = await fetch('/api/admin/support-tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket, adminUser }),
    });
    const data = await safeJson<{ ok: boolean }>(res);
    return Boolean(data?.ok);
  } catch (err) {
    console.warn('[supportCommsApi] saveSupportTicket failed:', err);
    return false;
  }
}

/** Load the mass-broadcast history from Supabase + MongoDB. */
export async function fetchBroadcastHistory(): Promise<BroadcastMessage[]> {
  try {
    const res = await fetch('/api/admin/broadcast-history', { headers: { Accept: 'application/json' } });
    const data = await safeJson<{ ok: boolean; history: BroadcastMessage[] }>(res);
    return Array.isArray(data?.history) ? data.history : [];
  } catch (err) {
    console.warn('[supportCommsApi] fetchBroadcastHistory failed:', err);
    return [];
  }
}

/** Append a single mass broadcast to the database. */
export async function saveBroadcast(
  broadcast: BroadcastMessage,
  adminUser = 'Super Admin'
): Promise<boolean> {
  try {
    const res = await fetch('/api/admin/broadcast-history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ broadcast, adminUser }),
    });
    const data = await safeJson<{ ok: boolean }>(res);
    return Boolean(data?.ok);
  } catch (err) {
    console.warn('[supportCommsApi] saveBroadcast failed:', err);
    return false;
  }
}

/** Load the Global Notice Banner config from the platform config document. */
export async function fetchAnnouncement(): Promise<Partial<PlatformAnnouncement> | null> {
  try {
    const res = await fetch('/api/admin/announcement', { headers: { Accept: 'application/json' } });
    const data = await safeJson<{ ok: boolean; announcement: Partial<PlatformAnnouncement> | null }>(res);
    return data?.announcement || null;
  } catch (err) {
    console.warn('[supportCommsApi] fetchAnnouncement failed:', err);
    return null;
  }
}

/** Persist the Global Notice Banner config so all merchants see it live. */
export async function saveAnnouncement(
  announcement: PlatformAnnouncement,
  adminUser = 'Super Admin'
): Promise<boolean> {
  try {
    const res = await fetch('/api/admin/announcement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ announcement, adminUser }),
    });
    const data = await safeJson<{ ok: boolean }>(res);
    return Boolean(data?.ok);
  } catch (err) {
    console.warn('[supportCommsApi] saveAnnouncement failed:', err);
    return false;
  }
}

export default {
  fetchSupportTickets,
  saveSupportTicket,
  fetchBroadcastHistory,
  saveBroadcast,
  fetchAnnouncement,
  saveAnnouncement,
};
