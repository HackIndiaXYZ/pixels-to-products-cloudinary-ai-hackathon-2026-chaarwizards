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
  // HS256 secret used to verify Supabase-issued JWTs. Server-only.
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
