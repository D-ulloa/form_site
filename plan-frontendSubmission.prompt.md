## Plan: Minimal Frontend for Backend Property Submission

TL;DR: Create a fresh minimal frontend app that posts multipart/form-data to `http://localhost:3001/properties/submit` with all fields defined in `scheme_reworked.json`, matching the backend's exact required property keys and agent metadata.

**Steps**
1. Create a new frontend app in a clean, separate folder such as `/frontend-simple` to avoid the existing faulty `frontend/` code.
2. Add `index.html` with a single HTML form.
   - Include required agent fields: `agent_user_id`, `agent_name`, `agent_email`.
   - Include `cover_file_name` plus a `files[]` multiple-file upload input.
   - Include every field from `scheme_reworked.json`, using the exact canonical keys from the backend schema.
   - Use text inputs for string fields, number inputs for numeric fields, and checkboxes for boolean fields.
3. Add a simple `main.js` to handle form submission.
   - Prevent default form submission.
   - Build a `FormData` object from the form.
   - Send it via `fetch` to `http://localhost:3001/properties/submit`.
   - Display backend response status and errors on the page.
4. Optionally add a tiny `styles.css` for readability, but keep styling minimal.
5. Verify the frontend with the backend running in development mode (`backend` should be served on port `3001`).

**Relevant backend contract**
- Endpoint: `POST /properties/submit`
- Accepts `multipart/form-data`
- Required request fields:
  - `agent_user_id`, `agent_name`, `agent_email`
  - `Tipo de Inmueble`, `Operación`, `Calle`, `Titulo`
  - All scheme fields are accepted and should be present as form fields
- File upload fields:
  - `files[]` for images/videos
  - `cover_file_name` to designate a cover image filename
- Backend validation is in `backend/src/services/validatePropertyPayload.ts` and normalizes form strings into final types.

**Relevant files to reference**
- `scheme_reworked.json` — exact field names and expected data types
- `backend/src/routes/properties.ts` — endpoint behavior and multipart handling
- `backend/src/services/validatePropertyPayload.ts` — field validation, defaults, and boolean parsing

**Verification**
1. Start backend with `npm run dev` inside `/backend`.
2. Open the new frontend page and submit the form.
3. Confirm the backend responds with HTTP 200 or 207 and no validation errors.
4. If the backend rejects the request, inspect the JSON `details` and fix any field name or type mismatch.

**Decisions**
- Use a separate new frontend folder to avoid carrying over current faulty React code.
- Submit all fields using canonical names from `scheme_reworked.json`.
- Keep UI simple and functional, not styled.
