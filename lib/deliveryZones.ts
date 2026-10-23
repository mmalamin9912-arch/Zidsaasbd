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
 *   • Customer picks their city / district, then the area inside it.
 *   • A Sub-Dhaka area  → "Sub-Dhaka / Suburbs" (checked first, see
 *                         {@link SUB_DHAKA_AREAS}).
 *   • Base city         → "Inside City" is allowed, other zones BLOCKED.
 *   • Any other city    → "Outside City" is forced, "Inside City" is BLOCKED.
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
 * City / Area / Thana / Upazila options per district.
 *
 * The checkout's FIRST dropdown picks the district; the SECOND one lists only
 * the areas of that district. Dhaka is listed exhaustively (thanas + the
 * well-known residential areas couriers actually deliver to) because that is
 * where most Bangladeshi online orders go, and where a non-serviceable area is
 * most likely to slip through. The other 63 districts use their upazila names,
 * which is what a courier zone sheet is keyed on.
 *
 * Areas are plain strings so they round-trip through Supabase/Mongo unchanged.
 * A district missing from this map gets a free-text area field on the checkout,
 * so the customer is never blocked from ordering.
 */
export const BANGLADESH_DISTRICT_AREAS: Record<string, readonly string[]> = {
  Dhaka: [
    'Adabor', 'Badda', 'Banani', 'Bangshal', 'Cantonment', 'Chawkbazar',
    'Dakshinkhan', 'Darus Salam', 'Demra', 'Dhanmondi', 'Gendaria',
    'Gulshan', 'Hazaribagh', 'Jatrabari', 'Kadamtali', 'Kafrul',
    'Kalabagan', 'Kamrangirchar', 'Khilgaon', 'Khilkhet', 'Kotwali',
    'Lalbagh', 'Mirpur', 'Mohammadpur', 'Motijheel', 'Mugda', 'New Market',
    'Pallabi', 'Paltan', 'Ramna', 'Rampura', 'Sabujbagh', 'Shahbagh',
    'Shah Ali', 'Sher-e-Bangla Nagar', 'Shyampur', 'Sutrapur', 'Tejgaon',
    'Turag', 'Uttara', 'Vatara',
    // Popular residential / commercial areas customers search by name.
    'Bashundhara R/A', 'Baridhara', 'Banasree', 'Aftabnagar', 'Baily Road',
    'Farmgate', 'Green Road', 'Karwan Bazar', 'Malibagh', 'Manikdi',
    'Moghbazar', 'Nadda', 'Nikunja', 'Rayer Bazar', 'Shyamoli', 'Siddheshwari',
    // ── Sub-Dhaka / Dhaka suburbs ──────────────────────────────────────────
    // Dhaka DISTRICT but outside the metropolitan thanas. Listed here so the
    // customer picks them under Dhaka instead of hunting for the Gazipur /
    // Narayanganj district; `isSubDhakaArea` prices every one of them as
    // "Sub-Dhaka / Suburbs", never the core metropolitan rate.
    'Uttarkhan', 'Southkhan', 'Keraniganj', 'Savar', 'Ashulia', 'Dhamrai',
    'Dohar', 'Tongi', 'Rupganj', 'Siddhirganj',
  ],
  Chattogram: [
    'Anwara', 'Banshkhali', 'Bayezid', 'Boalkhali', 'Chandanaish', 'Chandgaon',
    'Double Mooring', 'Fatikchhari', 'Halishahar', 'Hathazari', 'Kotwali',
    'Lohagara', 'Mirsharai', 'Pahartali', 'Panchlaish', 'Patiya', 'Patenga',
    'Rangunia', 'Raozan', 'Sandwip', 'Satkania', 'Sitakunda',
  ],
  Khulna: [
    'Batiaghata', 'Dacope', 'Daulatpur', 'Dighalia', 'Dumuria', 'Khalishpur',
    'Khan Jahan Ali', 'Koyra', 'Paikgachha', 'Phultala', 'Rupsha',
    'Sonadanga', 'Terokhada',
  ],
  Rajshahi: [
    'Bagha', 'Bagmara', 'Boalia', 'Charghat', 'Durgapur', 'Godagari',
    'Matihar', 'Mohanpur', 'Paba', 'Puthia', 'Rajpara', 'Shah Makhdum', 'Tanore',
  ],
  Sylhet: [
    'Balaganj', 'Beanibazar', 'Bishwanath', 'Companiganj', 'Dakshin Surma',
    'Fenchuganj', 'Golapganj', 'Gowainghat', 'Jaintiapur', 'Kanaighat',
    'Osmani Nagar', 'Sylhet Sadar', 'Zakiganj',
  ],
  Barishal: [
    'Agailjhara', 'Babuganj', 'Bakerganj', 'Banaripara', 'Barishal Sadar',
    'Gaurnadi', 'Hizla', 'Mehendiganj', 'Muladi', 'Wazirpur',
  ],
  Rangpur: [
    'Badarganj', 'Gangachara', 'Kaunia', 'Mithapukur', 'Pirgacha', 'Rangpur Sadar',
    'Pirganj', 'Taraganj',
  ],
  Mymensingh: [
    'Bhaluka', 'Dhobaura', 'Fulbaria', 'Gaffargaon', 'Gauripur', 'Haluaghat',
    'Ishwarganj', 'Muktagachha', 'Mymensingh Sadar', 'Nandail', 'Phulpur',
    'Tarakanda', 'Trishal',
  ],
  Cumilla: [
    'Adarsha Sadar', 'Barura', 'Brahmanpara', 'Burichang', 'Chandina', 'Chauddagram',
    'Daudkandi', 'Debidwar', 'Homna', 'Laksam', 'Meghna', 'Monohorgonj',
    'Muradnagar', 'Nangalkot', 'Sadar Dakshin', 'Titas',
  ],
  Narayanganj: [
    'Araihazar', 'Bandar', 'Narayanganj Sadar', 'Rupganj', 'Sonargaon', 'Siddhirganj',
    'Fatullah', 'Kanchpur',
  ],
  Gazipur: [
    'Gazipur Sadar', 'Kaliakair', 'Kaliganj', 'Kapasia', 'Sreepur', 'Tongi',
  ],
  Bogura: [
    'Adamdighi', 'Bogura Sadar', 'Dhunat', 'Dhupchanchia', 'Gabtali', 'Kahaloo',
    'Nandigram', 'Sariakandi', 'Shajahanpur', 'Sherpur', 'Shibganj', 'Sonatola',
  ],
  Jashore: [
    'Abhaynagar', 'Bagherpara', 'Chaugachha', 'Jhikargachha', 'Keshabpur',
    'Jashore Sadar', 'Manirampur', 'Sharsha',
  ],
  Dinajpur: [
    'Birampur', 'Birganj', 'Biral', 'Bochaganj', 'Chirirbandar', 'Phulbari',
    'Ghoraghat', 'Hakimpur', 'Kaharole', 'Khansama', 'Dinajpur Sadar', 'Nawabganj', 'Parbatipur',
  ],
  "Cox's Bazar": [
    'Chakaria', "Cox's Bazar Sadar", 'Kutubdia', 'Maheshkhali', 'Ramu',
    'Teknaf', 'Ukhia', 'Pekua',
  ],
};

