"use client";

import { useEffect, useState } from "react";

type Props = {
  image: string;
  onCropComplete?: ((croppedArea: any, croppedAreaPixels: any) => void) | null;
  aspect?: number;
};

export default function ImageCropper({ image, onCropComplete, aspect = 1 }: Props) {
  const [CropperComp, setCropperComp] = useState<any>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const mod = await import("react-easy-crop");
        if (mounted) setCropperComp(() => mod.default || mod);
      } catch (e) {
        // module not available — keep fallback
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Signal fallback if Cropper not available and render accordingly.
  useEffect(() => {
    if (!CropperComp && onCropComplete) onCropComplete?.(null, null);
  }, [image, onCropComplete, CropperComp]);

  if (CropperComp) {
    const C = CropperComp;
    return (
      <div className="relative w-full h-80 bg-black/5">
        <C
          image={image}
          crop={crop}
          zoom={zoom}
          aspect={aspect}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={(croppedArea: unknown, croppedAreaPixels: unknown) => onCropComplete?.(croppedArea, croppedAreaPixels)}
        />
      </div>
    );
  }

  return (
    <div className="relative w-full h-80 flex items-center justify-center bg-black/5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image} alt="crop preview" className="max-h-80 object-contain" />
    </div>
  );
}
