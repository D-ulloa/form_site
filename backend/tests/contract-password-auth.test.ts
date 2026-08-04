import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import express from 'express';
import request from 'supertest';
import { createContractPasswordAuthRouter } from '../src/routes/contractPasswordAuth.js';
import {
  CONTRACT_PASSWORD_SESSION_COOKIE,
  ContractPasswordAuthError,
  type ContractPasswordCredentials,
  type ContractPasswordSessionData,
} from '../src/services/contractPasswordAuth.js';

const ENVIRONMENT: NodeJS.ProcessEnv = {
  NODE_ENV: 'development',
  CONTRACT_TOKEN_SECRET: 'spec-19-test-secret-that-is-at-least-32-characters',
};

const SESSION: ContractPasswordSessionData = {
  userId: '55555555-5555-4555-8555-555555555555',
  email: 'admin@example.test',
  name: 'Admin Example',
  isAdmin: true,
};

function createApp(overrides: {
  register?: (credentials: ContractPasswordCredentials) => Promise<ContractPasswordSessionData>;
  login?: (credentials: ContractPasswordCredentials) => Promise<ContractPasswordSessionData>;
} = {}) {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', createContractPasswordAuthRouter({
    environment: ENVIRONMENT,
    register: async (credentials) => overrides.register?.(credentials) ?? SESSION,
    login: async (credentials) => overrides.login?.(credentials) ?? SESSION,
  }));
  return app;
}

test('SPEC-19 registration creates an immediate signed administrator session', async () => {
  let received: ContractPasswordCredentials | undefined;
  const agent = request.agent(createApp({
    register: async (credentials) => {
      received = credentials;
      return SESSION;
    },
  }));

  const registration = await agent
    .post('/api/auth/register')
    .send({
      name: '  Admin Example  ',
      email: '  admin@example.test  ',
      password: 'valid-password',
      company: '  Example Co  ',
      role: '  Administrador  ',
    })
    .expect(201)
    .expect('Cache-Control', 'no-store')
    .expect('X-Content-Type-Options', 'nosniff');

  assert.deepEqual(received, {
    name: 'Admin Example',
    email: 'admin@example.test',
    password: 'valid-password',
    company: 'Example Co',
    role: 'Administrador',
    rememberMe: false,
  });
  assert.deepEqual(registration.body, {
    authenticated: true,
    user: {
      id: SESSION.userId,
      email: SESSION.email,
      name: SESSION.name,
    },
  });
  assert.match(registration.headers['set-cookie']?.[0] ?? '', /HttpOnly/u);
  assert.doesNotMatch(registration.headers['set-cookie']?.[0] ?? '', /Max-Age=/u);

  const session = await agent.get('/api/auth/session').expect(200);
  assert.equal(session.body.authenticated, true);
  assert.deepEqual(session.body.user, registration.body.user);
});

test('SPEC-19 remembered login persists the cookie and logout invalidates it', async () => {
  const agent = request.agent(createApp());
  const login = await agent
    .post('/api/auth/login')
    .send({ email: 'admin@example.test', password: 'valid-password', rememberMe: true })
    .expect(200);

  assert.match(
    login.headers['set-cookie']?.[0] ?? '',
    /Max-Age=2592000/u,
  );
  await agent.get('/api/auth/session').expect(200, {
    authenticated: true,
    user: { id: SESSION.userId, email: SESSION.email, name: SESSION.name },
  });

  const logout = await agent.post('/api/auth/logout').expect(204);
  assert.match(logout.headers['set-cookie']?.[0] ?? '', /Max-Age=0/u);
  await agent.get('/api/auth/session').expect(200, { authenticated: false });
});

test('SPEC-19 routes reject invalid input and map authentication failures', async () => {
  let calls = 0;
  const app = createApp({
    login: async () => {
      calls += 1;
      throw new ContractPasswordAuthError(
        'invalid_credentials',
        'El correo o la contraseña no son correctos.',
      );
    },
  });

  await request(app)
    .post('/api/auth/register')
    .send({ email: 'invalid', password: 'short' })
    .expect(400, {
      error: 'INVALID_REQUEST',
      message: 'Ingresá un correo electrónico válido.',
      retriable: false,
    });
  assert.equal(calls, 0);

  await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@example.test', password: 'valid-password' })
    .expect(401, {
      error: 'INVALID_CREDENTIALS',
      message: 'El correo o la contraseña no son correctos.',
      retriable: false,
    });
  assert.equal(calls, 1);

  await request(app)
    .get('/api/auth/session')
    .set('Cookie', `${CONTRACT_PASSWORD_SESSION_COOKIE}=tampered`)
    .expect(200, { authenticated: false });
});

test('SPEC-19 migration grants only marked main-page signups', async () => {
  const migration = await readFile(
    new URL('../supabase/migrations/20260803010000_contract_spec19.sql', import.meta.url),
    'utf8',
  );
  assert.match(migration, /create table if not exists public\.contract_admin_users/iu);
  assert.match(migration, /main_page_registration' = 'true'/u);
  assert.match(migration, /create trigger contract_admin_on_signup/iu);
  assert.match(migration, /after insert on auth\.users/iu);
});
