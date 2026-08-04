import { createClient } from '@supabase/supabase-js';
const CONTRACT_ENTRY_LIST_PAGE_SIZE = 1000;
export class ContractDatabaseConfigurationError extends Error {
    constructor() {
        super('Supabase contract persistence requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
        this.name = 'ContractDatabaseConfigurationError';
    }
}
export class ContractEntryNotFoundError extends Error {
    constructor(entryId) {
        super(`Contract entry "${entryId}" was not found.`);
        this.name = 'ContractEntryNotFoundError';
    }
}
export class ContractEntryStateError extends Error {
    code;
    constructor(code) {
        super(code === 'archived'
            ? 'This contract entry has been archived.'
            : code === 'already_submitted'
                ? 'This contract form has already been submitted.'
                : 'This contract link was regenerated. Use the newest link.');
        this.name = 'ContractEntryStateError';
        this.code = code;
    }
}
function createContractSupabaseClient(environment) {
    const url = environment.SUPABASE_URL?.trim();
    const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!url || !serviceRoleKey)
        throw new ContractDatabaseConfigurationError();
    return createClient(url, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });
}
function toEntry(row) {
    return {
        id: row.id,
        schemaId: row.schema_id,
        direccion: row.direccion ?? null,
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
function toSubmission(row) {
    return {
        id: row.id,
        entryId: row.entry_id,
        role: row.role,
        submission: row.submission,
        metadata: row.submission_meta,
        submittedAt: row.submitted_at,
    };
}
function throwDatabaseError(error) {
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
export function createContractEntryRepository(environment = process.env, clientOverride) {
    const getClient = () => clientOverride ?? createContractSupabaseClient(environment);
    return {
        async createEntry(input) {
            const { data, error } = await getClient().from('contract_entries').insert({
                id: input.id,
                schema_id: input.schemaId,
                direccion: input.direccion,
                created_by: input.createdBy,
                created_at: input.createdAt,
                user_token_hash: input.userTokenHash,
                client_token_hash: input.clientTokenHash,
            }).select('*').single();
            if (error || !data)
                throwDatabaseError(error ?? { message: 'No entry returned.' });
            return toEntry(data);
        },
        async findEntry(entryId) {
            const { data, error } = await getClient().from('contract_entries')
                .select('*').eq('id', entryId).maybeSingle();
            if (error)
                throwDatabaseError(error);
            return data ? toEntry(data) : null;
        },
        async listEntries() {
            const client = getClient();
            const entries = [];
            let from = 0;
            while (true) {
                const { data, error, count } = await client.from('contract_entries')
                    .select('*', { count: 'exact' })
                    .order('created_at', { ascending: false })
                    .range(from, from + CONTRACT_ENTRY_LIST_PAGE_SIZE - 1);
                if (error)
                    throwDatabaseError(error);
                const rows = data ?? [];
                entries.push(...rows.map((row) => toEntry(row)));
                from += rows.length;
                if (rows.length === 0 ||
                    (count !== null && entries.length >= count) ||
                    (count === null && rows.length < CONTRACT_ENTRY_LIST_PAGE_SIZE)) {
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
            if (error)
                throwDatabaseError(error);
            return (data ?? []).map((row) => toSubmission(row));
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
            if (error || !data)
                throwDatabaseError(error ?? { message: 'No entry returned.' });
            return toEntry(data);
        },
        async updateRoleSubmission(input) {
            const { data, error } = await getClient().rpc('update_contract_entry_role', {
                p_submission_id: input.submissionId,
                p_authorized_token_hash: input.authorizedTokenHash,
                p_entry_id: input.entryId,
                p_role: input.role,
                p_submission: input.fields,
                p_submission_meta: input.metadata,
                p_submitted_at: input.submittedAt,
            }).single();
            if (error || !data)
                throwDatabaseError(error ?? { message: 'No entry returned.' });
            return toEntry(data);
        },
        async archiveEntry(entryId, archivedAt) {
            const { data, error } = await getClient().rpc('archive_contract_entry', {
                p_entry_id: entryId,
                p_archived_at: archivedAt,
            }).single();
            if (error || !data)
                throwDatabaseError(error ?? { message: 'No entry returned.' });
            return toEntry(data);
        },
        async updateStatus(entryId, status) {
            const { data, error } = await getClient().from('contract_entries')
                .update({ status })
                .eq('id', entryId)
                .select('*')
                .single();
            if (error || !data)
                throwDatabaseError(error ?? { message: 'No entry returned.' });
            return toEntry(data);
        },
        async updateGenerationTrigger(entryId) {
            const { data, error } = await getClient().from('contract_entries')
                .update({ status: 'generar_contrato', generar_contrato_trigger: true })
                .eq('id', entryId)
                .select('*')
                .single();
            if (error || !data)
                throwDatabaseError(error ?? { message: 'No entry returned.' });
            return toEntry(data);
        },
        async replaceTokenHash(entryId, role, tokenHash, occurredAt) {
            const { data, error } = await getClient().rpc('replace_contract_token_hash', {
                p_entry_id: entryId,
                p_role: role,
                p_token_hash: tokenHash,
                p_occurred_at: occurredAt,
            }).single();
            if (error || !data)
                throwDatabaseError(error ?? { message: 'No entry returned.' });
            return toEntry(data);
        },
    };
}
//# sourceMappingURL=contractEntryRepository.js.map