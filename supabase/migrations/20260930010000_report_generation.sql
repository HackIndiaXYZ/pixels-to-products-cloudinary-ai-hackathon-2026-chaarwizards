-- Phase 9 — Report Generation columns on evidence_packages
-- Source: BUILD_ORDER.md Phase 9 ("Renderer: … store the template + input IDs
--         for regeneration", "Determinism: … Record template_version") and
--         api-contracts.md §Reports (the generate response carries html_url,
--         byte_size, and template_version alongside the existing pdf_url).
--
-- AGENTS.md §8 note: these columns are NOT in the original DATABASE_SCHEMA.md
-- evidence_packages DDL, so this is a documented schema change. They are added,
-- with the reason recorded here and in DATABASE_SCHEMA.md, because a report must
-- be regenerable byte-for-byte from its stored inputs — that requires pinning
-- WHICH template version produced it (`template_id` + `template_version`) and
-- recording both delivery artifacts (`report_cloudinary_url` = PDF already
-- existed; `report_html_url` = the self-contained HTML) plus the artifact size.
--
-- evidence_packages carries NO evidence-immutability trigger (it is a compiled
-- artifact record, not source evidence — AGENTS.md §3.1 protects the originals
-- and asset_derivatives, not the report row), so adding nullable columns here
-- touches no protected evidence column.

ALTER TABLE evidence_packages
  ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES report_templates(id),
  ADD COLUMN IF NOT EXISTS template_version TEXT,
  ADD COLUMN IF NOT EXISTS report_html_url TEXT,
  ADD COLUMN IF NOT EXISTS byte_size BIGINT;

COMMENT ON COLUMN evidence_packages.template_id IS
  'The report_templates row this package was rendered from. NULL for a built-in template (identified by template_version alone).';
COMMENT ON COLUMN evidence_packages.template_version IS
  'Pinned template version, e.g. forestry_donor@3. Changing a template changes the version and therefore the artifact hash — two reports from different template versions are never confused (BUILD_ORDER Phase 9 Determinism).';
COMMENT ON COLUMN evidence_packages.report_html_url IS
  'Cloudinary URL of the self-contained HTML artifact (data-URI inlined). report_cloudinary_url holds the PDF.';
COMMENT ON COLUMN evidence_packages.byte_size IS
  'Byte size of the finalized artifact, surfaced in the generate response.';
