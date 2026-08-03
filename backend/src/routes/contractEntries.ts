import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  ContractSchemaNotFoundError,
  RENT_CONTRACT_SCHEMA_ID,
  getContractRoleSchema,
} from '../config/contractSchemas.js';
import type {
  ContractDniImageReference,
  ContractEntryRecord,
  ContractEvidenceFileReference,
  ContractRole,
} from '../contracts/types.js';
import {
  ContractAuthenticationError,
  ContractAuthorizationError,
  authenticateContractRequest,
  authorizeContractAdmin,
  authorizeContractUserScope,
  getContractPrincipalUserId,
} from '../services/contractAuth.js';
import {
  createContractEntryRepository,
  ContractDatabaseConfigurationError,
  ContractEntryNotFoundError,
  ContractEntryStateError,
  type ContractEntryRepository,
} from '../services/contractEntryRepository.js';
import {
  ContractPublicBaseUrlConfigurationError,
  ContractRoleValidationError,
  createContractEntry,
  regenerateContractRoleToken,
  submitContractEntryRole,
  toContractEntrySummary,
} from '../services/contractEntryService.js';
import {
  CONTRACT_DNI_IMAGE_MIME_TYPES,
  ContractDniUploadConfigurationError,
  ContractDniUploadValidationError,
  getContractDniMaxImageBytes,
  issueContractDniViewUrl,
  issueContractDniUploadUrls,
  type ContractDniPresignedUpload,
  type ContractDniSignedView,
  type ContractDniUploadDescriptor,
} from '../services/contractDniUploadService.js';
import {
  CONTRACT_EVIDENCE_FILE_MIME_TYPE_SET,
  ContractEvidenceUploadConfigurationError,
  ContractEvidenceUploadValidationError,
  ContractEvidenceVerificationUnavailableError,
  getContractEvidenceMaxFileBytes,
  issueContractEvidenceUploadUrls,
  issueContractEvidenceViewUrl,
  verifyContractEvidenceReferences,
  type ContractEvidencePresignedUpload,
  type ContractEvidenceReferenceVerifier,
  type ContractEvidenceSignedView,
  type ContractEvidenceUploadDescriptor,
} from '../services/contractEvidenceUploadService.js';
import {
  buildContractAdminInspection,
  hydrateContractRoleValuesWithDownloadUrls,
  getContractSubmissionRecordsByRole,
} from '../services/contractAdminInspectionService.js';
import {
  createContractSubmissionRateLimiter,
  type ContractSubmissionRateLimiter,
} from '../services/contractSubmissionRateLimiter.js';
import {
  ContractTokenConfigurationError,
  verifyContractAccessToken,
} from '../services/contractTokenService.js';
import { normalizeContractRequestIp } from '../services/contractRequestContext.js';
import { getContractGoogleOAuthSession } from '../services/contractGoogleOAuth.js';

