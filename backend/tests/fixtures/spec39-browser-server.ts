/** Disposable-database browser harness. Never imported by the production server. */
import { createHmac } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { arrangementHarness, A } from './arrangements.js';
import { createArrangementOrderRepository } from '../../src/arrangements/arrangementOrderRepository.js';
import { IdentityAccessError } from '../../src/identity/sessionSecurity.js';

const endpoint = new URL(process.env.SPEC39_POSTGREST_URL ?? 'http://127.0.0.1:55440');
if (!['127.0.0.1', 'localhost'].includes(endpoint.hostname)) throw new Error('Disposable loopback database required');
const secret = process.env.SPEC39_TEST_JWT_SECRET;
if (!secret || secret.length < 32) throw new Error('SPEC39_TEST_JWT_SECRET required');
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const body = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ role: 'service_role', exp: Math.floor(Date.now() / 1000) + 3600 })}`;
const token = `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
const client = createClient(endpoint.origin, token, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (input, init) => fetch(String(input).replace('/rest/v1/', '/'), init) },
});
const { app, cookie, sessions, state } = arrangementHarness(createArrangementOrderRepository(client));
app.get('/api/test-session', (_request, response) => {
  response.setHeader('Set-Cookie', `${cookie}; HttpOnly; Path=/; SameSite=Lax`);
  response.json({ fixture: 'SPEC-39', organization_id: A });
});
app.get('/api/auth/session', async (request, response) => {
  try {
    const { session, identity } = await sessions.authenticate(request);
    response.json({ authenticated: true, user: { id: identity.id, email: identity.email, name: identity.display_name }, session,
      memberships: [{ organization_id: A, organization_slug: 'azar', organization_display_name: 'Azar', organization_status: 'active',
        membership_id: state.membership.id, membership_status: 'active', role: 'owner', capabilities: ['arrangements.read'] }] });
  } catch { response.json({ authenticated: false }); }
});
app.get('/api/organizations/:organization/context', async (request, response) => {
  try {
    const context = await sessions.context(request, request.params.organization);
    response.json({ organization: context.organization, membership: context.membership, capabilities: [...context.capabilities] });
  } catch (error) { response.status(error instanceof IdentityAccessError ? error.status : 503).json({ error: 'CONTEXT_UNAVAILABLE' }); }
});
app.listen(3001, '127.0.0.1', () => process.stdout.write('SPEC-39 disposable browser API on 127.0.0.1:3001\n'));
