#!/usr/bin/env node
/**
 * capture-gifs.mjs
 * ─────────────────────────────────────────────────────────────────
 * Records animated GIFs from each Archify HTML diagram.
 *
 * Timeline per diagram:
 *   0 ms  : page loads
 *   1500ms: force dark theme + classic preset + enter presentation mode + zoom 100%
 *   2s after setup: start recording frames
 *   first 2s of recording: full static diagram (no story playing)
 *   after 2s: click "Play Guided Story"
 *   remaining 20s: capture the animated story
 *   total GIF = 2s still + 20s animated = 22s @ 5 fps = 110 frames
 *
 * Requires: google-chrome in PATH, ffmpeg, node ws package
 * Usage:    node scripts/capture-gifs.mjs
 */

import { execSync, spawn }             from "child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync, statSync } from "fs";
import { join, dirname }               from "path";
import { fileURLToPath }               from "url";
import WebSocket                       from "ws";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, "..");
const HTML_DIR  = join(ROOT, "docs/assets/interactive");
const OUT_DIR   = join(ROOT, "docs/assets/animations");
const TMP_DIR   = join(ROOT, ".gif-tmp");

const PORT   = 9225;
const FPS    = 5;
const WIDTH  = 1280;
const HEIGHT = 800;
const FRAME_MS = Math.round(1000 / FPS);   // 200 ms between frames

const STILL_FRAMES    = 2 * FPS;  // 2 s of full diagram before play
const ANIM_FRAMES     = 20 * FPS; // 20 s of guided story
const TOTAL_FRAMES    = STILL_FRAMES + ANIM_FRAMES;

const FILES = [
  "01-system-topology",
  "02-capture-act-workflow",
  "03-asset-upload-ingest",
  "04-evidence-ingest-sequence",
  "05-evidence-lineage-dataflow",
  "06-asset-lifecycle",
];

/* ── helpers ─────────────────────────────────────────────────────── */

const sleep = ms => new Promise(r => setTimeout(r, ms));
const log   = msg => console.log(`  ${msg}`);

function startChrome() {
  return spawn("google-chrome", [
    `--remote-debugging-port=${PORT}`,
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--no-first-run",
    "--disable-extensions",
    `--window-size=${WIDTH},${HEIGHT}`,
    "--hide-scrollbars",
    "--force-color-profile=srgb",
    "about:blank",
  ], { stdio: "ignore" });
}

async function waitForChrome(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://localhost:${PORT}/json`);
      if (r.ok) return;
    } catch (_) {}
    await sleep(500);
  }
  throw new Error("Chrome did not become ready in time");
}

async function getPageTarget() {
  const r = await fetch(`http://localhost:${PORT}/json`);
  const targets = await r.json();
  const t = targets.find(x => x.type === "page" || x.type === "other");
  if (!t) throw new Error("No Chrome page target found");
  return t.webSocketDebuggerUrl;
}

function makeCdp(wsUrl) {
  return new Promise((resolveReady) => {
    const ws = new WebSocket(wsUrl);
    let id = 1;
    const pending = new Map();

    ws.on("message", raw => {
      const msg = JSON.parse(raw.toString());
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    });

    ws.on("open", () => {
      const send = (method, params = {}) =>
        new Promise((resolve, reject) => {
          const cid = id++;
          pending.set(cid, { resolve, reject });
          ws.send(JSON.stringify({ id: cid, method, params }));
        });
      resolveReady({ send, close: () => ws.close() });
    });
  });
}

/* ── main ────────────────────────────────────────────────────────── */

mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(TMP_DIR, { recursive: true });

log("Starting headless Chrome...");
const chrome = startChrome();

const cleanup = () => {
  try { chrome.kill(); } catch (_) {}
  rmSync(TMP_DIR, { recursive: true, force: true });
};
process.on("exit", cleanup);
process.on("SIGINT", () => { cleanup(); process.exit(1); });

await waitForChrome();
log("Chrome ready.\n");

const wsUrl = await getPageTarget();
const cdp   = await makeCdp(wsUrl);

await cdp.send("Page.enable");
await cdp.send("Emulation.setDeviceMetricsOverride", {
  width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false,
});

