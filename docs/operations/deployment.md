# Deployment Guide

---

## Overview

| Service | Platform | Runtime | Auto-Deploy |
|---------|----------|---------|-------------|
| Dashboard | Vercel | Node.js (Vite build) | `main` branch |
| Node API | Railway/Render | Node.js 20 (Fastify) | `main` branch |
| ML Service | Fly.io | Python 3.11 (Docker) | `main` branch |
| Capture App | Expo EAS | iOS/Android (Expo SDK 50) | Manual/Release |
| Database | Supabase | PostgreSQL 15 + PostGIS | Managed |
| Media | Cloudinary | Cloudinary CDN | Managed |
| Cache/Queue | Redis (Railway/Upstash) | Redis 7 | Managed |

---

## Prerequisites

### Accounts Required
- [ ] GitHub (repo + Actions)
- [ ] Supabase (project)
- [ ] Cloudinary (account)
- [ ] Vercel (dashboard)
- [ ] Railway or Render (API + Redis)
- [ ] Fly.io (ML service)
- [ ] Expo (EAS build)
- [ ] Docker Hub / GHCR (ML Docker image)

### Local Tools
- Node.js 20+ (via `volta` or `nvm`)
- pnpm 9+ (`corepack enable pnpm`)
- Python 3.11+
- Docker Desktop
- Expo CLI (`pnpm dlx expo@latest`)
- Fly CLI (`flyctl`)
- Vercel CLI (`pnpm i -g vercel`)
- Railway CLI (`npm i -g @railway/cli`) or Render CLI

---

## Secret Management

**See [ARCHITECTURE.md §6](../../ARCHITECTURE.md) for the complete secret inventory and rotation procedure.**

Quick reference for this deployment guide:

| Secret | Where Set | How |
|--------|-----------|-----|
| `CLOUDINARY_*` | Railway, Fly.io, Vercel, EAS, Supabase Vault | CLI / Dashboard |
| `SUPABASE_*` | Railway, Fly.io, Vercel, EAS | CLI / Dashboard |
| `REDIS_URL` | Railway (API) | CLI / Dashboard |
| `ML_SERVICE_URL` | Railway (API) | CLI / Dashboard |
| Webhook keys | Supabase Vault | SQL / Dashboard |

**Local Dev**: Use `.env.local` with 1Password CLI (`op inject -i .env.template -o .env.local`)

**CI/CD**: GitHub Actions Secrets (Settings → Secrets → Actions)

**Rotation**: Monthly for API keys, quarterly for service keys — see the rotation procedure in [ARCHITECTURE.md §6.1](../../ARCHITECTURE.md)

---

## 1. Supabase Setup

### Create Project
1. Go to https://supabase.com → New Project
2. Choose region close to users
3. Save: Project URL, Anon Key, Service Role Key

### Run Migrations
```bash
# Local development
supabase link --project-ref <ref>
supabase db push

# Or apply migrations manually via Dashboard SQL Editor
# Run files in order: extensions → tables → functions → RLS → indexes
```

### Configure Auth
- Enable Email/Password provider
- Configure JWT expiry: 1 hour access, 30 day refresh
- Set up Row Level Security (auto-enabled by migrations)

### Edge Functions
```bash
# Deploy signed-delivery-url function
supabase functions deploy signed-delivery-url \
  --env CLOUDINARY_CLOUD_NAME=xxx \
  --env CLOUDINARY_API_KEY=xxx \
  --env CLOUDINARY_API_SECRET=xxx
```

### Realtime
- Enable Realtime for `assets`, `change_events` tables in Dashboard
- Configure publication: `supabase_realtime`

---

## 2. Cloudinary Setup

### Create Upload Preset
1. Settings → Upload → Upload Presets → Add
2. Name: `verified_capture`
3. Settings:
   - **Unsigned**: Yes
   - **Folder**: `verified/{org_id}/{project_id}` (dynamic via public_id)
   - **Use filename**: No
   - **Unique filename**: No
   - **Overwrite**: No
   - **Resource type**: Auto
   - **Metadata**: Yes
   - **Context**: Yes
   - **Colors**: Yes
   - **PHash**: Yes
   - **Faces**: Yes
   - **Quality analysis**: Yes
   - **Access mode**: Authenticated (or Public with signed delivery)
   - **Notification URL**: `https://api.impact-platform.example.com/webhooks/cloudinary`
   - **Eager transformations**:
     ```json
     [
       {"width": 1920, "height": 1080, "crop": "limit", "quality": "auto", "format": "auto"},
       {"width": 400, "height": 300, "crop": "fill", "quality": "auto", "format": "auto"},
       {"width": 100, "height": 100, "crop": "thumb", "gravity": "auto", "quality": "auto", "format": "auto"}
     ]
     ```
   - **Tags**: `["verified-capture"]`
   - **Preserve EXIF**: Yes (important!)

