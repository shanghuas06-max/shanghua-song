export interface ParsedDocxImagePayload {
  mime: string;
  docxType: 'png' | 'jpg' | 'gif' | 'bmp';
  bytes: Uint8Array;
}

const MIME_TO_DOCX_TYPE: Record<string, ParsedDocxImagePayload['docxType']> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
};

export function parseDataUrlImage(dataUrl: string): ParsedDocxImagePayload | null {
  const trimmed = String(dataUrl ?? '').trim();
  const match = trimmed.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) return null;
  const mime = match[1].toLowerCase();
  const docxType = MIME_TO_DOCX_TYPE[mime];
  if (!docxType) return null;
  const cleanB64 = match[2].replace(/\s+/g, '');
  if (!cleanB64) return null;

  try {
    const binary = atob(cleanB64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return { mime, docxType, bytes };
  } catch {
    return null;
  }
}

export function extractImageDimensionsFromBytes(
  bytes: Uint8Array,
  docxType: ParsedDocxImagePayload['docxType'],
): { width: number; height: number } | null {
  if (docxType === 'png' && bytes.length >= 24) {
    // PNG IHDR width/height at offsets 16..23
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
      const w =
        ((bytes[16] << 24) >>> 0) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
      const h =
        ((bytes[20] << 24) >>> 0) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
      if (w > 0 && h > 0) return { width: w, height: h };
    }
  }

  if (docxType === 'gif' && bytes.length >= 10) {
    const w = bytes[6] | (bytes[7] << 8);
    const h = bytes[8] | (bytes[9] << 8);
    if (w > 0 && h > 0) return { width: w, height: h };
  }

  if (docxType === 'jpg' && bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 4 < bytes.length) {
      if (bytes[offset] !== 0xff) break;
      const marker = bytes[offset + 1];
      offset += 2;
      if (marker === 0xd9 || marker === 0xda) break;
      if (offset + 2 > bytes.length) break;
      const len = (bytes[offset] << 8) | bytes[offset + 1];
      if (len < 2 || offset + len > bytes.length) break;
      if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
        if (offset + 7 <= bytes.length) {
          const h = (bytes[offset + 3] << 8) | bytes[offset + 4];
          const w = (bytes[offset + 5] << 8) | bytes[offset + 6];
          if (w > 0 && h > 0) return { width: w, height: h };
        }
        break;
      }
      offset += len;
    }
  }

  return null;
}

export function computeDocxImageBox(
  bytes: Uint8Array,
  docxType: ParsedDocxImagePayload['docxType'],
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  const dims = extractImageDimensionsFromBytes(bytes, docxType);
  if (!dims) {
    return { width: maxWidth, height: maxHeight };
  }
  const scale = Math.min(maxWidth / dims.width, maxHeight / dims.height);
  return {
    width: Math.max(12, Math.round(dims.width * scale)),
    height: Math.max(12, Math.round(dims.height * scale)),
  };
}

function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to decode image file'));
    img.src = dataUrl;
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read image file'));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });
}

export async function compressImageFileToDataUrl(
  file: File,
  options?: {
    maxDimension?: number;
    maxBase64Length?: number;
  },
): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('请选择有效的图片文件（PNG / JPG / WEBP / GIF）');
  }
  const rawDataUrl = await readFileAsDataUrl(file);
  const maxBase64Length = options?.maxBase64Length ?? 150000;
  const startDim = options?.maxDimension ?? 320;

  if (
    typeof document === 'undefined' ||
    typeof Image === 'undefined'
  ) {
    if (rawDataUrl.length <= maxBase64Length && /^data:image\/(png|jpeg|jpg|gif);base64,/i.test(rawDataUrl)) {
      return rawDataUrl;
    }
    throw new Error('当前环境不支持图片压缩，请上传 ≤ 150KB 的 PNG/JPG 图片');
  }

  const img = await loadImageFromDataUrl(rawDataUrl);
  const candidates = [startDim, 240, 180, 140];

  for (const dim of candidates) {
    const scale = Math.min(1, dim / Math.max(img.width || 1, img.height || 1));
    const targetW = Math.max(1, Math.round((img.width || 1) * scale));
    const targetH = Math.max(1, Math.round((img.height || 1) * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) break;
    ctx.clearRect(0, 0, targetW, targetH);
    ctx.drawImage(img, 0, 0, targetW, targetH);

    // Export transparent PNG first (ideal for stamps & signatures)
    const pngUrl = canvas.toDataURL('image/png');
    if (pngUrl.length <= maxBase64Length) {
      return pngUrl;
    }
  }

  // Fallback to white-background JPEG if PNG is still too large
  const scale = Math.min(1, 240 / Math.max(img.width || 1, img.height || 1));
  const targetW = Math.max(1, Math.round((img.width || 1) * scale));
  const targetH = Math.max(1, Math.round((img.height || 1) * scale));
  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.drawImage(img, 0, 0, targetW, targetH);
    const jpgUrl = canvas.toDataURL('image/jpeg', 0.82);
    if (jpgUrl.length <= maxBase64Length) {
      return jpgUrl;
    }
  }

  throw new Error('图片体积过大，请裁剪或选择更清晰的小尺寸印章/签名图片');
}
