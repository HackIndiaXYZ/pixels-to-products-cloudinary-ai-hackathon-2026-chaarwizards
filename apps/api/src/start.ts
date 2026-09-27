/**
 * Production entrypoint. Loads and validates config, wires the real Supabase,
 * Cloudinary, and BullMQ adapters, and starts listening. A missing env var is a
 * fatal boot error (see `config.ts`), never a silent default.
 */
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createSupabaseDb } from './plugins/supabase.js';
import { createCloudinaryAdapter } from './plugins/cloudinary.js';
import { createQueue } from './plugins/queue.js';
import { createMlClient } from './services/ml-client.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const db = createSupabaseDb(config);
  const cloudinaryAdapter = createCloudinaryAdapter(config);
  const queue = createQueue(config);
  const ml = createMlClient(config);

  const app = await buildApp({
    config,
    db,
    cloudinary: cloudinaryAdapter,
    queue,
    ml,
    fetchBytes: async (url) => Buffer.from(await (await fetch(url)).arrayBuffer()),
  });

  const closeGracefully = async (): Promise<void> => {
    await app.close();
    await queue.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void closeGracefully());
  process.on('SIGTERM', () => void closeGracefully());

  await app.listen({ host: config.HOST, port: config.PORT });
}

main().catch((err) => {
  console.error('failed to start api', err);
  process.exit(1);
});
