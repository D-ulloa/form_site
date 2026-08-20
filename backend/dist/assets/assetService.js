import { createHash } from 'node:crypto';
import { PlatformError } from '../platform/errors.js';
import { authorizeAssetRead, verifyProviderObject } from './assetDomain.js';
import { createAssetReceiverRegistry, validateAssetUploadBatch, } from './receiverPolicy.js';
function fingerprint(action, value) {
    return createHash('sha256').update(action).update('\0').update(JSON.stringify(value)).digest('hex');
}
export function createAssetService(dependencies) {
    const registry = dependencies.registry ?? createAssetReceiverRegistry();
    return {
        async initialize(context, input) {
            if (!context.capabilities.has(input.capability_key)
                || !await dependencies.authorizeOwner(context, input.owner_type, input.owner_id)) {
                throw new PlatformError('NOT_FOUND');
            }
            const policies = validateAssetUploadBatch(input.descriptors, context.principal.type, registry);
            const totalBytes = input.descriptors.reduce((total, descriptor) => total + descriptor.declared_bytes, 0);
            if (!Number.isSafeInteger(totalBytes))
                throw new Error('BATCH_TOO_LARGE');
            await dependencies.reserveQuota(context.scope, totalBytes, input.idempotency_key);
            const descriptors = input.descriptors.map((descriptor, index) => ({
                ...descriptor,
                bucket_name: policies[index].bucket,
                category: policies[index].category,
                retention_class: policies[index].retention_class,
            }));
            const requestFingerprint = fingerprint('asset-upload.initialize', {
                owner_type: input.owner_type, owner_id: input.owner_id,
                capability_key: input.capability_key, descriptors,
            });
            const session = await dependencies.repository.initialize(context.scope, {
                ...input, descriptors, principal: context.principal,
                request_fingerprint: requestFingerprint, request_id: context.request_id,
            });
            const sessionId = String(session.id);
            const intents = await dependencies.repository.listSessionIntents(context.scope, sessionId);
            const uploads = await Promise.all(intents.map(async (intent) => {
                if (intent.organization_id !== context.scope.organization_id)
                    throw new Error('ORGANIZATION_SCOPE_MISMATCH');
                const signed = await dependencies.storage.issueUpload(intent.bucket_name, intent.object_path);
                await dependencies.repository.recordUrlIssued(context.scope, sessionId, intent.id, String(session.expires_at));
                return Object.freeze({
                    asset_id: intent.asset_id, upload_intent_id: intent.id,
                    upload_url: signed.upload_url, required_headers: signed.required_headers,
                });
            }));
            return Object.freeze({ upload_session_id: sessionId, expires_at: session.expires_at, uploads });
        },
        async finalize(context, input) {
            const intents = await dependencies.repository.listSessionIntents(context.scope, input.upload_session_id);
            if (intents.length !== input.asset_ids.length
                || intents.some((intent) => !input.asset_ids.includes(intent.asset_id)))
                throw new PlatformError('NOT_FOUND');
            const verifiedObjects = [];
            for (const intent of intents) {
                const asset = await dependencies.repository.findInternal(context.scope, intent.asset_id);
                if (!asset)
                    throw new PlatformError('NOT_FOUND');
                const policy = registry.get(intent.receiver_key);
                if (!policy)
                    throw new Error('UNKNOWN_RECEIVER');
                const metadata = await dependencies.storage.inspect(intent.bucket_name, intent.object_path);
                const detection = policy.require_content_detection
                    ? await dependencies.detectContent?.(intent.bucket_name, intent.object_path)
                    : undefined;
                if (policy.require_content_detection && !detection)
                    throw new Error('ASSET_VERIFICATION_UNAVAILABLE');
                const verifiedMetadata = { ...metadata, ...detection };
                verifyProviderObject(asset, verifiedMetadata, policy);
                verifiedObjects.push({ ...verifiedMetadata, upload_intent_id: intent.id });
            }
            return dependencies.repository.finalize(context.scope, {
                p_upload_session_id: input.upload_session_id, p_expected_version: input.expected_version,
                p_verified_objects: verifiedObjects, p_request_id: context.request_id,
            });
        },
        async issueView(context, assetId, ownerVisible) {
            const asset = await dependencies.repository.findInternal(context.scope, assetId);
            if (!asset)
                throw new PlatformError('NOT_FOUND');
            authorizeAssetRead(context, asset, ownerVisible);
            return dependencies.storage.issueView(asset.bucket_name, asset.object_path, 60);
        },
    };
}
//# sourceMappingURL=assetService.js.map