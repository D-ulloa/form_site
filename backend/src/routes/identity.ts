import { Router, type NextFunction, type Request, type Response } from 'express';
import type { IdentityRepository } from '../identity/identityRepository.js';
import { SessionService } from '../identity/sessionService.js';
import {
  IdentityAccessError, IdentityConfigurationError, assertCsrf, assertMutationOrigin,
  clearSessionCookies, serializeSessionCookies,
} from '../identity/sessionSecurity.js';
import type { IdentityProvider } from '../identity/supabaseIdentityProvider.js';

function privateHeaders(response: Response): void {
  response.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer', 'Cross-Origin-Resource-Policy': 'same-origin' });
}

function safeError(response: Response, error: unknown): void {
  privateHeaders(response);
  if (error instanceof IdentityAccessError) {
    response.status(error.status).json({ error: error.code, retriable: false }); return;
  }
  if (error instanceof IdentityConfigurationError) {
    response.status(503).json({ error: 'AUTH_DEPENDENCY_UNAVAILABLE', retriable: true }); return;
  }
  const code = error instanceof Error && error.message === 'INVALID_CREDENTIALS'
    ? 'INVALID_CREDENTIALS' : 'AUTH_DEPENDENCY_UNAVAILABLE';
  response.status(code === 'INVALID_CREDENTIALS' ? 401 : 503).json({ error: code, retriable: code !== 'INVALID_CREDENTIALS' });
}

function bodyRecord(request: Request): Record<string, unknown> {
  return request.body && typeof request.body === 'object' ? request.body as Record<string, unknown> : {};
}

function publicSession(session: Awaited<ReturnType<SessionService['authenticate']>>, memberships: Awaited<ReturnType<SessionService['memberships']>>) {
  return { authenticated: true, user: { id: session.identity.id, email: session.identity.email,
    name: session.identity.display_name }, session: {
    id: session.session.id, auth_method: session.session.auth_method,
    assurance_level: session.session.assurance_level, created_at: session.session.created_at,
    absolute_expires_at: session.session.absolute_expires_at,
    idle_expires_at: session.session.idle_expires_at, remembered: session.session.remembered,
  }, memberships };
}