### API Keys
- Dashboard → Settings → Security → API Keys
- Save: Cloud Name, API Key, API Secret

### Transformations (Named)
Create named transformations for reports:
- `report_thumb`: `w_400,h_300,c_fill,f_auto,q_auto`
- `report_full`: `w_1200,h_900,c_limit,f_auto,q_auto`
- `report_diff`: `w_800,h_600,c_fill,f_auto,q_auto`
- `social_image`: `w_1200,h_630,c_fill,f_auto,q_auto`
- `social_video`: `w_720,h_1280,c_fill,f_auto,q_auto,du_10`

---

## 3. Node API Deployment (Railway)

### Railway Setup
```bash
# Install CLI
npm i -g @railway/cli
railway login

# Create project
railway init
# Select "Empty Project" → Name: impact-api

# Add services
railway add redis        # Redis for BullMQ
railway add postgresql   # Optional: if not using Supabase directly
```

### Environment Variables (Railway Dashboard)
```bash
# Required
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIs...
CLOUDINARY_CLOUD_NAME=your-cloud
CLOUDINARY_API_KEY=123456789
CLOUDINARY_API_SECRET=abcdefghijklmnop
REDIS_URL=redis://default:xxx@xxx.railway.internal:6379
ML_SERVICE_URL=https://ml.impact-platform.fly.dev
NODE_ENV=production
PORT=3000

# Optional
LOG_LEVEL=info
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW_MS=60000
```

### Deploy
```bash
# From repo root
railway up --service api

# Or use railway.toml (see below)
```

### railway.toml
```toml
[build]
builder = "nixpacks"
buildCommand = "pnpm --filter=api build"

[deploy]
startCommand = "node apps/api/dist/app.js"
healthcheckPath = "/health"
healthcheckTimeout = 300
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3

[environments.production]
variables = { NODE_ENV = "production" }
```

### Custom Domain
- Railway Dashboard → Settings → Domains → Add Custom Domain
- Configure DNS: CNAME `api.impact-platform.example.com` → `xxx.railway.app`

---

## 4. ML Service Deployment (Fly.io)

### Fly.io Setup
```bash
# Install CLI
curl -L https://fly.io/install.sh | sh
flyctl auth login

# Create app
flyctl apps create impact-ml-service --org personal

# Set secrets
flyctl secrets set \
  CLOUDINARY_CLOUD_NAME=xxx \
  CLOUDINARY_API_KEY=xxx \
  CLOUDINARY_API_SECRET=xxx \
  PYTHONPATH=/app
```

### Dockerfile (apps/ml-service/Dockerfile)
```dockerfile
FROM python:3.11-slim

WORKDIR /app

# System deps for OpenCV/PIL
RUN apt-get update && apt-get install -y \
    libglib2.0-0 libsm6 libxext6 libxrender-dev libgl1-mesa-glx \
    && rm -rf /var/lib/apt/lists/*

# Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# App code
COPY src/ ./src/
COPY weights/ ./weights/  # Pre-downloaded model weights

EXPOSE 8000

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
```

### fly.toml (apps/ml-service/fly.toml)
```toml
app = "impact-ml-service"
primary_region = "iad"  # or closest to users

[build]
  dockerfile = "Dockerfile"

[env]
  PORT = "8000"
  PYTHONUNBUFFERED = "1"

[http_service]
  internal_port = 8000
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 0  # Scale to zero when idle
  max_machines_running = 3

[[vm]]
  cpu_kind = "shared"
  cpus = 2
  memory = "4gb"  # GPU not needed for inference (CPU OK for YOLOv8n)

[metrics]
  port = 9091
  path = "/metrics"
```

### Deploy
```bash
cd apps/ml-service
flyctl deploy

# Check logs
flyctl logs
```

### GPU Option (if needed)
```toml
# fly.toml - for GPU inference
[[vm]]
  cpu_kind = "shared"
  cpus = 4
  memory = "16gb"
  gpu = "a100-40gb"  # or "t4" for cheaper
```

---

## 5. Dashboard Deployment (Vercel)

### Vercel Setup
```bash
# Install CLI
pnpm i -g vercel
vercel login

# Link project
cd apps/dashboard
vercel link
```

