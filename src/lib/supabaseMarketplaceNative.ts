/**
 * Supabase Marketplace Native Data Layer - PRIMARY READS, NO MONGODB DEPENDENCY.
 *
 * Reads marketplace products and categories DIRECTLY from Supabase tables.
 */

import { getSupabaseClient, isSupabaseConfigured, supabaseErrorMessage } from './supabase';
import type { MarketplaceProduct, MarketplaceFilters } from '../types';

export async function fetchSupabaseNativeProducts(
  filters: MarketplaceFilters = {},
): Promise<{ ok: boolean; products: MarketplaceProduct[]; total: number; page: number; limit: number; pages: number; price_range: { min: number; max: number } | null; error?: string }> {
  if (!isSupabaseConfigured) throw new Error('[supabaseNative] Supabase not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  const client = getSupabaseClient();
  if (!client) throw new Error('[supabaseNative] getSupabaseClient() returned null.');
  const page = Math.max(1, Number(filters.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(filters.limit) || 100));
  const offset = (page - 1) * limit;
  const w: string[] = [];
  if (filters.q) w.push(`title ILIKE '%${filters.q}%'`, `description ILIKE '%${filters.q}%'`, `sku ILIKE '%${filters.q}%'`);
  if (filters.category) w.push(`category ILIKE '%${filters.category}%'`);
  if (filters.minPrice !== null && filters.minPrice !== undefined) w.push(`priceBDT >= ${filters.minPrice}`);
  if (filters.maxPrice !== null && filters.maxPrice !== undefined) w.push(`priceBDT <= ${filters.maxPrice}`);
  w.push(`status ILIKE 'active' OR status ILIKE 'published'`, `is_published = true`);
  const q = client.from('products').select(`id, title, description, sku, priceBDT, compareAtPriceBDT, stock, status, is_published, category, category_id, sub_category, sub_category_id, image, image_url, imageUrl, thumbnail, images, variantsCount, salesCount, createdAt, updatedAt, brand, vendor_id, vendor_name, vendor_slug, store_id, store_slug, store_slugs`);
  if (w.length > 0) q.or(w.join(' OR '));
  const { data, error } = await q.order('created_at', { ascending: false }).range(offset, offset + limit - 1);
  if (error) {
    console.warn('[supabaseNative] fetchSupabaseNativeProducts error:', supabaseErrorMessage(error));
    return { ok: false, products: [], total: 0, page, limit, pages: 0, price_range: null, error: error.message || 'Marketplace catalogue unavailable.' };
  }
  const products = Array.isArray(data)
    ? (data as any[]).map((row) => ({ id: String(row.id || ''), title: String(row.title || 'Untitled'), description: row.description || '', sku: row.sku || '', priceBDT: Number(row.priceBDT || 0) || 0, compareAtPriceBDT: row.compareAtPriceBDT != null ? Number(row.compareAtPriceBDT) : undefined, stock: Number(row.stock ?? 0) || 0, status: row.status || 'active', is_published: Boolean(row.is_published), category: row.category || '', category_id: row.category_id || '', sub_category: row.sub_category || undefined, sub_category_id: row.sub_category_id || undefined, image: row.image || row.image_url || '', image_url: row.image_url || '', imageUrl: row.imageUrl || '', thumbnail: row.thumbnail || '', images: Array.isArray(row.images) ? row.images : [], variantsCount: Number(row.variantsCount || 0) || 0, salesCount: Number(row.salesCount || 0) || 0, createdAt: row.createdAt || undefined, updatedAt: row.updatedAt || undefined, vendor_id: row.vendor_id || row.store_id || '', vendor_name: row.vendor_name || '', vendor_slug: row.vendor_slug || row.store_slug || '', store_id: row.store_id || row.vendor_id || '', store_slug: row.store_slug || '' })) as MarketplaceProduct[]
    : [];
  const priceMin = products.reduce((m, p) => Math.min(m, Number(p.priceBDT) || 0), Number.POSITIVE_INFINITY);
  const priceMax = products.reduce((m, p) => Math.max(m, Number(p.priceBDT) || 0), Number.NEGATIVE_INFINITY);
  return { ok: true, products, total: products.length, page, limit, pages: 1, price_range: priceMin === Number.POSITIVE_INFINITY || priceMax === Number.NEGATIVE_INFINITY ? null : { min: priceMin, max: priceMax } };
}

export async function fetchSupabaseNativeCategories(): Promise<any[]> {
  if (!isSupabaseConfigured) throw new Error('[supabaseNative] Supabase not configured.');
  const client = getSupabaseClient();
  if (!client) return [];
  const { data, error } = await client.from('categories').select('*').eq('is_published', true).eq('is_active', true).order('sort_order', { ascending: true });
  if (error) { console.warn('[supabaseNative] fetchSupabaseNativeCategories error:', supabaseErrorMessage(error)); return []; }
  return Array.isArray(data) ? data : [];
}

export async function createSupabaseNativeOrder(input: any): Promise<{ ok: boolean; order?: any; error?: string }> {
  if (!isSupabaseConfigured) return { ok: false, error: 'Supabase is not configured.' };
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase client unavailable.' };
  const orderRow: Record<string, any> = {
    order_number: input.orderNumber, customer_name: input.customerName, customer_phone: input.customerPhone, customer_email: input.customerEmail || null, district: input.district || null, city_area: input.cityArea || null, address: input.address, delivery_zone: input.deliveryZone || null, subtotal_bdt: Number(input.subtotalBDT || 0), delivery_charge: Number(input.deliveryCharge || 0), total_bdt: Number(input.totalBDT || 0), payment_method: input.paymentMethod || '', payment_status: input.paymentStatus || '', fulfillment_status: input.fulfillmentStatus || null, status: input.status || 'New', vendor_id: input.vendorId || null, store_id: input.storeId || null, store_slug: input.storeSlug || null, items: input.items || [], split_by_vendor: Boolean(input.split_by_vendor), order_source_channel: input.order_source_channel || 'marketplace', marketplace_order: input.marketplace_order ?? true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  const { data: orderData, error: orderError } = await client.from('orders').insert(orderRow).select('id, order_number').single();
  if (orderError) { console.warn('[supabaseNative] createSupabaseNativeOrder (orders) error:', supabaseErrorMessage(orderError)); return { ok: false, error: orderError.message || 'Order could not be persisted.' }; }
  const orderItems = input.items || [];
  if (orderItems.length > 0) {
    const itemRows = orderItems.map((item) => ({ order_id: (orderData as any)?.id || null, order_number: input.orderNumber, product_id: item.productId || null, product_name: item.productName || 'Item', variant: item.variant || null, quantity: Number(item.quantity || 0), unit_price_bdt: Number(item.unitPriceBDT || 0), image: item.image || null, vendor_id: item.vendor_id || null, vendor_name: item.vendor_name || null, vendor_slug: item.vendor_slug || null, store_id: item.store_id || null, store_slug: item.store_slug || null, category: item.category || null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }));
    const { error: itemsError } = await client.from('order_items').insert(itemRows);
    if (itemsError) console.warn('[supabaseNative] createSupabaseNativeOrder (order_items) error:', supabaseErrorMessage(itemsError));
  }
  return { ok: true, order: orderData };
}

export async function fetchSupabaseNativeAllOrders(): Promise<{ ok: boolean; orders: any[]; error?: string }> {
  if (!isSupabaseConfigured) return { ok: false, orders: [], error: 'Supabase is not configured.' };
  const client = getSupabaseClient();
  if (!client) return { ok: false, orders: [], error: 'Supabase client unavailable.' };
  const { data, error } = await client.from('orders').select('*').eq('marketplace_order', true).order('created_at', { ascending: false });
  if (error) { console.warn('[supabaseNative] fetchSupabaseNativeAllOrders error:', supabaseErrorMessage(error)); return { ok: false, orders: [], error: error.message || 'Orders could not be fetched.' }; }
  return { ok: true, orders: Array.isArray(data) ? data : [] };
}

export async function fetchSupabaseNativeVendorOrders(vendorId: string): Promise<{ ok: boolean; orders: any[]; error?: string }> {
  if (!vendorId) return { ok: false, orders: [], error: 'Vendor ID required.' };
  if (!isSupabaseConfigured) return { ok: false, orders: [], error: 'Supabase is not configured.' };
  const client = getSupabaseClient();
  if (!client) return { ok: false, orders: [], error: 'Supabase client unavailable.' };
  const { data, error } = await client.from('orders').select('*').or([`vendor_id.eq.${vendorId}`, `store_id.eq.${vendorId}`, `store_slug.eq.${vendorId}`]).eq('marketplace_order', true).order('created_at', { ascending: false });
  if (error) { console.warn('[supabaseNative] fetchSupabaseNativeVendorOrders error:', supabaseErrorMessage(error)); return { ok: false, orders: [], error: error.message || 'Vendor orders unavailable.' }; }
  return { ok: true, orders: Array.isArray(data) ? data : [] };
}

const supabaseNativeModule = { fetchSupabaseNativeProducts, fetchSupabaseNativeCategories, createSupabaseNativeOrder, fetchSupabaseNativeAllOrders, fetchSupabaseNativeVendorOrders };
export default supabaseNativeModule;
