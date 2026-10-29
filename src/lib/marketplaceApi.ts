/**
 * Marketplace API client.
 *
 * Talks to the multi-vendor endpoints in lib/serverApp.ts:
 *
 *   GET    /api/marketplace/products         → global catalogue + facets
 *   GET    /api/marketplace/vendor-payouts   → commission ledger (Vendor Wallet)
 *   PATCH  /api/marketplace/vendor-payouts/:id
 *   GET    /api/marketplace/commission-rates
 *   POST   /api/marketplace/commission-rates
 *   DELETE /api/marketplace/commission-rates/:id
 *
 * Every helper degrades to an empty, well-formed result instead of throwing —
 * the marketplace homepage must still render when the database hiccups.
 */
import { safeFetch } from './safeFetch';
import type { MarketplaceProduct, VendorPayout, CommissionRate } from '../types';

export interface MarketplaceFilters {
  q?: string;
  category?: string;
  /** Second level of the global taxonomy mega-menu ("Sarees & Jamdani"). */
  subCategory?: string;
  /** Product ids already shown elsewhere (e.g. the featured rail). */
  excludeIds?: string[];
  minPrice?: number | null;
  maxPrice?: number | null;
  /** Vendor slug / ZID-BD code / stores.id UUID. */
  vendor?: string;
  vendorName?: string;
  excludeVendor?: string;
  sort?: 'relevance' | 'newest' | 'price_asc' | 'price_desc' | 'popular';
  page?: number;
  limit?: number;
}

export interface MarketplaceFacetVendor {
  vendor_id: string;
  vendor_slug: string;
  vendor_name: string;
  vendor_code?: string;
  product_count: number;
}

export interface MarketplaceResponse {
  ok: boolean;
  products: MarketplaceProduct[];
  total: number;
  page: number;
  limit: number;
  pages: number;
  vendors: MarketplaceFacetVendor[];
  categories: { name: string; product_count: number }[];
  price_range: { min: number; max: number } | null;
  error?: string;
}

const EMPTY: MarketplaceResponse = {
  ok: false,
  products: [],
  total: 0,
  page: 1,
  limit: 24,
  pages: 0,
  vendors: [],
  categories: [],
  price_range: null,
};

/** Build the querystring for a filter object, dropping empty values. */
export function buildMarketplaceQuery(filters: MarketplaceFilters): string {
  const params = new URLSearchParams();
  const set = (key: string, value: unknown) => {
    if (value === undefined || value === null || value === '') return;
    params.set(key, String(value));
  };
  set('q', filters.q?.trim());
  set('category', filters.category?.trim());
  set('sub_category', filters.subCategory?.trim());
  if (Array.isArray(filters.excludeIds) && filters.excludeIds.length > 0) {
    params.set('exclude_ids', filters.excludeIds.map(String).filter(Boolean).join(','));
  }
  set('min_price', filters.minPrice);
  set('max_price', filters.maxPrice);
  set('vendor', filters.vendor?.trim());
  set('vendor_name', filters.vendorName?.trim());
  set('exclude_vendor', filters.excludeVendor?.trim());
  if (filters.sort) set('sort', filters.sort);
  set('page', filters.page);
  set('limit', filters.limit);
  return params.toString();
}

/** Fetch public products across every active merchant. */
export async function fetchMarketplaceProducts(filters: MarketplaceFilters = {}): Promise<MarketplaceResponse> {
  const qs = buildMarketplaceQuery(filters);
  const result = await safeFetch<MarketplaceResponse>(
    `/api/marketplace/products${qs ? `?${qs}` : ''}`,
    { cache: 'no-store' },
    EMPTY,
  );
  const data = result.data;
  if (!data || !Array.isArray(data.products)) return { ...EMPTY, error: result.message };
  return {
    ...EMPTY,
    ...data,
    products: data.products,
    vendors: Array.isArray(data.vendors) ? data.vendors : [],
    categories: Array.isArray(data.categories) ? data.categories : [],
  };
}

export interface VendorPayoutResponse {
  ok: boolean;
  payouts: VendorPayout[];
  summary: { total: number; pending: number; paid: number; gross_bdt: number; commission_bdt: number; net_bdt: number };
  error?: string;
}

/** Read the commission ledger for one vendor (or the whole platform). */
export async function fetchVendorPayouts(params: {
  vendorId?: string;
  storeSlug?: string;
  masterOrderId?: string;
  status?: string;
  limit?: number;
} = {}): Promise<VendorPayoutResponse> {
  const qs = new URLSearchParams();
  if (params.vendorId) qs.set('vendor_id', params.vendorId);
  if (params.storeSlug) qs.set('store_slug', params.storeSlug);
  if (params.masterOrderId) qs.set('master_order_id', params.masterOrderId);
  if (params.status) qs.set('status', params.status);
  if (params.limit) qs.set('limit', String(params.limit));

  const empty: VendorPayoutResponse = {
    ok: false,
    payouts: [],
    summary: { total: 0, pending: 0, paid: 0, gross_bdt: 0, commission_bdt: 0, net_bdt: 0 },
  };
  const result = await safeFetch<VendorPayoutResponse>(
    `/api/marketplace/vendor-payouts${qs.toString() ? `?${qs}` : ''}`,
    { cache: 'no-store' },
    empty,
  );
  return result.data ? { ...empty, ...result.data } : empty;
}

