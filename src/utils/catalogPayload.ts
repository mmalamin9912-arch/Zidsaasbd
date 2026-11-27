import {
  buildCategoryMirrorPayload,
  buildProductMirrorPayload,
  fetchKnownColumns,
  mirrorWriteRefusedReason,
  rememberMirrorWriteRefusal,
  restrictToKnownColumns,
  toSafeBigIntId,
} from '../../lib/supabaseSchema';

export { toSafeBigIntId };

export function toCatalogSlug(value: string, fallback = 'item'): string {
  const slug = (value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
}

export function newCatalogId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const n = (Math.random() * 16) | 0;
    const v = ch === 'x' ? n : (n & 0x3) | 0x8;
    return v.toString(16);
  });
}

export const maxCatalogId = newCatalogId;

export function ensureCategory(category: any, merchant?: { id?: string; storeSlug?: string } | null) {
  return buildCategoryDbPayload(category, merchant);
}

export function packCatalogItem(item: any, merchant?: { id?: string; storeSlug?: string } | null) {
  if (item?.type === 'category' || item?.isCategory) {
    return buildCategoryDbPayload(item, merchant);
  }
  return buildProductDbPayload(item, merchant);
}

export function mapApiProduct(raw: any): any {
  if (!raw || typeof raw !== 'object') return raw;
  const title = raw.title || raw.name || 'Untitled Product';
  const storeSlug = raw.storeSlug || raw.store_slug || '';
  const merchantId = raw.merchantId || raw.merchant_id || storeSlug || 'default';
  return {
    ...raw,
    id: String(raw.id || raw._id || newCatalogId()),
    title,
    name: raw.name || title,
    titleBn: raw.titleBn || raw.title_bn || '',
    sku: raw.sku || '',
    category: raw.category || raw.category_name || 'General',
    categoryId: raw.categoryId || raw.category_id || '',
    subCategory: raw.subCategory || raw.sub_category || '',
    subCategoryId: raw.subCategoryId || raw.sub_category_id || '',
    // Merchant-only storefront grouping — never used for marketplace filters.
    storeCollection: raw.storeCollection || raw.store_collection || '',
    priceBDT: Number(raw.priceBDT ?? raw.price ?? raw.price_bdt ?? 0),
    costPriceBDT: raw.costPriceBDT != null ? Number(raw.costPriceBDT) : (raw.cost_price != null ? Number(raw.cost_price) : undefined),
    compareAtPriceBDT: raw.compareAtPriceBDT != null ? Number(raw.compareAtPriceBDT) : (raw.compare_at_price != null ? Number(raw.compare_at_price) : undefined),
    // The monetary discount is what lets a product WITHOUT a stored compare-at
    // price still show a percentage (see src/utils/productPricing.ts).
    discountPriceBDT: raw.discountPriceBDT != null ? Number(raw.discountPriceBDT) : (raw.discount_price != null ? Number(raw.discount_price) : undefined),
    stock: Number(raw.stock ?? 0),
    status: raw.status || 'Active',
    image:
      (Array.isArray(raw.images) ? String(raw.images.find((x: unknown) => typeof x === 'string' && String(x).trim()) || '').trim() : '') ||
      String(raw.image || '').trim() ||
      String(raw.thumbnail || raw.thumbnailUrl || raw.thumbnail_url || '').trim() ||
      String(raw.imageUrl || raw.image_url || '').trim() ||
      '',
    images: Array.isArray(raw.images) ? raw.images : [],
    thumbnail: raw.thumbnail || raw.thumbnailUrl || raw.thumbnail_url || '',
    imageUrl: raw.imageUrl || raw.image_url || '',
    image_url: raw.image_url || raw.imageUrl || '',
    additionalImages: raw.additionalImages || raw.additional_images || [],
    merchantId,
    merchant_id: raw.merchant_id || merchantId,
    storeSlug,
    store_slug: raw.store_slug || storeSlug,
    slug: raw.slug || toCatalogSlug(title, 'product'),
    descriptionEn: raw.descriptionEn || raw.description || raw.description_en || '',
    variantsCount: Number(raw.variantsCount ?? raw.variants_count ?? (Array.isArray(raw.variants) ? raw.variants.length : 1)),
    salesCount: Number(raw.salesCount ?? raw.sales_count ?? 0),
    // Per-product delivery charges, carried through for the storefront and
    // checkout. Both the zone list and the explicit pair are mapped so a product
    // saved before this existed still resolves a fee.
    deliveryRates: Array.isArray(raw.deliveryRates)
      ? raw.deliveryRates
      : Array.isArray(raw.delivery_rates)
      ? raw.delivery_rates
      : undefined,
    delivery_rates: Array.isArray(raw.delivery_rates)
      ? raw.delivery_rates
      : Array.isArray(raw.deliveryRates)
      ? raw.deliveryRates
      : undefined,
    inside_city_fee: raw.inside_city_fee != null ? Number(raw.inside_city_fee) : (raw.insideCityFee != null ? Number(raw.insideCityFee) : undefined),
    outside_city_fee: raw.outside_city_fee != null ? Number(raw.outside_city_fee) : (raw.outsideCityFee != null ? Number(raw.outsideCityFee) : undefined),
    sub_dhaka_fee: raw.sub_dhaka_fee != null ? Number(raw.sub_dhaka_fee) : (raw.subDhakaFee != null ? Number(raw.subDhakaFee) : undefined),
    requiresShipping: raw.requiresShipping !== false,
  };
}

