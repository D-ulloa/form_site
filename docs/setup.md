# Project Setup and Architecture

This document outlines the current setup and architectural decisions for the internal property creation web application.

## Repository Structure

The project is structured as a monorepo with explicit separation between the frontend and backend to keep the initialization and package management clean and isolated.

- `/frontend`: Contains the React web application.
- `/backend`: Contains the Node.js API services.
- `/docs`: Contains documentation, including the PRD and setup guides.
- `/references`: Contains the LLM workflow guide.

## Frontend Architecture

- **Framework:** React 19 with TypeScript.
- **Build Tool:** Vite 8.
- **Styling:** Tailwind CSS v4 (configured via the `@tailwindcss/vite` plugin and `@import "tailwindcss"` in `src/index.css`).
- **Routing:** React Router v7.
- **Forms & State:** React Hook Form, Zod for validation, and TanStack Query for server state.

### Running the Frontend
```bash
cd frontend
npm install
npm run dev
```

## Backend Architecture

- **Framework:** Node.js with Express.
- **Language:** TypeScript.
- **Module System:** ES Modules (`"type": "module"` in `package.json`).
- **Utilities:** `cors`, `dotenv`, `zod`, and `multer`.

### Running the Backend
*Note: Development scripts for the backend are pending, but the environment is fully typed and configured for ES Modules.*

To verify the TypeScript build:
```bash
cd backend
npm install
npx tsc --noEmit
```

## Setup Deviations from Initial PRD
- **Tailwind CSS:** The project is using Tailwind CSS **v4** which relies on Vite plugins rather than the traditional `tailwind.config.js` and `postcss.config.js` setup.
- **Project Root:** Instead of placing the frontend at the root directory, the frontend and backend are cleanly separated into `/frontend` and `/backend` directories for better isolation.
