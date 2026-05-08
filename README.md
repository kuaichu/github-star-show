# GitHub Star Show

Turn GitHub Stars into a maintainable personal open-source library.

`GitHub Star Show` is a self-hostable web app that lets users sign in with GitHub, sync their starred repositories, organize them into a personal project library, and keep that library separated by user account instead of showing one shared demo list.

## Live Demo

- Demo site: [https://stars.yeque.top](https://stars.yeque.top)
- Frontend: Cloudflare Pages
- Backend: self-hosted Express + Prisma service

## What It Does

- Sign in with GitHub OAuth
- Sync each user's own starred repositories
- Persist user-specific project libraries in the database
- Organize projects with rule-based categories
- Track remote states such as `unstarred`, `archived`, and `missing`
- Edit notes, status, links, and user-level metadata in an admin panel
- Support incremental sync and manual full re-sync
- Keep AI classification optional instead of making it a hard dependency

## Product Positioning

This project is not trying to replace GitHub, Notion, or a generic bookmark manager.

It is focused on one workflow:

1. Use GitHub Stars as the collection entry point
2. Sync repositories into your own system
3. Continue organizing them as a long-lived personal open-source library

The key idea is:

> GitHub Stars should not disappear into a long list. They should become a library you can maintain.

## Current Capabilities

### Authentication

- GitHub OAuth login
- Persistent database-backed sessions
- User/account binding through `users`, `github_accounts`, and `sessions`

### Sync

- First sync runs in full mode
- Later syncs default to incremental mode
- Manual full re-sync remains available
- Recent sync runs and last sync time are stored

### User Library

- User data is isolated by account
- Shared repository metadata is stored globally
- User-level overrides are stored separately
- The same repository can appear in multiple users' libraries without mixing notes or categories

### Classification

- Rule-based categorization is enabled by default
- Uses repository name, description, language, and topics
- Categories currently include:
  - `AI / LLM`
  - `Automation / Productivity`
  - `Frontend UI / Visualization`
  - `Media / Download / Image Hosting`
  - `Network / NAS / Virtualization`
  - `Ops / Self-hosted Services`
  - `Security / CTF`
  - `Uncategorized / Review`

### Remote State Tracking

- `active`
- `unstarred`
- `archived`
- `missing`

These states are kept as user-level sync facts, so the app can preserve local notes and categorization even when the remote GitHub state changes.

### Admin

- Create local projects
- Edit category, note, links, status, tags, and features
- Import a single repository by `owner/repo`
- Remove a project from the local library
- Optionally unstar it on GitHub during deletion

## Tech Stack

### Frontend

- Vue 3
- Vite
- Plain CSS

### Backend

- Express
- Prisma
- SQLite

## Architecture Summary

The data model intentionally separates shared repository metadata from user-specific organization:

- `Project`
  - Global repository record
  - One shared source of truth for repo metadata

- `UserProject`
  - Per-user relationship to a project
  - Stores category, note, status, tags, feature overrides, remote state, and sync timestamps

- `User`
  - Local application user

- `GithubAccount`
  - GitHub identity, token, scope, and profile mapping

- `Session`
  - Persistent login session

- `SyncRun`
  - Sync history for status tracking

This lets multiple users share repository records while keeping their own library curation separate.

## Screenshots

Recommended screenshots to place here for the public repository:

- Guest homepage
- Signed-in homepage after sync
- Admin panel
- Project detail drawer with README preview

Suggested folder:

```text
docs/screenshots/
```

Suggested README image blocks after you export screenshots:

```md
![Guest homepage](docs/screenshots/guest-home.png)
![Signed-in dashboard](docs/screenshots/user-dashboard.png)
![Admin panel](docs/screenshots/admin-panel.png)
![Project details](docs/screenshots/project-detail.png)
```

## Local Development

### 1. Install dependencies

```bash
cd backend
npm install
```

```bash
cd frontend
npm install
```

### 2. Configure backend environment

Create `backend/.env` from `backend/.env.example`.

Example local configuration:

```env
DATABASE_URL="file:./dev.db"
PORT=3000
CLIENT_ORIGIN="http://localhost:5173"
APP_BASE_URL="http://localhost:5173"
BACKEND_BASE_URL="http://localhost:3000"

GITHUB_API_BASE_URL="https://api.github.com"
GITHUB_CLIENT_ID=""
GITHUB_CLIENT_SECRET=""

OPENAI_API_KEY=""
OPENAI_API_BASE_URL="https://api.openai.com/v1"
OPENAI_MODEL="gpt-4o-mini"
AI_CLASSIFICATION_ENABLED="false"
AI_CLASSIFICATION_MAX_PER_RUN="25"
AI_CLASSIFICATION_INCLUDE_README="false"
```

### 3. Initialize the database

```bash
cd backend
npx prisma generate
npx prisma db push
```

### 4. Start the backend

```bash
cd backend
npm run dev
```

### 5. Start the frontend

```bash
cd frontend
npm run dev
```

## Deployment

This repository is currently deployed as:

- Frontend: Cloudflare Pages
- Frontend domain: `https://stars.yeque.top`
- Backend: self-hosted on 1Panel
- Backend base path: `https://api.yeque.top:9000/githubstarshow`

### Frontend environment variables

Set these in Cloudflare Pages:

```env
VITE_API_BASE_URL=https://api.yeque.top:9000/githubstarshow/api
VITE_AUTH_BASE_URL=https://api.yeque.top:9000/githubstarshow/auth
```

### Backend environment variables

Example production shape:

```env
DATABASE_URL="file:./data/dev.db"
PORT=3000

CLIENT_ORIGIN="https://stars.yeque.top"
APP_BASE_URL="https://stars.yeque.top"
BACKEND_BASE_URL="https://api.yeque.top:9000/githubstarshow"

GITHUB_API_BASE_URL="https://api.github.com"
GITHUB_CLIENT_ID="your-client-id"
GITHUB_CLIENT_SECRET="your-client-secret"

OPENAI_API_KEY=""
OPENAI_API_BASE_URL="https://api.openai.com/v1"
OPENAI_MODEL="gpt-4o-mini"
AI_CLASSIFICATION_ENABLED="false"
AI_CLASSIFICATION_MAX_PER_RUN="25"
AI_CLASSIFICATION_INCLUDE_README="false"
```

### Reverse proxy routing

If you deploy behind a shared API gateway, make sure:

- `/githubstarshow/api/*` is forwarded to `/api/*`
- `/githubstarshow/auth/*` is forwarded to `/auth/*`

The `/githubstarshow` prefix should be removed before the request reaches Express.

### GitHub OAuth

Recommended GitHub OAuth App settings for the current demo:

- Homepage URL:
  - `https://stars.yeque.top`
- Authorization callback URL:
  - `https://api.yeque.top:9000/githubstarshow/auth/github/callback`

## Known Limits

- No automated weekly full re-sync scheduler yet
- No test suite yet
- AI classification is optional and disabled by default
- README screenshots are still waiting for final exported images

## Release Status

Recommended first public tag:

- `v0.1.0-beta.1`

Why this version:

- Core login + sync + persistence flow is working
- Multi-user isolation is in place
- The app is already usable as a real demo
- There is still room to improve tests, scheduler automation, and polish
