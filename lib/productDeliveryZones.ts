/**
 * Per-product delivery zones and fees — the single source of truth shared by
 * the product Add/Edit form, the API (which validates what it stores) and the
 * storefront checkout (which prices the cart).
 *
 * WHY A SEPARATE MODULE
 * ---------------------
 * Before this existed the product form offered a free-text zone list ("Inside
 * Dhaka", "Chattogram", …) and three different readers each guessed which entry
 * meant "inside" / "sub" / "outside" with their own regexes. A merchant could
 * type a zone name no reader recognised, the product saved happily, and the
 * checkout then quoted the STORE rate instead of the product's — which is the
 * customer-visible symptom of "my product shipping fee does nothing".
 *
 * Now the zones are a fixed, ordered set (`inside`, `sub`, `outside`), the form
 * renders exactly those, and every reader resolves a product's rates through
 * {@link resolveZoneRates}. Extra zones the merchant kept from the old free-text
 * form are still honoured (they are matched by name), but the three canonical
 * zones always win and are always present.
 *
 * This module is dependency-free and never throws, so it is safe to import from
 * the Express server bundle as well as the browser bundle.
 */

/** The delivery zones a product (and a store) prices. */
export type DeliveryZoneKey = 'inside' | 'sub' | 'outside';

/**
 * The canonical zones, in the order they are shown in the form and priced.
 * `required: true` means the merchant CANNOT save/publish the product without
 * a fee for it.
 */
export interface DeliveryZoneDefinition {
  key: DeliveryZoneKey;
  /** The zone name stored in `deliveryRates[].zoneName` and shown to customers. */
  label: string;
  /** Short helper text under the fee input in the product form. */
  hint: string;
  /** Customer-facing zone name used in the checkout breakdown. */
  checkoutLabel: string;
  /** True for the zones the form enforces (Inside + Outside). */
  required: boolean;
  /** Legacy names that also map onto this zone (old saved products). */
  legacyNames: readonly string[];
}

export const PRODUCT_DELIVERY_ZONES: readonly DeliveryZoneDefinition[] = [
  {
    key: 'inside',
    label: 'Inside City',
    hint: 'Dhaka metro / your own city — courier city rate.',
    checkoutLabel: 'Inside City',
    required: true,
    legacyNames: ['inside dhaka', 'inside city', 'inside', 'within city', 'city'],
  },
  {
    key: 'sub',
    label: 'Sub-Dhaka / Suburbs',
    hint: 'Optional separate rate for Keraniganj, Savar, Tongi, Demra, Uttarkhan, Rupganj, …',
    checkoutLabel: 'Sub-Dhaka / Suburbs',
    required: false, // Sub stays optional: an unpriced Sub zone falls back to Inside fee.
    legacyNames: [
      'sub dhaka', 'sub-dhaka', 'subdhaka', 'suburbs', 'dhaka suburbs',
      'sub dhaka / suburbs', 'sub-dhaka / suburbs', 'suburban',
    ],
  },
  {
    key: 'outside',
    label: 'Outside City',
    hint: 'All other districts — courier upazila rate.',
    checkoutLabel: 'Outside City',
    required: true,
    legacyNames: ['outside dhaka', 'outside city', 'outside', 'other districts', 'other'],
  },
];

/** The zones a product MUST price before it can be saved. */
export const REQUIRED_PRODUCT_ZONES: readonly DeliveryZoneKey[] =
  PRODUCT_DELIVERY_ZONES.filter((zone) => zone.required).map((zone) => zone.key);

/** Look up a zone definition by key. */
export function zoneDefinition(key: DeliveryZoneKey): DeliveryZoneDefinition {
  return PRODUCT_DELIVERY_ZONES.find((zone) => zone.key === key) ?? PRODUCT_DELIVERY_ZONES[0];
}

/** Normalise a zone name for comparison: lowercase, punctuation folded away. */
function zoneKeyOf(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*\/\s*/g, ' / ');
}

/** The canonical zone a merchant-typed zone name belongs to, or null. */
export function classifyZoneName(zoneName: unknown): DeliveryZoneKey | null {
  const name = zoneKeyOf(zoneName);
  if (!name) return null;

  // Sub-Dhaka is tested FIRST: its name contains "dhaka", which the inside
  // matchers would otherwise claim as the core metropolitan rate.
  for (const zone of PRODUCT_DELIVERY_ZONES) {
    if (zone.key !== 'sub') continue;
    if (zone.legacyNames.includes(name)) return 'sub';
    if (/sub\s*[\-/]?\s*dhaka|suburb/.test(name)) return 'sub';
  }
  for (const zone of PRODUCT_DELIVERY_ZONES) {
    if (zone.key === 'sub') continue;
    if (zone.legacyNames.includes(name)) return zone.key;
  }
  if (/\boutside\b|out of|other district|upazila/.test(name)) return 'outside';
  if (/\binside\b|within|metro|\bcity\b|^dhaka$/.test(name)) return 'inside';
  return null;
}

/** A single stored zone rate, in either of the shapes the app has used. */
export interface StoredZoneRate {
  zoneName?: string;
  zone_name?: string;
  name?: string;
  fee?: number | string | null;
  amount?: number | string | null;
  charge?: number | string | null;
}

/** A fully resolved per-product fee table. `null` = the merchant never priced it. */
export interface ZoneFeeTable {
  inside: number | null;
  sub: number | null;
  outside: number | null;
}

