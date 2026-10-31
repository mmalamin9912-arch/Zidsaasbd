/**
 * Supabase Marketplace Data Layer — products, categories, orders with fallback.
 *
 * WHY THIS EXISTS
 * ---------------
 * The multi-vendor marketplace reads/writes products, categories and orders
 * primarily from MongoDB Atlas via `/api/*` routes. When Mongo is slow,
 * rate-limited, or unreachable (the "connection limit exceeded" M0 errors),
 * the marketplace should degrade gracefully to Supabase instead of showing
 * empty shelves or a broken checkout.
 *
 * This module is the client-side Supabase integration:
 *   • `fetchSupabaseProducts()`      → read products from Supabase `products`
 *   • `fetchSupabaseCategories()`    → read categories from Supabase `categories`
 *   • `createSupabaseOrder()`        → write an order to Supabase `orders`
 *   • `fetchVendorOrders()`          → read a vendor's orders from Supabase
 *
 * Every function degrades to the existing MongoDB `/api/*` routes when
 * Supabase is unconfigured, times out, or returns an error — so the UI never
 * crashes and the shopper never sees an empty basket.
 *
 * MULTI-VENDOR ROUTING
 * --------------------
 * Orders written to Supabase carry `vendor_id` on each line item. The
 * `fetchVendorOrders(vendorId)` query filters by `vendor_id` so each vendor
 * sees only their own child orders in `/dashboard/orders`.
 */

import { getSupabaseClient, isSupabaseConfigured, supabaseErrorMessage } from './supabase';
import { safeFetch } from './safeFetch';
import type { MarketplaceProduct } from '../types';

export interface SupabaseProduct {
  id: string;
  title: string;
  name?: string;
  priceBDT?: number;
  price?: number;
  stock?: number;
  status?: string;
  is_published?: boolean;
  category?: string;
  image?: string;
  image_url?: string;
  imageUrl?: string;
  vendor_id?: string;
  vendor_name?: string;
  vendor_slug?: string;
  store_slug?: string;
  store_id?: string;
  sku?: string;
  description?: string;
  created_at?: string;
  updated_at?: string;
}

export interface SupabaseCategory {
  id: string;
  name: string;
  title?: string;
  slug?: string;
  parent_id?: string;
  image?: string;
  image_url?: string;
  is_published?: boolean;
  is_active?: boolean;
  store_slug?: string;
  sort_order?: number;
  created_at?: string;
  updated_at?: string;
}

export interface SupabaseOrderInput {
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  district?: string;
  cityArea?: string;
  address: string;
  deliveryZone?: string;
  subtotalBDT: number;
  deliveryCharge: number;
  totalBDT: number;
  paymentMethod: string;
  paymentStatus: string;
  fulfillmentStatus?: string;
  status?: string;
  vendorId?: string;
  storeId?: string;
  storeSlug?: string;
  items: Array<{
    id?: string;
    productId?: string;
    productName: string;
    variant?: string;
    quantity: number;
    unitPriceBDT: number;
    image?: string;
    vendor_id?: string;
    vendor_name?: string;
    vendor_slug?: string;
    store_id?: string;
    store_slug?: string;
    category?: string;
  }>;
  split_by_vendor?: boolean;
  order_source_channel?: string;
  marketplace_order?: boolean;
}

export interface SupabaseOrder {
  id?: string;
  ok?: boolean;
  order_number?: string;
  orderNumber?: string;
  customer_name?: string;
  customerName?: string;
  customer_phone?: string;
  customerPhone?: string;
  vendor_id?: string;
  vendor_name?: string;
  vendor_slug?: string;
  store_id?: string;
  store_slug?: string;
  status?: string;
  payment_status?: string;
  fulfillment_status?: string;
  total_bdt?: number;
  totalBDT?: number;
  created_at?: string;
  items?: any[];
  error?: string;
}

function productToMarketplaceShape(row: any): MarketplaceProduct {
  return {
    id: String(row.id ?? row.product_id ?? row._id ?? ''),
    title: String(row.title || row.name || 'Untitled'),
    priceBDT: Number(row.priceBDT ?? row.price ?? row.price_bdt ?? 0) || 0,
    stock: Number(row.stock ?? 0) || 0,
    status: String(row.status || 'active'),
    category: String(row.category || ''),
    image: row.image || row.image_url || row.imageUrl || '',
    vendor_id: String(row.vendor_id || row.vendorId || row.store_id || row.storeId || ''),
    vendor_name: String(row.vendor_name || row.vendorName || row.store_name || row.storeName || row.store_slug || 'Store'),
    vendor_slug: String(row.vendor_slug || row.vendorSlug || row.store_slug || row.storeSlug || ''),
    sku: String(row.sku || ''),
    descriptionEn: String(row.description || row.descriptionEn || ''),
    variantsCount: Number(row.variantsCount ?? 0),
    salesCount: Number(row.salesCount ?? 0),
    is_published: Boolean(row.is_published ?? row.isPublished ?? true),
  };
}

