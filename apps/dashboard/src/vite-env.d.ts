/// <reference types="vite/client" />

/* Declared as a type alias, not an interface, so it carries an implicit index signature and can be
   read as `Record<string, string | undefined>` where the app probes optional variables. */
type ImportMetaEnv = {
  readonly DEV: boolean;
  /** Supabase project URL. Safe to publish to the browser. */
  readonly VITE_SUPABASE_URL?: string;
  /** Anon or publishable key only. A service-role key is refused at runtime. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** Base URL of the authenticated API routes (also accepted as VITE_PANCHNAMA_API_BASE). */
  readonly VITE_API_URL?: string;
  /** Legacy alias for the authenticated API base URL. */
  readonly VITE_PANCHNAMA_API_BASE?: string;
  /** Optional raster tile template for the satellite basemap. Absent means the control stays off. */
  readonly VITE_SATELLITE_TILE_URL?: string;
  /** Cloudinary cloud name, used only to compose derivative delivery URLs with `@cloudinary/url-gen`.
   *  Absent means a public derivative renders `Unavailable`; originals still work, because they are
   *  delivered through the server-signed URL instead. */
  readonly VITE_CLOUDINARY_CLOUD_NAME?: string;
};

interface ImportMeta {
  readonly env: ImportMetaEnv;
}