type ImageFormat = 'png' | 'jpg';
type ImageEncoder = (width: number, height: number, quality?: number) => Promise<Blob>;

/** Find an encoded image strictly below the limit, preserving dimensions where possible. */
export const fitCardImageToSize = async (input: {
  original: Blob; width: number; height: number; format: ImageFormat;
  maxBytes: number; encode: ImageEncoder;
}): Promise<Blob> => {
  if (input.maxBytes <= 0 || input.original.size <= input.maxBytes) return input.original;
  const target = input.maxBytes - 1;
  let width = input.width;
  let height = input.height;
  while (true) {
    let candidate = await input.encode(width, height, input.format === 'jpg' ? 0.4 : undefined);
    if (candidate.size <= target) {
      if (input.format === 'png') return candidate;
      // Maximize JPEG quality at this resolution within the byte budget.
      let low = 0.4;
      let high = 0.92;
      for (let attempt = 0; attempt < 7; attempt++) {
        const quality = (low + high) / 2;
        const next = await input.encode(width, height, quality);
        if (next.size <= target) { candidate = next; low = quality; }
        else high = quality;
      }
      return candidate;
    }
    if (width === 1 && height === 1) throw new Error('Image cannot fit within the configured export size limit');
    const ratio = Math.max(0.1, Math.min(0.85, Math.sqrt(target / candidate.size) * 0.95));
    width = Math.max(1, Math.floor(width * ratio));
    height = Math.max(1, Math.floor(height * ratio));
  }
};

/** Compression happens in memory before any file write; zero keeps the original bytes. */
export const compressCardImageForExport = async (original: Blob, format: ImageFormat, maxSizeKb: number): Promise<Blob> => {
  const maxBytes = Math.floor(maxSizeKb * 1024);
  if (!Number.isFinite(maxBytes) || maxBytes <= 0 || original.size <= maxBytes) return original;
  const bitmap = await createImageBitmap(original);
  const canvas = document.createElement('canvas');
  try {
    return await fitCardImageToSize({
      original, width: bitmap.width, height: bitmap.height, format, maxBytes,
      encode: async (width, height, quality) => {
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Image compression canvas unavailable');
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        context.drawImage(bitmap, 0, 0, width, height);
        const mime = format === 'png' ? 'image/png' : 'image/jpeg';
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, quality));
        if (!blob || blob.type !== mime) throw new Error('Failed to encode compressed image');
        return blob;
      },
    });
  } finally {
    bitmap.close();
    canvas.width = 0;
    canvas.height = 0;
  }
};
