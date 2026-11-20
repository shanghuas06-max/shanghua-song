import type {
  CurrencyCode,
  Customer,
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

export function resolveOrderItemPartName(
  item: Pick<OrderItem, 'productId' | 'description' | 'sku'>,
  customer?: Customer,
  products: Product[] = [],
): string {
  if (item.productId && Array.isArray(customer?.customPrices)) {
    const custEntry = customer.customPrices.find(
      (cp) => cp.productId === item.productId,
    );
    if (custEntry?.customDescription?.trim()) {
      return custEntry.customDescription.trim();
    }
  }
  if (item.description?.trim()) {
    return item.description.trim();
  }
  if (item.productId) {
    const prod = products.find((p) => p.id === item.productId);
    if (prod?.nameEn?.trim()) {
      return prod.nameEn.trim();
    }
  }
  return item.sku?.trim() || '—';
}

export function formatDocumentPartDisplay(
  item: Pick<OrderItem, 'productId' | 'description' | 'sku'>,
  customer?: Customer,
  products: Product[] = [],
): {
  partName: string;
  sku: string;
  hasCustomPartName: boolean;
  combinedLabel: string;
} {
  const custEntry =
    item.productId && Array.isArray(customer?.customPrices)
      ? customer.customPrices.find((cp) => cp.productId === item.productId)
      : undefined;
  const hasCustomPartName = Boolean(custEntry?.customDescription?.trim());
  const partName = resolveOrderItemPartName(item, customer, products);
  const sku = item.sku?.trim() || '';
  const combinedLabel =
    sku && partName && partName !== sku
      ? `${partName} (${sku})`
      : partName || sku || '—';
  return { partName, sku, hasCustomPartName, combinedLabel };
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
  options?: { palletCapacity?: number; customer?: Customer },
): RenderedPackingRow[] {
  const palletCapacity = Math.max(1, Math.round(options?.palletCapacity ?? 60));
  const customer = options?.customer;

  const baseRows: (PackingListRow & { unitLabel: string })[] =
    explicitRows && explicitRows.length > 0
      ? explicitRows.map((row) => {
          const matchedItem =
            items[Math.max(0, row.itemNo - 1)] ??
            items.find((it) => it.sku && it.sku === row.type);
          const resolvedPartName =
            row.partName?.trim() ||
            (matchedItem
              ? resolveOrderItemPartName(matchedItem, customer, products)
              : row.type);
          return {
            ...row,
            partName: resolvedPartName,
            unitLabel: matchedItem?.unit?.toLowerCase() || 'sets',
          };
        })
      : (() => {
          const rows: (PackingListRow & { unitLabel: string })[] = [];
          const prodById = new Map(products.map((p) => [p.id, p]));

          // Pre-compute active shared carton groups (>= 2 items)
          const groupIndicesMap = new Map<string, number[]>();
          items.forEach((item, idx) => {
            const g = (item.sharedCartonGroupId ?? '').trim();
            if (g && g !== 'NONE') {
              const arr = groupIndicesMap.get(g) ?? [];
              arr.push(idx);
              groupIndicesMap.set(g, arr);
            }
          });

          const processedGroups = new Set<string>();
          let ctnCursor = 1;

          for (let idx = 0; idx < items.length; idx += 1) {
            const item = items[idx];
            const groupId = (item.sharedCartonGroupId ?? '').trim();
            const groupMembers =
              groupId && groupId !== 'NONE'
                ? groupIndicesMap.get(groupId)
                : undefined;

            if (groupId && groupMembers && groupMembers.length >= 2) {
              if (processedGroups.has(groupId)) continue;
              processedGroups.add(groupId);

              const start = ctnCursor;
              // Shared carton consolidation (typically 1 shared carton, or ceil(sumRatio))
              const allHavePerCtn = groupMembers.every(
                (mIdx) => Number(items[mIdx].setsPerCarton) > 0,
              );
              const rawGroupCartons = groupMembers.reduce(
                (s, mIdx) => s + Math.max(0, Number(items[mIdx].cartons) || 0),
                0,
              );
              let groupCartons = 1;
              if (allHavePerCtn) {
                const ratioSum = groupMembers.reduce(
                  (s, mIdx) =>
                    s +
                    Math.max(0, Number(items[mIdx].quantity) || 0) /
                      Math.max(1, Number(items[mIdx].setsPerCarton) || 1),
                  0,
                );
                groupCartons =
                  ratioSum <= 1.001
                    ? 1
                    : Math.min(
                        Math.max(1, rawGroupCartons),
                        Math.ceil(ratioSum - 1e-4),
                      );
              }
              const end = start + groupCartons - 1;
              ctnCursor = end + 1;

              const ctnNo = start === end ? `${start}` : `${start} - ${end}`;
              const explicitPallet = groupMembers
                .map((mIdx) => items[mIdx].palletNo?.trim())
                .find(Boolean);
              const palletNum = Math.floor((start - 1) / palletCapacity) + 1;
              const palletNo = explicitPallet || `Pallet ${palletNum}`;

              groupMembers.forEach((mIdx) => {
                const mItem = items[mIdx];
                const prod = prodById.get(mItem.productId);
                const specs = resolveItemSpecs(mItem, prod);
                const qty = Math.max(0, Number(mItem.quantity) || 0);
                const tw = Number(
                  (qty * (mItem.unitNetWeightKg || 0)).toFixed(1),
                );
                rows.push({
                  id: `pk-${mItem.id}`,
                  palletNo,
                  ctnNo,
                  itemNo: mIdx + 1,
                  type: mItem.sku,
                  partName: resolveOrderItemPartName(mItem, customer, products),
                  size: specs.size,
                  material: specs.material,
                  surfaceFinish: specs.surfaceFinish,
                  setsPerCarton:
                    groupCartons === 1
                      ? qty
                      : mItem.setsPerCarton && mItem.setsPerCarton > 0
                        ? mItem.setsPerCarton
                        : qty,
                  cartonCount: groupCartons,
                  sharedCarton: true,
                  qty,
                  unitWeightKg: mItem.unitNetWeightKg,
                  totalWeightKg: tw,
                  unitLabel: (mItem.unit || 'sets').toLowerCase(),
                });
              });
              continue;
            }

            // Standard ungrouped item — split across 60-carton pallet boundaries when palletNo/cartonRange are auto
            const prod = prodById.get(item.productId);
            const specs = resolveItemSpecs(item, prod);
            const cartons = Math.max(0, Number(item.cartons) || 0);
            const explicitPallet = item.palletNo?.trim() || '';
            const explicitRange = item.cartonRange?.trim() || '';
            const setsPerCarton =
              item.setsPerCarton && item.setsPerCarton > 0
                ? item.setsPerCarton
                : cartons > 0
                  ? Math.round(item.quantity / cartons)
                  : item.quantity;

            if (cartons === 0 || explicitPallet || explicitRange) {
              const start = ctnCursor;
              const end = cartons > 0 ? start + cartons - 1 : start;
              if (cartons > 0) ctnCursor = end + 1;
              const palletNum = Math.floor((Math.max(1, start) - 1) / palletCapacity) + 1;
              const palletNo =
                explicitPallet || (cartons === 0 ? '—' : `Pallet ${palletNum}`);
              const ctnNo =
                explicitRange ||
                (cartons === 0
                  ? '-'
                  : start === end
                    ? `${start}`
                    : `${start} - ${end}`);
              const tw = Number(
                ((item.quantity || 0) * (item.unitNetWeightKg || 0)).toFixed(1),
              );
              rows.push({
                id: `pk-${item.id}`,
                palletNo,
                ctnNo,
                itemNo: idx + 1,
                type: item.sku,
                partName: resolveOrderItemPartName(item, customer, products),
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
              });
              continue;
            }

            // Split item cartons at each palletCapacity (60-carton) boundary
            let remainingCartons = cartons;
            let remainingQty = Math.max(0, Number(item.quantity) || 0);
            let chunkIndex = 0;

            while (remainingCartons > 0) {
              const palletNum = Math.floor((ctnCursor - 1) / palletCapacity) + 1;
              const palletMaxCtn = palletNum * palletCapacity;
              const takeCartons = Math.min(
                remainingCartons,
                palletMaxCtn - ctnCursor + 1,
              );
              const chunkStart = ctnCursor;
              const chunkEnd = chunkStart + takeCartons - 1;
              ctnCursor = chunkEnd + 1;
              remainingCartons -= takeCartons;

              const chunkQty =
                remainingCartons === 0
                  ? remainingQty
                  : Math.min(
                      remainingQty,
                      Math.round((item.quantity * takeCartons) / cartons),
                    );
              remainingQty -= chunkQty;

              const chunkTw = Number(
                (chunkQty * (item.unitNetWeightKg || 0)).toFixed(1),
              );
              rows.push({
                id:
                  chunkIndex === 0
                    ? `pk-${item.id}`
                    : `pk-${item.id}-p${palletNum}`,
                palletNo: `Pallet ${palletNum}`,
                ctnNo:
                  chunkStart === chunkEnd
                    ? `${chunkStart}`
                    : `${chunkStart} - ${chunkEnd}`,
                itemNo: idx + 1,
                type: item.sku,
                partName: resolveOrderItemPartName(item, customer, products),
                size: specs.size,
                material: specs.material,
                surfaceFinish: specs.surfaceFinish,
                setsPerCarton,
                cartonCount: takeCartons,
                sharedCarton: false,
                qty: chunkQty,
                unitWeightKg: item.unitNetWeightKg,
                totalWeightKg: chunkTw,
                unitLabel: (item.unit || 'sets').toLowerCase(),
              });
              chunkIndex += 1;
            }
          }

          return rows;
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
