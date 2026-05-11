import { Readable } from 'stream';
import { google } from 'googleapis';
import { withRetry } from '../utils/retryPolicy.js';
import { createGoogleAuth } from '../utils/googleAuth.js';
import type { MediaFile } from '../types.js';

const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive'];

// ─── Create folder ────────────────────────────────────────────────────────────

export interface CreateFolderResult {
  folder_id: string;
  folder_name: string;
  folder_url: string;
}

export async function createDriveFolder(
  folderName: string,
  parentFolderId: string,
): Promise<CreateFolderResult> {
  const auth = createGoogleAuth(DRIVE_SCOPES);
  const drive = google.drive({ version: 'v3', auth });

  const createRes = await withRetry(() =>
    drive.files.create({
      requestBody: {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentFolderId],
      },
      fields: 'id,name,webViewLink',
    }),
  );

  const { id, webViewLink } = createRes.data;
  if (!id || !webViewLink) {
    throw new Error('Drive folder creation returned incomplete metadata');
  }

  // Make folder readable by anyone with the link
  await withRetry(() =>
    drive.permissions.create({
      fileId: id,
      requestBody: { role: 'reader', type: 'anyone' },
    }),
  );

  return { folder_id: id, folder_name: folderName, folder_url: webViewLink };
}

// ─── Upload files ─────────────────────────────────────────────────────────────

export interface UploadedFile extends MediaFile {
  drive_file_id: string;
}

export async function uploadFilesToFolder(
  files: Express.Multer.File[],
  folderId: string,
): Promise<UploadedFile[]> {
  const auth = createGoogleAuth(DRIVE_SCOPES);
  const drive = google.drive({ version: 'v3', auth });
  const uploaded: UploadedFile[] = [];

  for (const file of files) {
    const res = await withRetry(() =>
      drive.files.create({
        requestBody: {
          name: file.originalname,
          parents: [folderId],
        },
        media: {
          mimeType: file.mimetype,
          body: Readable.from(file.buffer),
        },
        fields: 'id,webViewLink',
      }),
    );

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