### Environment Variables (Vercel Dashboard)
```bash
# Required
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
VITE_API_URL=https://api.impact-platform.example.com/v1
VITE_CLOUDINARY_CLOUD_NAME=your_cloud_name
VITE_CLOUDINARY_UPLOAD_PRESET=verified_capture

# Optional
VITE_MAPLIBRE_STYLE_URL=https://...  # MapLibre style, not Mapbox
VITE_APP_NAME=Impact Media Platform

# NOT HERE. CLOUDINARY_API_SECRET is server-only and belongs on the API host.
# It must never be set in Vercel env vars for a VITE_ app — anything without
# the VITE_ prefix is also not readable by the bundle, but setting it here
# risks leaking it through a build log or a future SSR path.
```

### vercel.json (apps/dashboard/vercel.json)
```json
{
  "buildCommand": "pnpm build",
  "outputDirectory": "dist",
  "devCommand": "pnpm dev",
  "installCommand": "pnpm install",
  "framework": "vite",
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ],
  "headers": [
    {
      "source": "/assets/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
      ]
    }
  ]
}
```

### Deploy
```bash
# Preview deploy
vercel

# Production deploy
vercel --prod
```

### Custom Domain
- Vercel Dashboard → Settings → Domains → Add
- Configure DNS: CNAME `app.impact-platform.example.com` → `cname.vercel-dns.com`

---

## 6. Capture App Deployment (Expo EAS)

### EAS Setup
```bash
# Install CLI
pnpm i -g eas-cli
eas login

# Configure project
cd apps/capture-app
eas build:configure
```

### eas.json (apps/capture-app/eas.json)
```json
{
  "cli": { "version": ">= 5.0.0" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": { "resourceClass": "m-medium" },
      "android": { "gradleCommand": ":app:assembleDebug" }
    },
    "preview": {
      "distribution": "internal",
      "ios": { "resourceClass": "m-medium" },
      "android": { "buildType": "apk" }
    },
    "production": {
      "distribution": "store",
      "ios": { "resourceClass": "m-medium" },
      "android": { "buildType": "app-bundle" }
    }
  },
  "submit": {
    "production": {
      "ios": { "appleId": "your@email.com", "ascAppId": "123456789" },
      "android": { "serviceAccountKeyPath": "./google-play-key.json", "track": "internal" }
    }
  }
}
```

### app.config.ts (apps/capture-app/app.config.ts)
```typescript
import { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Impact Capture',
  slug: 'impact-capture',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  splash: { image: './assets/splash.png', resizeMode: 'contain', backgroundColor: '#ffffff' },
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.impact.capture',
    infoPlist: {
      NSCameraUsageDescription: 'This app needs camera access to capture field evidence',
      NSLocationWhenInUseUsageDescription: 'This app needs location access to geotag evidence',
      NSPhotoLibraryAddUsageDescription: 'This app saves captured evidence to your photo library',
    },
  },
  android: {
    adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#ffffff' },
    package: 'com.impact.capture',
    permissions: ['CAMERA', 'ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION'],
  },
  plugins: [
    'expo-camera',
    'expo-location',
    'expo-secure-store',
    ['expo-build-properties', { ios: { deploymentTarget: '15.1' } }],
  ],
  extra: {
    eas: { projectId: 'your-eas-project-id' },
  },
});
```

### Environment Variables (EAS Secrets)
```bash
# Set secrets for all builds
eas secret:create --scope project --name EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME --value your-cloud
eas secret:create --scope project --name EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET --value verified_capture
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value https://xxx.supabase.co
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value eyJhbGciOiJIUzI1NiIs...
eas secret:create --scope project --name EXPO_PUBLIC_GPS_ACCURACY_THRESHOLD --value 10
```

### Build Commands
```bash
# Development build (for testing on device)
eas build --profile development --platform all

# Preview build (internal distribution)
eas build --profile preview --platform all

# Production build (App Store / Play Store)
eas build --profile production --platform all

# Submit to stores
eas submit --platform ios
eas submit --platform android
```

### Internal Distribution (for team testing)
```bash
# Build preview
eas build --profile preview --platform all

# Install via Expo Go or direct IPA/APK
# Share build URL from EAS dashboard
```

---

## 7. CI/CD (GitHub Actions)

### .github/workflows/ci.yml
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck

  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm test

  build-api:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter=api build

  build-dashboard:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter=dashboard build

  build-ml:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build ML Docker image
        run: docker build -t impact-ml-service ./apps/ml-service
