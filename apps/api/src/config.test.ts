import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

/** A complete, valid environment for the parser (Phase 11 — env trust boundary). */
function validEnv(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'production',
    HOST: '127.0.0.1',
    PORT: '9090',
    LOG_LEVEL: 'warn',
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_ANON_KEY: 'anon',
    SUPABASE_SERVICE_KEY: 'service',
    SUPABASE_JWT_SECRET: 'jwt-secret',
    CLOUDINARY_CLOUD_NAME: 'demo',
    CLOUDINARY_API_KEY: 'key',
    CLOUDINARY_API_SECRET: 'secret',
    CLOUDINARY_UPLOAD_PRESET: 'verified_capture',
    INTERNAL_JWT_SECRET: 'internal',
    REDIS_URL: 'redis://localhost:6379',
    ML_SERVICE_URL: 'http://localhost:9000',
  };
}

describe('loadConfig', () => {
  it('parses and coerces a complete environment', () => {
    const cfg = loadConfig(validEnv());
    expect(cfg.PORT).toBe(9090); // coerced to number
    expect(cfg.NODE_ENV).toBe('production');
    expect(cfg.ORG_UPLOAD_RATE_MAX).toBe(600); // default applied
    expect(cfg.ORG_UPLOAD_RATE_WINDOW_MS).toBe(60_000);
    expect(cfg.DASHBOARD_URL).toBe('http://localhost:5173'); // default applied
  });

  it('applies safe defaults for optional infra values', () => {
    const env = validEnv();
    delete env.NODE_ENV;
    delete env.PORT;
    delete env.LOG_LEVEL;
    const cfg = loadConfig(env);
    expect(cfg.NODE_ENV).toBe('development');
    expect(cfg.PORT).toBe(8080);
    expect(cfg.LOG_LEVEL).toBe('info');
  });

  it('honours overridden per-org upload limits', () => {
    const cfg = loadConfig({ ...validEnv(), ORG_UPLOAD_RATE_MAX: '10', ORG_UPLOAD_RATE_WINDOW_MS: '5000' });
    expect(cfg.ORG_UPLOAD_RATE_MAX).toBe(10);
    expect(cfg.ORG_UPLOAD_RATE_WINDOW_MS).toBe(5000);
  });

  it('throws listing every missing required secret rather than booting half-configured', () => {
    const env = validEnv();
    delete env.SUPABASE_URL;
    delete env.CLOUDINARY_API_SECRET;
    expect(() => loadConfig(env)).toThrow();
  });

  it('rejects a non-positive per-org upload max', () => {
    expect(() => loadConfig({ ...validEnv(), ORG_UPLOAD_RATE_MAX: '0' })).toThrow();
  });
});
