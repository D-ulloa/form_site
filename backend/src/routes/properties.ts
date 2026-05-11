import { Router } from 'express';
import multer from 'multer';
import { validatePropertyPayload } from '../services/validatePropertyPayload.js';
import { createPropertySubmission } from '../services/createPropertySubmission.js';
import { validateMimeTypes, validateTotalSize } from '../utils/sizeLimits.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// ─── POST /properties/submit ──────────────────────────────────────────────────
//
// Accepts multipart/form-data:
//   • All property fields as text fields (see scheme.json + agent_* fields)
//   • files[]  — image/video files (total ≤ 1 GB, whitelisted MIME types)
//   • cover_file_name — filename of the designated cover image

router.post('/submit', upload.array('files'), async (req, res) => {
  const files = Array.isArray(req.files)
    ? (req.files as Express.Multer.File[])
    : [];

  // Validate form fields
  const validation = validatePropertyPayload(req.body as unknown);
  if (!validation.success) {
    res
      .status(400)
      .json({ error: 'Validation failed', details: validation.errors });
    return;
  }

  // Validate uploaded files
  if (files.length > 0 && !validateMimeTypes(files)) {
    res
      .status(400)
      .json({ error: 'One or more files have an unsupported MIME type.' });
    return;
  }
  if (!validateTotalSize(files)) {
    res
      .status(400)
      .json({ error: 'Total upload size exceeds the 1 GB limit.' });
    return;
  }

  // Delegate all orchestration to the submission service
  const result = await createPropertySubmission(validation.data, files);

  const statusCode =
    result.outcome === 'success'
      ? 200
      : result.outcome === 'partial_failure'
        ? 207
        : 500;

  res.status(statusCode).json(result);
});

export default router;