/**
 * The areas / thanas / upazilas of a district (empty when unknown).
 *
 * Matching is alias-aware (`Chittagong` finds the `Chattogram` list) so the
 * second dropdown is populated no matter which spelling the customer's
 * district was saved under.
 */
export function getDistrictAreas(district: unknown): string[] {
  const raw = String(district ?? '').trim();
  if (!raw) return [];
  for (const [name, areas] of Object.entries(BANGLADESH_DISTRICT_AREAS)) {
    if (normalizeCityName(name) === normalizeCityName(raw)) return [...areas];
  }
  return [];
}

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

/**
 * The delivery zones a merchant prices.
 *
 *   inside  — Dhaka metropolitan thanas that a courier treats as city delivery.
 *   sub     — "Sub-Dhaka / Dhaka Suburbs": areas that are administratively
 *             OUTSIDE Dhaka city (Keraniganj, Savar, Tongi, Rupganj, …) but are
 *             close enough that couriers quote a rate between inside and the
 *             64-district rate. Priced separately by the merchant.
 *   outside — everywhere else in Bangladesh.
 */
export type DeliveryZone = 'inside' | 'sub' | 'outside';

/**
 * Every non-metropolitan area a courier treats as "Sub-Dhaka / Dhaka Suburbs".
 *
 * These were previously lumped into core "Inside City" whenever the customer
 * picked the district `Dhaka` — an Uttarkhan delivery was quoted the metropolitan
 * rate even though the courier drives well past the city boundary. Each entry is
 * normalised with {@link normalizeCityName}, so "Keraniganj", "Keranigonj" and
 * "Keraniganj Sadar" all resolve to the same key.
 *
 * The list deliberately uses the names that appear in a courier zone sheet, the
 * postal address and the checkout's own area dropdown. A few heavily-ordered
 * neighbouring areas (Tongi, Rupganj, Siddhirganj, Sonargaon) are included even
 * though they sit in Gazipur / Narayanganj district, because couriers bill them
 * as Dhaka suburbs.
 */
