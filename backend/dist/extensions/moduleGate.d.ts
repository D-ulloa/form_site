import { type ExtensionAccessDecision, type ExtensionAccessInput, type ExtensionModuleKey, type ExtensionModuleState } from './types.js';
export declare function isExtensionModuleKey(value: string): value is ExtensionModuleKey;
export declare function assertExtensionModuleTransition(from: ExtensionModuleState, to: ExtensionModuleState): void;
/**
 * Core authorization is deliberately evaluated before optional commercial state.
 * A module or entitlement may only narrow a previously authorized request.
 */
export declare function evaluateExtensionAccess(input: ExtensionAccessInput): ExtensionAccessDecision;
//# sourceMappingURL=moduleGate.d.ts.map