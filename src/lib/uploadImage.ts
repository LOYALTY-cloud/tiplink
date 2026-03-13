// Client-side helper: resizes image, sends to server route for validation/upload
export async function uploadImage(
  file: Blob | File,
  bucket: "avatars" | "banners",
  userId: string,
  oldPublicUrl?: string
) {
  const inputFile = file instanceof File ? file : new File([file], "upload.jpg", { type: (file as Blob).type || "image/jpeg" });

  if (!inputFile.type.startsWith("image/")) {
    throw new Error("File must be an image");
  }

  // client-side max size before upload: 5MB
  const MAX_BYTES = 5 * 1024 * 1024;

  // resize image using canvas if larger than target dimensions or size
  const resizedBlob = await resizeImage(inputFile, 2048, 0.9);
  if (resizedBlob.size > MAX_BYTES) {
    throw new Error("Max file size is 5MB");
  }

  const fileExt = (inputFile.name?.split(".").pop() || "jpg").replace(/[^a-zA-Z0-9]/g, "");
  // Use organized per-user paths so stored objects look like:
  // avatars/{userId}/avatar.png or banners/{userId}/banner.png
  const fileName = `${userId}/${bucket === "avatars" ? "avatar" : "banner"}.${fileExt}`;

  const arrayBuffer = await resizedBlob.arrayBuffer();
  const base64 = bufferToBase64(new Uint8Array(arrayBuffer));

  const res = await fetch("/api/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bucket, fileName, fileBase64: base64, oldPublicUrl }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || "Upload failed");
  }

  const data = await res.json();
  return data.publicUrl as string;
}

function bufferToBase64(u8: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < u8.length; i += chunkSize) {
    const slice = u8.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(slice));
  }
  return btoa(binary);
}

async function resizeImage(file: File, maxDim = 2048, quality = 0.9): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const { width, height } = img;
      if (width <= maxDim && height <= maxDim) {
        resolve(file);
        return;
      }

      const scale = Math.min(maxDim / width, maxDim / height);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas context unavailable"));
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error("Failed to create blob"));
          resolve(blob);
        },
        file.type || "image/jpeg",
        quality
      );
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(new Error("Image load error"));
    };
    img.src = url;
  });
}