export const SUB_DHAKA_AREAS: readonly string[] = [
  // Dhaka district — outskirts, outside the core metropolitan thanas
  'Kamrangirchar', 'Keraniganj', 'Keranigonj', 'Savar', 'Ashulia', 'Dhamrai',
  'Dohar', 'Uttarkhan', 'Southkhan', 'Dakshinkhan', 'Demra', 'Narayanganj',
  // Suburban / commuter belt billed as Dhaka suburbs by the couriers
  'Tongi', 'Rupganj', 'Siddhirganj', 'Fatullah', 'Kanchpur', 'Sonargaon',
  'Araihazar', 'Bandar', 'Gazipur Sadar', 'Kaliakair', 'Sreepur', 'Kapasia',
  'Kaliganj',
];

/**
 * Spellings that mean the SAME sub-urban area.
 *
 * Folded onto one canonical key so free text, a legacy order and the dropdown
 * all agree: "Keranigonj" → keraniganj, "Uttor Khan" → uttarkhan, …
 */
const SUB_AREA_ALIASES: Record<string, string> = {
  keranigonj: 'keraniganj',
  keranigong: 'keraniganj',
  southkhansadar: 'southkhan',
  northkhan: 'uttarkhan',
  utorkhan: 'uttarkhan',
  ashuliasadar: 'ashulia',
  narayangonj: 'narayanganj',
  gazipursadar: 'gazipursadar',
};

/**
 * Canonical keys of {@link SUB_DHAKA_AREAS}, for O(1) matching.
 *
 * Built lazily (and memoised) rather than at module load so this module never
 * depends on the declaration order of `normalizeCityName` — a module-level
 * `new Set(SUB_DHAKA_AREAS.map(normalizeCityName))` would hit the const's TDZ
 * when the file is evaluated top-to-bottom.
 */
let subDhakaKeysCache: ReadonlySet<string> | null = null;
function subDhakaKeys(): ReadonlySet<string> {
  if (!subDhakaKeysCache) {
    subDhakaKeysCache = new Set(
      SUB_DHAKA_AREAS.map((area) => normalizeCityName(area)).filter(Boolean),
    );
  }
  return subDhakaKeysCache;
}

/**
 * Is this area / thana one of the Sub-Dhaka (Dhaka suburbs) delivery zones?
 *
 * Matching is exact-after-normalisation (deliberately NOT substring matching:
 * "Uttara Sector 7" must stay core, while "Uttarkhan" must be suburban). A
 * trailing qualifier — "Savar Sadar", "Tongi Municipal Area", "Keraniganj,
 * Dhaka" — is tolerated by testing the first word-stem as well.
 */
export function isSubDhakaArea(area: unknown): boolean {
  const keys = subDhakaKeys();
  const key = normalizeCityName(area);
  if (!key) return false;
  const canonical = SUB_AREA_ALIASES[key] || key;
  if (keys.has(canonical)) return true;

  // "Savar Sadar" / "Keraniganj Dhaka" — drop trailing administrative words
  // and retry, so a qualified spelling still lands on its zone.
  const condensed = canonical.replace(/(sadar|municipality|municipal|pouroshova|union|city)$/, '');
  if (condensed && condensed !== canonical) {
    const alias = SUB_AREA_ALIASES[condensed] || condensed;
    if (keys.has(alias)) return true;
  }
  return false;
}

/** The outcome of the city → zone decision. */
export interface DeliveryZoneResolution {
  /** The zone that MUST be used for this city / area. */
  zone: DeliveryZone;
  /** Whether the customer may pick "Inside City". */
  insideAllowed: boolean;
  /** Whether the customer may pick "Sub-Dhaka / Suburbs". */
  subAllowed: boolean;
  /** Whether the customer may pick "Outside City". */
  outsideAllowed: boolean;
  /** True when the selected city IS the merchant's base city. */
  isBaseCity: boolean;
  /** True when the merchant actually configured a base city. */
  hasBaseCity: boolean;
  /** True when the selected AREA classifies as a Sub-Dhaka / suburb zone. */
  isSubDhaka: boolean;
}

