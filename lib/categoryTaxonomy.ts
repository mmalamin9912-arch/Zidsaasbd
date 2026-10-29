/**
 * GLOBAL CATEGORY TAXONOMY — the platform-wide category tree.
 *
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 * Categories used to be free text. Every merchant typed their own spelling
 * ("Fashion", "fashion", "Womens Fashion", "Cloths"), so the marketplace could
 * not build a real navigation tree and the same product lived in five places.
 * This module is the single, Super-Admin-owned tree that every merchant picks
 * from and every marketplace filter resolves against.
 *
 * SHAPE
 * ---------------------------------------------------------------------------
 * Two levels, as on Noon / Amazon:
 *
 *   category_taxonomy (one document per node)
 *     { id, parent_id: null, name, slug, level: 1, … }   ← primary category
 *     { id, parent_id: 'cat-fashion', …, level: 2 }      ← sub-category / sub-type
 *
 * A sub-category may itself have children, in which case `level` is 2 and the
 * extra nesting is presented as "sub-types" inside that sub-category's menu.
 * Nothing beyond three levels is exposed in the UI.
 *
 * WHY NOT REUSE `marketplace_config.categories`
 * ---------------------------------------------------------------------------
 * That collection is the MARKETPLACE'S PRESENTATION list — which categories
 * show in the rail, in what order, with which artwork. It is a display overlay
 * over whatever products happen to exist.
 *
 * This is different: it is the canonical, enforced vocabulary that products
 * must be tagged with. Keeping them separate means an admin can hide a
 * category from the front-page rail without removing it from the merchant's
 * product form, and the two can never drift into contradicting each other.
 * `getMarketplaceStorefrontConfig` overlays this tree onto that list so the
 * marketplace rail and the taxonomy always agree on names and order.
 *
 * PRODUCT TAGGING
 * ---------------------------------------------------------------------------
 * A product stores three fields (see `tagProductWithTaxonomy`):
 *
 *   category          — the PRIMARY category name  (marketplace facet key)
 *   category_id       — the taxonomy primary id
 *   sub_category      — the sub-category name       (second facet level)
 *   sub_category_id   — the taxonomy sub-category id
 *
 * `category` stays a NAME, not an id, because every existing marketplace query,
 * facet and product card already keys off it — changing that would break the
 * catalogue. The ids are carried alongside so a rename in the admin panel can be
 * propagated without a guess.
 *
 * Everything here degrades: a missing database returns an empty tree rather
 * than throwing, and the merchant form falls back to its legacy list.
 */

import mongoose from 'mongoose';
import { getMongoDb, DB_NAME } from './db.js';
import { toJsonPlain } from './hybridDb.js';

export const TAXONOMY_COLLECTION = 'category_taxonomy';

export interface TaxonomyNode {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  /** 1 = primary category, 2 = sub-category, 3 = sub-type. */
  level: number;
  /** Emoji or uploaded image for the menu tile. */
  emoji?: string;
  image?: string;
  description?: string;
  isActive: boolean;
  sortOrder: number;
  created_at?: string;
  updated_at?: string;
}

export interface TaxonomyTree extends TaxonomyNode {
  children: TaxonomyTree[];
}

/* ─────────────────────────────── helpers ─────────────────────────────── */

export function toTaxonomySlug(value: string): string {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'category';
}

function toNum(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  return Number.isFinite(n) ? n : fallback;
}

function toBool(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return !['false', '0', 'no', 'off', 'hidden', 'inactive'].includes(String(value).toLowerCase());
}

function makeId(prefix = 'cat'): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

async function safeDb() {
  try {
    return await getMongoDb(DB_NAME);
  } catch (err: any) {
    console.warn('[CategoryTaxonomy] database unavailable:', err?.message || err);
    return null;
  }
}

