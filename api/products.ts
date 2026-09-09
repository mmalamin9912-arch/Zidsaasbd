import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getTenant, saveTenant } from './tenantStore';
import mongoose from 'mongoose';

type VercelRequest = {
  method?: string;
  query?: Record<string, string | string[] | undefined>;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
  url?: string;
};

type VercelResponse = {
  status: (status: number) => VercelResponse;
  json: (body: unknown) => unknown;
  setHeader: (name: string, value: string) => void;
  end: () => void;
};

let cachedSupabase: SupabaseClient | null = null;

function cleanEnvUrl(raw?: string): string {
  if (!raw) return '';
  let str = String(raw).trim();
  str = str.replace(/^["'`\\]+|["'`\\]+$/g, '').trim();
  return str.replace(/\/+$/, '');
}

function cleanEnvKey(raw?: string): string {
  if (!raw) return '';
  let str = String(raw).trim();
  return str.replace(/^["'`\\]+|["'`\\]+$/g, '').trim();
}

function isValidUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function getDatabaseClient(): SupabaseClient | null {
  try {
    if (cachedSupabase) return cachedSupabase;

    // 1. Multi-Prefix Environment Fallback
    const rawSupabaseUrl =
      process.env.VITE_SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.SUPABASE_URL ||
      process.env.DATABASE_URL ||
      '';

    const rawSupabaseKey =
      process.env.VITE_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_KEY ||
      '';

    const supabaseUrl = cleanEnvUrl(rawSupabaseUrl);
    const supabaseKey = cleanEnvKey(rawSupabaseKey);

    // 2. Safe Initialization Guard
    if (!supabaseUrl || !supabaseKey) {
      console.warn('[Vercel Serverless /api/products] Supabase credentials missing (VITE_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_URL, or SUPABASE_URL). Fallback mode enabled.');
      return null;
    }

    if (!isValidUrl(supabaseUrl)) {
      console.warn('[Vercel Serverless /api/products] Invalid Supabase URL format:', supabaseUrl);
      return null;
    }

    cachedSupabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { 'x-client-info': 'vercel-serverless-products' } },
    });
    return cachedSupabase;
  } catch (e: any) {
    console.warn('[Vercel Serverless /api/products] Supabase client initialization warning:', e?.message || e);
    return null;
  }
}

function extractRawStoreSlug(req: VercelRequest): string {
  try {
    // Accept store_slug, store_id, store_code, slug, or store from query
    const qSlug = req.query?.store_slug || req.query?.store_id || req.query?.store_code || req.query?.slug || req.query?.store;
    if (typeof qSlug === 'string' && qSlug.trim()) return qSlug.trim();
    if (Array.isArray(qSlug) && typeof qSlug[0] === 'string' && qSlug[0].trim()) return qSlug[0].trim();

    if (req.url) {
      try {
        const urlObj = new URL(req.url, 'http://localhost');
        const sSlug =
          urlObj.searchParams.get('store_slug') ||
          urlObj.searchParams.get('store_id') ||
          urlObj.searchParams.get('store_code') ||
          urlObj.searchParams.get('slug') ||
          urlObj.searchParams.get('store');
        if (sSlug && sSlug.trim()) return sSlug.trim();

        const parts = urlObj.pathname.split('/').filter(Boolean);
        const lastPart = parts[parts.length - 1];
        if (lastPart && !lastPart.startsWith('products') && !lastPart.startsWith('api')) {
          return lastPart.trim();
        }
      } catch {}
    }

    if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
      const bSlug =
        (req.body as Record<string, any>).store_slug ||
        (req.body as Record<string, any>).store_id ||
        (req.body as Record<string, any>).store_code ||
        (req.body as Record<string, any>).slug ||
        (req.body as Record<string, any>).storeSlug;
      if (typeof bSlug === 'string' && bSlug.trim()) return bSlug.trim();
    }
  } catch (err: any) {
    console.warn('[Vercel Serverless /api/products] Error extracting store_slug:', err?.message || err);
  }
  return 'bd';
}

