/** Disposable provider double: actual HTTP bytes and signatures, no hosted Storage or external uploads. */
import express, { type Express } from 'express';
import { randomUUID } from 'node:crypto';
import type { PrivateAssetStorageAdapter } from '../../src/assets/storageAdapter.js';
import { detectAssetBytes } from '../../src/assets/contentDetector.js';
export function createFixtureStorage(app: Express) {
  const objects = new Map<string, { bytes: Buffer; mime: string }>();
  const tokens = new Map<string, { path: string; expires: number; write: boolean }>();
  app.use('/spec43-storage', (req, res, next) => {
    res.set({ 'Access-Control-Allow-Origin': 'http://127.0.0.1:4173', 'Access-Control-Allow-Methods': 'PUT,GET,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Cache-Control': 'no-store' });
    if (req.method === 'OPTIONS') { res.status(204).end(); return; } next();
  });
  app.put('/spec43-storage/:token', express.raw({ type: () => true, limit: '100mb' }), (req, res) => {
    const token = tokens.get(String(req.params.token));
    if (!token?.write || token.expires <= Date.now()) { res.status(403).end(); return; }
    if (objects.has(token.path)) { res.status(409).end(); return; }
    objects.set(token.path, { bytes: Buffer.from(req.body), mime: req.get('Content-Type') ?? '' }); res.status(201).end();
  });
  app.get('/spec43-storage/:token', (req, res) => {
    const token = tokens.get(String(req.params.token)); const object = token ? objects.get(token.path) : null;
    if (!token || token.write || token.expires <= Date.now() || !object) { res.status(404).end(); return; }
    res.set({ 'Content-Type': object.mime, 'Content-Disposition': 'attachment; filename="test-media"' }); res.send(object.bytes);
  });
  const sign = (path: string, write: boolean, ttl: number) => {
    const token = randomUUID(); tokens.set(token, { path, write, expires: Date.now() + ttl * 1000 });
    return `http://127.0.0.1:3002/spec43-storage/${token}`;
  };
  const storage: PrivateAssetStorageAdapter = {
    async issueUpload(bucket, path) { return { upload_url: sign(`${bucket}/${path}`, true, 7200), required_headers: {} }; },
    async inspect(bucket, path) {
      const object = objects.get(`${bucket}/${path}`); if (!object) throw new Error('ASSET_NOT_FOUND');
      return { bucket_name: bucket, object_path: path, bytes: object.bytes.length, provider_mime: object.mime };
    },
    async issueView(bucket, path, ttl) { return { signed_url: sign(`${bucket}/${path}`, false, ttl), expires_at: new Date(Date.now() + ttl * 1000).toISOString() }; },
    async remove(bucket, path) { return objects.delete(`${bucket}/${path}`) ? 'deleted' : 'not_found'; },
  };
  return { storage, async detectContent(bucket: string, path: string) {
    const object = objects.get(`${bucket}/${path}`); if (!object) throw new Error('ASSET_NOT_FOUND');
    return detectAssetBytes(object.bytes);
  } };
}