function normalizeNode(raw: any, fallbackOrder = 0): TaxonomyNode {
  const name = String(raw?.name ?? '').trim();
  return {
    id: String(raw?.id || makeId()),
    parent_id: raw?.parent_id ?? raw?.parentId ?? null,
    name,
    slug: String(raw?.slug || toTaxonomySlug(name)),
    level: Math.min(3, Math.max(1, Math.floor(toNum(raw?.level, 1)))),
    emoji: raw?.emoji ? String(raw.emoji) : undefined,
    image: raw?.image ? String(raw.image) : undefined,
    description: raw?.description ? String(raw.description) : undefined,
    isActive: toBool(raw?.isActive ?? raw?.is_active, true),
    sortOrder: toNum(raw?.sortOrder ?? raw?.sort_order, fallbackOrder),
    created_at: raw?.created_at ? String(raw.created_at) : undefined,
    updated_at: raw?.updated_at ? String(raw.updated_at) : undefined,
  };
}

/* ──────────────────────────── seed taxonomy ──────────────────────────── */

/**
 * The starter tree. Deliberately broad and Bangladeshi-market relevant, and
 * deliberately NOT auto-installed: an operator with an existing catalogue
 * should decide when to adopt it. The admin UI offers a one-click "load
 * starter tree" action instead.
 */
export const STARTER_TAXONOMY: { name: string; emoji: string; subs: string[] }[] = [
  {
    name: 'Fashion', emoji: '👗',
    subs: ["Women's Clothing", "Men's Clothing", 'Sarees & Jamdani', 'Panjabi & Kurta', 'Shoes & Footwear', 'Bags & Accessories', 'Watches', 'Jewellery'],
  },
  {
    name: 'Electronics', emoji: '📱',
    subs: ['Mobile Phones', 'Tablets', 'Laptops & Computers', 'Audio & Headphones', 'Cameras', 'TV & Home Entertainment', 'Smart Watches', 'Accessories & Cables'],
  },
  {
    name: 'Beauty & Personal Care', emoji: '💄',
    subs: ['Skincare', 'Makeup', 'Haircare', 'Fragrance', 'Bath & Body', 'Men’s Grooming'],
  },
  {
    name: 'Home & Kitchen', emoji: '🏠',
    subs: ['Furniture', 'Kitchenware', 'Home Décor', 'Bedding & Bath', 'Lighting', 'Storage & Organisation', 'Appliances'],
  },
  {
    name: 'Grocery & Food', emoji: '🛒',
    subs: ['Rice & Staples', 'Spices & Masala', 'Snacks & Sweets', 'Beverages', 'Tea & Coffee', 'Fresh Produce', 'Baby Food'],
  },
  {
    name: 'Health & Pharmacy', emoji: '💊',
    subs: ['Medicines', 'Supplements & Vitamins', 'Medical Devices', 'Personal Hygiene', 'Health Monitors'],
  },
  {
    name: 'Sports & Outdoors', emoji: '🏏',
    subs: ['Cricket', 'Football', 'Fitness & Gym', 'Cycling', 'Camping & Outdoor', 'Sportswear'],
  },
  {
    name: 'Toys, Baby & Kids', emoji: '🧸',
    subs: ['Toys & Games', 'Baby Gear', 'Diapers & Care', "Kids' Clothing", 'School Supplies'],
  },
  {
    name: 'Books & Stationery', emoji: '📚',
    subs: ['Academic Books', 'Fiction & Literature', 'Islamic Books', 'Office Supplies', 'Art & Craft'],
  },
  {
    name: 'Jewellery & Watches', emoji: '💎',
    subs: ['Gold & Diamond', 'Silver', 'Fashion Jewellery', 'Wrist Watches'],
  },
];

/* ─────────────────────────────── reads ─────────────────────────────── */

