export const dataUrlToBlob = (dataUrl: string) => {
  const [header, body = ''] = dataUrl.split(',', 2);
  const mimeMatch = /data:([^;]+)/.exec(header);
  const mime = mimeMatch?.[1] ?? 'application/octet-stream';
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
};

export const blobToUint8Array = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer());

export const renderSquareJpgBlob = async (dataUrl: string, size: number, quality = 0.92) => {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas context unavailable');
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.clearRect(0, 0, size, size);
  context.drawImage(image, 0, 0, size, size);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', quality);
  });
  if (blob) {
    return blob;
  }

  return dataUrlToBlob(canvas.toDataURL('image/jpeg', quality));
};

export const convertImageBlobToJpg = async (blob: Blob, quality: number) => {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();

    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas context unavailable');
    }

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const jpgBlob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', quality);
    });
    if (jpgBlob) return jpgBlob;

    return dataUrlToBlob(canvas.toDataURL('image/jpeg', quality));
  } finally {
    URL.revokeObjectURL(url);
  }
};
