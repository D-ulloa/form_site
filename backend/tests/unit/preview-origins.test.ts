import assert from 'node:assert/strict';
import test from 'node:test';
import type { Request } from 'express';
import express from 'express';
import cors from 'cors';
import request from 'supertest';
import { createCorsOriginValidator } from '../../src/utils/serverConfig.js';
import { approvedOrigins, assertMutationOrigin, IdentityAccessError } from '../../src/identity/sessionSecurity.js';

const preview = {
  NODE_ENV: 'production',
  VERCEL: '1',
  VERCEL_ENV: 'preview',
  VERCEL_URL: 'form-site-deployment.vercel.app',
  VERCEL_BRANCH_URL: 'form-site-git-multi-tenant.vercel.app',
  APP_ALLOWED_ORIGINS: 'https://preview.example.test',
};

function requestFrom(origin: string): Request {
  return { get: (name: string) => name === 'Origin' ? origin : undefined } as Request;
}

test('Preview accepts its exact deployment and branch origins for mutations', () => {
  for (const origin of ['https://preview.example.test', 'https://form-site-deployment.vercel.app',
    'https://form-site-git-multi-tenant.vercel.app']) {
    assert.doesNotThrow(() => assertMutationOrigin(requestFrom(origin), preview));
  }
  for (const origin of ['https://other-project.vercel.app', 'http://form-site-deployment.vercel.app',
    'https://form-site-deployment.vercel.app.attacker.test', 'http://localhost:5173']) {
    assert.throws(() => assertMutationOrigin(requestFrom(origin), preview), IdentityAccessError);
  }
});

test('Production and local environments retain only explicitly configured origins', () => {
  for (const environment of [{ ...preview, VERCEL_ENV: 'production' },
    { ...preview, VERCEL_ENV: 'development' }, { ...preview, VERCEL: undefined }]) {
    assert.deepEqual([...approvedOrigins(environment)], ['https://preview.example.test']);
  }
});

test('Preview still requires explicit application origins and tolerates absent Vercel host metadata', () => {
  assert.throws(() => approvedOrigins({ ...preview, APP_ALLOWED_ORIGINS: '' }),
    /APP_ALLOWED_ORIGINS is required/);
  assert.deepEqual([...approvedOrigins({ ...preview, VERCEL_URL: undefined, VERCEL_BRANCH_URL: undefined })],
    ['https://preview.example.test']);
});

test('Hosted same-origin reads work without Origin while mutations still require it', async () => {
  const app = express();
  app.use(cors({ origin: createCorsOriginValidator(approvedOrigins(preview)), credentials: true }));
  app.get('/session', (_req, res) => { res.json({ authenticated: false }); });
  app.post('/mutation', (req, res) => {
    try { assertMutationOrigin(req, preview); res.sendStatus(204); }
    catch { res.sendStatus(403); }
  });
  const read = await request(app).get('/session').expect(200, { authenticated: false });
  assert.equal(read.headers['access-control-allow-origin'], undefined);
  const allowed = await request(app).get('/session')
    .set('Origin', 'https://form-site-deployment.vercel.app').expect(200);
  assert.equal(allowed.headers['access-control-allow-origin'], 'https://form-site-deployment.vercel.app');
  await request(app).post('/mutation').expect(403);
  await request(app).post('/mutation').set('Origin', 'https://form-site-deployment.vercel.app').expect(204);
  await request(app).get('/session').set('Origin', 'https://other-project.vercel.app').expect(500);
});