/** Every node, active or not, in display order. Admin read. */
export async function listTaxonomyNodes(): Promise<{ ok: boolean; nodes: TaxonomyNode[]; error?: string }> {
  const db = await safeDb();
  if (!db) return { ok: false, nodes: [], error: 'The database is unavailable.' };
  try {
    const rows = await db.collection(TAXONOMY_COLLECTION).find({}).limit(5000).toArray();
    const seen = new Set<string>();
    const nodes: TaxonomyNode[] = [];
    rows.forEach((row: any, i: number) => {
      const node = normalizeNode(toJsonPlain(row), i);
      if (!node.name || seen.has(node.id)) return;
      seen.add(node.id);
      nodes.push(node);
    });
    // Parents before their children, then by explicit sortOrder — this keeps a
    // tree render correct even when the admin never touched the ordering.
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const depthOf = (node: TaxonomyNode): number => {
      let depth = 0;
      let cursor = node;
      const guard = new Set<string>();
      while (cursor.parent_id && byId.has(cursor.parent_id) && !guard.has(cursor.id)) {
        guard.add(cursor.id);
        cursor = byId.get(cursor.parent_id)!;
        depth += 1;
      }
      return depth;
    };
    return {
      ok: true,
      nodes: nodes
        .map((node) => ({ node, depth: depthOf(node) }))
        .sort((a, b) => a.depth - b.depth || a.node.sortOrder - b.node.sortOrder || a.node.name.localeCompare(b.node.name))
        .map((entry) => entry.node),
    };
  } catch (err: any) {
    return { ok: false, nodes: [], error: err?.message || 'The taxonomy could not be read.' };
  }
}

/** Build the nested tree from a flat node list. */
export function buildTree(nodes: TaxonomyNode[]): TaxonomyTree[] {
  const byParent = new Map<string | null, TaxonomyTree[]>();
  const byId = new Map<string, TaxonomyTree>();
  for (const node of nodes) {
    const tree: TaxonomyTree = { ...node, children: [] };
    byId.set(node.id, tree);
  }
  for (const node of nodes) {
    const tree = byId.get(node.id)!;
    // A dangling parent reference is treated as a root so nothing is lost.
    const parentKey = node.parent_id && byId.has(node.parent_id) ? node.parent_id : null;
    const bucket = byParent.get(parentKey) || [];
    bucket.push(tree);
    byParent.set(parentKey, bucket);
  }
  for (const [parentKey, children] of byParent) {
    if (parentKey === null) continue;
    const parent = byId.get(parentKey);
    if (parent) parent.children = children.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }
  const roots = (byParent.get(null) || []).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  return roots;
}

/** The public tree: active nodes only, nested. Cached briefly per request budget. */
export async function getPublicTaxonomyTree(): Promise<{ ok: boolean; tree: TaxonomyTree[]; flat: TaxonomyNode[]; error?: string }> {
  const { ok, nodes, error } = await listTaxonomyNodes();
  const active = nodes.filter((n) => n.isActive);
  // Drop any node whose ancestor is inactive, so a hidden primary category
  // never leaks into the mega-menu through a live child.
  const byId = new Map(active.map((n) => [n.id, n]));
  const reachable = active.filter((node) => {
    let cursor = node;
    const guard = new Set<string>();
    while (cursor.parent_id && !guard.has(cursor.id)) {
      guard.add(cursor.id);
      const parent = byId.get(cursor.parent_id);
      if (!parent) return false; // hidden/deleted ancestor
      cursor = parent;
    }
    return true;
  });
  return { ok, tree: buildTree(reachable), flat: reachable, error };
}

/**
 * A flat lookup used by the merchant form and by product tagging:
 * `{ byId, byName, byPath }` so every spelling a product might carry resolves.
 */
export interface TaxonomyLookup {
  nodes: TaxonomyNode[];
  byId: Map<string, TaxonomyNode>;
  /** `"fashion"` → primary node */
  byName: Map<string, TaxonomyNode>;
  /** `"fashion > sarees"` (slug path) → deepest node */
  byPath: Map<string, TaxonomyNode>;
  parentsOf: (id: string) => TaxonomyNode[];
}

