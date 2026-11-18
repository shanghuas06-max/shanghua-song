import type {
  CurrencyCode,
  DocLanguage,
  OrderItem,
  PackingListRow,
  Product,
} from '../types/erp';

export interface ParsedItemSpecs {
  size: string;
  material: string;
  surfaceFinish: string;
}

const MONTH_SHORT = [
  'Jan.',
  'Feb.',
  'Mar.',
  'Apr.',
  'May',
  'Jun.',
  'Jul.',
  'Aug.',
  'Sep.',
  'Oct.',
  'Nov.',
  'Dec.',
];

export function formatDocumentDate(
  isoDate: string | undefined,
  lang: DocLanguage = 'en',
): string {
  const raw = (isoDate ?? '').trim();
  if (!raw) return '—';
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return raw;
  const year = Number(match[1]);
  const monthIdx = Number(match[2]) - 1;
  const day = Number(match[3]);
  if (monthIdx < 0 || monthIdx > 11 || !Number.isFinite(day)) return raw;
  if (lang === 'en') {
    return `${MONTH_SHORT[monthIdx]} ${day}, ${year}`;
  }
  return `${year}年${monthIdx + 1}月${day}日`;
}

export function formatCurrencyLabel(currency: CurrencyCode): string {
  switch (currency) {
    case 'CNY':
      return 'CNY (RMB)';
    case 'USD':
      return 'USD ($)';
    case 'JPY':
      return 'JPY (¥)';
    case 'EUR':
      return 'EUR (€)';
  }
}