const EntryIdSchema = z.string().uuid();
const RoleSchema = z.enum(['user', 'client']);
const EntryStatusSchema = z.enum(['open', 'complete', 'archived', 'generar_contrato']);
const CreateEntryBodySchema = z.object({
  schemaId: z.string().trim().min(1).max(128).default(RENT_CONTRACT_SCHEMA_ID),
  createdBy: z.string().trim().min(1).max(256).optional(),
  Direccion: z.string().trim().min(1).max(256).optional(),
  direccion: z.string().trim().min(1).max(256).optional(),
}).strict().transform((value) => ({
  ...value,
  direccion: value.Direccion ?? value.direccion ?? "Sin direcciÃ³n",
}));
const SubmitRoleBodySchema = z.object({
  fields: z.record(z.string(), z.unknown()),
}).strict();
const DniPresignBodySchema = z.object({
  uploads: z.array(z.object({
    collection: z.enum(['inquilinos', 'garantes']),
    itemIndex: z.number().int().nonnegative(),
    slot: z.enum(['front', 'back']),
    originalName: z.string().trim().min(1).max(256),
    mimeType: z.string().refine((value) => CONTRACT_DNI_IMAGE_MIME_TYPES.has(value), {
      message: 'DNI uploads accept JPG, PNG, WEBP, GIF, HEIC, HEIF, or PDF files.',
    }),
    sizeBytes: z.number().int().positive(),
  }).strict()).min(1).max(20),
}).strict().superRefine((body, context) => {
  const slots = new Set<string>();
  body.uploads.forEach((upload, index) => {
    const key = `${upload.collection}:${upload.itemIndex}:${upload.slot}`;
    if (slots.has(key)) {
      context.addIssue({
        code: 'custom',
        path: ['uploads', index, 'slot'],
        message: 'Each repeated entry accepts only one front and one back DNI image.',
      });
    }
    slots.add(key);
  });
});
const EvidencePresignBodySchema = z.object({
  uploads: z.array(z.object({
    collection: z.literal('garantes'),
    itemIndex: z.number().int().nonnegative(),
    field: z.enum(['recibo_sueldo_files', 'garantia_propietaria_files']),
    filename: z.string().trim().min(1).max(256),
    mimeType: z.string().refine(
      (value) => CONTRACT_EVIDENCE_FILE_MIME_TYPE_SET.has(value),
      {
        message: 'Evidence uploads accept PDF, JPG, PNG, GIF, WEBP, BMP, or TIFF files only.',
      },
    ),
    size: z.number().int().positive(),
  }).strict()).min(1).max(20),
}).strict().superRefine((body, context) => {
  const receiverCounts = new Map<string, number>();
  body.uploads.forEach((upload, index) => {
    const key = `${upload.collection}:${upload.itemIndex}:${upload.field}`;
    const count = (receiverCounts.get(key) ?? 0) + 1;
    receiverCounts.set(key, count);
    if (count > 2) {
      context.addIssue({
        code: 'custom',
        path: ['uploads', index, 'field'],
        message: 'Each evidence receiver accepts at most two files.',
      });
    }
  });
});

export interface ContractEntriesRouterDependencies {
  readonly environment: NodeJS.ProcessEnv;
  readonly repository: ContractEntryRepository;
  readonly rateLimiter: ContractSubmissionRateLimiter;
  readonly now: () => Date;
  readonly issueDniUploadUrls: (
    entryId: string,
    descriptors: readonly ContractDniUploadDescriptor[],
    environment: NodeJS.ProcessEnv,
  ) => Promise<readonly ContractDniPresignedUpload[]>;
  readonly issueDniViewUrl: (
    reference: ContractDniImageReference,
    environment: NodeJS.ProcessEnv,
  ) => Promise<ContractDniSignedView>;
  readonly issueEvidenceUploadUrls: (
    entryId: string,
    descriptors: readonly ContractEvidenceUploadDescriptor[],
    environment: NodeJS.ProcessEnv,
  ) => Promise<readonly ContractEvidencePresignedUpload[]>;
  readonly issueEvidenceViewUrl: (
    reference: ContractEvidenceFileReference,
    environment: NodeJS.ProcessEnv,
  ) => Promise<ContractEvidenceSignedView>;
  readonly verifyEvidenceReferences: ContractEvidenceReferenceVerifier;
}

function resolveDependencies(
  overrides: Partial<ContractEntriesRouterDependencies>,
): ContractEntriesRouterDependencies {
  const environment = overrides.environment ?? process.env;
  return {
    environment,
    repository: overrides.repository ?? createContractEntryRepository(environment),
    rateLimiter: overrides.rateLimiter ?? createContractSubmissionRateLimiter(environment),
    now: overrides.now ?? (() => new Date()),
    issueDniUploadUrls: overrides.issueDniUploadUrls ?? issueContractDniUploadUrls,
    issueDniViewUrl: overrides.issueDniViewUrl ?? issueContractDniViewUrl,
    issueEvidenceUploadUrls:
      overrides.issueEvidenceUploadUrls ?? issueContractEvidenceUploadUrls,
    issueEvidenceViewUrl:
      overrides.issueEvidenceViewUrl ?? issueContractEvidenceViewUrl,
    verifyEvidenceReferences:
      overrides.verifyEvidenceReferences ?? verifyContractEvidenceReferences,
  };
}

function authenticate(req: Request, environment: NodeJS.ProcessEnv) {
  const session = getContractGoogleOAuthSession(req, environment);
  return authenticateContractRequest({
    authorization: req.get('Authorization'),
    authenticatedUserId: req.get('X-Authenticated-User-Id'),
    developmentUserId: req.get('X-User-Id'),
    ...(session ? { oauthUser: { userId: session.userId, email: session.email } } : {}),
  }, environment);
}