export async function loadTaxonomyLookup(): Promise<TaxonomyLookup> {
  const { nodes } = await listTaxonomyNodes();
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const byName = new Map<string, TaxonomyNode>();
  for (const node of nodes) {
    const key = node.name.toLowerCase();
    // First (shallowest) wins on a duplicate name, which is what the merchant
    // dropdown shows first.
    if (!byName.has(key)) byName.set(key, node);
  }
  const pathOf = (node: TaxonomyNode): string => {
    const parts: string[] = [node.slug];
    let cursor = node;
    const guard = new Set<string>();
    while (cursor.parent_id && byId.has(cursor.parent_id) && !guard.has(cursor.id)) {
      guard.add(cursor.id);
      const parent = byId.get(cursor.parent_id)!;
      parts.unshift(parent.slug);
      cursor = parent;
    }
    return parts.join(' > ');
  };
  const byPath = new Map<string, TaxonomyNode>();
  for (const node of nodes) byPath.set(pathOf(node), node);
  return {
    nodes, byId, byName, byPath,
    parentsOf: (id: string) => {
      const out: TaxonomyNode[] = [];
      let cursor = byId.get(id);
      const guard = new Set<string>();
      while (cursor?.parent_id && byId.has(cursor.parent_id) && !guard.has(cursor.id)) {
        guard.add(cursor.id);
        cursor = byId.get(cursor.parent_id)!;
        out.unshift(cursor);
      }
      return out;
    },
  };
}

/* ─────────────────────────────── writes ─────────────────────────────── */

function sanitizeNodeInput(input: any): Partial<TaxonomyNode> {
  const out: Partial<TaxonomyNode> = {};
  if (input?.name !== undefined) out.name = String(input.name).trim();
  if (input?.slug !== undefined) out.slug = input.slug ? toTaxonomySlug(String(input.slug)) : undefined;
  if (input?.parent_id !== undefined || input?.parentId !== undefined) {
    out.parent_id = input.parent_id ?? input.parentId ?? null;
  }
  if (input?.emoji !== undefined) out.emoji = input.emoji ? String(input.emoji) : undefined;
  if (input?.image !== undefined) out.image = input.image ? String(input.image) : undefined;
  if (input?.description !== undefined) out.description = input.description ? String(input.description) : undefined;
  if (input?.isActive !== undefined || input?.is_active !== undefined) {
    out.isActive = toBool(input.isActive ?? input.is_active, true);
  }
  if (input?.sortOrder !== undefined || input?.sort_order !== undefined) {
    out.sortOrder = toNum(input.sortOrder ?? input.sort_order, 0);
  }
  return out;
}

async function upsertNode(node: TaxonomyNode): Promise<{ ok: boolean; error?: string }> {
  const db = await safeDb();
  if (!db) return { ok: false, error: 'The database is unavailable.' };
  try {
    const now = new Date().toISOString();
    await db.collection(TAXONOMY_COLLECTION).updateOne(
      { id: node.id },
      { $set: toJsonPlain({ ...node, updated_at: now }), $setOnInsert: { created_at: node.created_at || now } },
      { upsert: true },
    );
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'The category could not be saved.' };
  }
}