export function createIdentityRouter(
  service: SessionService,
  provider: IdentityProvider,
  environment: NodeJS.ProcessEnv = process.env,
): Router {
  const router = Router();
  router.use((_request, response, next) => { privateHeaders(response); next(); });

  router.post('/register', (_request, response) => {
    response.status(403).json({ error: 'REGISTRATION_CLOSED', retriable: false });
  });

  router.post('/password/reset/request', async (request, response) => {
    try {
      assertMutationOrigin(request, environment);
      const body = bodyRecord(request);
      const email = typeof body.email === 'string' ? body.email.trim() : '';
      if (email && email.length <= 320) {
        const redirect = environment.APP_PASSWORD_RESET_REDIRECT_URL?.trim();
        if (!redirect) throw new IdentityConfigurationError('Password reset redirect is unavailable.');
        try { await provider.requestPasswordReset(email, redirect); } catch { /* enumeration-resistant response */ }
      }
      response.status(202).json({ accepted: true });
    } catch (error) { safeError(response, error); }
  });

  router.post('/password/change', async (request, response) => {
    try {
      const authenticated = await service.authenticate(request, false);
      assertCsrf(request, authenticated.session.csrf_token_hash, environment);
      if (authenticated.session.assurance_level !== 'aal2') throw new IdentityAccessError('STEP_UP_REQUIRED', 403);
      const password = bodyRecord(request).password;
      if (typeof password !== 'string' || password.length < 12 || password.length > 1024) {
        throw new IdentityAccessError('INVALID_REQUEST', 422);
      }
      await provider.updatePassword(authenticated.identity.id, password);
      await service.revokeOthers(request);
      response.status(204).end();
    } catch (error) { safeError(response, error); }
  });

  router.post('/email/change', async (request, response) => {
    try {
      const authenticated = await service.authenticate(request, false);
      assertCsrf(request, authenticated.session.csrf_token_hash, environment);
      if (authenticated.session.assurance_level !== 'aal2') throw new IdentityAccessError('STEP_UP_REQUIRED', 403);
      const email = bodyRecord(request).email;
      if (typeof email !== 'string' || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
        throw new IdentityAccessError('INVALID_REQUEST', 422);
      }
      await provider.updateEmail(authenticated.identity.id, email);
      await service.revokeOthers(request);
      response.status(202).json({ accepted: true });
    } catch (error) { safeError(response, error); }
  });

  router.post('/login', async (request, response) => {
    try {
      assertMutationOrigin(request, environment);
      const body = bodyRecord(request);
      const email = typeof body.email === 'string' ? body.email.trim() : '';
      const password = typeof body.password === 'string' ? body.password : '';
      if (!email || email.length > 320 || password.length < 8 || password.length > 1024) {
        throw new IdentityAccessError('INVALID_REQUEST', 422);
      }
      const identity = await provider.password(email, password);
      const created = await service.create(identity, body.remember_me === true || body.rememberMe === true, request);
      response.set('Set-Cookie', [...serializeSessionCookies(created.material, environment,
        created.session.remembered, created.max_age_seconds)]);
      response.json(publicSession({ session: created.session, identity: {
        id: identity.user_id, email: identity.email, display_name: identity.display_name,
      } }, await service.memberships(identity.user_id)));
    } catch (error) { safeError(response, error); }
  });

  router.post('/google/session', async (request, response) => {
    try {
      assertMutationOrigin(request, environment);
      const body = bodyRecord(request);
      const token = typeof body.access_token === 'string' ? body.access_token
        : typeof body.accessToken === 'string' ? body.accessToken : '';
      if (!token || token.length > 16384) throw new IdentityAccessError('INVALID_REQUEST', 422);
      const identity = await provider.accessToken(token, 'google');
      const created = await service.create(identity, body.remember_me !== false && body.rememberMe !== false, request);
      response.set('Set-Cookie', [...serializeSessionCookies(created.material, environment,
        created.session.remembered, created.max_age_seconds)]);
      response.json(publicSession({ session: created.session, identity: {
        id: identity.user_id, email: identity.email, display_name: identity.display_name,
      } }, await service.memberships(identity.user_id)));
    } catch (error) { safeError(response, error); }
  });

  router.get('/session', async (request, response) => {
    try {
      const authenticated = await service.authenticate(request);
      response.json(publicSession(authenticated, await service.memberships(authenticated.identity.id)));
    } catch (error) {
      if (error instanceof IdentityAccessError && error.status === 401) {
        response.set('Set-Cookie', [...clearSessionCookies(environment)]);
        response.json({ authenticated: false }); return;
      }
      safeError(response, error);
    }
  });

  router.get('/sessions', async (request, response) => {
    try {
      const current = await service.authenticate(request);
      const sessions = await service.listSessions(request);
      response.json({ items: sessions.map((item) => ({ id: item.id, current: item.id === current.session.id,
        auth_method: item.auth_method, assurance_level: item.assurance_level, created_at: item.created_at,
        last_seen_at: item.last_seen_at, absolute_expires_at: item.absolute_expires_at,
        idle_expires_at: item.idle_expires_at, remembered: item.remembered, revoked_at: item.revoked_at })) });
    } catch (error) { safeError(response, error); }
  });

  router.post('/sessions/revoke-others', async (request, response) => {
    try {
      const { session } = await service.authenticate(request, false);
      assertCsrf(request, session.csrf_token_hash, environment);
      response.json({ revoked_count: await service.revokeOthers(request) });
    } catch (error) { safeError(response, error); }
  });

  router.post('/sessions/rotate', async (request, response) => {
    try {
      const { session } = await service.authenticate(request, false);
      assertCsrf(request, session.csrf_token_hash, environment);
      const rotated = await service.rotate(request);
      response.set('Set-Cookie', [...serializeSessionCookies(rotated.material, environment,
        rotated.session.remembered, rotated.max_age_seconds)]);
      response.json({ session: { id: rotated.session.id, absolute_expires_at: rotated.session.absolute_expires_at,
        idle_expires_at: rotated.session.idle_expires_at, assurance_level: rotated.session.assurance_level } });
    } catch (error) { safeError(response, error); }
  });

  router.post('/logout', async (request, response) => {
    try {
      const { session } = await service.authenticate(request, false);
      assertCsrf(request, session.csrf_token_hash, environment);
      await service.logout(request);
      response.set('Set-Cookie', [...clearSessionCookies(environment)]);
      response.status(204).end();
    } catch (error) {
      response.set('Set-Cookie', [...clearSessionCookies(environment)]);
      if (error instanceof IdentityAccessError && error.status === 401) { response.status(204).end(); return; }
      safeError(response, error);
    }
  });
  return router;
}