function setPrivateHeaders(res: Response): void {
  res.set('Cache-Control', 'no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'no-referrer');
}

function getBearerToken(req: Request): string | undefined {
  const authorization = req.get('Authorization');
  if (!authorization) return undefined;
  return /^Bearer[ \t]+([^\s,]+)$/u.exec(authorization.trim())?.[1];
}

function getAccessToken(req: Request): string | undefined {
  const queryToken = req.query.token;
  if (typeof queryToken === 'string') return queryToken;
  return getBearerToken(req);
}

function getPublicBaseUrl(req: Request, environment: NodeJS.ProcessEnv): string {
  const configured = environment.CONTRACT_PUBLIC_BASE_URL?.trim();
  if (configured) return configured;
  if (environment.NODE_ENV === 'production') {
    throw new ContractPublicBaseUrlConfigurationError();
  }
  return `${req.protocol}://${req.get('host') ?? 'localhost'}`;
}

function roleTokenHash(entry: ContractEntryRecord, role: ContractRole): string {
  return role === 'user' ? entry.userTokenHash : entry.clientTokenHash;
}

function authorizeRoleAccess(
  req: Request,
  entry: ContractEntryRecord,
  role: ContractRole,
  environment: NodeJS.ProcessEnv,
): string | null {
  const token = getAccessToken(req);
  if (token && verifyContractAccessToken(token, roleTokenHash(entry, role), environment)) {
    return roleTokenHash(entry, role);
  }
  if (role === 'client') {
    if (!token) {
      throw new ContractAuthenticationError('A client contract access token is required.');
    }
    throw new ContractAuthorizationError('The contract access token is invalid.');
  }
  if (typeof req.query.token === 'string') {
    throw new ContractAuthorizationError('The contract access token is invalid.');
  }
  const principal = authenticate(req, environment);
  authorizeContractUserScope(principal, entry.createdBy);
  return null;
}

async function loadEntry(
  entryIdValue: string | undefined,
  repository: ContractEntryRepository,
): Promise<ContractEntryRecord> {
  const parsed = EntryIdSchema.safeParse(entryIdValue);
  if (!parsed.success) throw new z.ZodError(parsed.error.issues);
  const entry = await repository.findEntry(parsed.data);
  if (!entry) throw new ContractEntryNotFoundError(parsed.data);
  return entry;
}

function validationErrors(error: ContractRoleValidationError) {
  return error.errors.map((issue) => ({
    field: issue.path.startsWith('fields.') ? issue.path.slice(7) : issue.path,
    message: issue.message,
  }));
}

function sendError(res: Response, error: unknown): void {
  if (error instanceof z.ZodError) {
    res.status(400).json({
      error: 'INVALID_REQUEST',
      message: 'The contract request is invalid.',
      errors: error.issues.map((issue) => ({
        field: issue.path.join('.') || 'request',
        message: issue.message,
      })),
      retriable: false,
    });
    return;
  }
  if (error instanceof ContractRoleValidationError) {
    res.status(400).json({
      error: 'VALIDATION_FAILED',
      message: error.message,
      errors: validationErrors(error),
      retriable: false,
    });
    return;
  }
  if (error instanceof ContractDniUploadValidationError) {
    res.status(400).json({
      error: 'INVALID_DNI_UPLOAD',
      message: error.message,
      retriable: false,
    });
    return;
  }
  if (error instanceof ContractEvidenceUploadValidationError) {
    res.status(400).json({
      error: 'INVALID_EVIDENCE_UPLOAD',
      message: error.message,
      retriable: false,
    });
    return;
  }
  if (error instanceof ContractEvidenceVerificationUnavailableError) {
    res.status(503).json({
      error: 'EVIDENCE_VERIFICATION_UNAVAILABLE',
      message: error.message,
      retriable: true,
    });
    return;
  }

  if (error instanceof ContractAuthenticationError) {
    res.status(401).json({ error: 'AUTHENTICATION_REQUIRED', message: error.message, retriable: false });
    return;
  }
  if (error instanceof ContractAuthorizationError) {
    res.status(403).json({ error: 'FORBIDDEN', message: error.message, retriable: false });
    return;
  }
  if (error instanceof ContractEntryNotFoundError || error instanceof ContractSchemaNotFoundError) {
    res.status(404).json({ error: 'NOT_FOUND', message: error.message, retriable: false });
    return;
  }
  if (error instanceof ContractEntryStateError) {
    const status = error.code === 'archived' ? 410
      : error.code === 'access_changed' ? 403
        : 409;
    const code = error.code === 'archived' ? 'ENTRY_ARCHIVED'
      : error.code === 'access_changed' ? 'ACCESS_REVOKED'
        : 'ALREADY_SUBMITTED';
    res.status(status).json({
      error: code,
      message: error.message,
      retriable: false,
    });
    return;
  }
  if (
    error instanceof ContractDatabaseConfigurationError ||
    error instanceof ContractDniUploadConfigurationError ||
    error instanceof ContractEvidenceUploadConfigurationError ||
    error instanceof ContractPublicBaseUrlConfigurationError ||
    error instanceof ContractTokenConfigurationError
  ) {
    console.error('[contract-entries] configuration error', error.name);
    res.status(500).json({
      error: 'CONTRACT_CONFIGURATION_ERROR',
      message: error.message,
      retriable: false,
    });
    return;
  }
  console.error('[contract-entries] unexpected error', error instanceof Error ? error.name : 'UnknownError');
  res.status(500).json({
    error: 'INTERNAL_ERROR',
    message: 'The contract operation could not be completed.',
    retriable: false,
  });
}

export function createContractEntriesRouter(
  dependencyOverrides: Partial<ContractEntriesRouterDependencies> = {},
): Router {
  const dependencies = resolveDependencies(dependencyOverrides);
  const router = Router();

  router.use((req, res, next) => {
    if (dependencies.environment.NODE_ENV === 'production' && !req.secure) {
      setPrivateHeaders(res);
      res.status(426).json({
        error: 'HTTPS_REQUIRED',
        message: 'Contract links and submissions are accepted only over HTTPS.',
        retriable: false,
      });
      return;
    }
    next();
  });

  router.post('/create', async (req, res) => {
    setPrivateHeaders(res);
    try {
      const principal = authenticate(req, dependencies.environment);
      const body = CreateEntryBodySchema.parse(req.body);
      const createdBy = getContractPrincipalUserId(principal, body.createdBy);
      const entry = await createContractEntry({
        schemaId: body.schemaId,
        direccion: body.direccion,
        createdBy,
        publicBaseUrl: getPublicBaseUrl(req, dependencies.environment),
      }, dependencies.repository, dependencies.environment);
      res.status(201).json(entry);
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/admin/entries', async (req, res) => {
    setPrivateHeaders(res);
    try {
      const principal = authenticate(req, dependencies.environment);
      authorizeContractAdmin(principal, dependencies.environment);
      const entries = await dependencies.repository.listEntries();
      res.status(200).json({ entries: entries.map(toContractEntrySummary) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/admin/entries/:entryId', async (req, res) => {
    setPrivateHeaders(res);
    try {
      const principal = authenticate(req, dependencies.environment);
      authorizeContractAdmin(principal, dependencies.environment);
      const entry = await loadEntry(req.params.entryId, dependencies.repository);
      const submissions = await dependencies.repository.listSubmissions(entry.id);
      const submissionsByRole = getContractSubmissionRecordsByRole(entry.id, submissions);
      const inspection = await buildContractAdminInspection(
        entry,
        submissions,
        dependencies.environment,
        {
          issueDniViewUrl: dependencies.issueDniViewUrl,
          issueEvidenceViewUrl: dependencies.issueEvidenceViewUrl,
        },
      );
      res.status(200).json({
        entry: toContractEntrySummary(entry),
        userSubmission: submissionsByRole.get('user')?.submission ?? null,
        clientSubmission: submissionsByRole.get('client')?.submission ?? null,
        combinedSubmission: entry.combinedSubmission,
        roleSchemas: {
          user: getContractRoleSchema(entry.schemaId, "user", dependencies.environment),
          client: getContractRoleSchema(entry.schemaId, "client", dependencies.environment),
        },
        inspection,
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  const updateAdminRoleSubmission = async (req: Request, res: Response) => {
    setPrivateHeaders(res);
    try {
      const principal = authenticate(req, dependencies.environment);
      authorizeContractAdmin(principal, dependencies.environment);
      const entryId = EntryIdSchema.parse(req.params.entryId);
      const role = RoleSchema.parse(req.params.role);
      const body = SubmitRoleBodySchema.parse(req.body);
      const entry = await loadEntry(entryId, dependencies.repository);
      if (entry.status === 'archived') throw new ContractEntryStateError('archived');
      const roleFilled = role === 'user' ? entry.userFilled : entry.clientFilled;
      if (!roleFilled) throw new ContractEntryStateError('already_submitted');
      const receivedAt = dependencies.now().toISOString();
      const updated = await submitContractEntryRole({
        entry,
        role,
        authorizedTokenHash: null,
        fields: body.fields,
        mode: 'update',
        metadata: {
          ip: normalizeContractRequestIp(req.ip),
          userAgent: (req.get('User-Agent') ?? '').slice(0, 512),
          receivedAt,
        },
      }, dependencies.repository, {
        environment: dependencies.environment,
        verifyEvidenceReferences: dependencies.verifyEvidenceReferences,
      });
      res.status(200).json({
        entry: toContractEntrySummary(await loadEntry(entryId, dependencies.repository)),
        submissionId: updated.submissionId,
        submittedAt: updated.submittedAt,
      });
    } catch (error) {
      sendError(res, error);
    }
  };

  router.patch('/admin/entries/:entryId/submissions/:role', updateAdminRoleSubmission);
  router.put('/admin/entries/:entryId/submissions/:role', updateAdminRoleSubmission);

  router.post('/admin/entries/:entryId/status', async (req, res) => {
    setPrivateHeaders(res);
    try {
      const principal = authenticate(req, dependencies.environment);
      authorizeContractAdmin(principal, dependencies.environment);
      const entryId = EntryIdSchema.parse(req.params.entryId);
      const body = z.object({ status: EntryStatusSchema }).parse(req.body);
      const entry = await dependencies.repository.updateStatus!(entryId, body.status);
      res.status(200).json({ entry: toContractEntrySummary(entry) });
    } catch (error) {
      sendError(res, error);
    }
  });
  router.post('/admin/entries/:entryId/archive', async (req, res) => {
    setPrivateHeaders(res);
    try {
      const principal = authenticate(req, dependencies.environment);
      authorizeContractAdmin(principal, dependencies.environment);
      const entryId = EntryIdSchema.parse(req.params.entryId);
      const entry = await dependencies.repository.archiveEntry(
        entryId,
        dependencies.now().toISOString(),
      );
      res.status(200).json({ entry: toContractEntrySummary(entry) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/admin/entries/:entryId/tokens/:role/regenerate', async (req, res) => {
    setPrivateHeaders(res);
    try {
      const principal = authenticate(req, dependencies.environment);
      authorizeContractAdmin(principal, dependencies.environment);
      const entryId = EntryIdSchema.parse(req.params.entryId);
      const role = RoleSchema.parse(req.params.role);
      const result = await regenerateContractRoleToken({
        entryId,
        role,
        publicBaseUrl: getPublicBaseUrl(req, dependencies.environment),
      }, dependencies.repository, dependencies.environment, { now: dependencies.now });
      res.status(200).json(result);
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/:entryId/dni-uploads/presign', async (req, res) => {
    setPrivateHeaders(res);
    try {
      const entry = await loadEntry(req.params.entryId, dependencies.repository);
      if (entry.status === 'archived') throw new ContractEntryStateError('archived');
      authorizeRoleAccess(req, entry, 'client', dependencies.environment);
      const body = DniPresignBodySchema.parse(req.body);
      const maxImageBytes = getContractDniMaxImageBytes(dependencies.environment);
      if (body.uploads.some((upload) => upload.sizeBytes > maxImageBytes)) {
        throw new ContractDniUploadValidationError(
          'The DNI image size is outside the configured limit.',
        );
      }
      const uploads = await dependencies.issueDniUploadUrls(
        entry.id,
        body.uploads,
        dependencies.environment,
      );
      res.status(200).json({ uploads });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/:entryId/evidence-uploads/presign', async (req, res) => {
    setPrivateHeaders(res);
    try {
      const entry = await loadEntry(req.params.entryId, dependencies.repository);
      if (entry.status === 'archived') throw new ContractEntryStateError('archived');
      authorizeRoleAccess(req, entry, 'client', dependencies.environment);
      // Repeatable role schemas do not define a maximum guarantor count. This
      // evidence-specific bucket bounds preflight issuance without consuming
      // final-submit attempts; a durable per-entry quota would require storage.
      const rateLimit = dependencies.rateLimiter.check(
        `evidence:${normalizeContractRequestIp(req.ip)}:${entry.id}`,
      );
      if (!rateLimit.allowed) {
        res.set('Retry-After', String(rateLimit.retryAfterSeconds));
        res.status(429).json({
          error: 'RATE_LIMITED',
          message: 'Too many evidence upload requests. Try again later.',
          retriable: true,
        });
        return;
      }
      const body = EvidencePresignBodySchema.parse(req.body);
      const maxFileBytes = getContractEvidenceMaxFileBytes(dependencies.environment);
      if (body.uploads.some((upload) => upload.size > maxFileBytes)) {
        throw new ContractEvidenceUploadValidationError(
          'The evidence file size is outside the configured limit.',
        );
      }
      const uploads = await dependencies.issueEvidenceUploadUrls(
        entry.id,
        body.uploads,
        dependencies.environment,
      );
      res.status(200).json({ uploads });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/:entryId/schema', async (req, res) => {
    setPrivateHeaders(res);
    try {
      const role = RoleSchema.parse(req.query.role);
      const entry = await loadEntry(req.params.entryId, dependencies.repository);
      if (entry.status === 'archived') throw new ContractEntryStateError('archived');
      authorizeRoleAccess(req, entry, role, dependencies.environment);
      const roleSchema = getContractRoleSchema(
        entry.schemaId,
        role,
        dependencies.environment,
      );
      const values = role === 'user' ? entry.userSubmission : entry.clientSubmission;
      const downloadableValues = await hydrateContractRoleValuesWithDownloadUrls(
        entry,
        role,
        roleSchema.sections,
        values ?? {},
        dependencies.environment,
        {
          issueDniViewUrl: dependencies.issueDniViewUrl,
          issueEvidenceViewUrl: dependencies.issueEvidenceViewUrl,
        },
      );
      res.status(200).json({
        ...roleSchema,
        entry: toContractEntrySummary(entry),
        readOnly: false,
        values: downloadableValues,
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/:entryId/submit', async (req, res) => {
    setPrivateHeaders(res);
    try {
      const role = RoleSchema.parse(req.query.role);
      const entryId = EntryIdSchema.parse(req.params.entryId);
      const rateLimit = dependencies.rateLimiter.check(
        `${normalizeContractRequestIp(req.ip)}:${entryId}`,
      );
      if (!rateLimit.allowed) {
        res.set('Retry-After', String(rateLimit.retryAfterSeconds));
        res.status(429).json({
          error: 'RATE_LIMITED',
          message: 'Too many submission attempts. Try again later.',
          retriable: true,
        });
        return;
      }
      const entry = await loadEntry(entryId, dependencies.repository);
      if (entry.status === 'archived') throw new ContractEntryStateError('archived');
      const alreadyFilled = role === 'user' ? entry.userFilled : entry.clientFilled;
      const authorizedTokenHash = authorizeRoleAccess(
        req,
        entry,
        role,
        dependencies.environment,
      );
      if (alreadyFilled && !dependencies.repository.updateRoleSubmission) {
        throw new ContractEntryStateError('already_submitted');
      }
      const body = SubmitRoleBodySchema.parse(req.body);
      const receivedAt = dependencies.now().toISOString();
      const result = await submitContractEntryRole({
        entry,
        role,
        authorizedTokenHash,
        fields: body.fields,
        mode: alreadyFilled ? 'update' : 'create',
        metadata: {
          ip: normalizeContractRequestIp(req.ip),
          userAgent: (req.get('User-Agent') ?? '').slice(0, 512),
          receivedAt,
        },
      }, dependencies.repository, {
        environment: dependencies.environment,
        verifyEvidenceReferences: dependencies.verifyEvidenceReferences,
      });
      res.status(200).json(result);
    } catch (error) {
      sendError(res, error);
    }
  });

  return router;
}

export default createContractEntriesRouter();


