/**
 * Per-product delivery charges.
 *
 * THE PROBLEM
 * -----------
 * The product form has a mandatory "Shipping & Delivery Charges" section, but the
 * charges never reached the storefront. The storefront computed shipping from the
 * STORE-level COD config (`codConfig.insideDhakaFee` / `outsideDhakaFee`) and
 * ignored the product entirely — so a merchant who set "Inside City ৳60" still
 * saw the store default in the cart, and the city dropdown's labels were
 * hardcoded to "৳80" / "৳150".
 *
 * This module is the single place that resolves a charge for a product, so the
 * form, the storefront product page and the checkout can never disagree.
 *
 * TWO STORED SHAPES, ONE SOURCE OF TRUTH
 * --------------------------------------
 * A product carries both:
 *   • `inside_city_fee` / `outside_city_fee` — explicit numbers, easy for any
 *     reader (and for a merchant inspecting the Mongo document), and
 *   • `deliveryRates` — the original zone list, which preserves extra custom zones
 *     and the merchant's own zone names ("Inside Dhaka", "Chattogram", …).
 *
 * `deliveryRates` is richer, so it is preferred when present; the explicit pair
 * is the fallback. Either way the caller gets one resolved answer.
 */

export interface DeliveryRates {
  /** Charge when the customer's city counts as "inside". */
  insideFee: number | null;
  /** Charge when the customer's city counts as "outside". */
  outsideFee: number | null;
  /** The zone label to show for the inside charge, when one was named. */
  insideLabel: string;
  /** The zone label to show for the outside charge, when one was named. */
  outsideLabel: string;
  /** True when this product has any usable charge stored. */
  hasProductRates: boolean;
}

/** Matchers, tried in order — the first hit wins. */
const INSIDE_MATCHERS = [/inside/i, /\bcity\b/i, /dhaka/i, /within/i, /^metro$/i];
const OUTSIDE_MATCHERS = [/outside/i, /out of/i, /other/i, /sub\s*-?\s*(city|dhaka)/i, /district/i, /upazila/i];

