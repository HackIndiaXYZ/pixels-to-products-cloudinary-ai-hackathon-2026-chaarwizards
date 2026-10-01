# Frontend Architecture Decision

> **Panchnama** — a written record of inspection, signed by a witness.

---

## Decision: Feature-Based Structure (Not Component-Based)

### Why Feature-Based?

| Factor | Component-Based | Feature-Based | Winner |
|--------|-----------------|---------------|--------|
| **Team Parallelism** | Conflicts in `components/` | Each feature = own folder | **Feature** |
| **Scalability** | `components/` grows to 200+ files | Features stay bounded | **Feature** |
| **Ownership** | Unclear who owns `Button.tsx` | Clear: `features/reports/` owns report UI | **Feature** |
| **Code Splitting** | Manual | Natural per route/feature | **Feature** |
| **Onboarding** | Hard to trace feature | Self-contained | **Feature** |

### Structure (Dashboard + Capture App)

```
src/
├── features/
│   ├── projects/              # Project CRUD, list, detail
│   │   ├── components/        # ProjectCard, ProjectForm, ProjectMap
│   │   ├── hooks/             # useProjects, useProjectMutations
│   │   ├── api.ts             # API calls (typed with @panchnama/shared)
│   │   └── types.ts           # Feature-specific types (extends shared)
│   │
│   ├── assets/                # Asset gallery, upload, detail
│   │   ├── components/        # AssetGrid, AssetViewer, AssetMetadata, IntegrityCard, VideoPlayer
│   │   ├── hooks/             # useAssets, useAssetSearch, useAssetIntegrity
│   │   ├── api.ts
│   │   └── types.ts
│   │
│   ├── change-events/         # Before/after pairs, metrics, diff viewer
│   │   ├── components/        # ChangeEventList, BeforeAfterSlider, MetricsTable, VideoDiffPlayer
│   │   ├── hooks/             # useChangeEvents
│   │   ├── api.ts
│   │   └── types.ts
│   │
│   ├── reports/               # Report builder, preview, export
│   │   ├── components/        # ReportBuilder, TemplateSelector, PDFPreview, IntegrityAppendix, VideoClipEmbed
│   │   ├── hooks/             # useReportGeneration
│   │   ├── api.ts
│   │   └── types.ts
│   │
│   ├── search/                # Global search, filters, saved searches
│   │   ├── components/        # SearchBar, FilterPanel, ResultsList, GPSAccuracyFilter
│   │   ├── hooks/             # useSearch, useFilters
│   │   ├── api.ts
│   │   └── types.ts
│   │
│   ├── map/                   # Map view, clustering, geometry
│   │   ├── components/        # ProjectMap, AssetCluster, GeometryEditor
│   │   ├── hooks/             # useMap, useClusters
│   │   └── api.ts
│   │
│   ├── integrity/             # Cross-cutting integrity features
│   │   ├── components/        # IntegrityCard, TimestampDrift, GPSBadge, SignatureBadge, EXIFHashBadge
│   │   ├── hooks/             # useIntegrityVerification
│   │   ├── api.ts
│   │   └── types.ts
│   │
│   └── admin/                 # Org settings, users, templates
│       ├── components/
│       ├── hooks/
│       └── api.ts
│
├── shared/                    # Truly cross-cutting
│   ├── components/            # Re-exports from @panchnama/ui-components
│   ├── hooks/                 # useAuth, useToast, useMediaQuery
│   ├── utils/                 # formatDate, cn, debounce
│   ├── providers/             # QueryClient, Auth, Theme
│   └── constants/
│
├── layouts/                   # Page shells
│   ├── MainLayout.tsx         # Sidebar + header + outlet
│   ├── AuthLayout.tsx         # Centered card
│   └── MapLayout.tsx          # Fullscreen map + overlay
│
├── routes/                    # React Router / TanStack Router
│   ├── index.tsx              # Dashboard home
│   ├── projects/
│   │   ├── $projectId.tsx
│   │   ├── $projectId/assets.tsx
│   │   ├── $projectId/change-events.tsx
│   │   ├── $projectId/reports.tsx
│   │   └── $projectId/integrity.tsx
│   ├── search.tsx
│   ├── map.tsx
│   ├── admin.tsx
│   └── integrity.tsx          # Global integrity audit view
│
├── main.tsx
└── App.tsx
```

---

## Capture App Feature Structure (Expo)

