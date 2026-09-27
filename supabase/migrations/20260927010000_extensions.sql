-- Phase 1 — Extensions
-- Source: docs/architecture/DATABASE_SCHEMA.md §Extensions
--
-- PostGIS powers geo-tagged capture (assets.gps_point, projects.geometry).
-- pgcrypto/uuid-ossp provide gen_random_uuid(). citext binds invite tokens to a
-- case-insensitive email. pg_trgm backs the phash near-duplicate search index.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
