import { Readable } from 'stream';
import { google } from 'googleapis';
import { withRetry } from '../utils/retryPolicy.js';
import { createGoogleAuth } from '../utils/googleAuth.js';
const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive'];
const DRIVE_REQUEST_OPTIONS = {
    supportsAllDrives: true,
};
export async function createDriveFolder(folderName, parentFolderId) {
    const auth = createGoogleAuth(DRIVE_SCOPES);
    const drive = google.drive({ version: 'v3', auth });
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
    // Make folder readable by anyone with the link
    await withRetry(() => drive.permissions.create({
        ...DRIVE_REQUEST_OPTIONS,
        fileId: id,
        requestBody: { role: 'reader', type: 'anyone' },
    }));
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