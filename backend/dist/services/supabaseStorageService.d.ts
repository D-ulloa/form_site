export interface PresignFileDescriptor {
    originalName: string;
    mimeType: string;
    sizeBytes: number;
}
export interface PresignedUpload {
    originalName: string;
    uploadUrl: string;
    publicPath: string;
    storagePath: string;
    storageBucket: string;
}
export interface SignedDownloadResult {
    signedUrl: string;
    expiresAt: string;
}
export declare function issueSignedUploadUrls(descriptors: PresignFileDescriptor[]): Promise<PresignedUpload[]>;
export declare function issueSignedDownloadUrl(storagePath: string, storageBucket?: string): Promise<SignedDownloadResult>;
//# sourceMappingURL=supabaseStorageService.d.ts.map