async function fetchWithTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), timeoutMs);
  });
  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timer!);
    return result;
  } catch {
    clearTimeout(timer!);
    return fallback;
  }
}

const FALLBACK_PRODUCTS = [
  {
    id: 'prod-fallback-1',
    title: 'Premium Oxford Cotton Shirt',
    name: 'Premium Oxford Cotton Shirt',
    price: 1850,
    priceBDT: 1850,
    stock: 45,
    stock_quantity: 45,
    category: 'Fashion & Clothing',
    store_slug: 'bd',
    status: 'active',
    is_published: true,
    image: 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?auto=format&fit=crop&w=600&q=80',
    image_url: 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?auto=format&fit=crop&w=600&q=80',
  },
  {
    id: 'prod-fallback-2',
    title: 'Wireless Active Noise-Cancelling Earbuds',
    name: 'Wireless Active Noise-Cancelling Earbuds',
    price: 3200,
    priceBDT: 3200,
    stock: 20,
    stock_quantity: 20,
    category: 'Electronics & Gadgets',
    store_slug: 'bd',
    status: 'active',
    is_published: true,
    image: 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?auto=format&fit=crop&w=600&q=80',
    image_url: 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?auto=format&fit=crop&w=600&q=80',
  },
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STORE_CODE_RE = /^ZID-BD-\d{4,}$/i;

/** Resolve a store_id UUID or the resolved store_slug back to the canonical store_id UUID in Supabase */
async function resolveStoreId(supabase: SupabaseClient, storeSlug: string): Promise<string | null> {
  if (!storeSlug || !storeSlug.trim()) return null;
  const clean = storeSlug.trim();

  // 1. Already a UUID
  if (UUID_RE.test(clean)) {
    try {
      const { data } = await supabase.from('stores').select('id').eq('id', clean).maybeSingle();
      if (data?.id) return data.id;
    } catch (e) {
      console.warn('[Vercel /api/products] store_id UUID validation failed:', e);
    }
  }

  // 2. Resolve by store_slug
  try {
    const { data } = await supabase.from('stores').select('id').eq('store_slug', clean).maybeSingle();
    if (data?.id) return data.id;
  } catch (e) {
    console.warn('[Vercel /api/products] store_slug to store_id lookup failed:', e);
  }

  return null;
}

/** Resolve a store_slug to the canonical store UUID from the 'stores' table */
async function resolveStoreIdBySlug(supabase: SupabaseClient, storeSlug: string): Promise<string | null> {
  if (!storeSlug || !storeSlug.trim()) return null;
  const clean = storeSlug.trim();
  try {
    const { data } = await supabase
      .from('stores')
      .select('id')
      .eq('store_slug', clean)
      .maybeSingle();
    if (data?.id) return data.id;
  } catch (e) {
    console.warn('[Vercel /api/products] store_id lookup by slug failed:', e);
  }
  return null;
}

/** Resolve a store_id UUID or ZID-BD-XXXX code back to the store_slug in Supabase */
async function resolveStoreSlugByRef(supabase: SupabaseClient, storeRef: string): Promise<string | null> {
  if (!storeRef || !storeRef.trim()) return null;
  const clean = storeRef.trim();

  // 1. UUID lookup
  if (UUID_RE.test(clean)) {
    try {
      const { data } = await supabase.from('stores').select('store_slug').eq('id', clean).maybeSingle();
      if (data?.store_slug) return data.store_slug;
    } catch (e) {
      console.warn('[Vercel /api/products] store_id UUID lookup failed:', e);
    }
  }

  // 2. ZID-BD-XXXX code lookup
  if (STORE_CODE_RE.test(clean)) {
    try {
      const { data } = await supabase.from('stores').select('store_slug').ilike('store_code', clean).maybeSingle();
      if (data?.store_slug) return data.store_slug;
    } catch (e) {
      console.warn('[Vercel /api/products] ZID-BD store_code lookup failed:', e);
    }
  }

  return null;
}

/** Resolve store_id (UUID) from any store reference (slug, UUID, or ZID-BD code) */
async function resolveStoreId(supabase: SupabaseClient, cleanSlug: string): Promise<string | null> {
  if (!cleanSlug || !cleanSlug.trim()) return null;
  const ref = cleanSlug.trim();

  // If it's already a UUID, validate & return it
  if (UUID_RE.test(ref)) {
    try {
      const { data } = await supabase.from('stores').select('id').eq('id', ref).maybeSingle();
      return data?.id ?? null;
    } catch (e) {
      console.warn('[Vercel /api/products] store_id direct UUID validation failed:', e);
    }
    return null;
  }

  // If it's a store_code (ZID-BD-XXXX), resolve to UUID
  if (STORE_CODE_RE.test(ref)) {
    try {
      const { data } = await supabase.from('stores').select('id').ilike('store_code', ref).maybeSingle();
      if (data?.id) return data.id;
    } catch (e) {
      console.warn('[Vercel /api/products] ZID-BD store_code -> store_id lookup failed:', e);
    }
    return null;
  }

  // It's a slug — resolve to store_id from stores table
  try {
    const { data, error } = await supabase
      .from('stores')
      .select('id')
      .eq('store_slug', ref)
      .maybeSingle();
    if (error) {
      console.warn('[Vercel /api/products] store_slug -> store_id lookup error:', error.message);
    }
    if (data?.id) return data.id;
  } catch (e) {
    console.warn('[Vercel /api/products] store_slug -> store_id lookup failed:', e);
  }

  return null;
}

async function loadProducts(cleanSlug: string): Promise<any[]> {
  try {
    const sanitizedSlug = String(cleanSlug || 'bd').split(':')[0].trim().toLowerCase() || 'bd';

    // If sanitizedSlug is a UUID or ZID-BD code, resolve it to the actual store_slug first
    let resolvedSlug = sanitizedSlug;
    const supabase = getDatabaseClient();
    if (supabase && (UUID_RE.test(sanitizedSlug) || STORE_CODE_RE.test(sanitizedSlug))) {
      const maybeSlug = await resolveStoreSlugByRef(supabase, sanitizedSlug);
      if (maybeSlug) resolvedSlug = maybeSlug;
    }

    // Also resolve store_id from the stores table (canonical UUID)
    let resolvedStoreId: string | null = null;
    if (supabase) {
      try {
        // Determine which reference to use for resolution
        const refForId = UUID_RE.test(sanitizedSlug) ? sanitizedSlug : (STORE_CODE_RE.test(sanitizedSlug) ? sanitizedSlug : resolvedSlug);
        resolvedStoreId = await resolveStoreId(supabase, refForId);
      } catch (e: any) {
        console.warn('[Vercel Serverless /api/products] store_id resolution warning:', e?.message || e);
      }
    }

    // 1. Safe Supabase Query — try store_slug, store_id, and tenants table
    if (supabase && (resolvedSlug !== 'bd' || resolvedStoreId)) {
      try {
        const sbQuery = (async () => {
          try {
            // Resolve store_id (UUID) from store_slug using stores table
            let storeId: string | null = null;
            try {
              const { data: storeRow, error: storeErr } = await supabase
                .from('stores')
                .select('id')
                .eq('store_slug', resolvedSlug)
                .maybeSingle();
              if (!storeErr && storeRow?.id) {
                storeId = String(storeRow.id);
              }
            } catch (resolveErr: any) {
              console.warn('[Vercel /api/products] store_id resolve warning:', resolveErr?.message || resolveErr);
            }

            // Query products by store_slug AND store_id in parallel for comprehensive results
            let allProducts: any[] = [];

            // Query by store_slug
            try {
              const { data: slugData, error: slugErr } = await supabase
                .from('products')
                .select('*')
                .eq('store_slug', resolvedSlug);

              if (slugErr) {
                console.error('[Vercel Serverless /api/products] Supabase products query error (slug):', slugErr.message);
              } else if (Array.isArray(slugData)) {
                allProducts.push(...slugData);
              }
            } catch (slugQueryErr: any) {
              console.error('[Vercel Serverless /api/products] Slug query exception:', slugQueryErr?.message || slugQueryErr);
            }

            // Query by store_id (UUID) if resolved, or if original slug is a UUID / ZID-BD code
            const idToQuery = storeId || (UUID_RE.test(sanitizedSlug) ? sanitizedSlug : null);
            if (idToQuery) {
              try {
                const { data: idData, error: idErr } = await supabase
                  .from('products')
                  .select('*')
                  .eq('store_id', idToQuery);

                if (idErr) {
                  console.error('[Vercel Serverless /api/products] Supabase products query error (store_id):', idErr.message);
                } else if (Array.isArray(idData)) {
                  allProducts.push(...idData);
                }
              } catch (idQueryErr: any) {
                console.error('[Vercel Serverless /api/products] store_id query exception:', idQueryErr?.message || idQueryErr);
              }
            }

            // Deduplicate by product id
            if (allProducts.length > 0) {
              const seen = new Set<string>();
              const unique: any[] = [];
              for (const p of allProducts) {
                const key = String(p.id);
                if (!seen.has(key)) {
                  seen.add(key);
                  unique.push(p);
                }
              }
              if (unique.length > 0) return unique;
            }

            // Check tenants table
            try {
              const { data: tenantData, error: tenantErr } = await supabase
                .from('tenants')
                .select('products')
                .eq('store_slug', resolvedSlug)
                .maybeSingle();

              if (tenantErr) {
                console.error('[Vercel Serverless /api/products] Supabase tenant products error:', tenantErr.message);
              } else if (tenantData?.products && Array.isArray(tenantData.products) && tenantData.products.length > 0) {
                return tenantData.products;
              }

              // Try tenants by store_id if original is a UUID
              if (UUID_RE.test(sanitizedSlug) || storeId) {
                const tenantIdQuery = storeId || sanitizedSlug;
                const { data: tenantById, error: errById } = await supabase
                  .from('tenants')
                  .select('products')
                  .eq('store_id', tenantIdQuery)
                  .maybeSingle();
                if (!errById && tenantById?.products && Array.isArray(tenantById.products) && tenantById.products.length > 0) {
                  return tenantById.products;
                }
              }

              return null;
            } catch (tErr: any) {
              console.error('[Vercel Serverless /api/products] Supabase tenant lookup exception:', tErr?.message || tErr);
            }

            return null;
          } catch (innerErr: any) {
            console.error('[Vercel Serverless /api/products] Supabase query execution error:', innerErr?.message || innerErr);
            return null;
          }
        })();

        const sbProducts = await fetchWithTimeout(sbQuery, 2500, null);
        if (sbProducts && Array.isArray(sbProducts) && sbProducts.length > 0) {
          return sbProducts;
        }
      } catch (e: any) {
        console.error('[Vercel Serverless /api/products] Supabase products load warning:', e?.message || e);
      }
    }

    // 2. Safe KV Storage Query — try resolved slug and original slug
    const kvSlugsToTry = new Set([resolvedSlug, sanitizedSlug]);
    for (const kvSlug of kvSlugsToTry) {
      try {
        const tenant = await fetchWithTimeout(getTenant(kvSlug), 2000, null);
        if (tenant && Array.isArray(tenant.products) && tenant.products.length > 0) {
          return tenant.products;
        }
      } catch (kvErr: any) {
        console.warn('[Vercel Serverless /api/products] KV load error for slug', kvSlug, ':', kvErr?.message || kvErr);
      }
    }

    // 3. Fallback mock products for standard preview slugs
    const isFallbackSlug = sanitizedSlug === 'bd' || sanitizedSlug === 'verandabd' || sanitizedSlug === 'default' ||
      resolvedSlug === 'bd' || resolvedSlug === 'verandabd' || resolvedSlug === 'default';
    if (isFallbackSlug) {
      const targetSlug = resolvedSlug === sanitizedSlug ? sanitizedSlug : resolvedSlug;
      return FALLBACK_PRODUCTS.map(p => ({ ...p, store_slug: targetSlug, storeSlug: targetSlug }));
    }

    return [];
  } catch (fatalLoadErr: any) {
    console.error('[Vercel Serverless /api/products] loadProducts fatal exception:', fatalLoadErr?.message || fatalLoadErr);
    return [];
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
    );
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('CDN-Cache-Control', 'no-store');
    res.setHeader('Vercel-CDN-Cache-Control', 'no-store');

    if (req.method === 'OPTIONS') {
      res.status(200);
      return res.end();
    }

    // Sanitize store_slug — preserve UUIDs and ZID-BD codes
    const rawParam = extractRawStoreSlug(req);
    let cleanSlug = String(rawParam || 'bd').trim();
    // Only split on ':' and lowercase for plain slugs (not UUIDs or store codes)
    if (!UUID_RE.test(cleanSlug) && !STORE_CODE_RE.test(cleanSlug)) {
      cleanSlug = cleanSlug.split(':')[0].trim().toLowerCase() || 'bd';
    }

    // GET handler - Safe query & guaranteed 200 array response
    if (req.method === 'GET' || !req.method) {
      try {
        const products = await loadProducts(cleanSlug);
        return res.status(200).json(Array.isArray(products) ? products : []);
      } catch (getErr: any) {
        console.error('[Vercel Serverless /api/products] GET error:', getErr?.message || getErr);
        return res.status(200).json([]);
      }
    }

    // POST/PUT handler - Safe data parsing and Supabase queries
    if (req.method === 'POST' || req.method === 'PUT') {
      try {
        const product = (req.body && typeof req.body === 'object') ? (req.body as any) : {};
        if (!product.id) {
          product.id = `prod-${Date.now()}`;
        }

        // 1. Sanitize incoming payload fields & data types
        const rawSlug = String(product.store_slug || product.storeSlug || cleanSlug || 'bd');
        const store_slug = String(rawSlug).split(':')[0].trim().toLowerCase() || 'bd';

        const price = parseFloat(product.price ?? product.priceBDT ?? product.price_bdt ?? 0) || 0;
        const stock_quantity = parseInt(product.stock_quantity ?? product.stock ?? 0, 10) || 0;
        const stock = stock_quantity;

        const id = String(product.id).trim();
        const title = String(product.title || product.name || 'Untitled Product').trim();
        const image_url = String(product.image || product.image_url || '').trim();
        const category_id = String(product.categoryId || product.category_id || product.category || '').trim();
        const category = String(product.category || 'General').trim();
        const description = String(product.description || product.descriptionEn || '').trim();
        const sku = String(product.sku || '').trim();

        // Attach sanitized properties back to product object
        product.id = id;
        product.store_slug = store_slug;
        product.storeSlug = store_slug;
        product.price = price;
        product.priceBDT = price;
        product.stock_quantity = stock_quantity;
        product.stock = stock;
        product.status = product.status || 'active';
        product.is_published = product.is_published !== false;

        // Save to KV / tenantStore
        try {
          const tenant = (await getTenant(store_slug)) || {};
          const prods = Array.isArray(tenant.products) ? tenant.products : [];
          const idx = prods.findIndex((p: any) => String(p.id) === String(product.id));
          if (idx >= 0) prods[idx] = product;
          else prods.unshift(product);
          await saveTenant(store_slug, { ...tenant, products: prods });
        } catch (kvErr: any) {
          console.warn('[Vercel Serverless /api/products] Save product KV error:', kvErr?.message || kvErr);
        }

        // 2. Safe Supabase Queries
        const supabase = getDatabaseClient();
        if (supabase) {
          try {
            // Resolve store_id UUID from store_slug
            let storeId: string | undefined;
            try {
              const { data: storeRow } = await supabase
                .from('stores')
                .select('id')
                .eq('store_slug', store_slug)
                .maybeSingle();
              if (storeRow?.id) storeId = String(storeRow.id);
            } catch (resolveErr: any) {
              console.warn('[Vercel Serverless /api/products] store_id resolve warning:', resolveErr?.message || resolveErr);
            }

            const sbRecord: any = {
              id: String(product.id),
              store_slug,
              title,
              name: title,
              price,
              stock_quantity,
              stock,
              image_url,
              image: image_url,
              category_id,
              category,
              status: 'active',
              is_published: true,
              sku,
              description,
            };
            if (storeId) sbRecord.store_id = storeId;

            const { error: upsertErr } = await supabase.from('products').upsert(sbRecord, { onConflict: 'id' });
            if (upsertErr) {
              console.error('[Vercel Serverless /api/products] Supabase products error on full upsert:', upsertErr.message);
              // Fallback minimal upsert with core columns
              const fallbackRecord: any = {
                id: sbRecord.id,
                store_slug: sbRecord.store_slug,
                title: sbRecord.title,
                price: sbRecord.price,
                image: sbRecord.image,
                status: 'active',
              };
              if (storeId) fallbackRecord.store_id = storeId;
              const { error: minErr } = await supabase.from('products').upsert(fallbackRecord, { onConflict: 'id' });

              if (minErr) {
                console.error('[Vercel Serverless /api/products] Supabase products error on minimal upsert:', minErr.message);
              }
            }
          } catch (sbErr: any) {
            console.error('[Vercel Serverless /api/products] Supabase product POST exception:', sbErr?.message || sbErr);
          }
        }

        return res.status(200).json({ ok: true, success: true, product });
      } catch (postErr: any) {
        console.error('[Vercel Serverless /api/products] POST product error:', postErr?.message || postErr);
        return res.status(200).json({ ok: false, error: postErr?.message || 'Invalid product payload' });
      }
    }

    // DELETE handler
    if (req.method === 'DELETE') {
      try {
        let id = (typeof req.query?.id === 'string' ? req.query.id : '').trim();
        if (!id && req.body && typeof req.body === 'object') {
          id = String((req.body as any).id || (req.body as any).product_id || (req.body as any).category_id || '').trim();
        }
        if (!id && req.url) {
          try {
            const u = new URL(req.url, 'http://localhost');
            id = (u.searchParams.get('id') || u.searchParams.get('product_id') || u.searchParams.get('category_id') || '').trim();
          } catch {}
        }

        if (id) {
          try {
            const tenant = (await getTenant(cleanSlug)) || {};
            if (Array.isArray(tenant.products)) {
              const updated = tenant.products.filter((p: any) => String(p.id) !== id);
              await saveTenant(cleanSlug, { ...tenant, products: updated });
            }
          } catch (kvDelErr: any) {
            console.warn('[Vercel Serverless /api/products] KV product delete error:', kvDelErr?.message || kvDelErr);
          }

          const supabase = getDatabaseClient();
          if (supabase) {
            try {
              const { error: delErr } = await supabase.from('products').delete().eq('id', id);
              if (delErr) {
                console.error('[Vercel Serverless /api/products] Supabase products error on delete:', delErr.message);
              }
            } catch (e: any) {
              console.error('[Vercel Serverless /api/products] Supabase product delete exception:', e?.message || e);
            }
          }

          return res.status(200).json({ ok: true, deleted_id: id });
        }

        return res.status(200).json({ ok: false, error: 'id required for deletion' });
      } catch (delErr: any) {
        console.error('[Vercel Serverless /api/products] Product delete error:', delErr?.message || delErr);
        return res.status(200).json({ ok: false, error: delErr?.message || 'Delete operation failed' });
      }
    }

    res.setHeader('Allow', 'GET, POST, PUT, DELETE, OPTIONS');
    return res.status(200).json([]);
  } catch (err: any) {
    console.error('[Vercel Serverless Fatal Error] /api/products crash prevented:', err?.message || err);
    return res.status(200).json([]);
  }
}
