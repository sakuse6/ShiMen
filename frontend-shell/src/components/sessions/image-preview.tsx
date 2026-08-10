import { X } from "lucide-react";

interface AttachedImage {
  id: string;
  data: string; // base64 data URL for preview
  filename: string;
  label: string;
}

interface ImagePreviewProps {
  images: AttachedImage[];
  onLabelChange: (id: string, label: string) => void;
  onRemove: (id: string) => void;
}

export function ImagePreview({ images, onLabelChange, onRemove }: ImagePreviewProps) {
  if (images.length === 0) return null;

  return (
    <div className="flex gap-2 overflow-x-auto p-2 border-t border-border">
      {images.map((img) => (
        <div key={img.id} className="relative flex-shrink-0 w-20 group">
          <img
            src={img.data.startsWith("data:") ? img.data : `data:image/png;base64,${img.data}`}
            alt={img.label}
            className="w-20 h-20 object-cover rounded border"
          />
          <button
            onClick={() => onRemove(img.id)}
            className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <X className="h-2.5 w-2.5" />
          </button>
          <input
            value={img.label}
            onChange={(e) => onLabelChange(img.id, e.target.value)}
            className="w-full text-[10px] text-center mt-0.5 border rounded px-0.5 py-0"
          />
        </div>
      ))}
    </div>
  );
}