export function mapApiCategory(raw: any, index = 0): any {
  if (!raw || typeof raw !== 'object') return raw;
  const name = raw.name || raw.title || 'Category';
  const storeSlug = raw.storeSlug || raw.store_slug || '';
  const merchantId = raw.merchantId || raw.merchant_id || storeSlug || 'default';
  return {
    id: String(raw.id || raw._id || `cat-${index}`),
    parentId: raw.parentId ?? raw.parent_id ?? null,
    name,
    imageAltText: raw.imageAltText || raw.image_alt_text || '',
    image: raw.image || raw.imageUrl || raw.image_url || '',
    coverImage: raw.coverImage || raw.cover_image || '',
    description: raw.description || '',
    status: raw.status === 'hidden' ? 'hidden' : 'published',
    productCount: Number(raw.productCount ?? raw.product_count ?? 0),
    slug: raw.slug || toCatalogSlug(name, 'category'),
    metaTitle: raw.metaTitle || raw.meta_title,
    metaDescription: raw.metaDescription || raw.meta_description,
    keywords: raw.keywords,
    noIndex: !!(raw.noIndex ?? raw.no_index),
    merchantId,
    merchant_id: raw.merchant_id || merchantId,
    storeSlug,
    store_slug: raw.store_slug || storeSlug,
  };
}

export function buildCategoryDbPayload(category: any, merchant?: { id?: string; storeSlug?: string } | null) {
  const merchantId = category.merchantId || category.merchant_id || merchant?.id || merchant?.storeSlug || 'default';
  const storeSlug = category.storeSlug || category.store_slug || merchant?.storeSlug || merchantId || 'default';
  const name = String(category.name || category.title || '').trim() || 'Category';
  const slug = category.slug || toCatalogSlug(name, 'category');
  return {
    id: category.id && String(category.id).includes('-') ? category.id : (category.id || newCatalogId()),
    name,
    title: name,
    slug,
    store_slug: storeSlug,
    storeSlug,
    merchantId,
    merchant_id: merchantId,
    parentId: category.parentId ?? category.parent_id ?? null,
    parent_id: category.parentId ?? category.parent_id ?? null,
    description: category.description || '',
    status: category.status || 'published',
    image: category.image || '',
    coverImage: category.coverImage || category.cover_image || '',
    cover_image: category.coverImage || category.cover_image || '',
    imageAltText: category.imageAltText || category.image_alt_text || '',
    image_alt_text: category.imageAltText || category.image_alt_text || '',
    productCount: Number(category.productCount ?? category.product_count ?? 0),
    product_count: Number(category.productCount ?? category.product_count ?? 0),
    metaTitle: category.metaTitle || category.meta_title || name,
    meta_title: category.metaTitle || category.meta_title || name,
    metaDescription: category.metaDescription || category.meta_description || '',
    meta_description: category.metaDescription || category.meta_description || '',
    keywords: category.keywords || '',
    noIndex: !!category.noIndex,
    no_index: !!category.noIndex,
  };
}

