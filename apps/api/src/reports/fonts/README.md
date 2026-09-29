# Report fonts

Report determinism depends on embedding the exact same font bytes on every
machine (BUILD_ORDER Phase 9 "Renderer"). Place the **Inter** `.woff2` files
here and they are inlined into every report as `@font-face` data URIs by
`src/reports/renderer.ts` → `loadFontFaceCss`.

Expected files (any subset; weight is inferred from the filename):

```
Inter-Regular.woff2      → weight 400
Inter-Medium.woff2       → weight 500
Inter-SemiBold.woff2     → weight 600
Inter-Bold.woff2         → weight 700
```

Download from https://rsms.me/inter/ (SIL Open Font License). The files are not
vendored into the repo to avoid committing binary blobs; drop them in before
building production reports.

If this directory is empty the report still renders, but line-wrapping then
depends on the host's default sans-serif font, so cross-machine byte-identical
**PDF** output is not guaranteed. The self-contained **HTML** artifact — the
artifact of record for the determinism gate — is byte-identical regardless,
because it embeds whatever font CSS is present (including none) verbatim.