for (const name of FILES) {
  const htmlPath = join(HTML_DIR, `${name}.html`);
  if (!existsSync(htmlPath)) { log(`SKIP ${name}.html — not found`); continue; }

  const frameDir = join(TMP_DIR, `frames-${name}`);
  mkdirSync(frameDir, { recursive: true });

  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📽  ${name}`);

  // ── 1. Navigate ─────────────────────────────────────────────────
  const fileUrl = `file://${htmlPath}`;
  log(`Navigating…`);
  await cdp.send("Page.navigate", { url: fileUrl });
  await sleep(2000); // let Archify fully initialise

  // ── 2. Setup: dark theme, classic preset, presentation, zoom 100% ─
  log("Entering presentation mode + dark theme + zoom 100%…");
  await cdp.send("Runtime.evaluate", { expression: `
    (function() {
      var html = document.documentElement;
      html.setAttribute('data-theme', 'dark');
      html.setAttribute('data-preset', 'classic');
      try { localStorage.setItem('archify-theme', 'dark'); } catch(_) {}

      // Enter presentation stage
      var presentBtn = document.getElementById('btn-present');
      if (presentBtn && presentBtn.getAttribute('aria-pressed') !== 'true') {
        presentBtn.click();
      }
    })();
  ` });
  await sleep(600); // wait for presentation layout to settle

  // Zoom to 100%
  await cdp.send("Runtime.evaluate", { expression: `
    (function() {
      if (typeof Archify !== 'undefined' && Archify.view && Archify.view.zoom) {
        Archify.view.zoom(1);
      }
    })();
  ` });
  await sleep(400); // let zoom animation complete

  // ── 3. Capture frames ───────────────────────────────────────────
  log(`Recording ${TOTAL_FRAMES} frames (${STILL_FRAMES} still + ${ANIM_FRAMES} animated)…`);

  for (let i = 0; i < TOTAL_FRAMES; i++) {

    // After STILL_FRAMES frames (2s), click Play Guided Story
    if (i === STILL_FRAMES) {
      log("▶  Starting Guided Story…");
      await cdp.send("Runtime.evaluate", { expression: `
        (function() {
          var playBtn = document.getElementById('guided-view-play');
          if (playBtn && playBtn.getAttribute('aria-pressed') !== 'true') {
            playBtn.click();
          }
        })();
      ` });
    }

    const shot = await cdp.send("Page.captureScreenshot", {
      format: "png",
      clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT, scale: 1 },
    });
    const framePath = join(frameDir, `frame-${String(i).padStart(4, "0")}.png`);
    writeFileSync(framePath, Buffer.from(shot.data, "base64"));

    if (i % FPS === 0) process.stdout.write(`  ${Math.round((i / TOTAL_FRAMES) * 100)}%\r`);
    await sleep(FRAME_MS);
  }
  process.stdout.write("  100%\n");

  // ── 4. Encode GIF with ffmpeg + palette ─────────────────────────
  const gifPath   = join(OUT_DIR, `${name}.gif`);
  const palPath   = join(TMP_DIR, `palette-${name}.png`);

  log("Building palette…");
  execSync(
    `ffmpeg -y -framerate ${FPS} -i "${frameDir}/frame-%04d.png" ` +
    `-vf "fps=${FPS},scale=${WIDTH}:-1:flags=lanczos,palettegen=max_colors=128:stats_mode=diff" ` +
    `"${palPath}"`,
    { stdio: "pipe" }
  );

  log("Encoding GIF…");
  execSync(
    `ffmpeg -y -framerate ${FPS} -i "${frameDir}/frame-%04d.png" -i "${palPath}" ` +
    `-lavfi "fps=${FPS},scale=${WIDTH}:-1:flags=lanczos [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" ` +
    `-loop 0 "${gifPath}"`,
    { stdio: "pipe" }
  );

  const sizeMB = (statSync(gifPath).size / 1024 / 1024).toFixed(1);
  log(`✅ ${name}.gif — ${sizeMB} MB\n`);

  rmSync(frameDir, { recursive: true });
  rmSync(palPath, { force: true });
}

cdp.close();
cleanup();

console.log("🎉  All GIFs saved to docs/assets/animations/");
execSync(`ls -lh "${OUT_DIR}"`, { stdio: "inherit" });

