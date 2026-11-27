/**
 * ONE source of truth for how a product's discount is expressed.
 *
 * WHY THIS EXISTS
 * ---------------
 * The product form, the storefront card and the marketplace card each worked out
 * "is this on sale?" from a different pair of fields, so the same product could
 * show `SALE` with no percentage on one surface and `-10%` on another (or
 * nothing at all). The merchant form only writes `compareAtPriceBDT` when the
 * "promotional discount" checkbox happens to be ticked, so a product saved with
 * just a Discount amount had no compare-at price anywhere — and the marketplace
 * therefore had no percentage to display.
 *
 * The merchant form's pricing model is:
 *   • `priceBDT`            — the SELLING price the customer pays
 *   • `compareAtPriceBDT`   — the ORIGINAL (crossed-out) price, optional
 *   • `discountPriceBDT`    — the monetary discount deducted from the selling price
 *
 * A line-up price (what is struck through) is derived in this order:
 *   1. an explicit compare-at price, when it is genuinely higher;
 *   2. the implied original `sellingPrice + discountAmount` (because the discount
 *      is deducted from the selling price at checkout);
 *   3. the selling price itself → no discount.
 *
 * The percentage is rounded to a whole number (`Math.round`) and clamped to
 * 1–99 so a badge can never read `0%` / `100%` / `-5%` / `133%`.
 */

export interface ProductPricingInput {
  /** What the customer pays. */
  priceBDT?: unknown;
  /** The original ("compare at") price, when the merchant supplied one. */
  compareAtPriceBDT?: unknown;
  compare_at_price?: unknown;
  /** A monetary discount deducted from the selling price. */
  discountPriceBDT?: unknown;
  discount_price?: unknown;
  /** Two more spellings the API/storefront may carry. */
  discount?: unknown;
  sellingPrice?: unknown;
}

export interface ProductPricing {
  /** Effective selling price (never negative). */
  price: number;
  /** The price to strike through, or `null` when the product is not on sale. */
  compareAt: number | null;
  /** Whole-number percentage off (1–99), or `0` when there is no discount. */
  discountPercent: number;
  /** `true` exactly when a discount is active. */
  onSale: boolean;
  /** Ready-to-render label such as `10% OFF`, or `''` when not on sale. */
  label: string;
}

const toAmount = (value: unknown): number => {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Round a raw percentage to a clean 1–99 integer, or 0 when there is none. */
export function normalizeDiscountPercent(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(99, Math.max(1, Math.round(n)));
}

/** `10% OFF` — the single spelling used by every surface. */
export function discountLabel(percent: unknown): string {
  const p = normalizeDiscountPercent(percent);
  return p > 0 ? `${p}% OFF` : '';
}

/**
 * Resolve a product's pricing into `{ price, compareAt, discountPercent }`.
 *
 * Never throws and never returns a negative price: a malformed record simply
 * reports "no discount" instead of breaking the card it is rendered on.
 */
export function resolveProductPricing(input: ProductPricingInput | null | undefined): ProductPricing {
  const raw = input || {};
  const price = toAmount(raw.priceBDT ?? raw.sellingPrice);
  const explicitCompare = toAmount(raw.compareAtPriceBDT ?? raw.compare_at_price);
  const discountAmount = toAmount(raw.discountPriceBDT ?? raw.discount_price ?? raw.discount);

  if (price <= 0) {
    return { price: 0, compareAt: null, discountPercent: 0, onSale: false, label: '' };
  }

  // 1. An explicit compare-at price wins when it is genuinely higher.
  if (explicitCompare > price) {
    const percent = normalizeDiscountPercent(((explicitCompare - price) / explicitCompare) * 100);
    return {
      price,
      compareAt: explicitCompare,
      discountPercent: percent,
      onSale: percent > 0,
      label: discountLabel(percent),
    };
  }

  /*
   * 2. NO COMPARE-AT PRICE → the money discount implies the original price.
   *
   * The form deducts `discountPriceBDT` from the selling price at checkout, so
   * `selling + discount` is the "before" price the customer is being shown.
   * Treating it as such is what makes a plain Discount amount produce a real
   * percentage instead of silently showing nothing.
   */
  if (discountAmount > 0 && discountAmount < price) {
    const impliedOriginal = price + discountAmount;
    const percent = normalizeDiscountPercent((discountAmount / impliedOriginal) * 100);
    if (percent > 0) {
      return {
        price,
        compareAt: Math.round(impliedOriginal),
        discountPercent: percent,
        onSale: true,
        label: discountLabel(percent),
      };
    }
  }

  return { price, compareAt: null, discountPercent: 0, onSale: false, label: '' };
}