/** Mark a payout paid / processing / failed with its transfer reference. */
export async function updatePayoutStatus(
  payoutId: string,
  patch: { status: string; payout_reference?: string; payout_method?: string; notes?: string },
): Promise<{ ok: boolean; payout?: VendorPayout; error?: string }> {
  const result = await safeFetch<{ ok: boolean; payout?: VendorPayout; error?: string }>(
    `/api/marketplace/vendor-payouts/${encodeURIComponent(payoutId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    },
    { ok: false },
  );
  return result.data || { ok: false, error: result.message };
}

/** List every commission rule (vendor / category / default). */
export async function fetchCommissionRates(): Promise<{ ok: boolean; rates: CommissionRate[]; error?: string }> {
  const result = await safeFetch<{ ok: boolean; rates: CommissionRate[]; error?: string }>(
    '/api/marketplace/commission-rates',
    { cache: 'no-store' },
    { ok: false, rates: [] },
  );
  const data = result.data;
  return { ok: Boolean(data?.ok), rates: Array.isArray(data?.rates) ? data!.rates : [], error: data?.error };
}

/** Create or update a commission rule. */
export async function saveCommissionRate(
  input: Partial<CommissionRate> & { rate_percent: number },
): Promise<{ ok: boolean; rate?: CommissionRate; error?: string }> {
  const result = await safeFetch<{ ok: boolean; rate?: CommissionRate; error?: string }>(
    '/api/marketplace/commission-rates',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
    { ok: false },
  );
  return result.data || { ok: false, error: result.message };
}

/** Delete a (non-default) commission rule. */
export async function removeCommissionRate(id: string): Promise<{ ok: boolean; error?: string }> {
  const result = await safeFetch<{ ok: boolean; error?: string }>(
    `/api/marketplace/commission-rates/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
    { ok: false },
  );
  return result.data || { ok: false, error: result.message };
}

/** Preview the commission on an amount for a given vendor. */
export async function previewCommission(input: {
  vendor_id?: string;
  gross_amount_bdt: number;
  categories?: string[];
}): Promise<{
  ok: boolean;
  rate_percent: number;
  commission_bdt: number;
  net_bdt: number;
  source: string;
}> {
  const result = await safeFetch<any>(
    '/api/marketplace/commission/preview',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
    null,
  );
  return result.data || { ok: false, rate_percent: 0, commission_bdt: 0, net_bdt: input.gross_amount_bdt, source: 'fallback' };
}

/* ───────────────────── COD ledger & vendor wallet ───────────────────── */

/** One settled COD parcel — the central ledger row. */
export interface CodLedgerEntry {
  id?: string;
  order_id: string;
  order_number: string;
  vendor_id: string;
  vendor_name?: string;
  courier_name?: string;
  tracking_code?: string;
  gross_collected: number;
  courier_fee: number;
  platform_commission: number;
  commission_rate_percent?: number;
  vendor_credit: number;
  net_settlement?: number;
  status?: string;
  delivered_at?: string;
  reconciled_at?: string;
}

export interface VendorWallet {
  vendor_id: string;
  store_slug?: string;
  vendor_name?: string;
  /** Settled COD earnings the vendor may withdraw right now. */
  available_bdt: number;
  /** Requested but not yet disbursed. */
  pending_payout_bdt: number;
  lifetime_credit_bdt: number;
  lifetime_paid_bdt: number;
  lifetime_gross_bdt?: number;
  lifetime_courier_fee_bdt?: number;
  lifetime_commission_bdt?: number;
  cod_orders_count?: number;
  last_credit_at?: string;
  last_credit_order?: string;
}

export interface PayoutRules {
  minAmountBDT: number;
  reviewThresholdBDT: number;
}

export interface PayoutRequest {
  id?: string;
  request_number: string;
  vendor_id: string;
  vendor_name?: string;
  amount_bdt: number;
  status: 'pending' | 'approved' | 'paid' | 'rejected' | 'cancelled';
  method?: string;
  account_name?: string;
  account_number?: string;
  bank_name?: string;
  payout_reference?: string;
  notes?: string;
  requested_at?: string;
  processed_at?: string;
}

export interface CodLedgerResponse {
  ok: boolean;
  entries: CodLedgerEntry[];
  summary: { count: number; gross: number; courier: number; commission: number; credit: number };
  error?: string;
}