export function buildProductDbPayload(product: any, merchant?: { id?: string; storeSlug?: string; storeCode?: string; store_code?: string; storeId?: string } | null) {
  const title = String(product.title || product.name || '').trim() || 'Untitled Product';
  const merchantId = product.merchantId || product.merchant_id || merchant?.id || merchant?.storeSlug || 'default';
  const storeSlug = product.storeSlug || product.store_slug || merchant?.storeSlug || merchantId || 'bd';
  const price = Number(product.priceBDT ?? product.price ?? product.price_bdt ?? 0);
  const stock = Number(product.stock ?? product.stock_quantity ?? product.quantity ?? 0);
  // Persist EVERY image key Products Management may have set — `images[0]`,
  // `thumbnail`, `imageUrl` — so the storefront resolver can find the real
  // database URL instead of falling back to a placeholder.
  const firstArrayImage = (value: unknown): string =>
    Array.isArray(value)
      ? String(value.find((x) => typeof x === 'string' && String(x).trim()) || '').trim()
      : '';
  const image = String(
    firstArrayImage(product.images) ||
    product.image ||
    product.thumbnail ||
    product.thumbnailUrl ||
    product.thumbnail_url ||
    product.imageUrl ||
    product.image_url ||
    ''
  ).trim();
  const storeId = product.storeId || product.store_id || merchant?.id || merchant?.storeId || '';
  const storeCode = product.storeCode || product.store_code || merchant?.storeCode || merchant?.store_code || '';

  return {
    ...product,
    id: product.id || newCatalogId(),
    name: title,
    title,
    titleBn: product.titleBn || product.title_bn || '',
    slug: product.slug || product.seoSlug || toCatalogSlug(title, 'product'),
    store_slug: storeSlug,
    storeSlug,
    ...(storeId ? { storeId, store_id: storeId } : {}),
    ...(storeCode ? { storeCode, store_code: storeCode } : {}),
    merchantId,
    merchant_id: merchantId,
    category: product.category || 'General',
    categoryId: product.categoryId || product.category_id || '',
    // Global taxonomy second level. Carried on BOTH spellings so the marketplace
    // query and the storefront can each read the one they already use.
    sub_category: product.subCategory || product.sub_category || '',
    subCategory: product.subCategory || product.sub_category || '',
    sub_category_id: product.subCategoryId || product.sub_category_id || '',
    subCategoryId: product.subCategoryId || product.sub_category_id || '',
    // Merchant-owned grouping label. Storefront-only; the marketplace ignores it.
    store_collection: product.storeCollection || product.store_collection || '',
    storeCollection: product.storeCollection || product.store_collection || '',
    status: product.status || 'active',
    is_published: product.is_published !== false,
    sku: product.sku || '',
    priceBDT: price,
    price,
    costPriceBDT: product.costPriceBDT != null ? Number(product.costPriceBDT) : undefined,
    compareAtPriceBDT: product.compareAtPriceBDT != null ? Number(product.compareAtPriceBDT) : undefined,
    discountPriceBDT: product.discountPriceBDT != null ? Number(product.discountPriceBDT) : undefined,
    stock,
    stock_quantity: stock,
    image,
    images: Array.isArray(product.images) && product.images.length > 0 ? product.images : (image ? [image] : []),
    thumbnail: product.thumbnail || product.thumbnailUrl || product.thumbnail_url || image,
    imageUrl: product.imageUrl || image,
    image_url: image,
    additionalImages: product.additionalImages || product.additional_images || [],
    description: product.description || product.descriptionEn || '',
    descriptionEn: product.descriptionEn || product.description_en || '',
    descriptionBn: product.descriptionBn || product.description_bn || '',
    descriptionAr: product.descriptionAr || product.description_ar || '',
    brand: product.brand || '',
    taxRatePercent: product.taxRatePercent || 0,
    maxOrderQuantity: product.maxOrderQuantity || 99,
    customizationEnabled: product.customizationEnabled || false,
    customizationLabel: product.customizationLabel || 'Custom instructions',
    seoTitle: product.seoTitle || '',
    seoDescription: product.seoDescription || '',
    seoSlug: product.seoSlug || '',
    templateStyle: product.templateStyle || 'standard',
    requiresShipping: product.requiresShipping !== false,
    isTaxExempt: product.isTaxExempt || false,
    hasDiscount: product.hasDiscount || false,
    variants: product.variants || [],
    variantsCount: product.variantsCount || (Array.isArray(product.variants) ? product.variants.length : 1),
    salesCount: product.salesCount || 0,
    createdAt: product.createdAt || new Date().toISOString().split('T')[0],
    updatedAt: new Date().toISOString().split('T')[0],
    // Per-product delivery charges - preserve BOTH the zone list and explicit pair
    deliveryRates: product.deliveryRates || product.delivery_rates || [],
    inside_city_fee: product.inside_city_fee != null ? Number(product.inside_city_fee) : (product.insideCityFee != null ? Number(product.insideCityFee) : undefined),
    outside_city_fee: product.outside_city_fee != null ? Number(product.outside_city_fee) : (product.outsideCityFee != null ? Number(product.outsideCityFee) : undefined),
    insideCityFee: product.insideCityFee != null ? Number(product.insideCityFee) : (product.inside_city_fee != null ? Number(product.inside_city_fee) : undefined),
    outsideCityFee: product.outsideCityFee != null ? Number(product.outsideCityFee) : (product.outside_city_fee != null ? Number(product.outside_city_fee) : undefined),
    // Sub-Dhaka / Dhaka-suburbs charge. Absent (not 0) when the merchant never
    // priced it, so the checkout can fall back to the Inside fee honestly.
    sub_dhaka_fee: product.sub_dhaka_fee != null ? Number(product.sub_dhaka_fee) : (product.subDhakaFee != null ? Number(product.subDhakaFee) : undefined),
    subDhakaFee: product.subDhakaFee != null ? Number(product.subDhakaFee) : (product.sub_dhaka_fee != null ? Number(product.sub_dhaka_fee) : undefined),
    colorImages: product.colorImages || {},
    selectedFilter: product.selectedFilter || '',
    customFields: product.customFields || [],
  };
}

