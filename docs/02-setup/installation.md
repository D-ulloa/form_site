# Installation

Status: 2026-09-01.

## Prerequisites

- Node.js and npm compatible with the versions in the lockfiles.
- A configured `frontend/.env` and `backend/.env`; see `environment.md`.
- Supabase, Google, and Make credentials only when exercising the corresponding integration.

## Frontend installation

1. From the repository root, enter `frontend`.
2. Install dependencies:

```bash
cd frontend
npm install
```

3. Start the development server:

```bash
npm run dev
```

4. Build the production bundle:

```bash
npm run build
```

5. Lint the frontend code:

```bash
npm run lint
```

## Backend installation

1. From the repository root, enter `backend`.
2. Install dependencies:

```bash
cd backend
npm install
```

3. Start the development backend:

```bash
npm run dev
```

4. Build the backend for production:

```bash
npm run build
```

5. Type-check the backend:

```bash
npm run typecheck
```

6. Run the bounded tenant contract Make worker manually when validating delivery:

```bash
npm run worker:contract-make
```

The worker requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. A scheduler
should invoke this command after the post-commit outbox path is enabled; the
contract status endpoint only performs an opportunistic bounded pass.

## Notes

- `frontend/package.json` controls the React app and Vite scripts (`dev`, `build`, `lint`, `test`, and E2E scripts).
- `backend/package.json` controls the Express API, TypeScript build, dev runner, worker, and tests.
- The backend is configured as an ES module project and relies on `dotenv` for environment variables.
- The frontend uses an API prefix of `/_/backend` in production, while development uses a relative root path; Vite proxies `/api`, `/properties`, and `/health` to the local backend.
- SPEC-34 manifests live in approved restricted storage, not this checkout. Validate one with `npm --prefix backend run spec34:validate-manifest -- /restricted/path/manifest.json`; this does not execute a migration or authorize Solar.