/** Create a primary category or a sub-category underneath one. */
export async function createTaxonomyNode(input: any): Promise<{ ok: boolean; node?: TaxonomyNode; error?: string }> {
  const clean = sanitizeNodeInput(input);
  if (!clean.name) return { ok: false, error: 'A category name is required.' };

  const { nodes } = await listTaxonomyNodes();

  // Siblings must not share a name — the whole point of a taxonomy is one
  // spelling per concept.
  const siblingClash = nodes.find(
    (n) => (n.parent_id || null) === (clean.parent_id || null) &&
      n.name.toLowerCase() === clean.name!.toLowerCase(),
  );
  if (siblingClash) {
    return { ok: false, error: `“${clean.name}” already exists at this level.` };
  }

  let level = 1;
  if (clean.parent_id) {
    const parent = nodes.find((n) => n.id === clean.parent_id);
    if (!parent) return { ok: false, error: 'The parent category no longer exists.' };
    level = Math.min(3, parent.level + 1);
    if (level > 3) return { ok: false, error: 'Categories can nest at most three levels deep.' };
  }

  const siblings = nodes.filter((n) => (n.parent_id || null) === (clean.parent_id || null));
  const node: TaxonomyNode = {
    id: makeId(),
    parent_id: clean.parent_id || null,
    name: clean.name,
    slug: clean.slug || toTaxonomySlug(clean.name),
    level,
    emoji: clean.emoji,
    image: clean.image,
    description: clean.description,
    isActive: clean.isActive ?? true,
    sortOrder: clean.sortOrder ?? siblings.length,
  };

  const result = await upsertNode(node);
  return result.ok ? { ok: true, node } : { ok: false, error: result.error };
}

/**
 * Update a node. A RENAME is propagated to tagged products immediately, because
 * `products.category` stores the NAME — leaving stale names behind would strand
 * those products outside every filter.
 */
export async function updateTaxonomyNode(input: any): Promise<{
  ok: boolean; node?: TaxonomyNode; renamedProducts?: number; error?: string;
}> {
  const id = String(input?.id || '').trim();
  if (!id) return { ok: false, error: 'A category id is required.' };

  const { nodes } = await listTaxonomyNodes();
  const existing = nodes.find((n) => n.id === id);
  if (!existing) return { ok: false, error: 'That category no longer exists.' };

  const clean = sanitizeNodeInput(input);

  if (clean.name && clean.name.toLowerCase() !== existing.name.toLowerCase()) {
    const clash = nodes.find(
      (n) => n.id !== id &&
        (n.parent_id || null) === (existing.parent_id || null) &&
        n.name.toLowerCase() === clean.name!.toLowerCase(),
    );
    if (clash) return { ok: false, error: `“${clean.name}” already exists at this level.` };
  }

  // Moving a node under one of its own descendants would orphan the subtree.
  if (clean.parent_id !== undefined && clean.parent_id !== existing.parent_id) {
    if (clean.parent_id) {
      const descendants = new Set<string>();
      const collect = (parentId: string) => {
        for (const n of nodes) {
          if (n.parent_id === parentId && !descendants.has(n.id)) {
            descendants.add(n.id);
            collect(n.id);
          }
        }
      };
      collect(id);
      if (descendants.has(clean.parent_id)) {
        return { ok: false, error: 'A category cannot be moved inside its own sub-category.' };
      }
      const newParent = nodes.find((n) => n.id === clean.parent_id);
      if (!newParent) return { ok: false, error: 'The new parent category no longer exists.' };
      if (newParent.level >= 3) return { ok: false, error: 'Categories can nest at most three levels deep.' };
    }
  }

  const node: TaxonomyNode = {
    ...existing,
    ...clean,
    id,
    name: clean.name || existing.name,
    slug: clean.slug || (clean.name ? toTaxonomySlug(clean.name) : existing.slug),
    parent_id: clean.parent_id !== undefined ? (clean.parent_id || null) : existing.parent_id,
  };
  // Keep the level consistent with wherever the node now sits.
  if (node.parent_id) {
    const parent = nodes.find((n) => n.id === node.parent_id);
    node.level = Math.min(3, (parent?.level ?? 1) + 1);
  } else {
    node.level = 1;
  }

  const result = await upsertNode(node);
  if (!result.ok) return { ok: false, error: result.error };

  // Propagate a rename onto the products tagged with the old name.
  let renamedProducts = 0;
  if (clean.name && clean.name !== existing.name) {
    renamedProducts = await renameTaggedProducts(existing, node);
  }
  return { ok: true, node, renamedProducts };
}

