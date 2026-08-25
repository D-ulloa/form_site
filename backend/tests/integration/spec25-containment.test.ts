import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import express from 'express';
import request from 'supertest';
import propertiesRouter, {
  applyVerifiedPropertyActor,
  createTenantPropertyCompatibilityRouter,
} from '../../src/routes/properties.js';
import type { SessionService } from '../../src/identity/sessionService.js';
import { hashCsrfToken } from '../../src/identity/sessionSecurity.js';

test('SPEC-25 property routes reject unauthenticated requests before parsing or side effects', async () => {
  const app = express();
  app.use(express.json());
  app.use('/properties', propertiesRouter);

  await request(app)
    .post('/properties/media/presign')
    .send({ files: [{ originalName: 'dni.jpg', mimeType: 'image/jpeg', sizeBytes: 12 }] })
    .expect(401, {
      error: 'AUTHENTICATION_REQUIRED',
      details: 'Iniciá sesión con una cuenta autorizada para gestionar propiedades.',
    });

  await request(app)
    .post('/properties/submit')
    .field('agent_user_id', 'spoofed-user')
    .attach('files', Buffer.from('not-an-image'), 'evidence.txt')
    .expect(401);
});

test('SPEC-25 property attribution always overwrites caller-controlled actor fields', () => {
  const body: Record<string, unknown> = {
    agent_user_id: 'spoofed-user',
    agent_name: 'Spoofed Name',
    agent_email: 'spoofed@example.test',
  };
  applyVerifiedPropertyActor(body, {
    userId: 'verified-user',
    name: 'Verified Name',
    email: 'verified@example.test',
    isAdmin: true,
    expiresAt: 4_000_000_000,
    sessionVersion: 'spec25-containment-v1',
  });
  assert.deepEqual(body, {
    agent_user_id: 'verified-user',
    agent_name: 'Verified Name',
    agent_email: 'verified@example.test',
  });
});

test('tenant property compatibility requires CSRF before resolving organization authority', async () => {
  const environment = {
    NODE_ENV: 'development',
    APP_CSRF_PEPPER: 'c'.repeat(32),
  } as NodeJS.ProcessEnv;
  let contextCalls = 0;
  const sessions = {
    async authenticate() {
      return {
        session: { csrf_token_hash: hashCsrfToken('valid-csrf-token', environment) },
        identity: { id: 'verified-user', email: 'verified@example.test', display_name: 'Verified User' },
      };
    },
    async context() {
      contextCalls += 1;
      throw new Error('context must not be reached without CSRF');
    },
  } as unknown as SessionService;
  const app = express();
  app.use(express.json());
  app.use('/api/organizations/:organization/properties/legacy',
    createTenantPropertyCompatibilityRouter(sessions, environment));

  await request(app)
    .post('/api/organizations/azar/properties/legacy/media/presign')
    .send({ files: [{ originalName: 'photo.jpg', mimeType: 'image/jpeg', sizeBytes: 12 }] })
    .expect(403, { error: 'CSRF_DENIED', retriable: false });
  assert.equal(contextCalls, 0);
});

test('SPEC-25 forward migration removes automatic grants and the fixed Make trigger', async () => {
  const migration = await readFile(
    new URL('../../../supabase/migrations/20260818000000_spec25_containment.sql', import.meta.url),
    'utf8',
  );
  assert.match(migration, /drop trigger if exists contract_admin_on_signup on auth\.users/iu);
  assert.match(migration, /drop function if exists public\.grant_contract_admin_on_signup\(\)/iu);
  assert.match(migration, /drop trigger if exists trigger_make_condicional on public\.contract_entries/iu);
  assert.match(migration, /drop function if exists public\.enviar_a_make_condicional\(\)/iu);
  assert.doesNotMatch(migration, /https?:\/\//u);
});

test('SPEC-25 runtime source has no public Drive permission creation', async () => {
  const source = await readFile(
    new URL('../../src/services/googleDriveService.ts', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(source, /permissions\.create/u);
  assert.doesNotMatch(source, /type:\s*['"]anyone['"]/u);
});
