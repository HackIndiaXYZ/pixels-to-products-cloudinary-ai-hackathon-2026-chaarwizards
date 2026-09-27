import { Cloudinary } from '@cloudinary/url-gen';

/**
 * The shared `cld` instance. Cloud name comes from the client-safe
 * `VITE_CLOUDINARY_CLOUD_NAME` (ENVIRONMENT.md §2). No secret is ever
 * referenced here — URL signing is done server-side by @impact/api
 * (AGENTS.md §3.5, §3.11).
 *
 * In dev only, an unset cloud name falls back to Cloudinary's public
 * `demo` cloud so the dev server renders before `.env.local` is filled.
 * In a production build a missing cloud name is a fatal misconfiguration:
 * we throw rather than silently serve evidence from the wrong cloud
 * (AGENTS.md §3.6, no silent degradation).
 */
function resolveCloudName(): string {
  const configured = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string | undefined;
  if (configured) {
    return configured;
  }
  if (import.meta.env.DEV) {
    return 'demo';
  }
  throw new Error(
    'VITE_CLOUDINARY_CLOUD_NAME is not set. Refusing to fall back to the public ' +
      "'demo' cloud in a production build (AGENTS.md §3.6).",
  );
}

export const CLOUD_NAME: string = resolveCloudName();

export const cld = new Cloudinary({
  cloud: {
    cloudName: CLOUD_NAME,
  },
  url: {
    // Deliver over https; never construct URLs by hand (AGENTS.md §4).
    secure: true,
  },
});
