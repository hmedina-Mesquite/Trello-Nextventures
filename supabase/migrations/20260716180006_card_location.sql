-- T096: location field for the Mapa board view.
-- Shape: {"lat": number, "lng": number} -- plain coordinates, no geocoding
-- needed (set via a map click or the browser's Geolocation API). Nullable:
-- most cards will have no location.
alter table public.cards add column location_data jsonb;

-- No RLS changes needed: the existing row-level "members manage cards" `for
-- all` policy (T010) already covers every column on `cards`, this one included.
