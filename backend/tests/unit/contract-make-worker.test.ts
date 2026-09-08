import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import request from 'supertest';
import { createContractMakeWorkerRouter } from '../../src/routes/contractMakeWorker.js';

test('scheduled delivery rejects missing/wrong credentials and awaits an authorized worker', async () => {
  let calls = 0;
  const app = express();
  app.use(createContractMakeWorkerRouter({ async run() { calls++; return 2; } }, { CRON_SECRET: 'test-secret' }));
  await request(app).get('/contract-make').expect(401);
  await request(app).get('/contract-make').set('Authorization', 'Bearer wrong').expect(401);
  assert.equal(calls, 0);
  const result = await request(app).get('/contract-make').set('Authorization', 'Bearer test-secret').expect(200);
  assert.deepEqual(result.body, { claimed: 2 });
  assert.equal(calls, 1);
});

test('scheduled delivery fails closed when its secret is unconfigured', async () => {
  const app = express();
  app.use(createContractMakeWorkerRouter({ async run() { throw Error('must not run'); } }, {}));
  await request(app).get('/contract-make').set('Authorization', 'Bearer ').expect(401);
});