function categoryToShape(row: any): SupabaseCategory {
  return {
    id: String(row.id ?? row.category_id ?? ''),
    name: String(row.name || row.title || row.category_name || ''),
    slug: String(row.slug || row.category_slug || row.handle || ''),
    image: row.image || row.image_url || row.cover_image || '',
    is_published: Boolean(row.is_published ?? row.isPublished ?? row.is_active ?? true),
    is_active: Boolean(row.is_active ?? row.isPublished ?? row.is_published ?? true),
    parent_id: row.parent_id || row.parent || undefined,
    store_slug: String(row.store_slug || row.storeSlug || row.store_id || ''),
    sort_order: Number(row.sort_order ?? row.position ?? row.sort ?? 0),
  };
}

/* ────────────────────────── products ────────────────────────── */

/** Fetch public products from Supabase. Falls back to MongoDB `/api/products`. */
export async function fetchSupabaseProducts(filters?: {
  category?: string;
  vendor?: string;
  limit?: number;
  status?: string;
}): Promise<{ ok: boolean; products: MarketplaceProduct[]; error?: string }> {
  const client = getSupabaseClient();
  if (!client || !isSupabaseConfigured) {
    return fallbackProducts(filters);
  }

  try {
    let query = client
      .from('products')
      .select('*')
      .eq('is_published', true)
      .order('created_at', { ascending: false })
      .limit(filters?.limit ?? 50);

    if (filters?.category) {
      query = query.eq('category', filters.category);
    }
    if (filters?.vendor) {
      query = query.eq('vendor_id', filters.vendor);
    }
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    const { data, error } = await query;
    if (error) throw error;

    const products = (Array.isArray(data) ? data : []).map(productToMarketplaceShape);
    return { ok: true, products };
  } catch (err: any) {
    console.warn('[supabaseMarketplace] fetchSupabaseProducts error, falling back:', supabaseErrorMessage(err));
    return fallbackProducts(filters);
  }
}

/** MongoDB API fallback for products. */
async function fallbackProducts(filters?: {
  category?: string;
  vendor?: string;
  limit?: number;
}): Promise<{ ok: boolean; products: MarketplaceProduct[]; error?: string }> {
  try {
    const qs = new URLSearchParams();
    if (filters?.category) qs.set('category', filters.category);
    if (filters?.vendor) qs.set('vendor', filters.vendor);
    if (filters?.limit) qs.set('limit', String(filters.limit));

    const result = await safeFetch<{ ok: boolean; products: MarketplaceProduct[] }>(
      `/api/products${qs.toString() ? `?${qs.toString()}` : ''}`,
      { cache: 'no-store' },
      { ok: false, products: [] },
    );
    return result.data || { ok: false, products: [], error: 'Products unavailable.' };
  } catch (err: any) {
    return { ok: false, products: [], error: err?.message || 'Products unavailable.' };
  }
}

/* ────────────────────────── categories ────────────────────────── */

