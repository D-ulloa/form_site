import { timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import type { ContractMakeDeliveryRunner } from '../integrations/contractMakeDeliveryRunner.js';

export function createContractMakeWorkerRouter(runner: ContractMakeDeliveryRunner, environment: NodeJS.ProcessEnv): Router {
  const router = Router();
  router.get('/contract-make', async (request, response) => {
    response.set('Cache-Control', 'no-store');
    const secret = environment.CRON_SECRET;
    const actual = Buffer.from(request.get('Authorization') ?? '');
    const expected = Buffer.from(`Bearer ${secret ?? ''}`);
    if (!secret || actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      response.status(401).json({ error: 'UNAUTHORIZED' }); return;
    }
    try {
      const claimed = await runner.run(`cron:${Date.now()}`);
      response.json({ claimed, runtime_mode: environment.NODE_ENV });
    } catch {
      response.status(503).json({ error: 'WORKER_UNAVAILABLE' });
    }
  });
  return router;
}