const EMPTY_LEDGER: CodLedgerResponse = {
  ok: false,
  entries: [],
  summary: { count: 0, gross: 0, courier: 0, commission: 0, credit: 0 },
};

/** Read settlement rows (`cod_ledger`) with the money summary. */
export async function fetchCodLedger(params: {
  vendorId?: string;
  storeSlug?: string;
  orderNumber?: string;
  status?: string;
  from?: string;
  to?: string;
  limit?: number;
} = {}): Promise<CodLedgerResponse> {
  const qs = new URLSearchParams();
  if (params.vendorId) qs.set('vendor_id', params.vendorId);
  if (params.storeSlug) qs.set('store_slug', params.storeSlug);
  if (params.orderNumber) qs.set('order_number', params.orderNumber);
  if (params.status) qs.set('status', params.status);
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  if (params.limit) qs.set('limit', String(params.limit));

  const result = await safeFetch<CodLedgerResponse>(
    `/api/marketplace/cod-ledger${qs.toString() ? `?${qs}` : ''}`,
    { cache: 'no-store' },
    EMPTY_LEDGER,
  );
  return result.data ? { ...EMPTY_LEDGER, ...result.data } : EMPTY_LEDGER;
}

/** Read the merchant's wallet (available COD earnings + payout rules). */
export async function fetchVendorWallet(params: {
  vendorId?: string;
  storeSlug?: string;
}): Promise<{ ok: boolean; wallet: VendorWallet | null; payout_rules?: PayoutRules; error?: string }> {
  const qs = new URLSearchParams();
  if (params.vendorId) qs.set('vendor_id', params.vendorId);
  if (params.storeSlug) qs.set('store_slug', params.storeSlug);
  const result = await safeFetch<{ ok: boolean; wallet: VendorWallet | null; payout_rules?: PayoutRules; error?: string }>(
    `/api/marketplace/vendor-wallet${qs.toString() ? `?${qs}` : ''}`,
    { cache: 'no-store' },
    { ok: false, wallet: null },
  );
  return result.data || { ok: false, wallet: null, error: result.message };
}

/** The vendor's withdrawal history. */
export async function fetchPayoutRequests(params: {
  vendorId?: string;
  storeSlug?: string;
  status?: string;
  limit?: number;
} = {}): Promise<{
  ok: boolean;
  requests: PayoutRequest[];
  summary: { pending_bdt: number; paid_bdt: number };
  error?: string;
}> {
  const qs = new URLSearchParams();
  if (params.vendorId) qs.set('vendor_id', params.vendorId);
  if (params.storeSlug) qs.set('store_slug', params.storeSlug);
  if (params.status) qs.set('status', params.status);
  if (params.limit) qs.set('limit', String(params.limit));

  const empty = { ok: false, requests: [], summary: { pending_bdt: 0, paid_bdt: 0 } };
  const result = await safeFetch<typeof empty>(
    `/api/marketplace/payout-requests${qs.toString() ? `?${qs}` : ''}`,
    { cache: 'no-store' },
    empty,
  );
  return result.data ? { ...empty, ...result.data } : empty;
}

/** Log a withdrawal request against the vendor's settled earnings. */
export async function requestPayout(input: {
  vendorId?: string;
  storeSlug?: string;
  amountBDT: number;
  method?: string;
  accountName?: string;
  accountNumber?: string;
  bankName?: string;
  notes?: string;
}): Promise<{ ok: boolean; request?: PayoutRequest | null; wallet?: VendorWallet | null; error?: string }> {
  const result = await safeFetch<{ ok: boolean; request?: PayoutRequest | null; wallet?: VendorWallet | null; error?: string }>(
    '/api/marketplace/payout-requests',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vendor_id: input.vendorId,
        store_slug: input.storeSlug,
        amount_bdt: input.amountBDT,
        method: input.method,
        account_name: input.accountName,
        account_number: input.accountNumber,
        bank_name: input.bankName,
        notes: input.notes,
      }),
    },
    { ok: false },
  );
  return result.data || { ok: false, error: result.message };
}

/** Manually reconcile one order (repairs a missed webhook). Idempotent. */
export async function reconcileCodOrder(input: {
  orderId?: string;
  orderNumber?: string;
  courierFee?: number;
}): Promise<{
  ok: boolean;
  status?: string;
  reason?: string;
  ledger?: CodLedgerEntry | null;
  wallet?: VendorWallet | null;
  error?: string;
}> {
  const result = await safeFetch<{
    ok: boolean; status?: string; reason?: string;
    ledger?: CodLedgerEntry | null; wallet?: VendorWallet | null; error?: string;
  }>(
    '/api/marketplace/cod-ledger/reconcile',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: input.orderId, order_number: input.orderNumber, courier_fee: input.courierFee }),
    },
    { ok: false },
  );
  return result.data || { ok: false, error: result.message };
}
