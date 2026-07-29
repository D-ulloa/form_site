import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  ContractEntryRecord,
  ContractRole,
  ContractSubmissionMetadata,
  ContractSubmissionRecord,
} from '../contracts/types.js';

const CONTRACT_ENTRY_LIST_PAGE_SIZE = 1000;

interface ContractEntryRow {
  id: string;
  schema_id: string;
  created_by: string;
  created_at: string;
  user_token_hash: string;
  client_token_hash: string;
  user_filled: boolean;
  client_filled: boolean;
  user_submitted_at: string | null;
  client_submitted_at: string | null;
  user_submission: Readonly<Record<string, unknown>> | null;
  client_submission: Readonly<Record<string, unknown>> | null;
  combined_submission: Readonly<Record<string, unknown>> | null;
  status: 'open' | 'complete' | 'archived';
  archived_at: string | null;
}

interface ContractSubmissionRow {
  id: string;
  entry_id: string;
  role: ContractRole;
  submission: Readonly<Record<string, unknown>>;
  submission_meta: ContractSubmissionMetadata;
  submitted_at: string;
}

export interface CreateContractEntryRecordInput {
  readonly id: string;
  readonly schemaId: string;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly userTokenHash: string;
  readonly clientTokenHash: string;
}

export interface SaveContractRoleSubmissionInput {
  readonly submissionId: string;
  readonly authorizedTokenHash: string | null;
  readonly entryId: string;
  readonly role: ContractRole;
  readonly fields: Readonly<Record<string, unknown>>;
  readonly metadata: ContractSubmissionMetadata;
  readonly submittedAt: string;
}

export interface ContractEntryRepository {
  createEntry(input: CreateContractEntryRecordInput): Promise<ContractEntryRecord>;
  findEntry(entryId: string): Promise<ContractEntryRecord | null>;
  listEntries(): Promise<readonly ContractEntryRecord[]>;
  listSubmissions(entryId: string): Promise<readonly ContractSubmissionRecord[]>;
  saveRoleSubmission(input: SaveContractRoleSubmissionInput): Promise<ContractEntryRecord>;
  archiveEntry(entryId: string, archivedAt: string): Promise<ContractEntryRecord>;
  replaceTokenHash(
    entryId: string,
    role: ContractRole,
    tokenHash: string,
    occurredAt: string,
  ): Promise<ContractEntryRecord>;
}

export class ContractDatabaseConfigurationError extends Error {
  constructor() {
    super('Supabase contract persistence requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    this.name = 'ContractDatabaseConfigurationError';
  }
}

export class ContractEntryNotFoundError extends Error {
  constructor(entryId: string) {
    super(`Contract entry "${entryId}" was not found.`);
    this.name = 'ContractEntryNotFoundError';
  }
}

export class ContractEntryStateError extends Error {
  readonly code: 'archived' | 'already_submitted' | 'access_changed';

