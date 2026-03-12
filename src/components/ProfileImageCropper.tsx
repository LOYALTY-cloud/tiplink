"use client";

import { useState, useCallback } from "react";
import Cropper from "react-easy-crop";

interface Props {
  image: string;
  onComplete: (blob: Blob) => void;
  onCancel: () => void;
}

export default function ProfileImageCropper({
  image,
  onComplete,
  onCancel,
}: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<unknown>(null);

  const onCropComplete = useCallback((_: unknown, croppedPixels: unknown) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const createImage = (url: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.src = url;
      image.onload = () => resolve(image);
      image.onerror = reject;
    });

  const getCroppedImg = async () => {
    const img = await createImage(image);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    canvas.width = croppedAreaPixels.width;
    canvas.height = croppedAreaPixels.height;

    ctx?.drawImage(
      img,
      croppedAreaPixels.x,
      croppedAreaPixels.y,
      croppedAreaPixels.width,
      croppedAreaPixels.height,
      0,
      0,
      croppedAreaPixels.width,
      croppedAreaPixels.height
    );

    return new Promise<Blob>((resolve) => {
      canvas.toBlob((blob) => {
        resolve(blob!);
      }, "image/jpeg", 0.85);
    });
  };

  const handleSave = async () => {
    const blob = await getCroppedImg();
    onComplete(blob);
  };

  return (
    <div className="fixed inset-0 bg-black flex flex-col z-50">
      <div className="flex justify-between p-4 text-white">
        <button onClick={onCancel} className="text-sm">
          Cancel
        </button>
        <button onClick={handleSave} className="text-sm">
          Use
        </button>
      </div>

      <div className="relative flex-1">
        <Cropper
          image={image}
          crop={crop}
          zoom={zoom}
          aspect={1}
          cropShape="round"
          showGrid={false}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
        />
      </div>

      <div className="p-4 bg-black">
        <input
          type="range"
          min={1}
          max={3}
          step={0.1}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="w-full"
        />
      </div>
    </div>
  );
}
