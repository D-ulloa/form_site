import { CONTRACT_DNI_IMAGE_MIME_TYPES, getContractDniMaxImageBytes } from '../services/contractDniUploadService.js';
import {
  CONTRACT_EVIDENCE_FILE_MIME_TYPES,
  getContractEvidenceMaxFileBytes,
} from '../services/contractEvidenceUploadService.js';
import type { AssetCategory, AssetPrincipalType, AssetUploadDescriptor } from './types.js';

export interface AssetReceiverPolicy {
  readonly key: string;
  readonly version: number;
  readonly category: AssetCategory;
  readonly bucket: string;
  readonly allowed_principals: ReadonlySet<AssetPrincipalType>;
  readonly allowed_mime_types: ReadonlySet<string>;
  readonly maximum_bytes: number;
  readonly maximum_count: number;
  readonly retention_class: string;
  readonly download_disposition: 'inline' | 'attachment';
  readonly require_checksum: boolean;
  readonly require_content_detection: boolean;
}

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const PROPERTY_VIDEO_MIME_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const MEMBER_OR_SYSTEM = new Set<AssetPrincipalType>([
  'member', 'organization_api_key', 'platform_support', 'system_worker', 'migration',
]);
const CONTRACT_PRINCIPALS = new Set<AssetPrincipalType>([
  'member', 'organization_api_key', 'external_contract_link', 'platform_support', 'migration',
]);

export function createAssetReceiverRegistry(
  environment: NodeJS.ProcessEnv = process.env,
): ReadonlyMap<string, AssetReceiverPolicy> {
  const dni = (key: string): AssetReceiverPolicy => Object.freeze({
    key, version: 1, category: 'contract_dni', bucket: environment.CONTRACT_DNI_STORAGE_BUCKET?.trim() || 'contract-dni',
    allowed_principals: CONTRACT_PRINCIPALS, allowed_mime_types: CONTRACT_DNI_IMAGE_MIME_TYPES,
    maximum_bytes: getContractDniMaxImageBytes(environment), maximum_count: 1,
    retention_class: 'contract_identity', download_disposition: 'attachment',
    require_checksum: false, require_content_detection: true,
  });
  const evidence = (key: string): AssetReceiverPolicy => Object.freeze({
    key, version: 1, category: 'contract_evidence',
    bucket: environment.CONTRACT_EVIDENCE_STORAGE_BUCKET?.trim() || 'contract-evidence',
    allowed_principals: CONTRACT_PRINCIPALS,
    allowed_mime_types: new Set(CONTRACT_EVIDENCE_FILE_MIME_TYPES),
    maximum_bytes: getContractEvidenceMaxFileBytes(environment), maximum_count: 2,
    retention_class: 'contract_evidence', download_disposition: 'attachment',
    require_checksum: false, require_content_detection: true,
  });
  return new Map<string, AssetReceiverPolicy>([
    ['contract.dni.front', dni('contract.dni.front')],
    ['contract.dni.back', dni('contract.dni.back')],
    ['contract.guarantor.salary_receipt', evidence('contract.guarantor.salary_receipt')],
    ['contract.guarantor.property_guarantee', evidence('contract.guarantor.property_guarantee')],
    ['property.image', Object.freeze({
      key: 'property.image', version: 1, category: 'property_image', bucket: 'property-media',
      allowed_principals: MEMBER_OR_SYSTEM, allowed_mime_types: IMAGE_MIME_TYPES,
      maximum_bytes: 10 * 1024 * 1024, maximum_count: 30, retention_class: 'property_media',
      download_disposition: 'inline', require_checksum: false, require_content_detection: true,
    })],
    ['property.video', Object.freeze({
      key: 'property.video', version: 1, category: 'property_video', bucket: 'property-media',
      allowed_principals: MEMBER_OR_SYSTEM, allowed_mime_types: PROPERTY_VIDEO_MIME_TYPES,
      maximum_bytes: 100 * 1024 * 1024, maximum_count: 10, retention_class: 'property_media',
      download_disposition: 'attachment', require_checksum: false, require_content_detection: true,
    })],
    ['branding.logo', Object.freeze({
      key: 'branding.logo', version: 1, category: 'organization_logo', bucket: 'organization-branding',
      allowed_principals: new Set<AssetPrincipalType>(['member', 'platform_support', 'migration']),
      allowed_mime_types: IMAGE_MIME_TYPES, maximum_bytes: 5 * 1024 * 1024, maximum_count: 1,
      retention_class: 'branding_original', download_disposition: 'attachment',
      require_checksum: true, require_content_detection: true,
    })],
  ]);
}

export function requireReceiverPolicy(
  receiverKey: string,
  registry: ReadonlyMap<string, AssetReceiverPolicy>,
): AssetReceiverPolicy {
  const policy = registry.get(receiverKey);
  if (!policy) throw new Error('UNKNOWN_RECEIVER');
  return policy;
}

export function validateAssetUploadBatch(
  descriptors: readonly AssetUploadDescriptor[],
  principalType: AssetPrincipalType,
  registry: ReadonlyMap<string, AssetReceiverPolicy>,
): readonly AssetReceiverPolicy[] {
  if (descriptors.length < 1 || descriptors.length > 40) throw new Error('INVALID_UPLOAD_BATCH');
  const counts = new Map<string, number>();
  return descriptors.map((descriptor) => {
    const policy = requireReceiverPolicy(descriptor.receiver_key, registry);
    if (!policy.allowed_principals.has(principalType)) throw new Error('RECEIVER_PRINCIPAL_FORBIDDEN');
    if (!descriptor.original_filename.trim() || descriptor.original_filename.length > 256) throw new Error('INVALID_FILENAME');
    if (!policy.allowed_mime_types.has(descriptor.declared_mime)) throw new Error('MIME_NOT_ALLOWED');
    if (!Number.isSafeInteger(descriptor.declared_bytes) || descriptor.declared_bytes < 1
      || descriptor.declared_bytes > policy.maximum_bytes) throw new Error('FILE_TOO_LARGE');
    if (policy.require_checksum && !/^[0-9a-f]{64}$/u.test(descriptor.checksum_sha256 ?? '')) {
      throw new Error('CHECKSUM_REQUIRED');
    }
    const count = (counts.get(policy.key) ?? 0) + 1;
    counts.set(policy.key, count);
    if (count > policy.maximum_count) throw new Error('RECEIVER_COUNT_EXCEEDED');
    return policy;
  });
}
