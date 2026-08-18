import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import express from 'express';
import request from 'supertest';
import { createContractPasswordAuthRouter } from '../../src/routes/contractPasswordAuth.js';
import {
  CONTRACT_PASSWORD_SESSION_COOKIE,
  ContractPasswordAuthError,
  getContractPasswordSession,
  loginContractGoogleUser,
  loginContractUser,
  serializeContractPasswordSessionCookie,
  type ContractPasswordCredentials,
  type ContractPasswordSessionData,
} from '../../src/services/contractPasswordAuth.js';

const ENVIRONMENT: NodeJS.ProcessEnv = {
  NODE_ENV: 'development',
  CONTRACT_ALLOW_SYNTHETIC_REGISTRATION: 'true',
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
  googleLogin?: (credentials: {
    accessToken: string;
    rememberMe?: boolean;
  }) => Promise<ContractPasswordSessionData>;
} = {}) {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', createContractPasswordAuthRouter({
    environment: ENVIRONMENT,
    register: async (credentials) => overrides.register?.(credentials) ?? SESSION,
    login: async (credentials) => overrides.login?.(credentials) ?? SESSION,
    googleLogin: async (credentials) => overrides.googleLogin?.(credentials) ?? SESSION,
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

test('SPEC-25 closes registration before validation or account creation in real-data modes', async () => {
  let calls = 0;
  const app = express();
  app.use(express.json());
  app.use('/api/auth', createContractPasswordAuthRouter({
    environment: { NODE_ENV: 'production' },
    register: async () => {
      calls += 1;
      return SESSION;
    },
  }));
  await request(app)
    .post('/api/auth/register')
    .send({ email: 'invalid', password: 'short' })
    .expect(403, {
      error: 'REGISTRATION_CLOSED',
      message: 'El registro está cerrado. Solicitá una invitación al administrador.',
      retriable: false,
    });
  assert.equal(calls, 0);
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

test('password login performs the administrator lookup with a fresh service client', async () => {
  const user = {
    id: SESSION.userId,
    email: SESSION.email,
    user_metadata: { full_name: SESSION.name },
  };
  const authClient = {
    auth: {
      signInWithPassword: async () => ({ data: { user }, error: null }),
    },
  };
  const adminClient = {
    from(table: string) {
      assert.equal(table, 'contract_admin_users');
      return {
        select(columns: string) {
          assert.equal(columns, 'user_id');
          return {
            eq(column: string, userId: string) {
              assert.equal(column, 'user_id');
              assert.equal(userId, user.id);
              return {
                maybeSingle: async () => ({ data: { user_id: user.id }, error: null }),
              };
            },
          };
        },
      };
    },
  };
  const clients = [authClient, adminClient];

  const session = await loginContractUser(
    { email: user.email, password: 'valid-password' },
    ENVIRONMENT,
    () => clients.shift() as never,
  );

  assert.deepEqual(session, SESSION);
  assert.equal(clients.length, 0);
});

test('Google OAuth sessions use the same signed administrator cookie', async () => {
  let received: { accessToken: string; rememberMe?: boolean } | undefined;
  const agent = request.agent(createApp({
    googleLogin: async (credentials) => {
      received = credentials;
      return SESSION;
    },
  }));

  const login = await agent
    .post('/api/auth/google/session')
    .send({ accessToken: 'supabase-google-access-token', rememberMe: true })
    .expect(200);

  assert.deepEqual(received, {
    accessToken: 'supabase-google-access-token',
    rememberMe: true,
  });
  assert.deepEqual(login.body, {
    authenticated: true,
    user: {
      id: SESSION.userId,
      email: SESSION.email,
      name: SESSION.name,
    },
  });
  assert.match(login.headers['set-cookie']?.[0] ?? '', /Max-Age=2592000/u);
  await agent.get('/api/auth/session').expect(200, {
    authenticated: true,
    user: { id: SESSION.userId, email: SESSION.email, name: SESSION.name },
  });
});

test('SPEC-25 Google handoff reads the reviewed grant without writing one', async () => {
  const client = {
    auth: {
      getUser: async () => ({
        data: {
          user: {
            id: SESSION.userId,
            email: SESSION.email,
            user_metadata: { full_name: SESSION.name },
            app_metadata: { provider: 'google' },
          },
        },
        error: null,
      }),
    },
    from(table: string) {
      assert.equal(table, 'contract_admin_users');
      return {
        upsert: () => { throw new Error('grant writes are forbidden'); },
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { user_id: SESSION.userId },
              error: null,
            }),
          }),
        }),
      };
    },
  };
  const session = await loginContractGoogleUser(
    { accessToken: 'verified-google-token' },
    ENVIRONMENT,
    () => client as never,
  );
  assert.deepEqual(session, SESSION);
});

test('SPEC-25 session version invalidates admin cookies independently', () => {
  const oldEnvironment = { ...ENVIRONMENT, CONTRACT_SESSION_VERSION: 'before-review' };
  const cookie = serializeContractPasswordSessionCookie(SESSION, oldEnvironment)
    .split(';', 1)[0] ?? '';
  const req = { get: (name: string) => name === 'Cookie' ? cookie : undefined };
  assert.equal(
    getContractPasswordSession(req as never, {
      ...ENVIRONMENT,
      CONTRACT_SESSION_VERSION: 'after-review',
    }),
    null,
  );
});

test('Google OAuth sessions reject missing access tokens before calling Supabase', async () => {
  let calls = 0;
  const app = createApp({
    googleLogin: async () => {
      calls += 1;
      return SESSION;
    },
  });

  await request(app)
    .post('/api/auth/google/session')
    .send({ rememberMe: true })
    .expect(400, {
      error: 'INVALID_REQUEST',
      message: 'No se pudo validar la cuenta de Google.',
      retriable: false,
    });
  assert.equal(calls, 0);
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

test('SPEC-19 reports a missing administrator grant separately from bad credentials', async () => {
  const app = createApp({
    login: async () => {
      throw new ContractPasswordAuthError(
        'not_admin',
        'La cuenta no está habilitada para administrar contratos.',
      );
    },
  });

  await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@example.test', password: 'valid-password' })
    .expect(403, {
      error: 'NOT_ADMIN',
      message: 'La cuenta no está habilitada para administrar contratos.',
      retriable: false,
    });
});

test('SPEC-19 migration grants only marked main-page signups', async () => {
  const migration = await readFile(
    new URL('../../../supabase/migrations/20260803010000_contract_spec19.sql', import.meta.url),
    'utf8',
  );
  assert.match(migration, /create table if not exists public\.contract_admin_users/iu);
  assert.match(migration, /main_page_registration' = 'true'/u);
  assert.match(migration, /create trigger contract_admin_on_signup/iu);
  assert.match(migration, /after insert on auth\.users/iu);
  const repairMigration = await readFile(
    new URL('../../../supabase/migrations/20260804010000_contract_spec19_admin_repair.sql', import.meta.url),
    'utf8',
  );
  assert.match(repairMigration, /insert into public\.contract_admin_users \(user_id, role\)/iu);
  assert.match(repairMigration, /select id,\s*'admin'\s+from auth\.users/iu);
});
