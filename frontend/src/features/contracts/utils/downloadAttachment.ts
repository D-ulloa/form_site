function filenameForDownload(filename: string): string {
  return filename.trim() || 'archivo';
}

export function buildAttachmentDownloadUrl(url: string, filename: string): string {
  const downloadUrl = new URL(
    url,
    typeof document === 'undefined' ? 'http://localhost' : document.baseURI,
  );
  downloadUrl.searchParams.set('download', filenameForDownload(filename));
  return downloadUrl.toString();
}

export async function downloadAttachment(url: string, filename: string): Promise<void> {
  const downloadUrl = buildAttachmentDownloadUrl(url, filename);

  try {
    const response = await fetch(downloadUrl);
    if (!response.ok) throw new Error(`Download failed with status ${response.status}`);

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filenameForDownload(filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  } catch {
    const fallback = document.createElement('a');
    fallback.href = downloadUrl;
    fallback.download = filenameForDownload(filename);
    document.body.appendChild(fallback);
    fallback.click();
    fallback.remove();
  }
}