export async function postCatalogJson(url: string, body: unknown): Promise<{ ok: boolean; status?: number; data: any; error?: string }> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const contentType = res.headers.get('content-type') || '';
    let data: any = null;
    try {
      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        data = text ? JSON.parse(text) : null;
      }
    } catch {
      data = null;
    }
    return { ok: res.ok, status: res.status, data, error: !res.ok ? (data?.error || `HTTP ${res.status}`) : undefined };
  } catch (err: any) {
    return { ok: false, status: 0, data: null, error: err?.message || 'Network request failed' };
  }
}

export async function upsertProductToSupabase(productData: any, storeSlugInput?: string): Promise<{ ok: boolean; error?: string }> {
  const storeSlug = String(storeSlugInput || productData.storeSlug || productData.store_slug || 'bd').toLowerCase().trim() || 'bd';
  const name = String(productData.name || productData.title || 'Untitled Product').trim();
  const price = Number(productData.price ?? productData.priceBDT ?? 0) || 0;
  const stock_quantity = Number(productData.stock ?? productData.stock_quantity ?? productData.quantity ?? 0) || 0;
  const category = productData.category || 'General';
  const image_url = String(productData.image || productData.imageUrl || productData.image_url || '');

  // Minimal row, restricted to the columns the deployed `products` table
  // actually has (`id, name, store_slug, price, stock_quantity, category,
  // image_url, created_at`). It used to carry `title`, `priceBDT`, `status`,
  // `sku`, `category_id`, … — every one of those is absent, and PostgREST
  // rejects the WHOLE request with a 400 (PGRST204) for a single unknown key.
  const source = {
    id: productData.id ? String(productData.id) : newCatalogId(),
    name,
    price,
    stock_quantity,
    category,
    image_url,
    store_slug: storeSlug || 'bd'
  };

  // Ask the table for its REAL column set first (ONE request, cached) and keep
  // only the keys it has, so the mirror can never 400 on an unknown column.
  // A table that already answered 401 is not asked again (see
  // `rememberMirrorWriteRefusal`).
  const { supabaseUrl, supabaseAnonKey, supabase } = await import('../lib/supabase');
  const refused = mirrorWriteRefusedReason('products');
  if (refused) return { ok: false, error: refused };

  const columns = await fetchKnownColumns(supabaseUrl, supabaseAnonKey, 'products');
  const record = buildProductMirrorPayload(restrictToKnownColumns(source, columns), columns);
  if (Object.keys(record).length === 0) {
    return { ok: false, error: 'Supabase products mirror skipped: nothing to write.' };
  }

  try {
    if (!supabase) return { ok: false, error: 'Supabase client unavailable.' };
    const { error } = await supabase.from('products').insert([record]);
    if (!error) return { ok: true };
    console.warn('[catalogPayload] Supabase product mirror skipped:', error.message);
    const status = (error as any)?.status;
    if (status === 401 || status === 403) rememberMirrorWriteRefusal('products', status, error.message);
    return { ok: false, error: error.message };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Supabase client error' };
  }
}

