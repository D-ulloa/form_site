# Installation

Status: 2026-08-06.

## Frontend installation

1. Open a terminal in `/frontend`.
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

1. Open a terminal in `/backend`.
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

## Notes

- `frontend/package.json` controls the React app and Vite scripts.
- `backend/package.json` controls the Express API, TypeScript build, and dev runner.
- The backend is configured as an ES module project and relies on `dotenv` for environment variables.
- The frontend uses an API prefix of `/_/backend` in production, while development uses a relative root path.
- SPEC-34 manifests live in approved restricted storage, not this checkout. Validate one with `npm --prefix backend run spec34:validate-manifest -- /restricted/path/manifest.json`; this does not execute a migration or authorize Solar.
