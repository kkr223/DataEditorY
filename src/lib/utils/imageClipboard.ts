export async function writeImageBlobToClipboard(blob: Blob) {
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
    throw new Error('Image clipboard API is not available');
  }

  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}