/**
 * Decide which delivery zone applies for a customer city.
 *
 *   • No base city configured → all zones stay available (the merchant has
 *     not told us where they are, so we must not guess a fee).
 *   • No city selected yet   → all zones stay available; the checkout
 *     re-evaluates the moment the customer picks a district / area.
 *   • A Sub-Dhaka area (Kamrangirchar, Savar, Tongi, …) → "Sub-Dhaka /
 *     Suburbs" is FORCED, whatever district it is filed under. This is
 *     checked FIRST so a Savar customer can never be quoted the core
 *     metropolitan rate.
 *   • Customer city == base city → "Inside City" allowed, the others blocked.
 *   • Any other city → "Outside City" forced, "Inside City" blocked.
 *
 * `area` is the City / Area / Thana the customer picked inside the district.
 * It is what turns "inside Dhaka" into "Sub-Dhaka" for a suburban thana.
 */
export function resolveDeliveryZoneForCity(options: {
  city?: unknown;
  area?: unknown;
  baseCity?: unknown;
}): DeliveryZoneResolution {
  const baseCity = String(options.baseCity ?? '').trim();
  const city = String(options.city ?? '').trim();
  const area = String(options.area ?? '').trim();
  const hasBaseCity = Boolean(baseCity) && Boolean(normalizeCityName(baseCity));
  // An area from ANY district is checked, so a customer who picks Gazipur →
  // Tongi (or Narayanganj → Rupganj) is priced as a Dhaka suburb too. Even
  // when the district itself is suburban (Savar / Keraniganj are their own
  // upazila entries on some courier sheets) the area check still wins.
  const isSubDhaka = isSubDhakaArea(area) || (Boolean(area) && isSubDhakaArea(city));

  if (isSubDhaka) {
    return {
      zone: 'sub',
      insideAllowed: false,
      subAllowed: true,
      outsideAllowed: false,
      isBaseCity: false,
      hasBaseCity,
      isSubDhaka: true,
    };
  }

  if (!hasBaseCity) {
    return {
      zone: 'inside',
      insideAllowed: true,
      subAllowed: true,
      outsideAllowed: true,
      isBaseCity: false,
      hasBaseCity: false,
      isSubDhaka: false,
    };
  }

  if (!city) {
    return {
      zone: 'inside',
      insideAllowed: true,
      subAllowed: true,
      outsideAllowed: true,
      isBaseCity: false,
      hasBaseCity: true,
      isSubDhaka: false,
    };
  }

  const isBaseCity = normalizeCityName(city) === normalizeCityName(baseCity);
  return isBaseCity
    ? {
        zone: 'inside',
        insideAllowed: true,
        subAllowed: false,
        outsideAllowed: false,
        isBaseCity: true,
        hasBaseCity: true,
        isSubDhaka: false,
      }
    : {
        zone: 'outside',
        insideAllowed: false,
        subAllowed: false,
        outsideAllowed: true,
        isBaseCity: false,
        hasBaseCity: true,
        isSubDhaka: false,
      };
}

/**
 * The zone options to render, with the blocked one flagged so the UI can
 * disable it and explain why.
 */
export function buildDeliveryZoneOptions(
  resolution: DeliveryZoneResolution,
): Array<{ value: DeliveryZone; allowed: boolean; forced: boolean }> {
  return (['inside', 'sub', 'outside'] as const).map((value) => ({
    value,
    allowed:
      value === 'inside'
        ? resolution.insideAllowed
        : value === 'sub'
          ? resolution.subAllowed
          : resolution.outsideAllowed,
    forced: (resolution.hasBaseCity || resolution.isSubDhaka) && resolution.zone === value,
  }));
}

export default {
  BANGLADESH_DISTRICTS,
  BANGLADESH_DISTRICT_AREAS,
  SUB_DHAKA_AREAS,
  isSubDhakaArea,
  getDistrictAreas,
  normalizeCityName,
  findCityInText,
  resolveMerchantBaseCity,
  resolveDeliveryZoneForCity,
  buildDeliveryZoneOptions,
};
