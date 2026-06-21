# Blex Commerce OS

Cross-platform commerce app rebuilt as:

- `apps/mobile`: Expo React Native app for iOS, Android, and web.
- `apps/desktop`: Windows desktop shell using Electron around the React Native web build.
- `apps/api`: Fastify API backed by PostgreSQL.
- `packages/shared`: shared TypeScript contracts and formatting helpers.
- `db/postgres`: PostgreSQL migrations and seed data.

## Requirements

- Node.js 20+
- pnpm 11+ (`corepack enable` if pnpm is not already installed)
- PostgreSQL 15+ or Docker Desktop

## Setup

```bash
pnpm install
cp .env.example .env
pnpm run db:up
pnpm run db:setup
```

If you are using PowerShell instead of Git Bash, copy the environment file with:

```powershell
Copy-Item .env.example .env
```

`npm run db:up` starts a local PostgreSQL 16 container on `localhost:5432` using the credentials in `.env.example`. If you already have PostgreSQL installed locally, skip `npm run db:up` and update `DATABASE_URL` in `.env` to match your local database.

## PostgreSQL Without Docker

If `docker` is not installed, install PostgreSQL directly on Windows:

```powershell
winget install PostgreSQL.PostgreSQL.16
```

After installation, open the PostgreSQL SQL Shell or pgAdmin and create a database named `blex`, then set `.env` to match your local password:

```text
DATABASE_URL=postgres://postgres:YOUR_PASSWORD@localhost:5432/blex
```

Then run:

```bash
pnpm run db:create
pnpm run db:check
pnpm run db:migrate
pnpm run db:seed
```

Or run the create, migrate, and seed steps together:

```bash
pnpm run db:setup
```

The seed user is:

```text
username: admin
password: admin
```

## Development

Run the backend:

```bash
pnpm run dev:api
```

Run the React Native app:

```bash
pnpm run dev:mobile
```

Launch directly in the iOS Simulator:

```bash
pnpm --filter @blex/mobile run ios
```

Expo can open the same app on iOS, Android, and web.

Run web only:

```bash
pnpm run dev:web
```

Run the Windows desktop wrapper while the web app is running:

```bash
pnpm run dev:desktop
```

## Build

```bash
pnpm run build
```

This compiles shared code, the Fastify API, exports the React Native web app, and packages the Windows desktop app.

Build only the Windows desktop installer:

```bash
pnpm run build:desktop:installer
```

The installer is written to:

```text
apps/desktop/release/
```

It creates a normal Windows application with a Start Menu shortcut, desktop shortcut, and Blex app icon.

## Backend Container Deployment

The API can be deployed from `Dockerfile.api` on container hosts.

Required environment variables:

```text
DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/DB_NAME
JWT_SECRET=use-a-long-random-secret
API_PORT=4000
```

Run migrations and seed data once after creating the cloud database:

```bash
pnpm run db:migrate
pnpm run db:seed
```

## Free Backend Deployment

Recommended free setup:

- Host the Fastify API on Vercel using the root `api/index.ts` serverless entry and `vercel.json`.
- Host PostgreSQL on Neon free tier, then put the Neon pooled connection string in `DATABASE_URL`.

Vercel environment variables:

```text
DATABASE_URL=postgres://USER:PASSWORD@HOST/DB_NAME?sslmode=require
JWT_SECRET=use-a-long-random-secret
API_PORT=4000
```

After the Vercel project is linked to this repository and the Neon database exists, run migrations once against the cloud database:

```bash
DATABASE_URL="postgres://USER:PASSWORD@HOST/DB_NAME?sslmode=require" pnpm run db:migrate
DATABASE_URL="postgres://USER:PASSWORD@HOST/DB_NAME?sslmode=require" pnpm run db:seed
```

Point mobile builds at the deployed API:

```bash
EXPO_PUBLIC_API_URL=https://YOUR-VERCEL-PROJECT.vercel.app pnpm --filter @blex/mobile run ios
```

This repository defaults production mobile builds to:

```text
https://blexx-api-ms2z.vercel.app
```

Set `EXPO_PUBLIC_API_URL` only when you need to point a build at another backend.