/** Fetch categories from Supabase. Falls back to MongoDB storefront API. */
export async function fetchSupabaseCategories(): Promise<{ ok: boolean; categories: SupabaseCategory[]; error?: string }> {
  const client = getSupabaseClient();
  if (!client || !isSupabaseConfigured) {
    return fallbackCategories();
  }

  try {
    const { data, error } = await client
      .from('categories')
      .select('*')
      .eq('is_published', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    if (error) throw error;

    const categories = (Array.isArray(data) ? data : []).map(categoryToShape);
    return { ok: true, categories };
  } catch (err: any) {
    console.warn('[supabaseMarketplace] fetchSupabaseCategories error, falling back:', supabaseErrorMessage(err));
    return fallbackCategories();
  }
}

/** Fallback: read marketplace categories from the MongoDB-backed storefront API. */
async function fallbackCategories(): Promise<{ ok: boolean; categories: SupabaseCategory[]; error?: string }> {
  try {
    const result = await safeFetch<any>(
      '/api/marketplace/storefront',
      { cache: 'no-store' },
      { ok: false, categories: [] },
    );
    const cats = result.data?.categories || [];
    return {
      ok: true,
      categories: cats.map((c: any) => categoryToShape(c)),
      error: result.data?.degraded ? 'Categories served from MongoDB fallback.' : undefined,
    };
  } catch (err: any) {
    return { ok: false, categories: [], error: err?.message || 'Categories unavailable.' };
  }
}

/* ────────────────────────── orders ────────────────────────── */

/** Create an order in Supabase. Falls back to MongoDB `/api/orders`. */
export async function createSupabaseOrder(input: SupabaseOrderInput): Promise<SupabaseOrder> {
  const client = getSupabaseClient();
  if (client && isSupabaseConfigured) {
    try {
      const row: any = {
        order_number: input.orderNumber,
        orderNumber: input.orderNumber,
        customer_name: input.customerName,
        customerName: input.customerName,
        customer_phone: input.customerPhone,
        customerPhone: input.customerPhone,
        customer_email: input.customerEmail,
        district: input.district,
        city_area: input.cityArea,
        address: input.address,
        delivery_zone: input.deliveryZone,
        subtotal_bdt: input.subtotalBDT,
        delivery_charge: input.deliveryCharge,
        total_bdt: input.totalBDT,
        payment_method: input.paymentMethod,
        payment_status: input.paymentStatus,
        fulfillment_status: input.fulfillmentStatus || 'Unfulfilled',
        status: input.status || 'New',
        vendor_id: input.vendorId || null,
        store_id: input.storeId || null,
        store_slug: input.storeSlug || null,
        items: input.items,
        split_by_vendor: Boolean(input.split_by_vendor),
        order_source_channel: input.order_source_channel || 'marketplace',
        marketplace_order: input.marketplace_order ?? true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await client.from('orders').insert(row).select().single();
      if (error) throw error;
      return { ...data, ok: true } as SupabaseOrder;
    } catch (err: any) {
      console.warn('[supabaseMarketplace] createSupabaseOrder error, falling back:', supabaseErrorMessage(err));
    }
  }

  // Fallback to MongoDB API
  try {
    const result = await safeFetch<{ ok: boolean; order?: any; error?: string }>(
      '/api/orders',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      },
      { ok: false },
    );
    if (result.data?.ok) {
      return { ...result.data.order, ok: true } as SupabaseOrder;
    }
    return {
      ok: false,
      error: result.data?.error || 'Order could not be placed.',
    } as SupabaseOrder;
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || 'Order could not be placed.',
    } as SupabaseOrder;
  }
}

/** Fetch a vendor's orders from Supabase. Falls back to MongoDB `/api/orders/:storeRef`. */
export async function fetchVendorOrders(vendorId: string): Promise<{ ok: boolean; orders: SupabaseOrder[]; error?: string }> {
  if (!vendorId) return { ok: false, orders: [], error: 'Vendor ID required.' };

  const client = getSupabaseClient();
  if (client && isSupabaseConfigured) {
    try {
      const { data, error } = await client
        .from('orders')
        .select('*')
        .or(`vendor_id.eq.${vendorId},store_id.eq.${vendorId},store_slug.eq.${vendorId}`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return { ok: true, orders: Array.isArray(data) ? data : [] };
    } catch (err: any) {
      console.warn('[supabaseMarketplace] fetchVendorOrders error, falling back:', supabaseErrorMessage(err));
    }
  }

  // Fallback to MongoDB API
  try {
    const result = await safeFetch<any>(
      `/api/orders/${encodeURIComponent(vendorId)}`,
      { cache: 'no-store' },
      { ok: false, orders: [] },
    );
    return {
      ok: true,
      orders: Array.isArray(result.data?.orders) ? result.data.orders : [],
      error: result.data?.error,
    };
  } catch (err: any) {
    return { ok: false, orders: [], error: err?.message || 'Vendor orders unavailable.' };
  }
}

/** Fetch all marketplace orders (admin/super-admin view) from Supabase. */
export async function fetchAllSupabaseOrders(): Promise<{ ok: boolean; orders: SupabaseOrder[]; error?: string }> {
  const client = getSupabaseClient();
  if (!client || !isSupabaseConfigured) {
    return fallbackAllOrders();
  }

  try {
    const { data, error } = await client
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { ok: true, orders: Array.isArray(data) ? data : [] };
  } catch (err: any) {
    console.warn('[supabaseMarketplace] fetchAllSupabaseOrders error, falling back:', supabaseErrorMessage(err));
    return fallbackAllOrders();
  }
}

async function fallbackAllOrders(): Promise<{ ok: boolean; orders: SupabaseOrder[]; error?: string }> {
  try {
    const result = await safeFetch<any>(
      '/api/orders',
      { cache: 'no-store' },
      { ok: false, orders: [] },
    );
    return {
      ok: true,
      orders: Array.isArray(result.data?.orders) ? result.data.orders : [],
      error: result.data?.error,
    };
  } catch (err: any) {
    return { ok: false, orders: [], error: err?.message || 'Orders unavailable.' };
  }
}

export default {
  fetchSupabaseProducts,
  fetchSupabaseCategories,
  createSupabaseOrder,
  fetchVendorOrders,
  fetchAllSupabaseOrders,
};