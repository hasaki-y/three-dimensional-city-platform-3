CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS buildings (
  id text PRIMARY KEY,
  name text NOT NULL,
  type text NOT NULL,
  district text NOT NULL,
  floors integer NOT NULL,
  height double precision NOT NULL,
  area double precision NOT NULL,
  year integer NOT NULL,
  geom geometry(Point, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS buildings_geom_gix ON buildings USING gist (geom);
CREATE INDEX IF NOT EXISTS buildings_geog_gix ON buildings USING gist ((geom::geography));
CREATE INDEX IF NOT EXISTS buildings_type_idx ON buildings (type);

CREATE TABLE IF NOT EXISTS pois (
  id text PRIMARY KEY,
  name text NOT NULL,
  type text NOT NULL,
  district text NOT NULL,
  geom geometry(Point, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS pois_geom_gix ON pois USING gist (geom);
CREATE INDEX IF NOT EXISTS pois_geog_gix ON pois USING gist ((geom::geography));
CREATE INDEX IF NOT EXISTS pois_type_idx ON pois (type);
ALTER TABLE pois ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'other';
CREATE INDEX IF NOT EXISTS pois_category_idx ON pois (category);

CREATE TABLE IF NOT EXISTS roads (
  id text PRIMARY KEY,
  name text NOT NULL,
  type text NOT NULL,
  geom geometry(LineString, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS roads_geom_gix ON roads USING gist (geom);

CREATE TABLE IF NOT EXISTS water_areas (
  id text PRIMARY KEY,
  name text NOT NULL,
  type text NOT NULL,
  geom geometry(Polygon, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS water_areas_geom_gix ON water_areas USING gist (geom);