```
apps/capture-app/src/features/
├── auth/
│   ├── components/
│   │   ├── LoginForm.tsx
│   │   └── RegisterForm.tsx
│   ├── hooks/
│   │   └── useAuth.ts
│   └── api.ts
│
├── capture/
│   ├── components/
│   │   ├── CameraView.tsx              # expo-camera v2 wrapper (photo + video)
│   │   ├── VideoCaptureView.tsx        # Video recording UI (30s max, timer, lock)
│   │   ├── ContextPicker.tsx           # Project + ObservationType + Phase
│   │   │   ├── ProjectTreePicker.tsx   # Hierarchical: Parent → Sub-projects
│   │   │   ├── ObservationTypePicker.tsx  # From project.config.observation_types[]
│   │   │   └── PhasePicker.tsx         # Before / After
│   │   ├── CaptionInput.tsx            # Optional caption + "Sign caption" checkbox
│   │   ├── GPSAccuracyDisplay.tsx      # Shows ±Xm accuracy in real-time
│   │   ├── ImmutableWarning.tsx        # "Once captured, cannot be edited"
│   │   ├── CaptureButton.tsx           # Disabled until GPS accuracy < threshold
│   │   └── AssetTypeSwitch.tsx         # Photo / Video toggle
│   ├── hooks/
│   │   ├── useCapture.ts               # Main capture flow (creates immutable commit)
│   │   ├── useCamera.ts                # Camera permissions + photo capture (expo-camera v2)
│   │   ├── useVideoCapture.ts          # Video recording + keyframe extraction
│   │   ├── useGPS.ts                   # Fused location + accuracy monitoring
│   │   └── useCaption.ts               # Caption input + signing
│   ├── types.ts
│   └── constants.ts                    # GPS accuracy thresholds, EXIF fields, video limits
│
├── projects/
│   ├── components/
│   │   ├── ProjectTreePicker.tsx       # Recursive tree: Parent → Sub-projects
│   │   ├── ProjectCard.tsx             # Shows sector, sub-project count
│   │   └── ProjectDetail.tsx           # Shows observation_types for selected project
│   ├── hooks/
│   │   ├── useProjectTree.ts           # Fetches full hierarchy recursively
│   │   └── useProjects.ts
│   └── api.ts
│
├── sync/
│   ├── components/
│   │   ├── OfflineQueue.tsx            # List of pending commits
│   │   ├── CommitCard.tsx              # Shows commit preview + status + GPS accuracy
│   │   ├── SyncStatus.tsx              # Online/offline, last sync, queue count
│   │   └── RetryButton.tsx             # Manual retry for failed uploads
│   ├── hooks/
│   │   ├── useOfflineQueue.ts          # MMKV queue management
│   │   └── useBackgroundSync.ts        # NetInfo + BackgroundFetch integration
│   ├── workers/
│   │   └── background-upload.ts        # BackgroundFetch upload worker (chunked)
│   └── api.ts                          # Upload to Cloudinary with context
│
└── integrity/
    ├── components/
    │   ├── LocalVerification.tsx       # Verify local commit signatures
    │   ├── CommitDetails.tsx           # Shows frozen EXIF, GPS, caption, signatures
    │   └── HashDisplay.tsx             # SHA-256 commit ID + device public key
    ├── hooks/
    │   └── useLocalVerification.ts
    └── api.ts
```

---

## Shared Package Contracts

### `@panchnama/shared` (TypeScript)
```typescript
// packages/shared/src/types/asset.ts
export interface Asset {
  id: string;
  project_id: string;
  cloudinary_public_id: string;
  asset_type: 'image' | 'video';
  device_capture_timestamp: string;    // Device timestamp (from capture commit)
  gps_point: { lat: number; lng: number } | null;
  gps_accuracy_meters: number | null;  // Horizontal accuracy
  gps_provider: string | null;         // 'gps' | 'network' | 'fused' | 'passive'
  gps_timestamp: string | null;        // GPS satellite time
  device_id: string;
  device_public_key: string;           // Ed25519 public key
  capture_signature: string;           // Ed25519 signature of commit
  sha256_hash: string;
  exif: Record<string, any>;           // PascalCase keys (Make, Model, etc.)
  exif_hash: string;                   // SHA-256 of frozen EXIF
  ai_tags: string[];
  custom_metadata: {
    observation_type?: string;
    phase?: 'before' | 'after';
    metrics?: Record<string, number>;
  };
  caption: string | null;
  caption_signature: string | null;
  caption_language: string | null;
  caption_created_at: string | null;
  // Server timestamps (immutable after insert)
  server_upload_timestamp: string;     // Cloudinary server time
  server_received_at: string;          // API receipt time
  upload_status: 'pending' | 'verified' | 'flagged';
  created_at: string;
}

// Capture Commit (local app types)
export interface LocalCaptureCommit {
  commitId: string;                    // SHA-256 of image bytes
  version: 1;
  imagePath: string;
  mimeType: 'image/jpeg' | 'image/heic' | 'video/mp4';
  exif: FrozenExif;                    // PascalCase keys
  gps: FrozenGPS | null;
  context: FrozenContext;
  caption?: FrozenCaption;
  signature: string;                   // Ed25519(device_key, commit_hash)
  devicePublicKey: string;
  createdAt: string;
  status: 'pending' | 'uploading' | 'uploaded' | 'failed';
  uploadAttempts: number;
  lastAttemptAt?: string;
  lastError?: string;
}

// EXIF frozen at capture — PascalCase (matches EXIF spec)
export interface FrozenExif {
  // Camera (immutable subset)
  Make: string;
  Model: string;
  Orientation: number;
  DateTimeOriginal: string;
  DateTimeDigitized: string;
  ExposureTime: number;
  FNumber: number;
  ISOSpeedRatings: number;
  FocalLength: number;
  PixelXDimension: number;
  PixelYDimension: number;
  // ... other frozen fields (see CAPTURE_APP_SECURITY.md)
}

export interface FrozenGPS {
  latitude: number;
  longitude: number;
  altitude: number | null;
  accuracy: number;                    // Horizontal accuracy in meters
  altitudeAccuracy: number | null;
  heading: number | null;
  speed: number | null;
  timestamp: string;
  provider: string;                    // 'gps' | 'network' | 'fused' | 'passive'
}

export interface FrozenContext {
  projectId: string;
  projectName: string;
  observationType: string;
  phase: 'before' | 'after';
  orgId: string;
  orgName: string;
  appVersion: string;
  deviceId: string;
}

export interface FrozenCaption {
  text: string;
  language: string;
  createdAt: string;
  signature: string;
}
```

