/**
 * Environment configuration, validated once at boot with Zod (AGENTS.md §4:
 * validate at every trust boundary — the process environment is one).
 *
 * Every secret named here is server-only (AGENTS.md §3.5): none carries a
 * `VITE_`/`EXPO_PUBLIC_` prefix, and none is ever returned in a response body or
 * a log line. A missing required variable is a fatal boot error, never a silent
 * default that ships a half-configured service.
 */
import { z } from 'zod';

const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(8080),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Supabase — system of record.
  SUPABASE_URL: z.string().min(1),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_KEY: z.string().min(1),
  // 🔴 SECRET. HS256 secret used to verify Supabase-issued JWTs LOCALLY
  // (`plugins/auth.ts` → `jwt.verify(token, secret, { algorithms: ['HS256'] })`),
  // so the caller identity in `app.ts` is trusted without a round-trip. Server-only
  // (AGENTS.md §3.5): it carries no `VITE_`/`EXPO_PUBLIC_` prefix, is never returned
  // in a response body, and is redacted from every log line (see `buildApp` redact
  // paths). Sourced from Supabase → Project Settings → API → JWT Secret.
  SUPABASE_JWT_SECRET: z.string().min(1),

  // Cloudinary — media pipeline, never a query DB (AGENTS.md §3.9).
  CLOUDINARY_CLOUD_NAME: z.string().min(1),
  CLOUDINARY_API_KEY: z.string().min(1),
  CLOUDINARY_API_SECRET: z.string().min(1),
  CLOUDINARY_UPLOAD_PRESET: z.string().min(1),

  // Internal API -> ML auth. Byte-identical to the ML service (AGENTS.md §3.4).
  INTERNAL_JWT_SECRET: z.string().min(1),

  // Infra.
  REDIS_URL: z.string().min(1),
  ML_SERVICE_URL: z.string().min(1),
  DASHBOARD_URL: z.string().default('http://localhost:5173'),

  // Per-org upload ceiling on the webhook ingest path (Phase 11 "Rate limiting";
  // unsigned-preset abuse mitigation). Keyed on the org derived from the SIGNED
  // project_id, so throttling one tenant never denies service to another. A
  // whole-org flood is capped here without touching the per-user REST limiter.
  ORG_UPLOAD_RATE_MAX: z.coerce.number().int().positive().default(600),
  ORG_UPLOAD_RATE_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
});

export type Config = z.infer<typeof ConfigSchema>;

/**
 * Parse and validate `process.env` (or a supplied record, for tests). Throws a
 * `ZodError` listing every missing/invalid variable rather than booting a
 * misconfigured server.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return ConfigSchema.parse(env);
}
