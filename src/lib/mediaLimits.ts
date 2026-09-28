/**
 * Shared media size limits for portfolio images, post images, and videos.
 * Client compresses before upload; architecture is ready for Storage rules.
 */

export const IMAGE_HARD_MAX_BYTES = 1 * 1024 * 1024; // 1 MB hard max
export const IMAGE_TARGET_MIN_BYTES = 300 * 1024; // ~300 KB target floor (guidance)
export const IMAGE_TARGET_MAX_BYTES = 800 * 1024; // ~800 KB target ceiling
export const PORTFOLIO_VIDEO_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
export const POST_VIDEO_MAX_BYTES = 25 * 1024 * 1024; // 25 MB

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Validate raw file size before processing. Returns error message or null. */
export function validateImageFileSize(file: File): string | null {
  if (!file.type.startsWith('image/')) {
    return 'Please select a valid image file (JPG, PNG, WebP, etc.).';
  }
  if (file.size > IMAGE_HARD_MAX_BYTES) {
    return `Image must be under ${formatBytes(IMAGE_HARD_MAX_BYTES)}. Selected file is ${formatBytes(file.size)}.`;
  }
  return null;
}

export function validateVideoFileSize(file: File, kind: 'portfolio' | 'post'): string | null {
  if (!file.type.startsWith('video/')) {
    return 'Please select a valid video file.';
  }
  const max = kind === 'portfolio' ? PORTFOLIO_VIDEO_MAX_BYTES : POST_VIDEO_MAX_BYTES;
  if (file.size > max) {
    return `Video must be under ${formatBytes(max)}. Selected file is ${formatBytes(file.size)}.`;
  }
  return null;
}

/**
 * Compress/resize an image file to approximately 300–800 KB where practical,
 * never exceeding 1 MB. Returns a data URL (JPEG).
 */
export async function compressImageFile(
  file: File,
  opts?: { maxDimension?: number; isBanner?: boolean }
): Promise<string> {
  const err = validateImageFileSize(file);
  if (err) throw new Error(err);

  const maxDimension = opts?.maxDimension ?? (opts?.isBanner ? 1280 : 1280);
  const dataUrl = await readFileAsDataUrl(file);
  const img = await loadImage(dataUrl);

  let width = img.width;
  let height = img.height;
  if (width > maxDimension || height > maxDimension) {
    if (width > height) {
      height = Math.round((height * maxDimension) / width);
      width = maxDimension;
    } else {
      width = Math.round((width * maxDimension) / height);
      height = maxDimension;
    }
  }

  // Quality ladder to land near 300–800 KB without exceeding 1 MB
  const qualities = [0.85, 0.75, 0.65, 0.55, 0.45];
  let best = '';
  for (const q of qualities) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not process image.');
    ctx.drawImage(img, 0, 0, width, height);
    const url = canvas.toDataURL('image/jpeg', q);
    const bytes = approxDataUrlBytes(url);
    best = url;
    if (bytes <= IMAGE_TARGET_MAX_BYTES && bytes <= IMAGE_HARD_MAX_BYTES) {
      return url;
    }
    // shrink dimensions further if still too large
    if (bytes > IMAGE_HARD_MAX_BYTES) {
      width = Math.round(width * 0.85);
      height = Math.round(height * 0.85);
    }
  }
  // Final check
  if (approxDataUrlBytes(best) > IMAGE_HARD_MAX_BYTES) {
    throw new Error(
      `Could not compress image under ${formatBytes(IMAGE_HARD_MAX_BYTES)}. Try a smaller source image.`
    );
  }
  return best;
}

function approxDataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.split(',')[1] || '';
  return Math.round((base64.length * 3) / 4);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Invalid image data.'));
    img.src = src;
  });
}
