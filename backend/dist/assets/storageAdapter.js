import { createPlatformServiceRoleClient } from '../platform/serviceRoleClient.js';
export function createSupabaseAssetStorageAdapter(clientOverride, environment = process.env, now = () => new Date()) {
    const client = () => clientOverride ?? createPlatformServiceRoleClient(environment);
    return {
        async issueUpload(bucketName, objectPath) {
            const { data, error } = await client().storage.from(bucketName)
                .createSignedUploadUrl(objectPath, { upsert: false });
            if (error || !data?.signedUrl || data.path !== objectPath)
                throw new Error('STORAGE_UNAVAILABLE');
            return { upload_url: data.signedUrl, required_headers: Object.freeze({}) };
        },
        async inspect(bucketName, objectPath) {
            const { data, error } = await client().storage.from(bucketName).info(objectPath);
            if (error || !data)
                throw new Error(error?.status === 404 ? 'ASSET_NOT_FOUND' : 'STORAGE_UNAVAILABLE');
            const bytes = data.size ?? data.metadata?.size;
            const providerMime = data.contentType ?? data.metadata?.mimetype;
            if (typeof bytes !== 'number' || !Number.isSafeInteger(bytes) || typeof providerMime !== 'string') {
                throw new Error('ASSET_VERIFICATION_UNAVAILABLE');
            }
            return { bucket_name: bucketName, object_path: objectPath, bytes, provider_mime: providerMime };
        },
        async issueView(bucketName, objectPath, expiresInSeconds) {
            const ttl = Math.max(15, Math.min(300, Math.floor(expiresInSeconds)));
            const { data, error } = await client().storage.from(bucketName).createSignedUrl(objectPath, ttl);
            if (error || !data?.signedUrl)
                throw new Error('STORAGE_UNAVAILABLE');
            return { signed_url: data.signedUrl, expires_at: new Date(now().getTime() + ttl * 1000).toISOString() };
        },
        async remove(bucketName, objectPath) {
            const { error } = await client().storage.from(bucketName).remove([objectPath]);
            if (!error)
                return 'deleted';
            if (error.status === 404)
                return 'not_found';
            throw new Error('STORAGE_UNAVAILABLE');
        },
    };
}
//# sourceMappingURL=storageAdapter.js.map