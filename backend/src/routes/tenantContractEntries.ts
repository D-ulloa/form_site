import { randomUUID } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { RENT_CONTRACT_SCHEMA_ID, getContractRoleSchema, getContractSchemaDefinition } from '../config/contractSchemas.js';
import { createOrganizationScope } from '../platform/scope.js';
import { PlatformError, safeErrorEnvelope } from '../platform/errors.js';
import { SessionService } from '../identity/sessionService.js';
import { IdentityAccessError, assertCsrf } from '../identity/sessionSecurity.js';
import { generateContractAccessToken, hashContractAccessToken } from '../services/contractTokenService.js';
import { ContractRoleValidationError, submitContractEntryRole, toContractEntrySummary } from '../services/contractEntryService.js';
import { ContractEntryStateError, type ContractEntryRepository } from '../services/contractEntryRepository.js';
import { normalizeContractRequestIp } from '../services/contractRequestContext.js';
import { buildContractAdminInspection, getContractSubmissionRecordsByRole } from '../services/contractAdminInspectionService.js';
import type { ContractRole } from '../contracts/types.js';
import {
  createTenantContractHttpRepository,
  type TenantContractHttpRepository,
} from '../contracts/tenantContractHttpRepository.js';

const EntryId = z.string().uuid();
const Role = z.enum(['user', 'client']);
const CreateBody = z.object({
  schemaId: z.string().trim().min(1).max(128).default(RENT_CONTRACT_SCHEMA_ID),
  Direccion: z.string().trim().min(1).max(256).optional(),
  direccion: z.string().trim().min(1).max(256).optional(),
}).strict();

function privateHeaders(response: Response): void {
  response.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer', 'Cross-Origin-Resource-Policy': 'same-origin' });
}

function organizationParam(request: Request): string {
  return String((request.params as Record<string, string | undefined>).organization ?? "");
}

function requestId(response: Response): string {
  return String(response.locals.request_id ?? `req_${randomUUID()}`);
}

function publicBaseUrl(request: Request, environment: NodeJS.ProcessEnv): string {
  if (environment.VERCEL_ENV?.trim().toLowerCase() === 'preview' && environment.VERCEL_URL?.trim()) {
    const value = environment.VERCEL_URL.trim();
    return /^https?:\/\//iu.test(value) ? value : `https://${value}`;
  }
  return environment.CONTRACT_PUBLIC_BASE_URL?.trim()
    ?? `${request.protocol}://${request.get('host') ?? 'localhost'}`;
}

function externalUrl(base: string, entryId: string, role: ContractRole, token: string): string {
  const url = new URL(`/contracts/${encodeURIComponent(entryId)}/${role}`, `${base.replace(/\/$/u, '')}/`);
  url.searchParams.set('token', token);
  return url.toString();
}

function sendError(response: Response, error: unknown): void {
  privateHeaders(response);
  if (error instanceof z.ZodError) {
    response.status(400).json({ error: 'INVALID_REQUEST', message: 'The contract request is invalid.', retriable: false });
    return;
  }
  if (error instanceof ContractRoleValidationError) {
    response.status(400).json({ error: "VALIDATION_FAILED", message: error.message,
      errors: error.errors, retriable: false });
    return;
  }
  if (error instanceof ContractEntryStateError) {
    response.status(error.code === "archived" ? 410 : 409).json({
      error: error.code === "archived" ? "ENTRY_ARCHIVED" : "INVALID_STATE", retriable: false,
    });
    return;
  }
  if (error instanceof IdentityAccessError) {
    response.status(error.status).json({ error: error.code, retriable: false });
    return;
  }
  const envelope = safeErrorEnvelope(error, requestId(response));
  response.status(envelope.status).json(envelope.body);
}

