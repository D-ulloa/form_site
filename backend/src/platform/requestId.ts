import { randomBytes } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

export function isValidRequestId(value: unknown): value is string {
  return typeof value === 'string' && REQUEST_ID.test(value);
}

export function resolveRequestId(candidate: unknown): string {
  return isValidRequestId(candidate) ? candidate : `req_${randomBytes(18).toString('base64url')}`;
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = resolveRequestId(req.header('X-Request-Id'));
  res.locals.request_id = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
}
