export declare function createCorsOriginValidator(allowedOrigins: ReadonlySet<string>): (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => void;
export declare function parseTrustProxyHops(rawValue: string | undefined): number;
export declare function resolveTrustProxyHops(environment: NodeJS.ProcessEnv): number;
export declare function validateContainmentEnvironment(environment: NodeJS.ProcessEnv): void;
//# sourceMappingURL=serverConfig.d.ts.map