export function formatDocMoney(amount: number, currency: CurrencyCode): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const decimals = currency === 'JPY' ? 0 : 2;
  const formatted = safe.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${currency} ${formatted}`;
}

export function parseProductSpecFallback(
  sku: string,
  description: string,
): ParsedItemSpecs {
  const combined = `${sku} ${description}`;

  // Extract metric size such as M8x1.25, M16x2.0, M50x1.5, M20×2.5
  const sizeMatch = combined.match(/\bM\d+(?:\s*[x×]\s*\d+(?:\.\d+)?)?/i);
  const size = sizeMatch ? sizeMatch[0].replace(/\s+/g, '').replace('×', 'x') : '-';

  // Extract surface finish from SKU suffix or description keywords
  let surfaceFinish = '-';
  if (/\b4CR\b|-4CR\b|\b8\/4CR\b|\bCR3\b/i.test(combined)) {
    surfaceFinish = 'CR3';
  } else if (/\b8MP\b|-MP\b|\bMP\b/i.test(combined)) {
    surfaceFinish = 'MP';
  } else if (/\bHDG\b|Galvanized/i.test(combined)) {
    surfaceFinish = 'HDG';
  } else if (/\bDAC\b|Dacromet|Geomet/i.test(combined)) {
    surfaceFinish = 'DAC';
  } else if (/SUS304|SUS316|Stainless/i.test(combined)) {
    surfaceFinish = 'PLAIN';
  }

  // Extract material grade
  let material = '-';
  if (/S45C\/SS400|\b8\/4CR\b/i.test(combined)) {
    material = 'S45C/SS400';
  } else if (/SUS304|Stainless/i.test(combined)) {
    material = 'SUS304';
  } else if (/SUS316/i.test(combined)) {
    material = 'SUS316';
  } else if (/S45C|-8CR\b|-8MP\b/i.test(combined)) {
    material = 'S45C';
  } else if (/SS400|-4CR\b/i.test(combined)) {
    material = 'SS400';
  } else if (/Class\s*10/i.test(combined)) {
    material = 'CLASS 10';
  }

  return { size, material, surfaceFinish };
}

export function resolveItemSpecs(
  item: OrderItem,
  product?: Product,
): ParsedItemSpecs {
  const fallback = parseProductSpecFallback(item.sku, item.description);
  return {
    size: item.size?.trim() || product?.size?.trim() || fallback.size,
    material:
      item.material?.trim() || product?.material?.trim() || fallback.material,
    surfaceFinish:
      item.surfaceFinish?.trim() ||
      product?.surfaceFinish?.trim() ||
      fallback.surfaceFinish,
  };
}

export interface RenderedPackingRow extends PackingListRow {
  palletRowSpan: number;
  showPalletCell: boolean;
  ctnRowSpan: number;
  showCtnCell: boolean;
  isSubRowInSameCtn: boolean;
  unitLabel: string;
}

export function buildPackingListDisplayRows(
  items: OrderItem[],
  products: Product[],
  explicitRows?: PackingListRow[],
): RenderedPackingRow[] {
  const baseRows: (PackingListRow & { unitLabel: string })[] =
    explicitRows && explicitRows.length > 0
      ? explicitRows.map((row) => ({
          ...row,
          unitLabel:
            items[Math.max(0, row.itemNo - 1)]?.unit?.toLowerCase() || 'sets',
        }))
      : (() => {
          let ctnCursor = 1;
          return items.map((item, idx) => {
            const prod = products.find((p) => p.id === item.productId);
            const specs = resolveItemSpecs(item, prod);
            const cartons = Math.max(0, Number(item.cartons) || 0);
            const start = ctnCursor;
            const end = cartons > 0 ? start + cartons - 1 : start;
            if (cartons > 0) ctnCursor = end + 1;
            const ctnNo =
              item.cartonRange?.trim() ||
              (cartons === 0
                ? '-'
                : start === end
                  ? `${start}`
                  : `${start} - ${end}`);
            const setsPerCarton =
              item.setsPerCarton && item.setsPerCarton > 0
                ? item.setsPerCarton
                : cartons > 0
                  ? Math.round(item.quantity / cartons)
                  : item.quantity;
            const tw = Number(
              ((item.quantity || 0) * (item.unitNetWeightKg || 0)).toFixed(1),
            );
            return {
              id: `pk-${item.id}`,
              palletNo: item.palletNo?.trim() || String(idx + 1),
              ctnNo,
              itemNo: idx + 1,
              type: item.sku,
              size: specs.size,
              material: specs.material,
              surfaceFinish: specs.surfaceFinish,
              setsPerCarton,
              cartonCount: cartons,
              sharedCarton: false,
              qty: item.quantity,
              unitWeightKg: item.unitNetWeightKg,
              totalWeightKg: tw,
              unitLabel: (item.unit || 'sets').toLowerCase(),
            };
          });
        })();

  const result: RenderedPackingRow[] = baseRows.map((row) => ({
    ...row,
    palletRowSpan: 1,
    showPalletCell: true,
    ctnRowSpan: 1,
    showCtnCell: true,
    isSubRowInSameCtn: false,
  }));

  // Compute rowspan for contiguous matching Pallet No.
  let i = 0;
  while (i < result.length) {
    let j = i + 1;
    while (
      j < result.length &&
      result[j].palletNo &&
      result[j].palletNo === result[i].palletNo
    ) {
      result[j].showPalletCell = false;
      result[j].palletRowSpan = 0;
      j += 1;
    }
    result[i].palletRowSpan = j - i;
    i = j;
  }

  // Compute rowspan for contiguous matching Ctn. No. inside the same pallet (mixed cartons)
  let k = 0;
  while (k < result.length) {
    let m = k + 1;
    while (
      m < result.length &&
      result[m].palletNo === result[k].palletNo &&
      result[m].ctnNo &&
      result[m].ctnNo !== '-' &&
      result[m].ctnNo === result[k].ctnNo
    ) {
      result[m].showCtnCell = false;
      result[m].ctnRowSpan = 0;
      result[m].isSubRowInSameCtn = true;
      m += 1;
    }
    result[k].ctnRowSpan = m - k;
    k = m;
  }

  return result;
}

export function extractSurfaceFootnotes(
  items: OrderItem[],
  products: Product[],
  customFootnotes?: string,
): string[] {
  if (customFootnotes && customFootnotes.trim().length > 0) {
    return customFootnotes
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }
  const finishes = new Set<string>();
  for (const item of items) {
    const prod = products.find((p) => p.id === item.productId);
    const { surfaceFinish } = resolveItemSpecs(item, prod);
    if (surfaceFinish && surfaceFinish !== '-') {
      finishes.add(surfaceFinish.toUpperCase());
    }
  }
  const notes: string[] = [];
  if (finishes.has('CR3')) notes.push('*CR3:ZINC TRIVALENT CHROMATE');
  if (finishes.has('MP')) notes.push('*MP:MANGANESE PHOSPHATE');
  if (finishes.has('HDG')) notes.push('*HDG:HOT-DIP GALVANIZED');
  if (finishes.has('DAC')) notes.push('*DAC:DACROMET / GEOMET COATING');
  return notes;
}

export function formatCompactHsCode(hsCode: string | undefined): string {
  const raw = (hsCode ?? '').trim();
  if (!raw) return '—';
  // Match 6-digit display like 7318.16 when trailing .00 is present
  return raw.endsWith('.00') ? raw.slice(0, -3) : raw;
}