export async function upsertCategoryToSupabase(category: any, storeSlugInput?: string): Promise<void> {
  const slug = String(storeSlugInput || category?.storeSlug || category?.store_slug || 'bd').toLowerCase().trim();

  // Only the ACTIVE tenant slug is written. MongoDB `/api/categories` remains the
  // authoritative write; this is a best-effort mirror that MUST NEVER block or reject.
  //
  // Two conditions made this mirror unusable on the deployed project and filled
  // the browser console on every `/dashboard/<store>` load:
  //   1. Introspection probed ~20 candidate columns in parallel; the table only
  //      has id/name/slug/store_slug/created_at, so 17 of them answered 400.
  //   2. The upsert targeted `on_conflict=id`. Row Level Security denies ALL
  //      inserts for the browser key, so the request could only ever answer 401 —
  //      once for EVERY category, on EVERY reorder/render.
  // Both are avoided now: the column set comes from ONE read, and the write is
  // not attempted again while the table is known to refuse it.
  try {
    const refused = mirrorWriteRefusedReason('categories');
    if (refused) return;

    const { supabaseUrl, supabaseAnonKey, supabase } = await import('../lib/supabase');

    // Build the row ONLY from columns the table REALLY has — an unknown key
    // rejects the whole request with a 400 (PGRST204).
    const columns = await fetchKnownColumns(supabaseUrl, supabaseAnonKey, 'categories');
    const payload = buildCategoryMirrorPayload(category, slug, columns);
    if (!payload.id) {
      // Missing or invalid ID — skip Supabase mirror silently
      return;
    }
    const record = restrictToKnownColumns(payload, columns);
    if (Object.keys(record).length === 0) return;

    if (!supabase) return;
    const { error } = await supabase.from('categories').insert([record]);
    if (!error) return;
    const status = (error as any)?.status;
    if (status === 401 || status === 403) rememberMirrorWriteRefusal('categories', status, error.message);
    console.warn('Supabase category mirror skipped:', error.message);
  } catch (e) {
    console.warn('Supabase category mirror unavailable (non-blocking):', e);
  }
}
