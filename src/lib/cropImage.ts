export async function getCroppedImg(imageSrc: string, crop: { x: number; y: number; width: number; height: number }) {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.src = imageSrc;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  canvas.width = Math.max(1, Math.round(crop.width));
  canvas.height = Math.max(1, Math.round(crop.height));

  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = reject;
  });

  if (!ctx) return null;

  ctx.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    crop.width,
    crop.height
  );

  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob);
    }, "image/jpeg");
  });
}
