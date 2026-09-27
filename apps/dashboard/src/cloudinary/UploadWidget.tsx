import { useCallback, useEffect, useRef } from 'react';

/**
 * Typed wrapper around Cloudinary's Upload Widget (from the
 * create-cloudinary-react starter kit). Uses the client-safe unsigned
 * preset only — no API key or secret is ever referenced here
 * (ENVIRONMENT.md §2, AGENTS.md §3.5).
 */

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string | undefined;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET as string | undefined;

interface UploadWidgetResultInfo {
  public_id: string;
  secure_url: string;
}

interface UploadWidgetResult {
  event: string;
  info: UploadWidgetResultInfo;
}

interface UploadWidgetInstance {
  open: () => void;
  destroy: () => void;
}

interface CloudinaryGlobal {
  createUploadWidget: (
    options: { cloudName: string; uploadPreset: string; sources: string[] },
    callback: (error: unknown, result: UploadWidgetResult | undefined) => void,
  ) => UploadWidgetInstance;
}

declare global {
  interface Window {
    cloudinary?: CloudinaryGlobal;
  }
}

export interface UploadWidgetProps {
  onUploaded?: (info: UploadWidgetResultInfo) => void;
}

export function UploadWidget({ onUploaded }: UploadWidgetProps) {
  const widgetRef = useRef<UploadWidgetInstance | null>(null);

  useEffect(() => {
    return () => {
      widgetRef.current?.destroy();
    };
  }, []);

  const open = useCallback(() => {
    if (!window.cloudinary || !CLOUD_NAME || !UPLOAD_PRESET) {
      // Fail loudly rather than silently (AGENTS.md §3.6).
      console.error('Cloudinary widget or client config unavailable');
      return;
    }
    widgetRef.current ??= window.cloudinary.createUploadWidget(
      {
        cloudName: CLOUD_NAME,
        uploadPreset: UPLOAD_PRESET,
        sources: ['local', 'camera'],
      },
      (error, result) => {
        if (error) {
          console.error('Upload failed', error);
          return;
        }
        if (result && result.event === 'success') {
          onUploaded?.(result.info);
        }
      },
    );
    widgetRef.current.open();
  }, [onUploaded]);

  return (
    <button type="button" onClick={open}>
      Upload evidence
    </button>
  );
}
