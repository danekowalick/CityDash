-- Property and development, from Latah County's open ArcGIS services.
--
-- Idaho is a non-disclosure state: sale prices are not public record
-- anywhere, and no table here pretends otherwise. What *is* public is how
-- land is zoned and what applications have been made to change or use it --
-- which is the part a resident can actually act on.

-- Zoning districts inside the city, each with the ordinance that set it.
CREATE TABLE IF NOT EXISTS zoning_districts (
  id           INTEGER PRIMARY KEY,
  zone_class   TEXT NOT NULL,
  zone_desc    TEXT,
  -- The ordinance that established this district, where the county recorded
  -- one. Formats vary across decades ("99-26", "2008-11").
  ordinance    TEXT,
  area_sq_ft   DOUBLE PRECISION,
  ingested_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS zoning_class_idx ON zoning_districts (zone_class);

-- Land use applications: conditional use permits, variances, rezones,
-- accessory permits. This is the development pipeline.
CREATE TABLE IF NOT EXISTS land_use_actions (
  id          INTEGER PRIMARY KEY,
  label       TEXT,
  kind        TEXT,
  number      INTEGER,
  action      TEXT,
  applicant   TEXT,
  parcel      TEXT,
  -- Nullable: a handful of county records carry impossible dates (one reads
  -- 2055), and a wrong date is worse than none.
  decided_on  DATE,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS land_use_date_idx ON land_use_actions (decided_on DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS land_use_kind_idx ON land_use_actions (kind);
