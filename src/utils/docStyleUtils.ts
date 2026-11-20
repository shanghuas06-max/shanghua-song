import type {
  DocCellDensity,
  DocFontFamilyId,
  DocStyleSettings,
} from '../types/erp';

export const DEFAULT_DOC_STYLE: Required<DocStyleSettings> = {
  fontFamily: 'serif',
  baseFontSizePx: 11,
  tableFontSizePx: 10.5,
  titleFontSizePx: 18,
  lineHeight: 1.35,
  cellDensity: 'normal',
  boldBody: false,
};

export const DOC_FONT_CSS_MAP: Record<DocFontFamilyId, string> = {
  serif:
    '"Times New Roman", Times, Georgia, "Noto Serif JP", "Noto Serif SC", serif',
  sans: '"Plus Jakarta Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "PingFang SC", "Microsoft YaHei", Arial, sans-serif',
  songti: 'SimSun, "MS Mincho", "Noto Serif SC", "Noto Serif JP", serif',
  arial:
    'Arial, Helvetica, "PingFang SC", "Microsoft YaHei", "Hiragino Kaku Gothic ProN", sans-serif',
  mono: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
};

export const DOC_FONT_EXCEL_MAP: Record<DocFontFamilyId, string> = {
  serif: 'Times New Roman',
  sans: 'Calibri',
  songti: 'SimSun',
  arial: 'Arial',
  mono: 'Consolas',
};

export const DOC_FONT_DOCX_MAP: Record<
  DocFontFamilyId,
  { ascii: string; hAnsi: string; cs: string; eastAsia: string }
> = {
  serif: {
    ascii: 'Times New Roman',
    hAnsi: 'Times New Roman',
    cs: 'Times New Roman',
    eastAsia: 'SimSun',
  },
  sans: {
    ascii: 'Calibri',
    hAnsi: 'Calibri',
    cs: 'Calibri',
    eastAsia: 'Microsoft YaHei',
  },
  songti: {
    ascii: 'Times New Roman',
    hAnsi: 'Times New Roman',
    cs: 'Times New Roman',
    eastAsia: 'SimSun',
  },
  arial: {
    ascii: 'Arial',
    hAnsi: 'Arial',
    cs: 'Arial',
    eastAsia: 'Microsoft YaHei',
  },
  mono: {
    ascii: 'Consolas',
    hAnsi: 'Consolas',
    cs: 'Consolas',
    eastAsia: 'SimSun',
  },
};

export const DOC_DENSITY_PADDING: Record<
  DocCellDensity,
  { px: string; py: string }
> = {
  compact: { px: '3px', py: '1px' },
  normal: { px: '6px', py: '3px' },
  relaxed: { px: '10px', py: '6px' },
};

function clampFinite(val: unknown, min: number, max: number, fallback: number): number {
  const n = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function resolveDocStyle(
  style?: DocStyleSettings,
): Required<DocStyleSettings> {
  const validFonts: DocFontFamilyId[] = [
    'serif',
    'sans',
    'songti',
    'arial',
    'mono',
  ];
  const validDensities: DocCellDensity[] = ['compact', 'normal', 'relaxed'];
  const fontFamily =
    style?.fontFamily && validFonts.includes(style.fontFamily)
      ? style.fontFamily
      : DEFAULT_DOC_STYLE.fontFamily;
  const cellDensity =
    style?.cellDensity && validDensities.includes(style.cellDensity)
      ? style.cellDensity
      : DEFAULT_DOC_STYLE.cellDensity;

  return {
    fontFamily,
    baseFontSizePx: clampFinite(
      style?.baseFontSizePx,
      7,
      24,
      DEFAULT_DOC_STYLE.baseFontSizePx,
    ),
    tableFontSizePx: clampFinite(
      style?.tableFontSizePx,
      7,
      22,
      DEFAULT_DOC_STYLE.tableFontSizePx,
    ),
    titleFontSizePx: clampFinite(
      style?.titleFontSizePx,
      12,
      36,
      DEFAULT_DOC_STYLE.titleFontSizePx,
    ),
    lineHeight: clampFinite(
      style?.lineHeight,
      1.0,
      2.2,
      DEFAULT_DOC_STYLE.lineHeight,
    ),
    cellDensity,
    boldBody: Boolean(style?.boldBody),
  };
}

export function buildDocSheetCssVars(
  style?: DocStyleSettings,
): Record<string, string | number> {
  const resolved = resolveDocStyle(style);
  const pad = DOC_DENSITY_PADDING[resolved.cellDensity];
  const headingScale = resolved.titleFontSizePx / DEFAULT_DOC_STYLE.titleFontSizePx;
  const companySizePx = Number((22 * headingScale).toFixed(2));
  const smallSizePx = Number(Math.max(7.5, resolved.tableFontSizePx - 1.5).toFixed(2));
  return {
    fontFamily: DOC_FONT_CSS_MAP[resolved.fontFamily],
    fontSize: `${resolved.baseFontSizePx}px`,
    lineHeight: String(resolved.lineHeight),
    fontWeight: resolved.boldBody ? 600 : 400,
    '--doc-font-family': DOC_FONT_CSS_MAP[resolved.fontFamily],
    '--doc-base-size': `${resolved.baseFontSizePx}px`,
    '--doc-table-size': `${resolved.tableFontSizePx}px`,
    '--doc-title-size': `${resolved.titleFontSizePx}px`,
    '--doc-company-size': `${companySizePx}px`,
    '--doc-small-size': `${smallSizePx}px`,
    '--doc-line-height': String(resolved.lineHeight),
    '--doc-cell-px': pad.px,
    '--doc-cell-py': pad.py,
    '--doc-body-weight': resolved.boldBody ? '600' : '400',
  };
}
