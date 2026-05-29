import type { MediaFile } from '../types.js';
export interface CreateFolderResult {
    folder_id: string;
    folder_name: string;
    folder_url: string;
}
export declare function createDriveFolder(folderName: string, parentFolderId: string): Promise<CreateFolderResult>;
export interface UploadedFile extends MediaFile {
    drive_file_id: string;
}
export declare function uploadFilesToFolder(files: Express.Multer.File[], folderId: string): Promise<UploadedFile[]>;
//# sourceMappingURL=googleDriveService.d.ts.map