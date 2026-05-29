export interface FolderNameParts {
    localidad: string;
    tipo_de_inmueble: string;
    calle: string;
}
/**
 * Builds a deterministic Drive folder name.
 * Format: OP-{localidad}-{tipo_de_inmueble}-{calle}-{YYYYMMDD}-{HHmm}
 * Example: OP-mar-del-plata-departamento-av-colon-1234-20260510-2128
 */
export declare function buildFolderName(parts: FolderNameParts, now?: Date): string;
//# sourceMappingURL=buildFolderName.d.ts.map