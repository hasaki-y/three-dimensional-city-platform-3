-- Run after import: psql "$DATABASE_URL" -f server/sql/explain.sql
-- Record the actual plan and buffer numbers for this data size; an index may not win on 3489 rows.
EXPLAIN (ANALYZE, BUFFERS)
SELECT id FROM buildings
WHERE geom && ST_MakeEnvelope(120.025, 30.275, 120.035, 30.285, 4326)
  AND ST_Intersects(geom, ST_MakeEnvelope(120.025, 30.275, 120.035, 30.285, 4326));

EXPLAIN (ANALYZE, BUFFERS)
SELECT id FROM buildings
WHERE ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint(120.028, 30.277),4326)::geography, 300);

EXPLAIN (ANALYZE, BUFFERS)
SELECT id FROM pois WHERE category = 'hospital'
ORDER BY geom::geography <-> ST_SetSRID(ST_MakePoint(120.028, 30.277),4326)::geography
LIMIT 5;
