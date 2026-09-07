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
    priceBDT: Number(raw.priceBDT ?? raw.price ?? raw.price_bdt ?? 0),
    costPriceBDT: raw.costPriceBDT != null ? Number(raw.costPriceBDT) : (raw.cost_price != null ? Number(raw.cost_price) : undefined),
    compareAtPriceBDT: raw.compareAtPriceBDT != null ? Number(raw.compareAtPriceBDT) : (raw.compare_at_price != null ? Number(raw.compare_at_price) : undefined),
    stock: Number(raw.stock ?? 0),
    status: raw.status || 'Active',
    image: raw.image || raw.image_url || (Array.isArray(raw.images) ? raw.images[0] : '') || '',
    additionalImages: raw.additionalImages || raw.additional_images || [],
    merchantId,
    merchant_id: raw.merchant_id || merchantId,
    storeSlug,
    store_slug: raw.store_slug || storeSlug,
    slug: raw.slug || toCatalogSlug(title, 'product'),
    descriptionEn: raw.descriptionEn || raw.description || raw.description_en || '',
    variantsCount: Number(raw.variantsCount ?? raw.variants_count ?? (Array.isArray(raw.variants) ? raw.variants.length : 1)),
    salesCount: Number(raw.salesCount ?? raw.sales_count ?? 0),
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
  const image = String(product.image || product.imageUrl || product.image_url || '');
  const storeId = product.storeId || product.store_id || merchant?.id || merchant?.storeId || '';
  const storeCode = product.storeCode || product.store_code || merchant?.storeCode || merchant?.store_code || '';

  return {
    ...product,
    id: product.id || newCatalogId(),
    name: title,
    title,
    slug: product.slug || product.seoSlug || toCatalogSlug(title, 'product'),
    store_slug: storeSlug,
    storeSlug,
    ...(storeId ? { storeId, store_id: storeId } : {}),
    ...(storeCode ? { storeCode, store_code: storeCode } : {}),
    merchantId,
    merchant_id: merchantId,
    category: product.category || 'General',
    status: product.status || 'active',
    is_published: product.is_published !== false,
    sku: product.sku || '',
    priceBDT: price,
    price,
    stock,
    stock_quantity: stock,
    image,
    image_url: image,
    description: product.description || product.descriptionEn || '',
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

  // 1. Explicit fallback schema mapping requested
  const payload = {
    name,
    price,
    stock_quantity,
    category,
    image_url,
    store_slug: storeSlug || 'bd'
  };

  const baseRecord = {
    id: String(productData.id || newCatalogId()),
    title: name,
    name,
    price,
    price_bdt: price,
    image_url,
    image: image_url,
    category_id: String(productData.categoryId || productData.category_id || category || ''),
    category,
    status: productData.status || 'active',
    is_published: true,
    description: String(productData.description || productData.descriptionEn || ''),
    sku: String(productData.sku || ''),
    stock: stock_quantity,
    stock_quantity,
    store_slug: storeSlug || 'bd',
    // Permanent store identity — attached to every product create so queries
    // never depend on the (mutable) display slug.
    ...(productData.storeId || productData.store_id ? { store_id: String(productData.storeId || productData.store_id) } : {}),
    ...(productData.storeCode || productData.store_code ? { store_code: String(productData.storeCode || productData.store_code) } : {}),
  };

  let clientError: string | undefined = undefined;

  try {
    const { supabase } = await import('../lib/supabase');
    if (supabase) {
      // First attempt: upsert complete record with conflict resolution
      const { error: upsertErr } = await supabase.from('products').upsert(baseRecord, { onConflict: 'id' });
      if (upsertErr) {
        console.warn('[catalogPayload] Supabase upsert notice, trying explicit insert with fallback schema mapping:', upsertErr.message);
        // Second attempt: explicit insert with fallback schema mapping
        const { error: insertErr } = await supabase.from('products').insert([payload]);
        if (insertErr) {
          console.error('[catalogPayload] Supabase insert with fallback schema failed:', insertErr.message);
          clientError = insertErr.message || upsertErr.message;
        }
      }
    }
  } catch (e: any) {
    console.error('[catalogPayload] Supabase client exception:', e);
    clientError = e?.message || 'Supabase client error';
  }

  // REST fallback
  try {
    const { supabaseUrl, supabaseAnonKey } = await import('../lib/supabase');
    if (supabaseUrl && supabaseAnonKey) {
      await fetch(`${supabaseUrl}/rest/v1/products`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseAnonKey,
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Prefer': 'resolution=merge-duplicates',
        },
        body: JSON.stringify(baseRecord),
      }).catch(err => console.warn('[catalogPayload] Supabase REST upsert warning:', err));
    }
  } catch (e) {
    console.warn('[catalogPayload] Supabase REST error:', e);
  }

  return { ok: !clientError, error: clientError };
}

export async function upsertCategoryToSupabase(category: any, storeSlugInput?: string) {
  const slug = String(storeSlugInput || category.storeSlug || category.store_slug || 'bd').toLowerCase().trim();
  const name = String(category.name || category.title || 'Category').trim();
  const basePayload = {
    id: String(category.id),
    title: name,
    name,
    image_url: String(category.image || category.coverImage || category.image_url || ''),
    image: String(category.image || category.coverImage || category.image_url || ''),
    category_id: String(category.id),
    status: category.status || 'active',
    is_published: category.status !== 'hidden',
    parent_id: category.parentId || category.parent_id || null,
    slug: category.slug || '',
  };

  const slugsToUpsert = Array.from(new Set([slug, 'bd', 'verandabd', 'default']));

  try {
    const { supabase } = await import('../lib/supabase');
    if (supabase) {
      for (const s of slugsToUpsert) {
        const payload = { ...basePayload, store_slug: s };
        const { error } = await supabase.from('categories').upsert(payload, { onConflict: 'id' });
        if (error) console.warn('Supabase category client upsert notice:', error.message);
      }
    }
  } catch (e) {
    console.warn('Supabase category client upsert error:', e);
  }

  try {
    const { supabaseUrl, supabaseAnonKey } = await import('../lib/supabase');
    if (supabaseUrl && supabaseAnonKey) {
      for (const s of slugsToUpsert) {
        const payload = { ...basePayload, store_slug: s };
        await fetch(`${supabaseUrl}/rest/v1/categories`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseAnonKey,
            'Authorization': `Bearer ${supabaseAnonKey}`,
            'Prefer': 'resolution=merge-duplicates',
          },
          body: JSON.stringify(payload),
        }).catch(err => console.warn('Supabase category REST upsert error:', err));
      }
    }
  } catch (e) {
    console.warn('Supabase category REST upsert warning:', e);
  }
}