export function createOrganizationContextRouter(
  service: SessionService,
  repository: IdentityRepository,
  environment: NodeJS.ProcessEnv = process.env,
): Router {
  const router = Router();
  router.use((_request, response, next) => { privateHeaders(response); next(); });

  router.get('/organizations/:organization/context', async (request, response) => {
    try {
      const context = await service.context(request, String(request.params.organization ?? ''));
      response.json({ organization: context.organization, membership: context.membership,
        capabilities: [...context.capabilities], context_epoch_hint: context.session_id });
    } catch (error) { safeError(response, error); }
  });

  router.get('/organizations/:organizationId/api-keys', async (request, response) => {
    try {
      const context = await service.context(request, String(request.params.organizationId ?? ''), 'integrations.manage');
      const items = await repository.listApiKeys(context.organization.id);
      response.json({ items: items.map(({ secret_hash: _secretHash, ...item }) => item) });
    } catch (error) { safeError(response, error); }
  });

  router.post('/organizations/:organizationId/api-keys', async (request, response) => {
    try {
      const authenticated = await service.authenticate(request, false);
      assertCsrf(request, authenticated.session.csrf_token_hash, environment);
      const body = bodyRecord(request);
      const result = await service.issueApiKey(request, String(request.params.organizationId ?? ''), {
        name: typeof body.name === 'string' ? body.name : '',
        scopes: Array.isArray(body.scopes) ? body.scopes.filter((item): item is string => typeof item === 'string') : [],
        expires_at: typeof body.expires_at === 'string' ? body.expires_at : '',
        allowed_ip_cidrs: Array.isArray(body.allowed_ip_cidrs)
          ? body.allowed_ip_cidrs.filter((item): item is string => typeof item === 'string') : [],
      });
      response.status(201).json(result);
    } catch (error) { safeError(response, error); }
  });

  router.delete('/organizations/:organizationId/api-keys/:keyId', async (request, response) => {
    try {
      const authenticated = await service.authenticate(request, false);
      assertCsrf(request, authenticated.session.csrf_token_hash, environment);
      const context = await service.context(request, String(request.params.organizationId ?? ''), 'integrations.manage');
      const body = bodyRecord(request);
      await repository.revokeApiKey(context.organization.id, String(request.params.keyId ?? ''),
        context.membership.id, Number(body.expected_version),
        typeof body.reason_code === 'string' ? body.reason_code : 'manual_revoke', context.request_id);
      response.status(204).end();
    } catch (error) { safeError(response, error); }
  });
  return router;
}

export function createTenantMutationSecurity(
  service: SessionService,
  environment: NodeJS.ProcessEnv = process.env,
): (request: Request, response: Response, next: NextFunction) => void {
  return (request, response, next) => {
    if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS'
      || request.path === '/invitations/resolve') { next(); return; }
    void service.authenticate(request, false).then(({ session }) => {
      assertCsrf(request, session.csrf_token_hash, environment);
      next();
    }).catch((error: unknown) => safeError(response, error));
  };
}