/** Re-tag every product carrying `oldNode.name` with `nextNode.name`. */
async function renameTaggedProducts(oldNode: TaxonomyNode, nextNode: TaxonomyNode): Promise<number> {
  const db = await safeDb();
  if (!db) return 0;
  try {
    const coll = db.collection('products');
    const isPrimary = oldNode.level === 1;
    const filter = isPrimary
      ? { $or: [{ category_id: oldNode.id }, { categoryId: oldNode.id }, { category: oldNode.name }] }
      : { $or: [{ sub_category_id: oldNode.id }, { subCategoryId: oldNode.id }, { sub_category: oldNode.name }] };

    const set = isPrimary
      ? { category: nextNode.name, category_id: nextNode.id, categoryId: nextNode.id }
      : { sub_category: nextNode.name, sub_category_id: nextNode.id, subCategoryId: nextNode.id };

    const res = await coll.updateMany(filter, { $set: set });
    return res?.modifiedCount ?? 0;
  } catch (err: any) {
    console.warn('[CategoryTaxonomy] rename propagation warning:', err?.message || err);
    return 0;
  }
}

/**
 * Delete a node. Refuses when it still has children — silently cascading would
 * delete an operator's entire subtree with one click.
 */
export async function deleteTaxonomyNode(id: string): Promise<{ ok: boolean; error?: string }> {
  const { nodes } = await listTaxonomyNodes();
  const node = nodes.find((n) => n.id === id);
  if (!node) return { ok: false, error: 'That category no longer exists.' };

  const children = nodes.filter((n) => n.parent_id === id);
  if (children.length > 0) {
    return { ok: false, error: `“${node.name}” still has ${children.length} sub-category${children.length === 1 ? '' : 'ies'}. Move or delete them first.` };
  }

  const db = await safeDb();
  if (!db) return { ok: false, error: 'The database is unavailable.' };
  try {
    await db.collection(TAXONOMY_COLLECTION).deleteOne({ id });
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'The category could not be deleted.' };
  }
}

/** Persist a new sibling order (and, optionally, a new parent) in one pass. */
export async function reorderTaxonomyNodes(entries: { id: string; sortOrder?: number; parentId?: string | null }[]): Promise<{ ok: boolean; error?: string }> {
  const { nodes } = await listTaxonomyNodes();
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const db = await safeDb();
  if (!db) return { ok: false, error: 'The database is unavailable.' };
  try {
    const now = new Date().toISOString();
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const node = byId.get(String(entry.id));
      if (!node) continue;
      const parentId = entry.parentId !== undefined ? (entry.parentId || null) : node.parent_id;
      if (parentId === node.id) continue;
      const parent = parentId ? byId.get(parentId) : null;
      if (parentId && !parent) continue;
      await db.collection(TAXONOMY_COLLECTION).updateOne(
        { id: node.id },
        {
          $set: toJsonPlain({
            parent_id: parentId,
            level: parentId ? Math.min(3, (parent?.level ?? 1) + 1) : 1,
            sortOrder: entry.sortOrder !== undefined ? toNum(entry.sortOrder, i) : i,
            updated_at: now,
          }),
        },
      );
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'The order could not be saved.' };
  }
}