/** Coerce a stored fee to a non-negative finite number, or null. */
export function toFee(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Pick the first zone whose name matches any of `matchers`. */
function pickZone(
  rates: any[],
  matchers: RegExp[],
  usedIndexes: Set<number>
): { fee: number | null; label: string; index: number } | null {
  for (const matcher of matchers) {
    for (let i = 0; i < rates.length; i++) {
      if (usedIndexes.has(i)) continue;
      const zoneName = String(rates[i]?.zoneName ?? rates[i]?.zone_name ?? rates[i]?.name ?? '');
      if (!zoneName || !matcher.test(zoneName)) continue;
      const fee = toFee(rates[i]?.fee ?? rates[i]?.amount ?? rates[i]?.charge);
      if (fee === null) continue;
      return { fee, label: zoneName.trim(), index: i };
    }
  }
  return null;
}

/**
 * Resolve the inside/outside delivery charges for a product.
 *
 * Never throws: an unrecognised or absent configuration yields `null` fees and
 * `hasProductRates: false`, which tells the caller to fall back to the store's
 * COD configuration rather than showing a wrong number.
 */
export function resolveProductDeliveryRates(product: any): DeliveryRates {
  const empty: DeliveryRates = {
    insideFee: null,
    outsideFee: null,
    insideLabel: '',
    outsideLabel: '',
    hasProductRates: false,
  };
  if (!product || typeof product !== 'object') return empty;

  const rates = Array.isArray(product.deliveryRates)
    ? product.deliveryRates
    : Array.isArray(product.delivery_rates)
    ? product.delivery_rates
    : [];

  const used = new Set<number>();
  let insideFee: number | null = null;
  let outsideFee: number | null = null;
  let insideLabel = '';
  let outsideLabel = '';

  // 1. Prefer the named zone list — it is what the merchant actually typed.
  if (rates.length > 0) {
    const inside = pickZone(rates, INSIDE_MATCHERS, used);
    if (inside) {
      insideFee = inside.fee;
      insideLabel = inside.label;
      used.add(inside.index);
    }
    const outside = pickZone(rates, OUTSIDE_MATCHERS, used);
    if (outside) {
      outsideFee = outside.fee;
      outsideLabel = outside.label;
      used.add(outside.index);
    }

    // 2. Unnamed zones: fall back to POSITION. The form seeds the list with
    //    "Inside City" then "Outside City", so [0] is inside and [1] is outside.
    if (insideFee === null || outsideFee === null) {
      const remaining = rates
        .map((rate, index) => ({ rate, index }))
        .filter(({ index }) => !used.has(index));
      for (const { rate, index } of remaining) {
        const fee = toFee(rate?.fee ?? rate?.amount ?? rate?.charge);
        if (fee === null) continue;
        if (insideFee === null) {
          insideFee = fee;
          insideLabel = String(rate?.zoneName ?? rate?.zone_name ?? '').trim();
          used.add(index);
        } else if (outsideFee === null) {
          outsideFee = fee;
          outsideLabel = String(rate?.zoneName ?? rate?.zone_name ?? '').trim();
          used.add(index);
        } else {
          break;
        }
      }
    }
  }

  // 3. The explicit columns are the fallback (or fill a gap the list left).
  if (insideFee === null) {
    const explicit = toFee(product.inside_city_fee ?? product.insideCityFee);
    if (explicit !== null) insideFee = explicit;
  }
  if (outsideFee === null) {
    const explicit = toFee(product.outside_city_fee ?? product.outsideCityFee);
    if (explicit !== null) outsideFee = explicit;
  }

  return {
    insideFee,
    outsideFee,
    insideLabel,
    outsideLabel,
    hasProductRates: insideFee !== null || outsideFee !== null,
  };
}

/**
 * Does a city name count as "inside"?
 *
 * Defaults to inside when the city is unknown, matching the previous behaviour:
 * charging the cheaper fee is the safer failure mode for a merchant (it never
 * overcharges a customer).
 */
export function isInsideCity(city: unknown): boolean {
  const value = String(city ?? '').trim().toLowerCase();
  if (!value) return true;
  return value.includes('dhaka') || value.includes('inside') || value === 'city';
}

/**
 * Resolve the charge to apply for a given product + city.
 *
 * `storeInsideFee` / `storeOutsideFee` come from the store's COD configuration and
 * are used ONLY when the product stores no usable charge, so a product-specific
 * fee always wins while an unconfigured product still shows the store default.
 */
export function resolveDeliveryCharge(options: {
  product?: any;
  city?: unknown;
  storeInsideFee?: unknown;
  storeOutsideFee?: unknown;
}): { fee: number; source: 'product' | 'store' | 'none'; isInside: boolean; label: string } {
  const isInside = isInsideCity(options.city);
  const product = resolveProductDeliveryRates(options.product);

  const productFee = isInside ? product.insideFee : product.outsideFee;
  if (productFee !== null) {
    const label = isInside
      ? product.insideLabel || 'Inside City'
      : product.outsideLabel || 'Outside City';
    return { fee: productFee, source: 'product', isInside, label };
  }

  const storeFee = toFee(isInside ? options.storeInsideFee : options.storeOutsideFee);
  if (storeFee !== null) {
    return { fee: storeFee, source: 'store', isInside, label: isInside ? 'Inside City' : 'Outside City' };
  }

  return { fee: 0, source: 'none', isInside, label: isInside ? 'Inside City' : 'Outside City' };
}

/**
 * Read the delivery charges out of a product form's zone list, for persistence.
 *
 * Written to the product document as an explicit pair so a reader does not have
 * to interpret zone names, while `deliveryRates` keeps the full list.
 */
export function buildDeliveryFeeFields(
  rates: { zoneName?: string; fee?: number | string }[] | undefined
): { inside_city_fee: number; outside_city_fee: number; insideCityFee: number; outsideCityFee: number } {
  const resolved = resolveProductDeliveryRates({ deliveryRates: rates || [] });
  const inside = resolved.insideFee ?? 0;
  const outside = resolved.outsideFee ?? 0;
  return {
    inside_city_fee: inside,
    outside_city_fee: outside,
    insideCityFee: inside,
    outsideCityFee: outside,
  };
}

export default {
  resolveProductDeliveryRates,
  resolveDeliveryCharge,
  buildDeliveryFeeFields,
  isInsideCity,
  toFee,
};