```

### Deploy Workflows (one per service)

#### .github/workflows/deploy-api.yml
```yaml
name: Deploy API

on:
  push:
    branches: [main]
    paths: ['apps/api/**', 'packages/shared/**', 'packages/ui-components/**']

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter=api build
      - uses: railway-actions/deploy@v1
        with:
          token: ${{ secrets.RAILWAY_TOKEN }}
          service: api
```

#### .github/workflows/deploy-dashboard.yml
```yaml
name: Deploy Dashboard

on:
  push:
    branches: [main]
    paths: ['apps/dashboard/**', 'packages/shared/**', 'packages/ui-components/**']

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter=dashboard build
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--prod'
```

#### .github/workflows/deploy-ml.yml
```yaml
name: Deploy ML Service

on:
  push:
    branches: [main]
    paths: ['apps/ml-service/**']

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to Fly.io
        uses: superfly/flyctl-actions@1.5
        with:
          args: "deploy --app impact-ml-service"
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
```

#### .github/workflows/deploy-app.yml
```yaml
name: Build Capture App

on:
  push:
    branches: [main]
    paths: ['apps/capture-app/**', 'packages/shared/**']
  workflow_dispatch: {}

jobs:
  build:
    runs-on: macos-latest  # Required for iOS builds
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install --frozen-lockfile
      - name: Build iOS
        run: eas build --platform ios --profile preview --non-interactive
        env:
          EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}
      - name: Build Android
        run: eas build --platform android --profile preview --non-interactive
        env:
          EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}
```

---

## 8. Secrets Management

### GitHub Repository Secrets
```
SUPABASE_URL
SUPABASE_SERVICE_KEY
SUPABASE_ANON_KEY
CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
REDIS_URL
ML_SERVICE_URL
RAILWAY_TOKEN
VERCEL_TOKEN
VERCEL_ORG_ID
VERCEL_PROJECT_ID
FLY_API_TOKEN
EXPO_TOKEN
```

### Supabase Vault (for Edge Functions)
```sql
-- In Supabase Dashboard → Vault
-- Add secrets:
-- CLOUDINARY_CLOUD_NAME
-- CLOUDINARY_API_KEY
-- CLOUDINARY_API_SECRET
```

---

## 9. Monitoring & Observability

### Health Checks
- API: `GET /health` → 200 OK
- ML: `GET /health` → 200 OK
- Dashboard: Vercel health checks

### Logging
- Railway/Render: Built-in logs
- Fly.io: `flyctl logs`
- Vercel: Function logs
- Supabase: Dashboard → Logs

### Error Tracking (Optional)
- Sentry DSN in each service
- `npm i @sentry/node @sentry/react @sentry/python`

### Metrics
- Prometheus + Grafana (self-hosted) or Datadog
- Key metrics: upload latency, change detection time, report generation time, error rates

---

## 10. Rollback Procedure

### API (Railway)
```bash
# List deployments
railway deployments --service api

# Rollback to previous
railway rollback --service api <deployment-id>
```

### Dashboard (Vercel)
```bash
# List deployments
vercel list

# Promote previous
vercel promote <deployment-url>
```

### ML Service (Fly.io)
```bash
# List releases
flyctl releases --app impact-ml-service

# Rollback
flyctl release rollback <release-id> --app impact-ml-service
```

### Capture App (Expo)
- Revert to previous EAS build
- Re-submit previous build to stores

---

## 11. Cost Optimization

| Service | Free Tier | Estimated MVP Cost |
|---------|-----------|-------------------|
| Supabase | 500MB DB, 2GB bandwidth | $25/mo |
| Cloudinary | 25GB storage, 25GB bandwidth | $50/mo |
| Railway | $5 credit/mo | $10/mo |
| Fly.io | 3 shared VMs free | $20/mo |
| Vercel | Personal free | $0 |
| Redis (Upstash) | 10K req/day | $0 |
| **Total** | | **~$105/mo** |

---

## 12. Security Checklist

- [ ] All secrets in Vault/Environment variables (never in code)
- [ ] HTTPS everywhere (enforced by platforms)
- [ ] RLS policies tested on all tables
- [ ] API rate limiting enabled
- [ ] CORS configured (Dashboard domain only)
- [ ] Cloudinary upload preset: unsigned but context-validated
- [ ] Device keys in Secure Enclave/Keystore (not app storage)
- [ ] Audit logs immutable (no UPDATE/DELETE)
- [ ] Regular dependency updates (`pnpm audit`, `pip-audit`)
- [ ] Penetration test before public launch