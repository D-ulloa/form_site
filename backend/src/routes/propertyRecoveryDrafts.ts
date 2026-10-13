import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { SessionService } from '../identity/sessionService.js';
import { assertCsrf, IdentityAccessError, IdentityConfigurationError } from '../identity/sessionSecurity.js';
import { createOrganizationScope } from '../platform/scope.js';
import { PlatformError, safeErrorEnvelope } from '../platform/errors.js';
import { propertySchema } from '../services/validatePropertyPayload.js';
import { MAX_MEDIA_FILES } from '../utils/sizeLimits.js';
import {
  createRecoveryDraftRepository, type RecoveryDraftRepository, type RecoveryDraftRow,
} from '../properties/recoveryDraftRepository.js';

const DraftId = z.string().uuid();
const allowedFields = new Set([
  ...Object.keys(propertySchema.shape).filter((key) => !key.startsWith('agent_')),
  'Numero', 'PisoMzaDenominacion', 'DeptoLote', 'SupTerrenoHectareas',
]);
const fieldValue = z.union([z.string().max(20_000), z.number().finite(), z.boolean()]);
const FormValues = z.record(z.string(), fieldValue).superRefine((fields, context) => {
  for (const key of Object.keys(fields)) {
    if (!allowedFields.has(key)) context.addIssue({ code: 'custom', message: `Unknown property field: ${key}` });
  }
  if (Buffer.byteLength(JSON.stringify(fields), 'utf8') > 200_000) {
    context.addIssue({ code: 'custom', message: 'Draft fields are too large.' });
  }
});
const MediaManifest = z.array(z.object({
  name: z.string().min(1).max(255),
  mimeType: z.string().max(120),
  sizeBytes: z.number().int().min(0).max(1_073_741_824),
  lastModified: z.number().int().min(0),
}).strict()).max(MAX_MEDIA_FILES);
const Snapshot = z.object({
  formValues: FormValues,
  mediaManifest: MediaManifest,
  coverFileName: z.string().max(255),
}).strict();
const SaveBody = Snapshot.extend({ expectedVersion: z.number().int().positive() });
const Failure = z.object({
  phase: z.enum(['validation', 'media_validation', 'presign', 'upload', 'submit', 'unexpected']),
  code: z.string().regex(/^[A-Z0-9_]{1,80}$/u),
  message: z.string().min(1).max(500),
  httpStatus: z.number().int().min(100).max(599).optional(),
  outcome: z.enum(['failure', 'partial_failure']).optional(),
  steps: z.record(z.string(), z.enum(['ok', 'failed', 'skipped'])).optional(),
  submissionId: z.string().max(100).optional(),
  propertyId: z.string().max(100).optional(),
}).strict();
const FailureBody = SaveBody.extend({ failure: Failure });

function privateHeaders(response: Response): void {
  response.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer', 'Cross-Origin-Resource-Policy': 'same-origin' });
}

function sendError(response: Response, error: unknown): void {
  privateHeaders(response);
  if (error instanceof z.ZodError) {
    response.status(400).json({ error: 'INVALID_RECOVERY_DRAFT', details: error.issues.map((item) => item.message) });
    return;
  }
  if (error instanceof IdentityAccessError) {
    response.status(error.status).json({ error: error.code });
    return;
  }
  if (error instanceof IdentityConfigurationError) {
    response.status(503).json({ error: 'AUTH_DEPENDENCY_UNAVAILABLE' });
    return;
  }
  const envelope = safeErrorEnvelope(error, String(response.locals.request_id ?? 'recovery_draft'));
  response.status(envelope.status).json(envelope.body);
}

function summary(row: RecoveryDraftRow) {
  const values = row.form_values;
  return {
    id: row.id, version: row.version, updatedAt: row.updated_at,
    title: typeof values.Titulo === 'string' ? values.Titulo : '',
    address: [values.Calle, values.Numero, values.Localidad].filter((item) => typeof item === 'string' && item).join(' '),
    mediaCount: row.media_manifest.length,
    lastError: row.last_error,
  };
}

export function createPropertyRecoveryDraftsRouter(
  sessions: SessionService,
  repository: RecoveryDraftRepository = createRecoveryDraftRepository(),
  environment: NodeJS.ProcessEnv = process.env,
): Router {
  const router = Router({ mergeParams: true });
  router.use((_request, response, next) => { privateHeaders(response); next(); });

  async function context(request: Request, mutating: boolean) {
    const authenticated = await sessions.authenticate(request, false);
    if (mutating) assertCsrf(request, authenticated.session.csrf_token_hash, environment);
    const resolved = await sessions.context(request, String(request.params.organization ?? ''), 'properties.write');
    if (resolved.user_id !== authenticated.identity.id) throw new PlatformError('UNAUTHENTICATED');
    return { scope: createOrganizationScope(resolved.organization.id), userId: resolved.user_id };
  }

  router.get('/', async (request, response) => {
    try {
      const { scope, userId } = await context(request, false);
      const drafts = await repository.list(scope, userId);
      response.json({ drafts: drafts.map(summary) });
    } catch (error) { sendError(response, error); }
  });

  router.post('/', async (request, response) => {
    try {
      const { scope, userId } = await context(request, true);
      const snapshot = Snapshot.parse(request.body);
      const draft = await repository.create(scope, userId, snapshot);
      response.status(201).json({ draft });
    } catch (error) { sendError(response, error); }
  });

  router.get('/:draftId', async (request, response) => {
    try {
      const { scope, userId } = await context(request, false);
      const draft = await repository.find(scope, userId, DraftId.parse(request.params.draftId));
      if (!draft || draft.status !== 'open') throw new PlatformError('NOT_FOUND');
      response.json({ draft });
    } catch (error) { sendError(response, error); }
  });

  router.patch('/:draftId', async (request, response) => {
    try {
      const { scope, userId } = await context(request, true);
      const { expectedVersion, ...snapshot } = SaveBody.parse(request.body);
      const draft = await repository.save(scope, userId, DraftId.parse(request.params.draftId), expectedVersion, snapshot);
      response.json({ draft });
    } catch (error) { sendError(response, error); }
  });

  router.post('/:draftId/failures', async (request, response) => {
    try {
      const { scope, userId } = await context(request, true);
      const { expectedVersion, failure, ...snapshot } = FailureBody.parse(request.body);
      const draft = await repository.recordFailure(scope, userId, DraftId.parse(request.params.draftId),
        expectedVersion, snapshot, failure);
      response.status(201).json({ draft });
    } catch (error) { sendError(response, error); }
  });

  router.post('/:draftId/discard', async (request, response) => {
    try {
      const { scope, userId } = await context(request, true);
      await repository.close(scope, userId, DraftId.parse(request.params.draftId), 'discarded');
      response.status(204).end();
    } catch (error) { sendError(response, error); }
  });

  return router;
}