  constructor(code: 'archived' | 'already_submitted' | 'access_changed') {
    super(code === 'archived'
      ? 'This contract entry has been archived.'
      : code === 'already_submitted'
        ? 'This contract form has already been submitted.'
        : 'This contract link was regenerated. Use the newest link.');
    this.name = 'ContractEntryStateError';
    this.code = code;
  }
}

function createContractSupabaseClient(
  environment: NodeJS.ProcessEnv,
): SupabaseClient {
  const url = environment.SUPABASE_URL?.trim();
  const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) throw new ContractDatabaseConfigurationError();
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function toEntry(row: ContractEntryRow): ContractEntryRecord {
  return {
    id: row.id,
    schemaId: row.schema_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    userTokenHash: row.user_token_hash,
    clientTokenHash: row.client_token_hash,
    userFilled: row.user_filled,
    clientFilled: row.client_filled,
    userSubmittedAt: row.user_submitted_at,
    clientSubmittedAt: row.client_submitted_at,
    userSubmission: row.user_submission,
    clientSubmission: row.client_submission,
    combinedSubmission: row.combined_submission,
    status: row.status,
    archivedAt: row.archived_at,
  };
}

function toSubmission(row: ContractSubmissionRow): ContractSubmissionRecord {
  return {
    id: row.id,
    entryId: row.entry_id,
    role: row.role,
    submission: row.submission,
    metadata: row.submission_meta,
    submittedAt: row.submitted_at,
  };
}

function throwDatabaseError(error: { message: string }): never {
  if (error.message.includes('CONTRACT_ENTRY_NOT_FOUND')) {
    throw new ContractEntryNotFoundError('unknown');
  }
  if (error.message.includes('CONTRACT_ENTRY_ARCHIVED')) {
    throw new ContractEntryStateError('archived');
  }
  if (error.message.includes('CONTRACT_ROLE_ALREADY_SUBMITTED')) {
    throw new ContractEntryStateError('already_submitted');
  }
  if (error.message.includes('CONTRACT_ACCESS_CHANGED')) {
    throw new ContractEntryStateError('access_changed');
  }
  throw new Error(`Supabase contract operation failed: ${error.message}`);
}

export function createContractEntryRepository(
  environment: NodeJS.ProcessEnv = process.env,
  clientOverride?: SupabaseClient,
): ContractEntryRepository {
  const getClient = () => clientOverride ?? createContractSupabaseClient(environment);

  return {
    async createEntry(input) {
      const { data, error } = await getClient().from('contract_entries').insert({
        id: input.id,
        schema_id: input.schemaId,
        created_by: input.createdBy,
        created_at: input.createdAt,
        user_token_hash: input.userTokenHash,
        client_token_hash: input.clientTokenHash,
      }).select('*').single();
      if (error || !data) throwDatabaseError(error ?? { message: 'No entry returned.' });
      return toEntry(data as ContractEntryRow);
    },

    async findEntry(entryId) {
      const { data, error } = await getClient().from('contract_entries')
        .select('*').eq('id', entryId).maybeSingle();
      if (error) throwDatabaseError(error);
      return data ? toEntry(data as ContractEntryRow) : null;
    },

    async listEntries() {
      const client = getClient();
      const entries: ContractEntryRecord[] = [];
      let from = 0;
      while (true) {
        const { data, error, count } = await client.from('contract_entries')
          .select('*', { count: 'exact' })
          .order('created_at', { ascending: false })
          .range(from, from + CONTRACT_ENTRY_LIST_PAGE_SIZE - 1);
        if (error) throwDatabaseError(error);
        const rows = data ?? [];
        entries.push(...rows.map((row) => toEntry(row as ContractEntryRow)));
        from += rows.length;
        if (
          rows.length === 0 ||
          (count !== null && entries.length >= count) ||
          (count === null && rows.length < CONTRACT_ENTRY_LIST_PAGE_SIZE)
        ) {
          break;
        }
      }
      return entries;
    },

    async listSubmissions(entryId) {
      const { data, error } = await getClient().from('contract_submissions')
        .select('id, entry_id, role, submission, submission_meta, submitted_at')
        .eq('entry_id', entryId)
        .order('submitted_at', { ascending: true });
      if (error) throwDatabaseError(error);
      return (data ?? []).map((row) => toSubmission(row as ContractSubmissionRow));
    },

    async saveRoleSubmission(input) {
      const { data, error } = await getClient().rpc('submit_contract_entry_role', {
        p_submission_id: input.submissionId,
        p_authorized_token_hash: input.authorizedTokenHash,
        p_entry_id: input.entryId,
        p_role: input.role,
        p_submission: input.fields,
        p_submission_meta: input.metadata,
        p_submitted_at: input.submittedAt,
      }).single();
      if (error || !data) throwDatabaseError(error ?? { message: 'No entry returned.' });
      return toEntry(data as ContractEntryRow);
    },

    async archiveEntry(entryId, archivedAt) {
      const { data, error } = await getClient().rpc('archive_contract_entry', {
        p_entry_id: entryId,
        p_archived_at: archivedAt,
      }).single();
      if (error || !data) throwDatabaseError(error ?? { message: 'No entry returned.' });
      return toEntry(data as ContractEntryRow);
    },

    async replaceTokenHash(entryId, role, tokenHash, occurredAt) {
      const { data, error } = await getClient().rpc('replace_contract_token_hash', {
        p_entry_id: entryId,
        p_role: role,
        p_token_hash: tokenHash,
        p_occurred_at: occurredAt,
      }).single();
      if (error || !data) throwDatabaseError(error ?? { message: 'No entry returned.' });
      return toEntry(data as ContractEntryRow);
    },
  };
}
