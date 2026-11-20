import type {
  CurrencyCode,
  Customer,
  DocLanguage,
  OrderItem,
  PackingListRow,
  Product,
} from '../types/erp';
import { cleanFloat } from './exportCalculations';

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
  const safe = cleanFloat(Number.isFinite(amount) ? amount : 0);
  const minDecimals = currency === 'JPY' ? 0 : 2;
  const formatted = safe.toLocaleString('en-US', {
    minimumFractionDigits: minDecimals,
    maximumFractionDigits: 10,
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

interface SingleAutoUnit {
  kind: 'single';
  itemNo: number;
  item: OrderItem;
  remainingCartons: number;
  remainingQty: number;
  totalCartons: number;
  setsPerCarton: number;
  specs: ParsedItemSpecs;
  partName: string;
  unitLabel: string;
}

interface SharedAutoUnit {
  kind: 'shared';
  itemNo: number;
  remainingCartons: number;
  members: Array<{
    itemNo: number;
    item: OrderItem;
    qty: number;
    setsPerCarton: number;
    specs: ParsedItemSpecs;
    partName: string;
    unitLabel: string;
  }>;
}

type AutoPackUnit = SingleAutoUnit | SharedAutoUnit;

type PlannedPalletPick =
  | {
      kind: 'single';
      unit: SingleAutoUnit;
      takeCartons: number;
      chunkQty: number;
      effectiveSetsPerCarton: number;
      chunkIndex: number;
    }
  | {
      kind: 'shared';
      unit: SharedAutoUnit;
    };

interface SubsetCandidate {
  kindCount: number;
  unitCount: number;
  maxCarton: number;
  indices: number[];
}

function getUnitKindWeight(u: AutoPackUnit): number {
  return u.kind === 'shared' ? u.members.length : 1;
}

function isBetterSubset(a: SubsetCandidate, b: SubsetCandidate): boolean {
  if (a.kindCount !== b.kindCount) return a.kindCount < b.kindCount;
  if (a.unitCount !== b.unitCount) return a.unitCount < b.unitCount;
  if (a.maxCarton !== b.maxCarton) return a.maxCarton > b.maxCarton;
  const len = Math.min(a.indices.length, b.indices.length);
  for (let i = 0; i < len; i += 1) {
    if (a.indices[i] !== b.indices[i]) return a.indices[i] < b.indices[i];
  }
  return a.indices.length < b.indices.length;
}

function findBestExactSubset(
  units: AutoPackUnit[],
  targetCartons: number,
): number[] | null {
  if (units.length === 0 || targetCartons <= 1e-6) return null;

  const isIntTarget = Math.abs(targetCartons - Math.round(targetCartons)) <= 1e-7;
  const allInts =
    isIntTarget &&
    units.every(
      (u) => Math.abs(u.remainingCartons - Math.round(u.remainingCartons)) <= 1e-7,
    );

  if (allInts) {
    const cap = Math.round(targetCartons);
    const dp: (SubsetCandidate | null)[] = new Array(cap + 1).fill(null);
    dp[0] = { kindCount: 0, unitCount: 0, maxCarton: 0, indices: [] };

    for (let idx = 0; idx < units.length; idx += 1) {
      const w = Math.round(units[idx].remainingCartons);
      if (w <= 0 || w > cap) continue;
      const kw = getUnitKindWeight(units[idx]);
      for (let s = cap; s >= w; s -= 1) {
        const prev = dp[s - w];
        if (!prev) continue;
        const cand: SubsetCandidate = {
          kindCount: prev.kindCount + kw,
          unitCount: prev.unitCount + 1,
          maxCarton: Math.max(prev.maxCarton, w),
          indices: [...prev.indices, idx],
        };
        const cur = dp[s];
        if (!cur || isBetterSubset(cand, cur)) {
          dp[s] = cand;
        }
      }
    }
    return dp[cap]?.indices ?? null;
  }

  // General bounded DFS for decimal carton counts (no-rounding mode)
  const sorted = units
    .map((u, idx) => ({
      idx,
      w: u.remainingCartons,
      kw: getUnitKindWeight(u),
    }))
    .filter((x) => x.w > 1e-6 && x.w <= targetCartons + 1e-6)
    .sort((a, b) => b.w - a.w || a.idx - b.idx);

  const suffixSum = new Array<number>(sorted.length + 1).fill(0);
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    suffixSum[i] = cleanFloat(suffixSum[i + 1] + sorted[i].w);
  }

  let best: SubsetCandidate | null = null;
  let visits = 0;
  const MAX_VISITS = 25000;
  const chosen: number[] = [];

  function dfs(
    pos: number,
    sum: number,
    kindCount: number,
    unitCount: number,
    maxCarton: number,
  ) {
    if (visits >= MAX_VISITS) return;
    visits += 1;

    if (Math.abs(sum - targetCartons) <= 1e-6) {
      const cand: SubsetCandidate = {
        kindCount,
        unitCount,
        maxCarton,
        indices: [...chosen].sort((a, b) => a - b),
      };
      if (!best || isBetterSubset(cand, best)) {
        best = cand;
      }
      return;
    }

    if (pos >= sorted.length) return;
    if (sum > targetCartons + 1e-6) return;
    if (sum + suffixSum[pos] < targetCartons - 1e-6) return;
    if (best && kindCount > best.kindCount) return;

    const item = sorted[pos];
    if (sum + item.w <= targetCartons + 1e-6) {
      chosen.push(item.idx);
      dfs(
        pos + 1,
        cleanFloat(sum + item.w),
        kindCount + item.kw,
        unitCount + 1,
        Math.max(maxCarton, item.w),
      );
      chosen.pop();
    }
    dfs(pos + 1, sum, kindCount, unitCount, maxCarton);
  }

  dfs(0, 0, 0, 0, 0);
  return best ? (best as SubsetCandidate).indices : null;
}

function allocateSingleUnitChunk(
  unit: SingleAutoUnit,
  takeCartons: number,
  isFinalRemainder: boolean,
): { chunkQty: number; effectiveSetsPerCarton: number } {
  const safeTake = Math.min(unit.remainingCartons, Math.max(0, takeCartons));
  let chunkQty: number;
  if (isFinalRemainder || safeTake >= unit.remainingCartons - 1e-9) {
    chunkQty = unit.remainingQty;
  } else if (
    unit.item.setsPerCarton &&
    unit.item.setsPerCarton > 0 &&
    unit.item.quantity <= unit.totalCartons * unit.item.setsPerCarton + 1e-6
  ) {
    chunkQty = Math.min(
      unit.remainingQty,
      cleanFloat(safeTake * unit.item.setsPerCarton),
    );
  } else {
    chunkQty = Math.min(
      unit.remainingQty,
      cleanFloat((unit.item.quantity * safeTake) / Math.max(1e-9, unit.totalCartons)),
    );
  }
  unit.remainingQty = cleanFloat(Math.max(0, unit.remainingQty - chunkQty));
  unit.remainingCartons = cleanFloat(Math.max(0, unit.remainingCartons - safeTake));

  const effectiveSetsPerCarton =
    safeTake > 0
      ? unit.item.setsPerCarton &&
        unit.item.setsPerCarton > 0 &&
        Math.abs(chunkQty - safeTake * unit.item.setsPerCarton) <= 1e-6
        ? unit.item.setsPerCarton
        : cleanFloat(chunkQty / safeTake)
      : unit.setsPerCarton;

  return { chunkQty, effectiveSetsPerCarton };
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
          const autoUnits: AutoPackUnit[] = [];
          const explicitOrZeroEntries: Array<{
            kind: 'explicit' | 'zero';
            itemNo: number;
            item: OrderItem;
            specs: ParsedItemSpecs;
            partName: string;
            setsPerCarton: number;
            cartons: number;
            explicitPallet: string;
            explicitRange: string;
          }> = [];

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

              const explicitPallet = groupMembers
                .map((mIdx) => items[mIdx].palletNo?.trim())
                .find(Boolean);
              const explicitRange = groupMembers
                .map((mIdx) => items[mIdx].cartonRange?.trim())
                .find(Boolean);

              if (explicitPallet || explicitRange) {
                // Keep manual group override in place
                const palletNo = explicitPallet || 'Pallet 1';
                const ctnNo =
                  explicitRange ||
                  (groupCartons === 1 ? '1' : `1 - ${groupCartons}`);
                groupMembers.forEach((mIdx) => {
                  const mItem = items[mIdx];
                  const prod = prodById.get(mItem.productId);
                  const specs = resolveItemSpecs(mItem, prod);
                  const qty = Math.max(0, Number(mItem.quantity) || 0);
                  const tw = cleanFloat(qty * (mItem.unitNetWeightKg || 0));
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

              autoUnits.push({
                kind: 'shared',
                itemNo: groupMembers[0] + 1,
                remainingCartons: groupCartons,
                members: groupMembers.map((mIdx) => {
                  const mItem = items[mIdx];
                  const prod = prodById.get(mItem.productId);
                  const specs = resolveItemSpecs(mItem, prod);
                  const qty = Math.max(0, Number(mItem.quantity) || 0);
                  return {
                    itemNo: mIdx + 1,
                    item: mItem,
                    qty,
                    setsPerCarton:
                      groupCartons === 1
                        ? qty
                        : mItem.setsPerCarton && mItem.setsPerCarton > 0
                          ? mItem.setsPerCarton
                          : qty,
                    specs,
                    partName: resolveOrderItemPartName(mItem, customer, products),
                    unitLabel: (mItem.unit || 'sets').toLowerCase(),
                  };
                }),
              });
              continue;
            }

            const prod = prodById.get(item.productId);
            const specs = resolveItemSpecs(item, prod);
            const cartons = Math.max(0, Number(item.cartons) || 0);
            const explicitPallet = item.palletNo?.trim() || '';
            const explicitRange = item.cartonRange?.trim() || '';
            const setsPerCarton =
              item.setsPerCarton && item.setsPerCarton > 0
                ? item.setsPerCarton
                : cartons > 0
                  ? cleanFloat(item.quantity / cartons)
                  : item.quantity;

            if (cartons === 0 || explicitPallet || explicitRange) {
              explicitOrZeroEntries.push({
                kind: cartons === 0 ? 'zero' : 'explicit',
                itemNo: idx + 1,
                item,
                specs,
                partName: resolveOrderItemPartName(item, customer, products),
                setsPerCarton,
                cartons,
                explicitPallet,
                explicitRange,
              });
              continue;
            }

            autoUnits.push({
              kind: 'single',
              itemNo: idx + 1,
              item,
              remainingCartons: cartons,
              remainingQty: Math.max(0, Number(item.quantity) || 0),
              totalCartons: cartons,
              setsPerCarton,
              specs,
              partName: resolveOrderItemPartName(item, customer, products),
              unitLabel: (item.unit || 'sets').toLowerCase(),
            });
          }

          // Smart Two-Phase + Minimum-Variety Pallet Allocation:
          // Phase 1: Items (or full-pallet multiples of items) that fill an entire pallet (>= palletCapacity) first
          // Phase 2: Remainder (< palletCapacity) grouped into exact palletCapacity sums with fewest product kinds
          // Phase 3: Remaining partial units packed greedily to fill full pallets cleanly while minimizing kinds & splits
          const plannedPallets: PlannedPalletPick[][] = [];
          const singleChunkCounter = new Map<string, number>();
          const nextChunkIndex = (id: string) => {
            const cur = singleChunkCounter.get(id) ?? 0;
            singleChunkCounter.set(id, cur + 1);
            return cur;
          };

          const remainderUnits: AutoPackUnit[] = [];

          for (const unit of autoUnits) {
            if (unit.kind === 'single') {
              while (unit.remainingCartons >= palletCapacity - 1e-9) {
                const isLast =
                  unit.remainingCartons <= palletCapacity + 1e-9;
                const { chunkQty, effectiveSetsPerCarton } =
                  allocateSingleUnitChunk(unit, palletCapacity, isLast);
                plannedPallets.push([
                  {
                    kind: 'single',
                    unit,
                    takeCartons: palletCapacity,
                    chunkQty,
                    effectiveSetsPerCarton,
                    chunkIndex: nextChunkIndex(unit.item.id),
                  },
                ]);
              }
              if (unit.remainingCartons > 1e-9) {
                remainderUnits.push(unit);
              }
            } else {
              remainderUnits.push(unit);
            }
          }

          // Phase 2: Repeatedly extract exact-fit subsets summing to palletCapacity with minimum product variety
          let unplaced = [...remainderUnits];
          while (unplaced.length > 0) {
            const subsetIndices = findBestExactSubset(unplaced, palletCapacity);
            if (!subsetIndices || subsetIndices.length === 0) break;
            const indexSet = new Set(subsetIndices);
            const palletPicks: PlannedPalletPick[] = subsetIndices
              .map((idx) => unplaced[idx])
              .sort((a, b) => a.itemNo - b.itemNo)
              .map((u) => {
                if (u.kind === 'shared') {
                  return { kind: 'shared' as const, unit: u };
                }
                const take = u.remainingCartons;
                const { chunkQty, effectiveSetsPerCarton } =
                  allocateSingleUnitChunk(u, take, true);
                return {
                  kind: 'single' as const,
                  unit: u,
                  takeCartons: take,
                  chunkQty,
                  effectiveSetsPerCarton,
                  chunkIndex: nextChunkIndex(u.item.id),
                };
              });
            plannedPallets.push(palletPicks);
            unplaced = unplaced.filter((_, idx) => !indexSet.has(idx));
          }

          // Phase 3: Pack remaining partial units (< palletCapacity each, no exact palletCapacity subset)
          while (unplaced.length > 0) {
            const totalRem = cleanFloat(
              unplaced.reduce((s, u) => s + u.remainingCartons, 0),
            );
            if (totalRem <= palletCapacity + 1e-6) {
              const lastPalletPicks: PlannedPalletPick[] = [...unplaced]
                .sort((a, b) => a.itemNo - b.itemNo)
                .map((u) => {
                  if (u.kind === 'shared') {
                    return { kind: 'shared' as const, unit: u };
                  }
                  const take = u.remainingCartons;
                  const { chunkQty, effectiveSetsPerCarton } =
                    allocateSingleUnitChunk(u, take, true);
                  return {
                    kind: 'single' as const,
                    unit: u,
                    takeCartons: take,
                    chunkQty,
                    effectiveSetsPerCarton,
                    chunkIndex: nextChunkIndex(u.item.id),
                  };
                });
              plannedPallets.push(lastPalletPicks);
              unplaced = [];
              break;
            }

            // Fill a full pallet of palletCapacity cartons starting from the largest remaining unit
            unplaced.sort((a, b) => {
              const diff = b.remainingCartons - a.remainingCartons;
              if (Math.abs(diff) > 1e-9) return diff;
              if (a.kind !== b.kind) return a.kind === 'single' ? -1 : 1;
              return a.itemNo - b.itemNo;
            });

            const palletPicks: PlannedPalletPick[] = [];
            const seedUnit = unplaced.shift()!;
            let spaceLeft = cleanFloat(
              Math.max(0, palletCapacity - seedUnit.remainingCartons),
            );
            if (seedUnit.kind === 'shared') {
              palletPicks.push({ kind: 'shared', unit: seedUnit });
            } else {
              const take = seedUnit.remainingCartons;
              const { chunkQty, effectiveSetsPerCarton } =
                allocateSingleUnitChunk(seedUnit, take, true);
              palletPicks.push({
                kind: 'single',
                unit: seedUnit,
                takeCartons: take,
                chunkQty,
                effectiveSetsPerCarton,
                chunkIndex: nextChunkIndex(seedUnit.item.id),
              });
            }

            while (spaceLeft > 1e-6 && unplaced.length > 0) {
              // 3a. Exact fit for remaining spaceLeft without splitting
              const exactRem = findBestExactSubset(unplaced, spaceLeft);
              if (exactRem && exactRem.length > 0) {
                const exactSet = new Set(exactRem);
                for (const rIdx of exactRem) {
                  const u = unplaced[rIdx];
                  if (u.kind === 'shared') {
                    palletPicks.push({ kind: 'shared', unit: u });
                  } else {
                    const take = u.remainingCartons;
                    const { chunkQty, effectiveSetsPerCarton } =
                      allocateSingleUnitChunk(u, take, true);
                    palletPicks.push({
                      kind: 'single',
                      unit: u,
                      takeCartons: take,
                      chunkQty,
                      effectiveSetsPerCarton,
                      chunkIndex: nextChunkIndex(u.item.id),
                    });
                  }
                }
                unplaced = unplaced.filter((_, idx) => !exactSet.has(idx));
                spaceLeft = 0;
                break;
              }

              // 3b. Single unit larger than spaceLeft: split one unit cleanly to hit exact palletCapacity
              const splittable = unplaced
                .map((u, idx) => ({ u, idx }))
                .filter(
                  (x): x is { u: SingleAutoUnit; idx: number } =>
                    x.u.kind === 'single' &&
                    x.u.remainingCartons > spaceLeft + 1e-6,
                );

              if (splittable.length > 0) {
                // Prefer splitting a unit whose leftover allows remaining items to hit exact palletCapacity
                let chosen = splittable[splittable.length - 1]; // default: smallest unit > spaceLeft
                for (const candidate of [...splittable].reverse()) {
                  const simulated = unplaced.map((u, idx) =>
                    idx === candidate.idx
                      ? {
                          ...u,
                          remainingCartons: cleanFloat(
                            u.remainingCartons - spaceLeft,
                          ),
                        }
                      : u,
                  );
                  if (findBestExactSubset(simulated, palletCapacity)) {
                    chosen = candidate;
                    break;
                  }
                }

                const splitUnit = chosen.u;
                const { chunkQty, effectiveSetsPerCarton } =
                  allocateSingleUnitChunk(splitUnit, spaceLeft, false);
                palletPicks.push({
                  kind: 'single',
                  unit: splitUnit,
                  takeCartons: spaceLeft,
                  chunkQty,
                  effectiveSetsPerCarton,
                  chunkIndex: nextChunkIndex(splitUnit.item.id),
                });
                if (splitUnit.remainingCartons <= 1e-9) {
                  unplaced.splice(chosen.idx, 1);
                }
                spaceLeft = 0;
                break;
              }

              // 3c. All remaining single units are smaller than spaceLeft -> take largest fitting whole unit
              const fitIdx = unplaced.findIndex(
                (u) => u.remainingCartons <= spaceLeft + 1e-6,
              );
              if (fitIdx === -1) {
                // Only indivisible shared carton unit(s) larger than remaining fractional space
                break;
              }
              const fitUnit = unplaced.splice(fitIdx, 1)[0];
              spaceLeft = cleanFloat(
                Math.max(0, spaceLeft - fitUnit.remainingCartons),
              );
              if (fitUnit.kind === 'shared') {
                palletPicks.push({ kind: 'shared', unit: fitUnit });
              } else {
                const take = fitUnit.remainingCartons;
                const { chunkQty, effectiveSetsPerCarton } =
                  allocateSingleUnitChunk(fitUnit, take, true);
                palletPicks.push({
                  kind: 'single',
                  unit: fitUnit,
                  takeCartons: take,
                  chunkQty,
                  effectiveSetsPerCarton,
                  chunkIndex: nextChunkIndex(fitUnit.item.id),
                });
              }
            }

            palletPicks.sort((a, b) => a.unit.itemNo - b.unit.itemNo);
            plannedPallets.push(palletPicks);
          }

          // Emit continuous carton numbers across all planned pallets
          let ctnCursor = 1;
          plannedPallets.forEach((palletPicks, palletIdx) => {
            const palletNum = palletIdx + 1;
            const palletNo = `Pallet ${palletNum}`;

            for (const pick of palletPicks) {
              if (pick.kind === 'shared') {
                const groupCartons = pick.unit.remainingCartons;
                const start = ctnCursor;
                const end =
                  Number.isInteger(groupCartons) && Number.isInteger(start)
                    ? start + groupCartons - 1
                    : cleanFloat(start + Math.max(0, groupCartons - 1));
                ctnCursor =
                  Number.isInteger(groupCartons) && Number.isInteger(start)
                    ? end + 1
                    : cleanFloat(start + groupCartons);
                const ctnNo =
                  groupCartons <= 1 || Math.abs(start - end) < 1e-9
                    ? `${start}`
                    : `${start} - ${end}`;

                for (const m of pick.unit.members) {
                  const tw = cleanFloat(m.qty * (m.item.unitNetWeightKg || 0));
                  rows.push({
                    id: `pk-${m.item.id}`,
                    palletNo,
                    ctnNo,
                    itemNo: m.itemNo,
                    type: m.item.sku,
                    partName: m.partName,
                    size: m.specs.size,
                    material: m.specs.material,
                    surfaceFinish: m.specs.surfaceFinish,
                    setsPerCarton: m.setsPerCarton,
                    cartonCount: groupCartons,
                    sharedCarton: true,
                    qty: m.qty,
                    unitWeightKg: m.item.unitNetWeightKg,
                    totalWeightKg: tw,
                    unitLabel: m.unitLabel,
                  });
                }
              } else {
                const {
                  unit,
                  takeCartons,
                  chunkQty,
                  effectiveSetsPerCarton,
                  chunkIndex,
                } = pick;
                const start = ctnCursor;
                const end =
                  Number.isInteger(takeCartons) && Number.isInteger(start)
                    ? start + takeCartons - 1
                    : cleanFloat(start + Math.max(0, takeCartons - 1));
                ctnCursor =
                  Number.isInteger(takeCartons) && Number.isInteger(start)
                    ? end + 1
                    : cleanFloat(start + takeCartons);
                const ctnNo =
                  takeCartons <= 1 || Math.abs(start - end) < 1e-9
                    ? `${start}`
                    : `${start} - ${end}`;
                const chunkTw = cleanFloat(
                  chunkQty * (unit.item.unitNetWeightKg || 0),
                );
                rows.push({
                  id:
                    chunkIndex === 0
                      ? `pk-${unit.item.id}`
                      : `pk-${unit.item.id}-p${palletNum}-c${chunkIndex}`,
                  palletNo,
                  ctnNo,
                  itemNo: unit.itemNo,
                  type: unit.item.sku,
                  partName: unit.partName,
                  size: unit.specs.size,
                  material: unit.specs.material,
                  surfaceFinish: unit.specs.surfaceFinish,
                  setsPerCarton: effectiveSetsPerCarton,
                  cartonCount: takeCartons,
                  sharedCarton: false,
                  qty: chunkQty,
                  unitWeightKg: unit.item.unitNetWeightKg,
                  totalWeightKg: chunkTw,
                  unitLabel: unit.unitLabel,
                });
              }
            }
          });

          // Emit any manual override or zero-carton entries cleanly
          for (const entry of explicitOrZeroEntries) {
            const cartons = entry.cartons;
            let palletNo = entry.explicitPallet;
            let ctnNo = entry.explicitRange;

            if (cartons === 0) {
              palletNo = palletNo || '—';
              ctnNo = ctnNo || '-';
            } else {
              const start = ctnCursor;
              const end =
                Number.isInteger(cartons) && Number.isInteger(start)
                  ? start + cartons - 1
                  : cleanFloat(start + Math.max(0, cartons - 1));
              ctnCursor =
                Number.isInteger(cartons) && Number.isInteger(start)
                  ? end + 1
                  : cleanFloat(start + cartons);
              const palletNum = Math.max(
                1,
                plannedPallets.length + (entry.explicitRange ? 0 : 1),
              );
              palletNo = palletNo || `Pallet ${palletNum}`;
              ctnNo =
                ctnNo ||
                (cartons <= 1 || Math.abs(start - end) < 1e-9
                  ? `${start}`
                  : `${start} - ${end}`);
            }

            const tw = cleanFloat(
              (entry.item.quantity || 0) * (entry.item.unitNetWeightKg || 0),
            );
            rows.push({
              id: `pk-${entry.item.id}`,
              palletNo,
              ctnNo,
              itemNo: entry.itemNo,
              type: entry.item.sku,
              partName: entry.partName,
              size: entry.specs.size,
              material: entry.specs.material,
              surfaceFinish: entry.specs.surfaceFinish,
              setsPerCarton: entry.setsPerCarton,
              cartonCount: cartons,
              sharedCarton: false,
              qty: entry.item.quantity,
              unitWeightKg: entry.item.unitNetWeightKg,
              totalWeightKg: tw,
              unitLabel: (entry.item.unit || 'sets').toLowerCase(),
            });
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
