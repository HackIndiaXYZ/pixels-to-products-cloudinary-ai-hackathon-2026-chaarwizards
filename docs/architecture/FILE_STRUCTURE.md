# Monorepo File Structure

> **Panchnama** — a written record of inspection, signed by a witness.

---

## Root Layout

```
panchnama/
├── .github/
│   └── workflows/
│       ├── ci.yml              # Lint, typecheck, test all packages
│       ├── deploy-api.yml      # Deploy Node API (Railway/Render)
│       ├── deploy-ml.yml       # Deploy Python ML (Fly.io)
│       ├── deploy-dashboard.yml# Deploy Dashboard (Vercel)
│       └── deploy-app.yml      # EAS Build (Expo)
├── .vscode/
│   └── settings.json           # Shared TS/ESLint/Prettier config
├── docs/
│   ├── architecture.md
│   ├── requirements.md
│   ├── api-contracts.md        # OpenAPI specs for all service contracts
│   ├── database-schema.md
│   ├── deployment.md           # Deployment guide for all services
│   ├── capture-app-security.md
│   └── secrets-management.md   # Centralized secret management strategy
├── packages/
│   ├── shared/                 # Shared TypeScript types, Zod schemas
│   │   ├── src/
│   │   │   ├── types/
│   │   │   │   ├── asset.ts
│   │   │   │   ├── project.ts
│   │   │   │   ├── change-event.ts
│   │   │   │   ├── observation.ts
│   │   │   │   ├── audit.ts
│   │   │   │   └── capture-commit.ts    # Local commit types (PascalCase EXIF)
│   │   │   ├── schemas/        # Zod validators (shared API ↔ Dashboard)
│   │   │   ├── cloudinary/     # Transformation helpers
│   │   │   └── crypto/         # Signature verification helpers
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── ui-components/          # Shared React components (design system)
│   │   ├── src/
│   │   │   ├── primitives/     # Button, Input, Card, Modal, Table
│   │   │   ├── map/            # MapLibre GL wrapper
│   │   │   ├── media/          # ImageViewer, VideoPlayer, BeforeAfterSlider
│   │   │   ├── forms/          # ProjectForm, ObservationForm
│   │   │   └── integrity/      # IntegrityCard, TimestampDrift, GPSBadge
│   │   ├── package.json
│   │   └── tsconfig.json
├── apps/
│   ├── capture-app/            # Expo React Native (iOS/Android)
│   │   ├── app/                # Expo Router (file-based routing)
│   │   │   ├── (auth)/
│   │   │   │   ├── login.tsx
│   │   │   │   └── register.tsx
│   │   │   ├── (main)/
│   │   │   │   ├── index.tsx              # Project list
│   │   │   │   ├── project/
│   │   │   │   │   ├── index.tsx          # Project dashboard
│   │   │   │   │   ├── capture.tsx        # Camera + context picker + caption
│   │   │   │   │   ├── gallery.tsx        # Offline queue + synced (immutable view)
│   │   │   │   │   ├── settings.tsx
│   │   │   │   │   └── integrity.tsx      # Local commit verification
│   │   │   └── _layout.tsx
│   │   ├── src/
│   │   │   ├── features/       # Feature-based modules
│   │   │   │   ├── auth/
│   │   │   │   ├── capture/
│   │   │   │   │   ├── components/
│   │   │   │   │   │   ├── CameraView.tsx           # expo-camera v2 wrapper
│   │   │   │   │   │   ├── ContextPicker.tsx
│   │   │   │   │   │   ├── CaptionInput.tsx
│   │   │   │   │   │   ├── GPSAccuracyDisplay.tsx
│   │   │   │   │   │   ├── ImmutableWarning.tsx
│   │   │   │   │   │   └── CaptureButton.tsx        # Disabled if GPS accuracy > threshold
│   │   │   │   │   ├── hooks/
│   │   │   │   │   │   ├── useCapture.ts
│   │   │   │   │   │   ├── useCamera.ts             # expo-camera v2 permissions/capture
│   │   │   │   │   │   └── useGPS.ts                # expo-location fused provider
│   │   │   │   │   └── types.ts
│   │   │   │   ├── projects/
│   │   │   │   ├── sync/
│   │   │   │   │   ├── components/
│   │   │   │   │   │   ├── OfflineQueue.tsx
│   │   │   │   │   │   ├── SyncStatus.tsx
│   │   │   │   │   │   └── CommitCard.tsx
│   │   │   │   │   ├── hooks/
│   │   │   │   │   │   └── useOfflineQueue.ts
│   │   │   │   │   └── workers/
│   │   │   │   │       └── background-upload.ts     # BackgroundFetch + chunked uploads
│   │   │   │   └── integrity/
│   │   │   │       ├── components/
│   │   │   │       │   └── LocalVerification.tsx
│   │   │   │       └── hooks/
│   │   │   │           └── useLocalVerification.ts
│   │   │   ├── lib/
│   │   │   │   ├── cloudinary.ts           # Direct upload helper
│   │   │   │   ├── crypto.ts               # Ed25519 signing (react-native-keychain + WebCrypto)
│   │   │   │   ├── exif.ts                 # EXIF extraction (exifr) + freezing (PascalCase)
│   │   │   │   ├── gps.ts                  # Location (expo-location) + accuracy
│   │   │   │   ├── queue.ts                # Offline queue (MMKV + NetInfo)
│   │   │   │   ├── secure-store.ts         # MMKV encrypted + Keychain for device keys
│   │   │   │   ├── commit.ts               # Local commit creation/verification
│   │   │   │   ├── device.ts               # Stable device ID (expo-application)
│   │   │   │   └── supabase.ts             # Supabase client (auth only)
│   │   │   ├── hooks/
│   │   │   │   ├── useCapture.ts
│   │   │   │   ├── useOfflineQueue.ts
│   │   │   │   ├── useProjects.ts
│   │   │   │   └── useDeviceIdentity.ts
│   │   │   └── styles/
│   │   ├── app.config.ts
│   │   ├── eas.json
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── dashboard/              # React + Vite + TypeScript
│   │   ├── src/
│   │   │   ├── features/       # Feature-based (see FRONTEND_ARCHITECTURE.md)
│   │   │   │   ├── projects/
│   │   │   │   │   ├── components/
│   │   │   │   │   ├── hooks/
│   │   │   │   │   ├── api.ts
│   │   │   │   │   └── types.ts
│   │   │   │   ├── assets/
│   │   │   │   │   ├── components/
│   │   │   │   │   │   ├── AssetGrid.tsx
│   │   │   │   │   │   ├── AssetViewer.tsx
│   │   │   │   │   │   ├── AssetMetadata.tsx
│   │   │   │   │   │   └── IntegrityCard.tsx
│   │   │   │   │   ├── hooks/
│   │   │   │   │   ├── api.ts
│   │   │   │   │   └── types.ts
│   │   │   │   ├── change-events/
│   │   │   │   ├── reports/
│   │   │   │   ├── search/
│   │   │   │   ├── map/
│   │   │   │   └── admin/
│   │   │   │   └── integrity/             # Cross-cutting integrity features
│   │   │   │       ├── components/        # IntegrityCard, TimestampDrift, GPSBadge, SignatureBadge, EXIFHashBadge
│   │   │   │       ├── hooks/             # useIntegrityVerification
│   │   │   │       ├── api.ts
│   │   │   │       └── types.ts
│   │   │   ├── shared/
│   │   │   │   ├── components/  # Re-exports from @panchnama/ui-components
│   │   │   │   ├── hooks/
│   │   │   │   ├── utils/
│   │   │   │   └── providers/
│   │   │   ├── layouts/
│   │   │   │   ├── MainLayout.tsx
│   │   │   │   ├── AuthLayout.tsx
│   │   │   │   └── MapLayout.tsx
│   │   │   ├── routes/
│   │   │   │   ├── index.tsx
│   │   │   │   ├── projects/
│   │   │   │   │   ├── $projectId.tsx
│   │   │   │   │   ├── $projectId/assets.tsx
│   │   │   │   │   ├── $projectId/change-events.tsx
│   │   │   │   │   ├── $projectId/reports.tsx
│   │   │   │   │   └── $projectId/integrity.tsx
│   │   │   │   ├── search.tsx
│   │   │   │   ├── map.tsx
│   │   │   │   ├── admin.tsx
│   │   │   │   └── integrity.tsx          # Global integrity audit view
│   │   │   ├── main.tsx
│   │   │   └── App.tsx
│   │   ├── index.html
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vite.config.ts
│   │   └── vercel.json
│   │
│   ├── api/                    # Node.js Fastify Backend
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   │   ├── projects.ts
│   │   │   │   ├── assets.ts
│   │   │   │   ├── change-events.ts
│   │   │   │   ├── observations.ts
│   │   │   │   ├── reports.ts
│   │   │   │   ├── search.ts
│   │   │   │   ├── integrity.ts           # /assets/:id/integrity endpoint
│   │   │   │   ├── webhooks/
│   │   │   │   │   └── cloudinary.ts      # Verifies signatures, EXIF hash, caption sig
│   │   │   │   └── admin.ts
│   │   │   ├── services/
│   │   │   │   ├── cloudinary.ts
│   │   │   │   ├── supabase.ts
│   │   │   │   ├── queue.ts               # BullMQ queues
│   │   │   │   ├── ml-client.ts           # HTTP client to Python ML
│   │   │   │   ├── report-generator.ts    # Puppeteer + Handlebars
│   │   │   │   ├── audit.ts
│   │   │   │   ├── verification.ts        # Signature/EXIF/timestamp verification
│   │   │   │   └── cloudinary-client.ts   # Cloudinary API wrapper
│   │   │   ├── workers/
│   │   │   │   ├── ai-enrich.ts
│   │   │   │   ├── pair-assets.ts
│   │   │   │   ├── detect-change.ts
│   │   │   │   ├── generate-report.ts
│   │   │   │   └── integrity-check.ts     # Periodic integrity verification
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts
│   │   │   │   ├── validation.ts
│   │   │   │   └── rate-limit.ts
│   │   │   ├── plugins/
│   │   │   │   ├── supabase.ts
│   │   │   │   └── swagger.ts
│   │   │   └── app.ts
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── Dockerfile
│   │
│   └── ml-service/             # Python FastAPI ML Service
│       ├── src/
│       │   ├── models/
│       │   │   ├── __init__.py
│       │   │   ├── registry.py
│       │   │   ├── forestry/
│       │   │   │   ├── sapling_detector.py
│       │   │   │   ├── change_detector.py
│       │   │   │   └── quantifier.py
│       │   │   └── base.py
│       │   ├── routes/
│       │   │   ├── detect_change.py
│       │   │   ├── classify_activity.py
│       │   │   ├── extract_signals.py
│       │   │   └── health.py
│       │   ├── services/
│       │   │   ├── cloudinary.py     # Download assets, upload diffs (Cloudinary API)
│       │   │   ├── image_proc.py     # Alignment, preprocessing
│       │   │   └── geospatial.py     # GPS distance, area calc
│       │   ├── schemas/
│       │   │   └── requests.py       # Pydantic models
│       │   ├── main.py
│       │   └── config.py
│       ├── training/               # Training scripts (not in Docker)
│       │   ├── data/
│       │   │   ├── download_forestnet.py
│       │   │   ├── download_levir_cd.py
│       │   │   └── prepare_yolo.py
│       │   ├── train_sapling_yolo.py
│       │   ├── train_change_detector.py
│       │   └── evaluate.py
│       ├── weights/                # .gitignored, downloaded at build
│       ├── requirements.txt
│       ├── pyproject.toml
│       ├── Dockerfile
│       └── .python-version
│
├── turbo.json
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .eslintrc.js
├── .prettierrc
├── .gitignore
└── README.md
```

