/**
 * Client helpers for the GLOBAL CATEGORY TAXONOMY.
 *
 * Mirrors the routes in lib/serverApp.ts (backed by lib/categoryTaxonomy.ts):
 *
 *   PUBLIC
 *     GET  /api/taxonomy               → nested active tree (mega-menu + product form)
 *     POST /api/taxonomy/resolve       → dropdown selection → product tag fields
 *
 *   ADMIN
 *     GET    /api/admin/taxonomy
 *     POST   /api/admin/taxonomy
 *     PATCH  /api/admin/taxonomy/:id
 *     DELETE /api/admin/taxonomy/:id
 *     POST   /api/admin/taxonomy/reorder
 *     POST   /api/admin/taxonomy/seed
 *
 * Every helper resolves rather than throwing, so a taxonomy outage degrades the
 * product form to its legacy list instead of blocking a merchant's save.
 */

export interface TaxonomyNode {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  /** 1 = primary category, 2 = sub-category, 3 = sub-type. */
  level: number;
  emoji?: string;
  image?: string;
  description?: string;
  isActive: boolean;
  sortOrder: number;
}

export interface TaxonomyTree extends TaxonomyNode {
  children: TaxonomyTree[];
}

export interface TaxonomyLookupResult {
  ok: boolean;
  tree: TaxonomyTree[];
  flat: TaxonomyNode[];
  error?: string;
}

async function safeJson<T>(res: Response): Promise<T | null> {
  try {
    const text = await res.text();
    if (!text || text.trimStart().startsWith('<')) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/* ──────────────────────────── public reads ──────────────────────────── */

let cache: { data: TaxonomyLookupResult; at: number } | null = null;
const CACHE_MS = 60 * 1000;

/** The active tree, for the mega-menu and the merchant product form. */
export async function fetchTaxonomy(force = false): Promise<TaxonomyLookupResult> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.data;
  const empty: TaxonomyLookupResult = { ok: false, tree: [], flat: [] };
  try {
    const res = await fetch('/api/taxonomy', { headers: { Accept: 'application/json' }, cache: 'no-store' });
    const data = await safeJson<TaxonomyLookupResult>(res);
    const result: TaxonomyLookupResult = data
      ? {
          ok: Boolean(data.ok),
          tree: Array.isArray(data.tree) ? data.tree : [],
          flat: Array.isArray(data.flat) ? data.flat : [],
          error: data.error,
        }
      : empty;
    cache = { data: result, at: Date.now() };
    return result;
  } catch (err) {
    console.warn('[categoryTaxonomyApi] fetchTaxonomy failed:', err);
    return empty;
  }
}

/** Drop the in-memory cache (called after an admin edit). */
export function clearTaxonomyCache(): void {
  cache = null;
}

/** Resolve a dropdown selection into the product's tag fields. */
export async function resolveTaxonomySelection(input: {
  categoryId?: string;
  subCategoryId?: string;
  category?: string;
  subCategory?: string;
}): Promise<{ ok: boolean; category: string; categoryId: string; subCategory: string; subCategoryId: string; error?: string }> {
  const fallback = { ok: false, category: '', categoryId: '', subCategory: '', subCategoryId: '' };
  try {
    const res = await fetch('/api/taxonomy/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(input),
    });
    const data = await safeJson<any>(res);
    if (!data) return fallback;
    return {
      ok: Boolean(data.ok),
      category: String(data.category || ''),
      categoryId: String(data.categoryId || ''),
      subCategory: String(data.subCategory || ''),
      subCategoryId: String(data.subCategoryId || ''),
      error: data.error,
    };
  } catch (err: any) {
    return { ...fallback, error: err?.message || 'Network error.' };
  }
}

/* ──────────────────────────── admin CRUD ──────────────────────────── */

export async function fetchAdminTaxonomy(): Promise<{ nodes: TaxonomyNode[]; tree: TaxonomyTree[] }> {
  try {
    const res = await fetch('/api/admin/taxonomy', { headers: { Accept: 'application/json' }, cache: 'no-store' });
    const data = await safeJson<{ ok: boolean; nodes: TaxonomyNode[]; tree: TaxonomyTree[] }>(res);
    return {
      nodes: Array.isArray(data?.nodes) ? data!.nodes : [],
      tree: Array.isArray(data?.tree) ? data!.tree : [],
    };
  } catch (err) {
    console.warn('[categoryTaxonomyApi] fetchAdminTaxonomy failed:', err);
    return { nodes: [], tree: [] };
  }
}

async function write<T>(url: string, method: string, body?: unknown): Promise<T> {
  try {
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json', Accept: 'application/json' } : { Accept: 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await safeJson<any>(res);
    clearTaxonomyCache();
    return (data ?? { ok: false, error: 'The server did not return JSON.' }) as T;
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Network error.' } as T;
  }
}

export const createTaxonomyNode = (input: Partial<TaxonomyNode> & { name: string }) =>
  write<{ ok: boolean; node?: TaxonomyNode; error?: string }>('/api/admin/taxonomy', 'POST', input);

export const updateTaxonomyNode = (id: string, input: Partial<TaxonomyNode>) =>
  write<{ ok: boolean; node?: TaxonomyNode; renamedProducts?: number; error?: string }>(
    `/api/admin/taxonomy/${encodeURIComponent(id)}`, 'PATCH', input,
  );

export const deleteTaxonomyNode = (id: string) =>
  write<{ ok: boolean; error?: string }>(`/api/admin/taxonomy/${encodeURIComponent(id)}`, 'DELETE');

export const reorderTaxonomyNodes = (entries: { id: string; sortOrder?: number; parentId?: string | null }[]) =>
  write<{ ok: boolean; error?: string }>('/api/admin/taxonomy/reorder', 'POST', { entries });

export const seedStarterTaxonomy = () =>
  write<{ ok: boolean; created: number; error?: string }>('/api/admin/taxonomy/seed', 'POST', {});

export default {
  fetchTaxonomy,
  clearTaxonomyCache,
  resolveTaxonomySelection,
  fetchAdminTaxonomy,
  createTaxonomyNode,
  updateTaxonomyNode,
  deleteTaxonomyNode,
  reorderTaxonomyNodes,
  seedStarterTaxonomy,
};
