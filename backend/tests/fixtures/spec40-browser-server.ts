/** SPEC-40 regression uses the current property-bound invitation flow. Disposable databases only. */
process.env.SPEC42_POSTGREST_URL ??= process.env.SPEC40_POSTGREST_URL ?? 'http://127.0.0.1:55444';
process.env.SPEC42_TEST_JWT_SECRET ??= process.env.SPEC40_TEST_JWT_SECRET;
await import('./spec42-browser-server.js');
export {};
