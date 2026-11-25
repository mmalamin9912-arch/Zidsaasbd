/**
 * Supabase Marketplace Native Data Layer - PRIMARY READS, NO MONGODB DEPENDENCY.
 *
 * Reads marketplace products and categories DIRECTLY from Supabase tables.
 */

import { getSupabaseClient, isSupabaseConfigured, supabaseErrorMessage, supabaseUrl, supabaseAnonKey } from './supabase';
import { buildSafeSelect, fetchKnownColumns } from '../../lib/supabaseSchema';
import { createMarketplaceOrderInSupabase } from './marketplaceOrderSupabase';
import { resolveProductImage } from '../utils/imageFallback';
import type { MarketplaceProduct } from '../types';
import type { MarketplaceFilters } from './marketplaceApi';

export async function fetchSupabaseNativeProducts(
  filters: MarketplaceFilters = {},
): Promise<{ ok: boolean; products: MarketplaceProduct[]; total: number; page: number; limit: number; pages: number; price_range: { min: number; max: number } | null; error?: string }> {
  if (!isSupabaseConfigured) throw new Error('[supabaseNative] Supabase not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  const client = getSupabaseClient();
  if (!client) throw new Error('[supabaseNative] getSupabaseClient() returned null.');
  const page = Math.max(1, Number(filters.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(filters.limit) || 100));
  const offset = (page - 1) * limit;
  /*
   * The projection and the filters below are trimmed to columns the deployed
   * `products` table really has (`id, name, store_slug, price, stock_quantity,
   * category, image_url, created_at`). PostgREST answers 400 / `42703` for the
   * WHOLE request when one select name or one filter column is missing, which is
   * what turned this single call into a burst of red console rows.
   */
  const productColumns = await fetchKnownColumns(supabaseUrl, supabaseAnonKey, 'products');
  const hasColumn = (name: string) =>
    !productColumns || productColumns.some((c) => c.toLowerCase() === name.toLowerCase());
  const w: string[] = [];
  if (filters.q && hasColumn('name')) {
    const safeQ = String(filters.q).replace(/[%,()]/g, ' ').trim();
    if (safeQ) w.push(`name ILIKE '%${safeQ}%'`);
  }
  if (filters.category && hasColumn('category')) {
    const safeCategory = String(filters.category).replace(/[%(),.]/g, ' ').trim();
    // A comma would read as PostgREST's `in.(a,b)` list operator — only % and *
    // are wanted as wildcards here.
    if (safeCategory) w.push(`category ILIKE '%${safeCategory}%'`);
  }
  if (filters.minPrice !== null && filters.minPrice !== undefined && hasColumn('price')) w.push(`price >= ${Number(filters.minPrice)}`);
  if (filters.maxPrice !== null && filters.maxPrice !== undefined && hasColumn('price')) w.push(`price <= ${Number(filters.maxPrice)}`);
  const q = client.from('products').select(
    productColumns
      ? buildSafeSelect(
          [
            'id', 'name', 'title', 'description', 'sku', 'price', 'priceBDT', 'stock', 'status',
            'category', 'image_url', 'image', 'images', 'store_slug', 'created_at',
          ],
          productColumns
        )
      : '*'
  );
  if (w.length > 0) q.or(w.join(' OR '));
  const { data, error } = await q.order(hasColumn('created_at') ? 'created_at' : 'id', { ascending: false }).range(offset, offset + limit - 1);
  if (error) {
    console.warn('[supabaseNative] fetchSupabaseNativeProducts error:', supabaseErrorMessage(error));
    return { ok: false, products: [], total: 0, page, limit, pages: 0, price_range: null, error: error.message || 'Marketplace catalogue unavailable.' };
  }
  const products = Array.isArray(data)
    ? (data as any[]).map((row) => ({ id: String(row.id || ''), title: String(row.title || row.name || 'Untitled'), description: row.description || '', sku: row.sku || '', priceBDT: Number(row.priceBDT ?? row.price ?? 0) || 0, compareAtPriceBDT: row.compareAtPriceBDT != null ? Number(row.compareAtPriceBDT) : undefined, stock: Number(row.stock ?? 0) || 0, status: row.status || 'active', is_published: Boolean(row.is_published), category: row.category || '', category_id: row.category_id || '', sub_category: row.sub_category || undefined, sub_category_id: row.sub_category_id || undefined, /*
     * ONE resolved, normalised image for every spelling the row may use —
     * `image`, `image_url`, `imageUrl`, `thumbnail`, `images[]` (string OR
     * `{ url }`) — with a relative storage path turned into a loadable URL.
     * Reading only `image || image_url` left a row whose photo lived in
     * `images[]` with an empty src, i.e. a broken thumbnail in the cart and the
     * checkout summary.
     */
    image: resolveProductImage(row), image_url: resolveProductImage(row), imageUrl: resolveProductImage(row), thumbnail: resolveProductImage(row), images: Array.isArray(row.images) ? row.images : [], variantsCount: Number(row.variantsCount || 0) || 0, salesCount: Number(row.salesCount || 0) || 0, createdAt: row.createdAt || undefined, updatedAt: row.updatedAt || undefined, vendor_id: row.vendor_id || row.store_id || '', vendor_name: row.vendor_name || '', vendor_slug: row.vendor_slug || row.store_slug || '', store_id: row.store_id || row.vendor_id || '', store_slug: row.store_slug || '' })) as MarketplaceProduct[]
    : [];
  const priceMin = products.reduce((m, p) => Math.min(m, Number(p.priceBDT) || 0), Number.POSITIVE_INFINITY);
  const priceMax = products.reduce((m, p) => Math.max(m, Number(p.priceBDT) || 0), Number.NEGATIVE_INFINITY);
  return { ok: true, products, total: products.length, page, limit, pages: 1, price_range: priceMin === Number.POSITIVE_INFINITY || priceMax === Number.NEGATIVE_INFINITY ? null : { min: priceMin, max: priceMax } };
}

export async function fetchSupabaseNativeCategories(): Promise<any[]> {
  if (!isSupabaseConfigured) throw new Error('[supabaseNative] Supabase not configured.');
  const client = getSupabaseClient();
  if (!client) return [];
  const categoryColumns = await fetchKnownColumns(supabaseUrl, supabaseAnonKey, 'categories');
  const present = categoryColumns ? new Set(categoryColumns.map((c) => c.toLowerCase())) : null;
  let categoryQuery = client.from('categories').select('*');
  /*
   * Filter and sort ONLY on columns the table is known to have. When the schema
   * is unknown (`null`) no filter is applied at all: a wrong column name would
   * 400 the request, and an unfiltered read still returns the rows.
   */
  if (present?.has('is_published')) categoryQuery = categoryQuery.eq('is_published', true);
  if (present?.has('is_active')) categoryQuery = categoryQuery.eq('is_active', true);
  if (present?.has('sort_order')) categoryQuery = categoryQuery.order('sort_order', { ascending: true });
  const { data, error } = await categoryQuery;
  if (error) { console.warn('[supabaseNative] fetchSupabaseNativeCategories error:', supabaseErrorMessage(error)); return []; }
  return Array.isArray(data) ? data : [];
}

/**
 * Persist a marketplace order to Supabase.
 *
 * Thin adapter over `createMarketplaceOrderInSupabase`, which owns the real
 * schema. The previous implementation inline-built a row with columns this
 * project's `orders` table does not have (`customer_email`, `address`,
 * `subtotal_bdt`, `total_bdt`, `delivery_zone`, `fulfillment_status`,
 * `status`, `vendor_id`, `store_slug`, `marketplace_order`, …) and inserted
 * `items` as an ARRAY into a TEXT column — every call 400'd with PGRST204 and
 * no order was ever written. It also wrote to an `order_items` table that does
 * not exist.
 *
 * Accepts the same loosely-typed input as before so existing callers keep
 * working.
 */
export async function createSupabaseNativeOrder(input: any): Promise<{ ok: boolean; order?: any; error?: string }> {
  if (!isSupabaseConfigured) return { ok: false, error: 'Supabase is not configured.' };
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase client unavailable.' };

  const rawItems = Array.isArray(input.items) ? input.items : [];
  const result = await createMarketplaceOrderInSupabase({
    orderNumber: String(input.orderNumber || ''),
    customerName: String(input.customerName || ''),
    customerPhone: String(input.customerPhone || ''),
    customerEmail: input.customerEmail || undefined,
    district: String(input.district || ''),
    cityArea: String(input.cityArea || ''),
    address: String(input.address || input.shipping_address || ''),
    customerNote: input.customerNote || undefined,
    subtotalBDT: Number(input.subtotalBDT || 0),
    deliveryCharge: Number(input.deliveryCharge || 0),
    totalBDT: Number(input.totalBDT || 0),
    paymentMethod: String(input.paymentMethod || 'COD'),
    paymentStatus: String(input.paymentStatus || 'Unpaid'),
    transactionId: input.transactionId || undefined,
    lines: rawItems.map((item: any) => ({
      productId: item.productId ?? item.product_id ?? '',
      productName: String(item.productName || item.product_name || 'Item'),
      variant: item.variant || undefined,
      quantity: Number(item.quantity || 0),
      unitPriceBDT: Number(item.unitPriceBDT ?? item.unit_price_bdt ?? 0),
      image: item.image || undefined,
      category: item.category || undefined,
      vendor_id: item.vendor_id || undefined,
      vendor_name: item.vendor_name || undefined,
      vendor_slug: item.vendor_slug || undefined,
      store_id: item.store_id || input.storeId || undefined,
      store_slug: item.store_slug || input.storeSlug || undefined,
    })),
  });

  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, order: { id: result.orderId, order_number: result.orderNumber } };
}

/*
 * REMOVED: fetchSupabaseNativeAllOrders / fetchSupabaseNativeVendorOrders.
 *
 * Both queried `orders` straight from the browser with the anon key. They had no
 * callers, and under RLS they would silently return `[]` (the table has no
 * client SELECT policy by design). Merchant and admin order lists are served by
 * GET /api/orders from MongoDB; the Supabase copy is written server-side by
 * POST /api/orders. Nothing in the browser reads `orders` any more.
 */

const supabaseNativeModule = { fetchSupabaseNativeProducts, fetchSupabaseNativeCategories, createSupabaseNativeOrder };
export default supabaseNativeModule;
