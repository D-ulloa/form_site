import { Readable } from 'stream';
import { google, drive_v3 } from 'googleapis';
import { withRetry } from '../utils/retryPolicy.js';
import { createGoogleAuth } from '../utils/googleAuth.js';
const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive'];
const DRIVE_REQUEST_OPTIONS = {
    supportsAllDrives: true,
};
async function assertPrivateParentAccess(drive, parentFolderId) {
    const permissionResponse = await withRetry(() => drive.permissions.list({
        ...DRIVE_REQUEST_OPTIONS,
        fileId: parentFolderId,
        fields: 'permissions(id,type,role,emailAddress,domain,allowFileDiscovery)',
    }));
    const permissions = permissionResponse.data.permissions ?? [];
    if (permissions.length === 0
        || permissions.some((permission) => (permission.type === 'anyone' || permission.type === 'domain'))
        || !permissions.some((permission) => (permission.type === 'user' || permission.type === 'group'))) {
        throw new Error('Configured Drive parent does not have a verified private user/group ACL.');
    }
}
export async function createDriveFolder(folderName, parentFolderId) {
    const auth = createGoogleAuth(DRIVE_SCOPES);
    const drive = google.drive({ version: 'v3', auth });
    await assertPrivateParentAccess(drive, parentFolderId);
    const createRes = await withRetry(() => drive.files.create({
        ...DRIVE_REQUEST_OPTIONS,
        requestBody: {
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parentFolderId],
        },
        fields: 'id,name,webViewLink',
    }));
    const { id, webViewLink } = createRes.data;
    if (!id || !webViewLink) {
        throw new Error('Drive folder creation returned incomplete metadata');
    }
    // SPEC-25 containment: the folder remains private and inherits only the
    // reviewed ACL from its configured Azar parent. A Drive URL is not access.
    return { folder_id: id, folder_name: folderName, folder_url: webViewLink };
}
export async function uploadFilesToFolder(files, folderId) {
    const auth = createGoogleAuth(DRIVE_SCOPES);
    const drive = google.drive({ version: 'v3', auth });
    const uploaded = [];
    for (const file of files) {
        const res = await withRetry(() => drive.files.create({
            ...DRIVE_REQUEST_OPTIONS,
            requestBody: {
                name: file.originalname,
                parents: [folderId],
            },
            media: {
                mimeType: file.mimetype,
                body: Readable.from(file.buffer),
            },
            fields: 'id,webViewLink',
        }));
        const { id, webViewLink } = res.data;
        if (!id || !webViewLink) {
            throw new Error(`Upload failed for file: ${file.originalname}`);
        }
        uploaded.push({
            drive_file_id: id,
            name: file.originalname,
            mime_type: file.mimetype,
            size_bytes: file.size,
            url: webViewLink,
        });
    }
    return uploaded;
}
//# sourceMappingURL=googleDriveService.js.map