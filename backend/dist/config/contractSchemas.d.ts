import type { ContractSchemaConfig, ContractSchemaDefinition, PublicContractSchema } from '../contracts/types.js';
export declare const RENT_CONTRACT_SCHEMA_ID = "rent-contract-v1";
export declare class ContractSchemaNotFoundError extends Error {
    readonly schemaId: string;
    constructor(schemaId: string);
}
export declare class ContractConfigurationError extends Error {
    readonly missingVariables: readonly string[];
    constructor(missingVariables: readonly string[]);
}
export declare function getContractSchemaDefinition(schemaId: string): ContractSchemaDefinition;
export declare function getPublicContractSchema(schemaId: string, environment?: NodeJS.ProcessEnv): PublicContractSchema;
export declare function getContractSchemaConfig(schemaId: string, environment?: NodeJS.ProcessEnv): ContractSchemaConfig;
//# sourceMappingURL=contractSchemas.d.ts.map