/** One-click install of the starter tree. Existing names are never duplicated. */
export async function seedStarterTaxonomy(): Promise<{ ok: boolean; created: number; error?: string }> {
  const { nodes } = await listTaxonomyNodes();
  const existing = new Set(nodes.map((n) => `${n.parent_id || 'root'}:${n.name.toLowerCase()}`));
  const db = await safeDb();
  if (!db) return { ok: false, created: 0, error: 'The database is unavailable.' };
  const now = new Date().toISOString();
  let created = 0;
  try {
    for (let i = 0; i < STARTER_TAXONOMY.length; i++) {
      const group = STARTER_TAXONOMY[i];
      let primaryId: string | null = null;
      const primaryKey = `root:${group.name.toLowerCase()}`;
      const found = nodes.find((n) => !n.parent_id && n.name.toLowerCase() === group.name.toLowerCase());
      if (found) {
        primaryId = found.id;
      } else if (!existing.has(primaryKey)) {
        const node: TaxonomyNode = {
          id: makeId(), parent_id: null, name: group.name, slug: toTaxonomySlug(group.name),
          level: 1, emoji: group.emoji, isActive: true, sortOrder: i, created_at: now,
        };
        await upsertNode(node);
        existing.add(primaryKey);
        primaryId = node.id;
        created += 1;
      }
      if (!primaryId) continue;
      for (let j = 0; j < group.subs.length; j++) {
        const subName = group.subs[j];
        const subKey = `${primaryId}:${subName.toLowerCase()}`;
        if (existing.has(subKey) || nodes.some((n) => n.parent_id === primaryId && n.name.toLowerCase() === subName.toLowerCase())) continue;
        await upsertNode({
          id: makeId(), parent_id: primaryId, name: subName, slug: toTaxonomySlug(subName),
          level: 2, isActive: true, sortOrder: j, created_at: now,
        });
        existing.add(subKey);
        created += 1;
      }
    }
    return { ok: true, created };
  } catch (err: any) {
    return { ok: false, created, error: err?.message || 'The starter tree could not be installed.' };
  }
}

/* ──────────────────────── product tagging helper ──────────────────────── */

export interface ResolvedProductCategory {
  category: string;
  categoryId: string;
  subCategory: string;
  subCategoryId: string;
}

/**
 * Resolve a merchant's selection into the exact fields a product should carry.
 *
 * Accepts either ids (`categoryId` / `subCategoryId`) — what the dropdowns send —
 * or legacy free-text names, so an older product can still be re-saved without
 * losing its category.
 */
export function resolveProductTaxonomy(
  lookup: TaxonomyLookup,
  input: { categoryId?: string; subCategoryId?: string; category?: string; subCategory?: string },
): ResolvedProductCategory {
  const empty: ResolvedProductCategory = { category: '', categoryId: '', subCategory: '', subCategoryId: '' };

  // Primary: id first, then exact name.
  let primary = input.categoryId ? lookup.byId.get(String(input.categoryId)) : undefined;
  if (!primary && input.category) primary = lookup.byName.get(String(input.category).toLowerCase());
  // A sub-category chosen without its primary resolves the primary from the tree.
  if (!primary && input.subCategoryId) {
    const sub = lookup.byId.get(String(input.subCategoryId));
    primary = sub ? lookup.parentsOf(sub.id)[0] || sub : undefined;
  }

  if (!primary) return empty;

  // If the "primary" resolved to a nested node, walk up to the true root so the
  // marketplace facet is always the level-1 category.
  const root = lookup.parentsOf(primary.id)[0] || primary;

  let sub = input.subCategoryId ? lookup.byId.get(String(input.subCategoryId)) : undefined;
  if (!sub && input.subCategory) sub = lookup.byName.get(String(input.subCategory).toLowerCase());
  // Only accept a sub-category that actually belongs to the chosen primary.
  if (sub && (lookup.parentsOf(sub.id)[0]?.id !== root.id)) sub = undefined;

  return {
    category: root.name,
    categoryId: root.id,
    subCategory: sub?.name || '',
    subCategoryId: sub?.id || '',
  };
}

export default {
  listTaxonomyNodes,
  getPublicTaxonomyTree,
  buildTree,
  loadTaxonomyLookup,
  createTaxonomyNode,
  updateTaxonomyNode,
  deleteTaxonomyNode,
  reorderTaxonomyNodes,
  seedStarterTaxonomy,
  resolveProductTaxonomy,
  toTaxonomySlug,
  STARTER_TAXONOMY,
};
