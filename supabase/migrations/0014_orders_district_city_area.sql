-- =============================================================================
-- ZID Merchant Dashboard — Separate `district` and `city_area` on orders
-- -----------------------------------------------------------------------------
-- Purpose:
--   The storefront checkout collected the customer's location in ONE field
--   ("City / District"), so the courier sheet could not tell Dhaka (an upazila
--   /thana level address, e.g. Uttara, Mirpur) apart from a thana in Khulna.
--   The checkout now has TWO dependent fields:
--
--      1. District / জেলা              → orders.district
--      2. City / Area / Thana / এলাকা  → orders.city_area
--
--   Both are persisted with the order (MongoDB writes the same two columns via
--   POST /api/orders), so a merchant can filter orders by district and route a
--   parcel to the exact area.
--
--   `customer_city` is kept for every legacy reader (dashboard tables, CSV
--   export, courier payloads) and is populated as "<city_area>, <district>".
--
-- Design rules (same as the rest of the chain):
--   - Idempotent: ADD COLUMN IF NOT EXISTS. Safe to run repeatedly.
--   - Existing rows keep NULL district/city_area; nothing is overwritten.
--   - Ends with NOTIFY pgrst so PostgREST re-introspects immediately.
-- =============================================================================

BEGIN;

ALTER TABLE IF EXISTS public.orders
  ADD COLUMN IF NOT EXISTS district   text,
  ADD COLUMN IF NOT EXISTS city_area  text;

-- Backfill `district` from the existing single city field where it clearly
-- names a district (exact match, case-insensitive). Anything else is left NULL
-- rather than guessed — a wrong district is worse than a missing one.
UPDATE public.orders
SET district = customer_city
WHERE district IS NULL
  AND customer_city IS NOT NULL
  AND trim(customer_city) <> ''
  AND lower(trim(customer_city)) IN (
    SELECT lower(d) FROM unnest(ARRAY[
      'Bagerhat','Bandarban','Barguna','Barishal','Bhola','Bogura','Brahmanbaria',
      'Chandpur','Chapainawabganj','Chattogram','Chuadanga','Cox''s Bazar','Cumilla',
      'Dhaka','Dinajpur','Faridpur','Feni','Gaibandha','Gopalganj','Habiganj','Jamalpur',
      'Jashore','Jenaidah','Jhalakathi','Joypurhat','Karishmarganj','Khagrachhari','Khulna',
      'Kishoreganj','Kushtia','Lakshmipur','Lalmonirhat','Larkana','Madaripur','Magura',
      'Manikganj','Meherpur','Moulvibazar','Munshiganj','Naogaon','Narail','Narayanganj',
      'Narsingdi','Natore','Netrokona','Nilphamari','Noakhali','Pabna','Panchagarh',
      'Patuakhali','Pirojpur','Rajbari','Rajshahi','Rangpur','Satkhira','Shariatpur',
      'Sherpur','Shibganj','Sirajganj','Sunamganj','Sylhet','Tangail','Thakurgaon'
    ]) AS d
  );

CREATE INDEX IF NOT EXISTS orders_district_idx ON public.orders (district);
CREATE INDEX IF NOT EXISTS orders_city_area_idx ON public.orders (city_area);

NOTIFY pgrst, 'reload schema';

COMMIT;
