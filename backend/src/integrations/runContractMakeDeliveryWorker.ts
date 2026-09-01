import { createContractMakeDeliveryRunner } from './contractMakeDeliveryRunner.js';

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) throw new Error('SUPABASE_WORKER_CONFIGURATION_MISSING');

const workerId = process.env.CONTRACT_MAKE_WORKER_ID ?? `contract-make-${process.pid}`;
await createContractMakeDeliveryRunner(process.env).run(workerId);