/** Coerce a stored fee to a non-negative finite number, or null. */
export function toZoneFee(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Read the fee out of a stored rate regardless of its key spelling. */
export function zoneRateFee(rate: StoredZoneRate | null | undefined): number | null {
  if (!rate || typeof rate !== 'object') return null;
  return toZoneFee(rate.fee ?? rate.amount ?? rate.charge);
}

/** Read the name out of a stored rate regardless of its key spelling. */
export function zoneRateName(rate: StoredZoneRate | null | undefined): string {
  if (!rate || typeof rate !== 'object') return '';
  return String(rate.zoneName ?? rate.zone_name ?? rate.name ?? '').trim();
}

/**
 * Resolve a stored zone list (plus optional explicit columns) into one fee per
 * canonical zone.
 *
 * Order of authority, identical everywhere:
 *   1. A `deliveryRates` entry whose NAME maps onto a canonical zone.
 *   2. An explicit `inside_city_fee` / `sub_dhaka_fee` / `outside_city_fee`.
 *   3. Positional order — the form has always seeded the list inside → outside,
 *      so an unnamed legacy entry keeps its meaning.
 *
 * Unpriced zones stay `null`; they are NEVER fabricated as ৳0.
 */
export function resolveZoneRates(
  rates: StoredZoneRate[] | null | undefined,
  explicit?: {
    inside?: unknown;
    sub?: unknown;
    outside?: unknown;
  },
): ZoneFeeTable {
  const table: ZoneFeeTable = { inside: null, sub: null, outside: null };
  const list = Array.isArray(rates) ? rates : [];
  const claimed = new Set<number>();

  // 1. Named zones.
  list.forEach((rate, index) => {
    const key = classifyZoneName(zoneRateName(rate));
    if (!key || table[key] !== null) return;
    const fee = zoneRateFee(rate);
    if (fee === null) return;
    table[key] = fee;
    claimed.add(index);
  });

  // 2. Explicit columns fill any gap.
  const explicitInside = toZoneFee(explicit?.inside);
  const explicitSub = toZoneFee(explicit?.sub);
  const explicitOutside = toZoneFee(explicit?.outside);
  if (table.inside === null && explicitInside !== null) table.inside = explicitInside;
  if (table.sub === null && explicitSub !== null) table.sub = explicitSub;
  if (table.outside === null && explicitOutside !== null) table.outside = explicitOutside;

  // 3. Positional fallback for UNNAMED legacy entries (inside, then outside).
  const unnamed = list
    .map((rate, index) => ({ rate, index }))
    .filter(({ rate, index }) => !claimed.has(index) && !classifyZoneName(zoneRateName(rate)));
  for (const { rate, index } of unnamed) {
    const fee = zoneRateFee(rate);
    if (fee === null) continue;
    if (table.inside === null) {
      table.inside = fee;
    } else if (table.outside === null) {
      table.outside = fee;
    } else {
      break;
    }
    claimed.add(index);
  }

  return table;
}

/**
 * Build the canonical zone list to STORE for a product.
 *
 * Always returns all three zones in canonical order and with the canonical
 * names, so the stored document is self-describing. Zones the merchant did not
 * price are kept with an EMPTY fee and the caller decides whether that is
 * allowed ({@link findMissingRequiredZones}).
 *
 * Any extra custom zone the merchant kept is appended after the canonical ones,
 * so nothing is lost.
 */
export function buildCanonicalZoneRates(
  rates: StoredZoneRate[] | null | undefined,
  explicit?: { inside?: unknown; sub?: unknown; outside?: unknown },
): Array<{ zoneName: string; fee: number | null }> {
  const list = Array.isArray(rates) ? rates : [];
  const table = resolveZoneRates(list, explicit);

  const canonical = PRODUCT_DELIVERY_ZONES.map((zone) => ({
    zoneName: zone.label,
    fee: table[zone.key],
  }));

  const extras: Array<{ zoneName: string; fee: number | null }> = [];
  for (const rate of list) {
    const name = zoneRateName(rate);
    if (!name) continue;
    if (classifyZoneName(name)) continue; // already covered by a canonical slot
    const fee = zoneRateFee(rate);
    if (fee === null) continue;
    extras.push({ zoneName: name, fee });
  }

  return [...canonical, ...extras];
}

/**
 * Which REQUIRED zones still have no fee?
 *
 * This is the rule the product form enforces before saving and that the API
 * re-checks before it persists a product, so a product can never reach the
 * storefront with an unpriceable delivery cost.
 */
export function findMissingRequiredZones(
  table: ZoneFeeTable,
): Array<{ key: DeliveryZoneKey; label: string }> {
  return PRODUCT_DELIVERY_ZONES
    .filter((zone) => zone.required && table[zone.key] === null)
    .map((zone) => ({ key: zone.key, label: zone.label }));
}

/**
 * Human-readable validation message for the missing zones, e.g.
 * "Delivery fee is required for: Inside City, Outside City."
 */
export function describeMissingZones(
  missing: Array<{ key: DeliveryZoneKey; label: string }>,
): string {
  if (missing.length === 0) return '';
  return `Delivery fee is required for: ${missing.map((zone) => zone.label).join(', ')}.`;
}

/** Map a zone key onto the checkout's resolver argument. */
export function zoneToChargeArea(key: DeliveryZoneKey): 'inside' | 'sub' | 'outside' {
  return key;
}

export default {
  PRODUCT_DELIVERY_ZONES,
  REQUIRED_PRODUCT_ZONES,
  zoneDefinition,
  classifyZoneName,
  toZoneFee,
  zoneRateFee,
  zoneRateName,
  resolveZoneRates,
  buildCanonicalZoneRates,
  findMissingRequiredZones,
  describeMissingZones,
  zoneToChargeArea,
};