---

## Key Principles

1. **`packages/shared`** — Single source of truth for types/schemas. Both `api` and `dashboard` depend on it. Includes `CaptureCommit` types with PascalCase EXIF.
2. **`packages/ui-components`** — Design system. `dashboard` and `capture-app` (via React Native Web or separate) consume it. Includes `IntegrityCard`, `GPSBadge`, `TimestampDrift`.
3. **Feature-based in `apps/*/src/features/`** — Colocate components, hooks, API, types per domain.
4. **Independent deploys** — Each `apps/*` has its own CI/CD, Dockerfile, build config.
5. **No circular deps** — `api` → `shared`, `dashboard` → `shared` + `ui-components`, `ml-service` standalone.
6. **Capture app security** — Immutable commits, frozen EXIF (PascalCase), signed captions, GPS accuracy, dual timestamps all implemented in `features/capture`, `features/sync`, `features/integrity`, `lib/crypto` (react-native-keychain), `lib/exif`, `lib/gps`, `lib/commit`, `lib/secure-store` (MMKV + Keychain), `lib/device`.
7. **Camera** — Uses `expo-camera` v2 (not deprecated `expo-camera` v1).
8. **Device Keys** — Hardware-backed via `react-native-keychain` (Secure Enclave/Keystore), not `react-native-quick-crypto`.
9. **Background Sync** — Uses `expo-background-fetch` with chunked uploads (iOS 30s limit), foreground sync priority.