### `@panchnama/ui-components` (React)
```typescript
// packages/ui-components/src/integrity/IntegrityCard.tsx
export interface IntegrityCardProps {
  asset: Asset;
  variant?: 'full' | 'compact';
}

// packages/ui-components/src/integrity/TimestampDrift.tsx
export interface TimestampDriftProps {
  deviceTime: string;
  serverTime: string;
  warningThresholdMs?: number;  // Default 60000 (1 minute)
}

// packages/ui-components/src/integrity/GPSBadge.tsx
export interface GPSBadgeProps {
  accuracyMeters: number | null;
  provider: string | null;
  showProvider?: boolean;
}

// packages/ui-components/src/integrity/SignatureBadge.tsx
export interface SignatureBadgeProps {
  verified: boolean;
  type: 'device' | 'caption';
}

// packages/ui-components/src/integrity/EXIFHashBadge.tsx
export interface EXIFHashBadgeProps {
  verified: boolean;
}
```

---

## State Management

| Layer | Tool | Scope |
|-------|------|-------|
| **Server State** | TanStack Query (React Query) | All API data, caching, mutations |
| **Client State** | React Context + `useReducer` | Auth, UI prefs, offline queue |
| **Forms** | React Hook Form + Zod | Validation shared with `@panchnama/shared` |
| **Maps** | MapLibre GL | Project boundaries, asset clusters. MapLibre, not Mapbox — no proprietary token in a client bundle. |
| **Capture App Local** | MMKV (encrypted) + SecureStore/Keychain | Immutable commits, device keypair |

---

## Media Rendering

Media bytes are served by Cloudinary; **every URL is minted by our API.** The dashboard never
holds a Cloudinary secret and never receives a `public_id` as input — it asks for a URL by
`asset_id` and the API resolves it under RLS.

| Surface | Transformation | Why |
|---|---|---|
| Grid thumbnail | `report_thumb` (`c_lfill,g_auto,w_400,h_300/q_auto:eco/f_auto`) | Fixed ratio, never upscales, saliency-centred, won't cut the subject out |
| Fluid / detail view | `c_limit,w_auto/dpr_auto/q_auto:good/f_auto` + `<picture>` | Sends phone-sized bytes to a phone |
| Report image | `report_full` | Capped 1920px so the inlined report stays a sane size |
| Original (view) | `authenticated` + `auth_token`, 5 min TTL | Requested on demand, never prefetched into a list |

> **The starter kit's `UploadWidget` and demo App read Cloudinary directly from the browser.**
> That is a demo, not a pattern. Direct client-side listing has no `org_id` filter and would
> expose one org's assets to another. Keep the kit's `cld` config and `.cursorrules`; replace
> its data layer with `useInfiniteQuery` against `/v1` and let the API own every lookup.

Set `sizes` on every `<CldImage>` in a responsive grid. Without it the browser picks the
largest candidate and the bandwidth saving is lost.

---

## Storybook

`packages/ui-components` is consumed by two apps, so a component that only type-checks can still
be visually wrong in one of them. Storybook runs in CI as a smoke test.

| Item | Detail |
|---|---|
| Location | `packages/ui-components/.storybook` |
| Required stories | `IntegrityCard` in all three states, `BeforeAfterSlider`, `MediaViewer`, `GPSBadge` at 5 m / 50 m / unknown |
| CI | `test-storybook` (build + interaction smoke) on PR |
| Contract | Props are imported from the package, not re-declared, so a breaking prop change fails the story build |

---

## Build & Deploy

| App | Build Tool | Deploy | Command |
|-----|------------|--------|---------|
| Dashboard | Vite | Vercel | `pnpm --filter=dashboard build` |
| Capture App | Expo (EAS) | Expo/Internal | `eas build --platform all` |
| API | TypeScript → Node | Railway/Render | `pnpm --filter=api build` |
| ML Service | Python | Fly.io | `docker build -t ml-service ./apps/ml-service` |