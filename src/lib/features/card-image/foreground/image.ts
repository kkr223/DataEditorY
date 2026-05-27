export type LoadedForegroundImage = {
  dataUrl: string;
  width: number;
  height: number;
};

export const readForegroundFileAsDataUrl = async (file: File): Promise<LoadedForegroundImage> => {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('File read failed'));
    reader.readAsDataURL(file);
  });

  const image = new Image();
  image.src = dataUrl;
  await image.decode();

  return {
    dataUrl,
    width: image.naturalWidth,
    height: image.naturalHeight,
  };
};

export const trimTransparentForegroundImage = async (dataUrl: string): Promise<LoadedForegroundImage> => {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();

  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    return {
      dataUrl,
      width: image.naturalWidth,
      height: image.naturalHeight,
    };
  }

  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;

  let minX = canvas.width;
  let minY = canvas.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const alpha = pixels[(y * canvas.width + x) * 4 + 3];
      if (alpha <= 0) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) {
    return {
      dataUrl,
      width: image.naturalWidth,
      height: image.naturalHeight,
    };
  }

  const trimmedWidth = maxX - minX + 1;
  const trimmedHeight = maxY - minY + 1;
  if (trimmedWidth === canvas.width && trimmedHeight === canvas.height) {
    return {
      dataUrl,
      width: image.naturalWidth,
      height: image.naturalHeight,
    };
  }

  const trimmedCanvas = document.createElement('canvas');
  trimmedCanvas.width = trimmedWidth;
  trimmedCanvas.height = trimmedHeight;
  const trimmedContext = trimmedCanvas.getContext('2d');
  if (!trimmedContext) {
    return {
      dataUrl,
      width: image.naturalWidth,
      height: image.naturalHeight,
    };
  }

  trimmedContext.drawImage(
    image,
    minX,
    minY,
    trimmedWidth,
    trimmedHeight,
    0,
    0,
    trimmedWidth,
    trimmedHeight,
  );

  return {
    dataUrl: trimmedCanvas.toDataURL('image/png'),
    width: trimmedWidth,
    height: trimmedHeight,
  };
};
