import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  ContractDniImageReference,
  ContractDniImageSlot,
  ContractRepeatableCollection,
} from '../contracts/types.js';

const DEFAULT_BUCKET = 'contract-dni';
const DEFAULT_MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export const CONTRACT_DNI_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
]);

export interface ContractDniUploadDescriptor {
  readonly collection: ContractRepeatableCollection;
  readonly itemIndex: number;
  readonly slot: ContractDniImageSlot;
  readonly originalName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
}

export interface ContractDniPresignedUpload extends ContractDniImageReference {
  readonly uploadUrl: string;
}

export class ContractDniUploadConfigurationError extends Error {
  constructor() {
    super('Contract DNI uploads require SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    this.name = 'ContractDniUploadConfigurationError';
  }
}

export class ContractDniUploadValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContractDniUploadValidationError';
  }
}

export function getContractDniStorageBucket(
  environment: NodeJS.ProcessEnv = process.env,
): string {
  return environment.CONTRACT_DNI_STORAGE_BUCKET?.trim() || DEFAULT_BUCKET;
}

export function getContractDniMaxImageBytes(
  environment: NodeJS.ProcessEnv = process.env,
): number {
  const configured = Number(environment.CONTRACT_DNI_MAX_IMAGE_BYTES);
  return Number.isSafeInteger(configured) && configured > 0
    ? configured
    : DEFAULT_MAX_IMAGE_BYTES;
}

function createSupabaseClient(environment: NodeJS.ProcessEnv): SupabaseClient {
  const url = environment.SUPABASE_URL?.trim();
  const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) throw new ContractDniUploadConfigurationError();
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function sanitizeFileName(rawName: string): string {
  const fileName = path.basename(rawName)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/[^a-zA-Z0-9._-]/gu, '_')
    .slice(0, 120);
  return fileName || 'dni-image';
}

function validateDescriptor(
  descriptor: ContractDniUploadDescriptor,
  environment: NodeJS.ProcessEnv,
): void {
  if (!Number.isSafeInteger(descriptor.itemIndex) || descriptor.itemIndex < 0) {
    throw new ContractDniUploadValidationError('DNI upload itemIndex must be a non-negative integer.');
  }
  if (!descriptor.originalName.trim()) {
    throw new ContractDniUploadValidationError('DNI upload originalName is required.');
  }
  if (!CONTRACT_DNI_IMAGE_MIME_TYPES.has(descriptor.mimeType)) {
    throw new ContractDniUploadValidationError('DNI uploads accept image files only.');
  }
  if (
    !Number.isSafeInteger(descriptor.sizeBytes) ||
    descriptor.sizeBytes <= 0 ||
    descriptor.sizeBytes > getContractDniMaxImageBytes(environment)
  ) {
    throw new ContractDniUploadValidationError('The DNI image size is outside the configured limit.');
  }
}

export async function issueContractDniUploadUrls(
  entryId: string,
  descriptors: readonly ContractDniUploadDescriptor[],
  environment: NodeJS.ProcessEnv = process.env,
  clientOverride?: SupabaseClient,
): Promise<readonly ContractDniPresignedUpload[]> {
  const bucket = getContractDniStorageBucket(environment);
  const client = clientOverride ?? createSupabaseClient(environment);
  const results: ContractDniPresignedUpload[] = [];

  for (const descriptor of descriptors) {
    validateDescriptor(descriptor, environment);
    const storagePath = [
      'contracts',
      entryId,
      'client',
      descriptor.collection,
      String(descriptor.itemIndex),
      `${descriptor.slot}-${randomUUID()}-${sanitizeFileName(descriptor.originalName)}`,
    ].join('/');
    const { data, error } = await client.storage
      .from(bucket)
      .createSignedUploadUrl(storagePath, { upsert: false });
    if (error || !data?.signedUrl || !data.path) {
      throw new Error(error?.message ?? 'Unable to create a signed DNI upload URL.');
    }
    results.push({
      originalName: descriptor.originalName,
      mimeType: descriptor.mimeType,
      sizeBytes: descriptor.sizeBytes,
      storagePath: data.path,
      storageBucket: bucket,
      publicPath: `${bucket}/${data.path}`,
      slot: descriptor.slot,
      uploadUrl: data.signedUrl,
    });
  }

  return results;
}
