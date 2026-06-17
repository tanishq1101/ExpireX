-- ============================================================================
-- Barcode catalog: a shared product-identity cache.
-- Every resolved barcode lookup is written here so future scans are served
-- instantly without hitting Open Food Facts / Open Beauty Facts / UPCitemdb.
-- confirmed_count increments each time a user saves a real item with that barcode.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.barcode_catalog (
  barcode         text PRIMARY KEY,
  name            text NOT NULL,
  brand           text,
  size            text,
  category        public.category,
  image_url       text,
  -- 'openfoodfacts' | 'openbeautyfacts' | 'openproductsfacts' | 'upcitemdb' | 'user'
  source          text NOT NULL DEFAULT 'api',
  -- how many users have confirmed this product by saving an item
  confirmed_count integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Reuse the existing set_updated_at trigger function (defined in 0001).
CREATE TRIGGER barcode_catalog_set_updated_at
  BEFORE UPDATE ON public.barcode_catalog
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS: any authenticated user can read; only service-role writes (via API routes).
ALTER TABLE public.barcode_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY catalog_select ON public.barcode_catalog
  FOR SELECT TO authenticated USING (true);

-- Atomic upsert called from the /api/catalog/confirm route.
-- On new barcode: inserts with confirmed_count = 1.
-- On existing: increments confirmed_count, leaves other fields untouched so the
--   first-resolved product data (from the external API) is the authoritative copy.
CREATE OR REPLACE FUNCTION public.confirm_barcode_scan(
  p_barcode    text,
  p_name       text,
  p_brand      text,
  p_size       text,
  p_category   public.category,
  p_image_url  text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.barcode_catalog
    (barcode, name, brand, size, category, image_url, source, confirmed_count)
  VALUES
    (p_barcode, p_name, p_brand, p_size, p_category, p_image_url, 'user', 1)
  ON CONFLICT (barcode) DO UPDATE SET
    confirmed_count = public.barcode_catalog.confirmed_count + 1,
    updated_at      = now();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.confirm_barcode_scan FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.confirm_barcode_scan TO authenticated;
