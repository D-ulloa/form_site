import type { NextFunction, Request, Response } from 'express';
export declare function isValidRequestId(value: unknown): value is string;
export declare function resolveRequestId(candidate: unknown): string;
export declare function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void;
//# sourceMappingURL=requestId.d.ts.map