export function createTenantContractEntriesRouter(
  sessions: SessionService,
  repository: TenantContractHttpRepository = createTenantContractHttpRepository(),
  environment: NodeJS.ProcessEnv = process.env,
): Router {
  const router = Router({ mergeParams: true });
  router.use((_request, response, next) => { privateHeaders(response); next(); });

  router.post('/create', async (request, response) => {
    try {
      const authenticated = await sessions.authenticate(request, false);
      assertCsrf(request, authenticated.session.csrf_token_hash, environment);
      const context = await sessions.context(request, organizationParam(request), 'contracts.create');
      const body = CreateBody.parse(request.body);
      getContractSchemaDefinition(body.schemaId);
      const entryId = randomUUID();
      const userToken = generateContractAccessToken();
      const clientToken = generateContractAccessToken();
      const scope = createOrganizationScope(context.organization.id);
      const entry = await repository.create(scope, {
        user_id: context.user_id, membership_id: context.membership.id,
        request_id: requestId(response),
      }, {
        id: entryId, schema_id: body.schemaId,
        direccion: body.Direccion ?? body.direccion ?? 'Sin dirección',
        user_token_hash: hashContractAccessToken(userToken, environment),
        client_token_hash: hashContractAccessToken(clientToken, environment),
      });
      const base = publicBaseUrl(request, environment);
      response.status(201).json({
        entryId, direccion: entry.direccion ?? 'Sin dirección',
        adminUrl: new URL(`/t/${context.organization.slug}/contracts/admin/${entryId}`, `${base.replace(/\/$/u, '')}/`).toString(),
        userUrl: externalUrl(base, entryId, 'user', userToken),
        clientUrl: externalUrl(base, entryId, 'client', clientToken),
        createdAt: entry.createdAt, status: 'open',
      });
    } catch (error) { sendError(response, error); }
  });

  router.get('/admin/entries', async (request, response) => {
    try {
      const context = await sessions.context(request, organizationParam(request), 'contracts.manage');
      const entries = await repository.list(createOrganizationScope(context.organization.id));
      response.json({ entries: entries.map(toContractEntrySummary) });
    } catch (error) { sendError(response, error); }
  });

  router.get('/admin/entries/:entryId', async (request, response) => {
    try {
      const context = await sessions.context(request, organizationParam(request), 'contracts.manage');
      const entryId = EntryId.parse(request.params.entryId);
      const scope = createOrganizationScope(context.organization.id);
      const entry = await repository.find(scope, entryId);
      if (!entry) throw new PlatformError('NOT_FOUND');
      const submissions = await repository.submissions(scope, entryId);
      const byRole = getContractSubmissionRecordsByRole(entry.id, submissions);
      response.json({
        entry: toContractEntrySummary(entry),
        userSubmission: byRole.get('user')?.submission ?? null,
        clientSubmission: byRole.get('client')?.submission ?? null,
        combinedSubmission: entry.combinedSubmission,
        roleSchemas: {
          user: getContractRoleSchema(entry.schemaId, 'user', environment),
          client: getContractRoleSchema(entry.schemaId, 'client', environment),
        },
        inspection: await buildContractAdminInspection(entry, submissions, environment),
      });
    } catch (error) { sendError(response, error); }
  });

  router.post('/admin/entries/:entryId/status', async (request, response) => {
    try {
      const authenticated = await sessions.authenticate(request, false);
      assertCsrf(request, authenticated.session.csrf_token_hash, environment);
      const context = await sessions.context(request, organizationParam(request), 'contracts.change_status');
      const entryId = EntryId.parse(request.params.entryId);
      const status = z.enum(['open', 'complete', 'generar_contrato']).parse(request.body?.status);
      const scope = createOrganizationScope(context.organization.id);
      const current = await repository.find(scope, entryId);
      if (!current) throw new PlatformError('NOT_FOUND');
      const entry = await repository.setStatus(scope, {
        user_id: context.user_id, membership_id: context.membership.id,
        request_id: requestId(response),
      }, entryId, current.version ?? 1, status);
      response.json({ entry: toContractEntrySummary(entry), ...(status === 'generar_contrato'
        ? { integration: { delivery: 'deferred', reason: 'SPEC25_CONTAINMENT' } } : {}) });
    } catch (error) { sendError(response, error); }
  });

  router.post('/admin/entries/:entryId/archive', async (request, response) => {
    try {
      const authenticated = await sessions.authenticate(request, false);
      assertCsrf(request, authenticated.session.csrf_token_hash, environment);
      const context = await sessions.context(request, organizationParam(request), 'contracts.archive');
      const entryId = EntryId.parse(request.params.entryId);
      const scope = createOrganizationScope(context.organization.id);
      const current = await repository.find(scope, entryId);
      if (!current) throw new PlatformError('NOT_FOUND');
      const entry = await repository.archive(scope, {
        user_id: context.user_id, membership_id: context.membership.id,
        request_id: requestId(response),
      }, entryId, current.version ?? 1);
      response.json({ entry: toContractEntrySummary(entry) });
    } catch (error) { sendError(response, error); }
  });

  router.post('/admin/entries/:entryId/tokens/:role/regenerate', async (request, response) => {
    try {
      const authenticated = await sessions.authenticate(request, false);
      assertCsrf(request, authenticated.session.csrf_token_hash, environment);
      const context = await sessions.context(request, organizationParam(request), 'contracts.manage_links');
      const entryId = EntryId.parse(request.params.entryId);
      const role = Role.parse(request.params.role);
      const scope = createOrganizationScope(context.organization.id);
      const current = await repository.find(scope, entryId);
      if (!current) throw new PlatformError('NOT_FOUND');
      const token = generateContractAccessToken();
      await repository.replaceToken(scope, {
        user_id: context.user_id, membership_id: context.membership.id,
        request_id: requestId(response),
      }, entryId, current.version ?? 1,
      role, hashContractAccessToken(token, environment));
      response.json({ role, url: externalUrl(publicBaseUrl(request, environment), entryId, role, token) });
    } catch (error) { sendError(response, error); }
  });
  const updateSubmission = async (request: Request, response: Response) => {
    try {
      const authenticated = await sessions.authenticate(request, false);
      assertCsrf(request, authenticated.session.csrf_token_hash, environment);
      const context = await sessions.context(request, organizationParam(request), "contracts.manage");
      const entryId = EntryId.parse(request.params.entryId);
      const role = Role.parse(request.params.role);
      const fields = z.record(z.string(), z.unknown()).parse(request.body?.fields);
      const scope = createOrganizationScope(context.organization.id);
      const entry = await repository.find(scope, entryId);
      if (!entry) throw new PlatformError("NOT_FOUND");
      if (entry.status === "archived") throw new ContractEntryStateError("archived");
      if (!(role === "user" ? entry.userFilled : entry.clientFilled)) {
        throw new PlatformError("VERSION_CONFLICT");
      }
      const actor = { user_id: context.user_id, membership_id: context.membership.id,
        request_id: requestId(response) };
      const adapter = {
        updateRoleSubmission: async (input: Parameters<NonNullable<ContractEntryRepository["updateRoleSubmission"]>>[0]) =>
          repository.appendRevision(scope, actor, entry, role, input.fields, input.submissionId),
      } as unknown as ContractEntryRepository;
      const result = await submitContractEntryRole({
        entry, role, authorizedTokenHash: null, fields, mode: "update",
        metadata: { ip: normalizeContractRequestIp(request.ip),
          userAgent: (request.get("User-Agent") ?? "").slice(0, 512),
          receivedAt: new Date().toISOString() },
      }, adapter, { environment });
      const updated = await repository.find(scope, entryId);
      if (!updated) throw new PlatformError("NOT_FOUND");
      response.json({ entry: toContractEntrySummary(updated), submissionId: result.submissionId,
        submittedAt: result.submittedAt });
    } catch (error) { sendError(response, error); }
  };
  router.patch("/admin/entries/:entryId/submissions/:role", updateSubmission);
  router.put("/admin/entries/:entryId/submissions/:role", updateSubmission);
  return router;
}
