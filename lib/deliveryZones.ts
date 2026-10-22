/**
 * Bangladesh delivery zones — the single source of truth for "is this order
 * inside the merchant's city or outside it?".
 *
 * THE PROBLEM
 * -----------
 * The checkout used to let the customer pick the delivery zone ("Inside City"
 * vs "Outside City") with no link to where they actually live. A customer in
 * Khulna could tick "Inside City" and pay the cheaper merchant-defined fee —
 * i.e. cheat the delivery charge. The zone has to be derived from the city
 * the customer typed, and the merchant's own base city had to be known.
 *
 * THE RULE
 * --------
 *   • The merchant configures ONE base city (their store location).
 *   • Customer picks their city / district.
 *   • Base city      → "Inside City" is allowed, "Outside City" is BLOCKED.
 *   • Any other city → "Outside City" is forced, "Inside City" is BLOCKED.
 *
 * WHY A SEPARATE MODULE
 * ---------------------
 * Both the Express server (which assembles the storefront payload) and the
 * React checkout (which renders the zone picker) need the SAME district list
 * and the SAME matching rule — if they disagreed, the customer would see a
 * zone the server never enforces. It lives in `lib/` because Vercel ships
 * `lib/` with the serverless function, and the browser bundle imports it the
 * same way `src/lib/storeData.ts` already imports `lib/galleryDefaults`.
 *
 * This module is dependency-free and never throws.
 */

/**
 * The 64 districts of Bangladesh, in their official spellings.
 *
 * Used for the checkout's "City / District" dropdown. Alias spellings used
 * elsewhere in the app ("Chittagong", "Comilla", "Barisal", "Jessore",
 * "Bogra") are normalised to the official name by {@link normalizeCityName},
 * so a merchant whose address says "Chittagong" still matches a customer who
 * picks "Chattogram" — and vice versa.
 */
export const BANGLADESH_DISTRICTS: readonly string[] = [
  'Bagerhat',
  'Bandarban',
  'Barguna',
  'Barishal',
  'Bhola',
  'Bogura',
  'Brahmanbaria',
  'Chandpur',
  'Chapainawabganj',
  'Chattogram',
  'Chuadanga',
  'Cox\'s Bazar',
  'Cumilla',
  'Dhaka',
  'Dinajpur',
  'Faridpur',
  'Feni',
  'Gaibandha',
  'Gopalganj',
  'Habiganj',
  'Jamalpur',
  'Jashore',
  'Jenaidah',
  'Jhalakathi',
  'Joypurhat',
  'Karishmarganj',
  'Khagrachhari',
  'Khulna',
  'Kishoreganj',
  'Kushtia',
  'Lakshmipur',
  'Lalmonirhat',
  'Larkana',
  'Madaripur',
  'Magura',
  'Manikganj',
  'Meherpur',
  'Moulvibazar',
  'Munshiganj',
  'Naogaon',
  'Narail',
  'Narayanganj',
  'Narsingdi',
  'Natore',
  'Netrokona',
  'Nilphamari',
  'Noakhali',
  'Pabna',
  'Panchagarh',
  'Patuakhali',
  'Pirojpur',
  'Rajbari',
  'Rajshahi',
  'Rangpur',
  'Satkhira',
  'Shariatpur',
  'Sherpur',
  'Shibganj',
  'Sirajganj',
  'Sunamganj',
  'Sylhet',
  'Tangail',
  'Thakurgaon',
];

/**
 * Alternative spellings that mean the SAME district.
 *
 * Bangladesh renamed several districts (Chittagong→Chattogram,
 * Comilla→Cumilla, Barisal→Barishal, Jessore→Jashore, Bogra→Bogura,
 * Jhenidah→Jenaidah). Both spellings are in active use on shop addresses, so
 * both must resolve to one canonical key or the merchant's base city would
 * never match the customer's district.
 */
const CITY_ALIASES: Record<string, string> = {
  chittagong: 'chattogram',
  comilla: 'cumilla',
  barisal: 'barishal',
  jessore: 'jashore',
  bogra: 'bogura',
  jhenaidah: 'jenaidah',
};

/**
 * Trailing administrative qualifiers that carry no extra meaning for the
 * zone decision: "Dhaka District", "Dhaka City", "Dhaka Division".
 */
const CITY_SUFFIXES = /\s+(district|division|city|upazila|zilla)$/i;

/**
 * Reduce a city / district name to a comparable key.
 *
 * Lower-cases, drops punctuation, strips a trailing qualifier ("Dhaka
 * District" → "dhaka") and folds the known alias spellings onto one canonical
 * key. Returns '' for anything empty so callers can treat "unknown" as falsy.
 */
export function normalizeCityName(value: unknown): string {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return '';
  const withoutSuffix = raw.replace(CITY_SUFFIXES, '').trim();
  const compact = withoutSuffix.replace(/[^a-z0-9]/g, '');
  if (!compact) return '';
  return CITY_ALIASES[compact] || compact;
}

/**
 * Find a Bangladesh district mentioned ANYWHERE inside a free-text value.
 *
 * The merchant's base city is usually stored as a full address
 * ("House 12, Banani, Dhaka-1211"), so the district has to be extracted from
 * the string rather than read as a field. Longest district names are tested
 * first so "Brahmanbaria" is never mis-detected as "Barishal".
 */
