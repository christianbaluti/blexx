# Blex Commerce OS

Cross-platform commerce app rebuilt as:

- `apps/mobile`: Expo React Native app for iOS, Android, and web.
- `apps/desktop`: Windows desktop shell using Electron around the React Native web build.
- `apps/api`: Fastify API backed by PostgreSQL.
- `packages/shared`: shared TypeScript contracts and formatting helpers.
- `db/postgres`: PostgreSQL migrations and seed data.

## Requirements

- Node.js 20+
- npm 10+
- PostgreSQL 15+ or Docker Desktop

## Setup

```bash
npm install
cp .env.example .env
npm run db:up
npm run db:setup
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
npm run db:create
npm run db:check
npm run db:migrate
npm run db:seed
```

Or run the create, migrate, and seed steps together:

```bash
npm run db:setup
```

The seed user is:

```text
username: admin
password: admin
```

## Development

Run the backend:

```bash
npm run dev:api
```

Run the React Native app:

```bash
npm run dev:mobile
```

Expo can open the same app on iOS, Android, and web.

Run web only:

```bash
npm run dev:web
```

Run the Windows desktop wrapper while the web app is running:

```bash
npm run dev:desktop
```

## Build

```bash
npm run build
```

This compiles shared code, the Fastify API, exports the React Native web app, and packages the Windows desktop app.

Build only the Windows desktop installer:

```bash
npm run build:desktop:installer
```

The installer is written to:

```text
apps/desktop/release/
```

It creates a normal Windows application with a Start Menu shortcut, desktop shortcut, and Blex app icon.