export function findCityInText(value: unknown): string {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return '';
  const compact = raw.replace(/[^a-z0-9]+/g, '');
  if (!compact) return '';

  const needles = BANGLADESH_DISTRICTS
    .map((district) => ({ district, key: normalizeCityName(district) }))
    // Longest first — the most specific district wins.
    .sort((a, b) => b.key.length - a.key.length);

  for (const { district, key } of needles) {
    if (key.length >= 4 && compact.includes(key)) return district;
  }
  return '';
}

/**
 * Field names a store record may use for the merchant's base city.
 * Canonical first, legacy spellings afterwards.
 */
const BASE_CITY_KEYS = [
  'baseCity',
  'base_city',
  'storeCity',
  'store_city',
  'businessCity',
  'business_city',
  'district',
  'district_name',
  'districtName',
  'city',
] as const;

/**
 * Field names that may hold a free-text address containing the base city.
 */
const BASE_CITY_ADDRESS_KEYS = [
  'pickupAddress',
  'pickup_address',
  'storeAddress',
  'store_address',
  'businessAddress',
  'business_address',
  'address',
] as const;

/**
 * Resolve the merchant's BASE CITY from whichever store record shape is at
 * hand.
 *
 * Order of authority:
 *   1. An explicit base-city field (`baseCity` / `base_city` / …).
 *   2. The district mentioned in the store's address fields.
 *
 * A value that is a single word ("Dhaka") is returned verbatim so the
 * merchant's own spelling is what the customer sees. A multi-word value is
 * treated as an address and scanned for a district.
 *
 * Returns '' when nothing could be resolved — the caller then leaves both
 * delivery zones available instead of guessing.
 */
export function resolveMerchantBaseCity(
  ...sources: Array<Record<string, any> | null | undefined>
): string {
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;

    for (const key of BASE_CITY_KEYS) {
      const raw = source[key];
      if (raw === null || raw === undefined) continue;
      const text = String(raw).trim();
      if (!text) continue;
      // A plain name (no separators, no digits) is the city itself.
      if (!/[,/|]/.test(text) && !/\d/.test(text)) {
        if (normalizeCityName(text)) return text;
      }
      // Otherwise it may still name a district inside a longer phrase.
      const found = findCityInText(text);
      if (found) return found;
    }

    for (const key of BASE_CITY_ADDRESS_KEYS) {
      const raw = source[key];
      if (raw === null || raw === undefined) continue;
      const found = findCityInText(raw);
      if (found) return found;
    }
  }
  return '';
}

/** The two delivery zones a merchant prices. */
export type DeliveryZone = 'inside' | 'outside';

/** The outcome of the city → zone decision. */
export interface DeliveryZoneResolution {
  /** The zone that MUST be used for this city. */
  zone: DeliveryZone;
  /** Whether the customer may pick "Inside City". */
  insideAllowed: boolean;
  /** Whether the customer may pick "Outside City". */
  outsideAllowed: boolean;
  /** True when the selected city IS the merchant's base city. */
  isBaseCity: boolean;
  /** True when the merchant actually configured a base city. */
  hasBaseCity: boolean;
}

/**
 * Decide which delivery zone applies for a customer city.
 *
 *   • No base city configured → both zones stay available (the merchant has
 *     not told us where they are, so we must not guess a fee).
 *   • No city selected yet   → both zones stay available; the checkout
 *     re-evaluates the moment the customer picks a district.
 *   • Customer city == base city → "Inside City" allowed, "Outside City"
 *     blocked.
 *   • Any other city → "Outside City" forced, "Inside City" blocked.
 */
export function resolveDeliveryZoneForCity(options: {
  city?: unknown;
  baseCity?: unknown;
}): DeliveryZoneResolution {
  const baseCity = String(options.baseCity ?? '').trim();
  const city = String(options.city ?? '').trim();
  const hasBaseCity = Boolean(baseCity) && Boolean(normalizeCityName(baseCity));

  if (!hasBaseCity) {
    return {
      zone: 'inside',
      insideAllowed: true,
      outsideAllowed: true,
      isBaseCity: false,
      hasBaseCity: false,
    };
  }

  if (!city) {
    return {
      zone: 'inside',
      insideAllowed: true,
      outsideAllowed: true,
      isBaseCity: false,
      hasBaseCity: true,
    };
  }

  const isBaseCity = normalizeCityName(city) === normalizeCityName(baseCity);
  return isBaseCity
    ? {
        zone: 'inside',
        insideAllowed: true,
        outsideAllowed: false,
        isBaseCity: true,
        hasBaseCity: true,
      }
    : {
        zone: 'outside',
        insideAllowed: false,
        outsideAllowed: true,
        isBaseCity: false,
        hasBaseCity: true,
      };
}

/**
 * The zone options to render, with the blocked one flagged so the UI can
 * disable it and explain why.
 */
export function buildDeliveryZoneOptions(
  resolution: DeliveryZoneResolution,
): Array<{ value: DeliveryZone; allowed: boolean; forced: boolean }> {
  return (['inside', 'outside'] as const).map((value) => ({
    value,
    allowed: value === 'inside' ? resolution.insideAllowed : resolution.outsideAllowed,
    forced: resolution.hasBaseCity && resolution.zone === value,
  }));
}

export default {
  BANGLADESH_DISTRICTS,
  normalizeCityName,
  findCityInText,
  resolveMerchantBaseCity,
  resolveDeliveryZoneForCity,
  buildDeliveryZoneOptions,
};
