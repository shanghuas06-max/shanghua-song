import type {
  CurrencyCode,
  ErpDataPayload,
  ExportOrder,
  IncotermCode,
  OrderCosts,
  OrderItem,
  Product,
  TransportMode,
} from '../types/erp';

export const CARTON_TARE_WEIGHT_KG = 0.65;
export const PALLET_WEIGHT_KG = 17;
export const PALLET_LENGTH_CM = 110;
export const PALLET_WIDTH_CM = 110;
export const PALLET_HEIGHT_CM = 14;
export const PALLET_VOLUME_CBM =
  (PALLET_LENGTH_CM * PALLET_WIDTH_CM * PALLET_HEIGHT_CM) / 1_000_000;
export const DEFAULT_MAX_SHARED_CARTON_WEIGHT_KG = 35;

export const DEFAULT_EXCHANGE_RATES: Record<CurrencyCode, number> = {
  JPY: 1,
  USD: 150,
  EUR: 162,
  CNY: 21,
};

export function getDefaultExchangeRate(currency: CurrencyCode): number {
  return DEFAULT_EXCHANGE_RATES[currency] ?? 1;
}

export function resolveEffectiveExchangeRate(
  currency: CurrencyCode,
  exchangeRate?: number,
): number {
  if (currency === 'JPY') return 1;
  const num = Number(exchangeRate);
  if (Number.isFinite(num) && num > 0) return num;
  return getDefaultExchangeRate(currency);
}

export interface PalletPackingResult {
  totalCartons: number;
  usesPallet: boolean;
  palletCount: number;
  emptyCartons: number;
  lastPalletCartons: number;
  maxCartonsPerPallet: number;
  cartonsPerLayer: number;
  palletThreshold: number;
}

export function cleanFloat(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (Object.is(value, -0) || value === 0) return 0;
  return Number(value.toPrecision(12));
}

export function formatNumberNoRound(value: number, minDecimals = 0): string {
  const safe = cleanFloat(Number.isFinite(value) ? value : 0);
  return safe.toLocaleString('en-US', {
    minimumFractionDigits: minDecimals,
    maximumFractionDigits: 10,
  });
}

export function calculateItemCartons(
  quantity: number,
  unitsPerCarton: number,
): number {
  const safeQty = Math.max(0, Number(quantity) || 0);
  if (safeQty <= 0) return 0;
  const perCarton = Math.max(0.0001, Number(unitsPerCarton) || 1);
  return Math.ceil(safeQty / perCarton);
}

export function getItemEffectiveSetsPerCarton(
  item: OrderItem,
  product?: Product,
): number {
  if (item.setsPerCarton && item.setsPerCarton > 0) {
    return item.setsPerCarton;
  }
  if (product?.defaultUnitsPerCarton && product.defaultUnitsPerCarton > 0) {
    return product.defaultUnitsPerCarton;
  }
  const qty = Math.max(0, Number(item.quantity) || 0);
  const ctns = Math.max(0, Number(item.cartons) || 0);
  if (qty > 0 && ctns > 0) {
    return cleanFloat(qty / ctns);
  }
  return qty > 0 ? qty : 1;
}

export function getItemFillRatio(item: OrderItem, product?: Product): number {
  const qty = Math.max(0, Number(item.quantity) || 0);
  if (qty <= 0) return 0;
  const perCarton = getItemEffectiveSetsPerCarton(item, product);
  return qty / perCarton;
}

export function isCartonDimensionCompatible(a: OrderItem, b: OrderItem): boolean {
  const dimsA = [
    Math.max(0, Number(a.cartonLengthCm) || 0),
    Math.max(0, Number(a.cartonWidthCm) || 0),
    Math.max(0, Number(a.cartonHeightCm) || 0),
  ];
  const dimsB = [
    Math.max(0, Number(b.cartonLengthCm) || 0),
    Math.max(0, Number(b.cartonWidthCm) || 0),
    Math.max(0, Number(b.cartonHeightCm) || 0),
  ];
  if (dimsA.some((v) => v <= 0) || dimsB.some((v) => v <= 0)) {
    return true;
  }
  const sortedA = [...dimsA].sort((x, y) => x - y);
  const sortedB = [...dimsB].sort((x, y) => x - y);
  for (let i = 0; i < 3; i += 1) {
    const ratio = Math.max(sortedA[i] / sortedB[i], sortedB[i] / sortedA[i]);
    if (ratio > 1.8) return false;
  }
  return true;
}

export function autoConsolidateHalfCartons(
  items: OrderItem[],
  products: Product[] = [],
  options?: {
    maxCartonWeightKg?: number;
    force?: boolean;
  },
): OrderItem[] {
  const maxWeight = Math.max(
    1,
    Number(options?.maxCartonWeightKg) || DEFAULT_MAX_SHARED_CARTON_WEIGHT_KG,
  );
  const force = Boolean(options?.force);
  const prodById = new Map(products.map((p) => [p.id, p]));

  const normalized: OrderItem[] = items.map((item) => {
    const prod = prodById.get(item.productId);
    const setsPerCarton = getItemEffectiveSetsPerCarton(item, prod);
    const ratio = (Math.max(0, Number(item.quantity) || 0)) / setsPerCarton;
    const rawGroup = (item.sharedCartonGroupId ?? '').trim();
    const isPartial = ratio > 0 && ratio < 0.9999;

    if (rawGroup === 'NONE') {
      return { ...item, setsPerCarton, sharedCartonGroupId: 'NONE' };
    }
    if (!isPartial) {
      return {
        ...item,
        setsPerCarton,
        sharedCartonGroupId: rawGroup.startsWith('mix-') ? '' : rawGroup,
      };
    }
    if (force) {
      return { ...item, setsPerCarton, sharedCartonGroupId: '' };
    }
    return { ...item, setsPerCarton, sharedCartonGroupId: rawGroup };
  });

  // Validate preserved manual mix groups when not forced (dissolve singletons)
  const keptGroups = new Map<string, number[]>();
  normalized.forEach((item, idx) => {
    const g = item.sharedCartonGroupId || '';
    if (g && g !== 'NONE') {
      const arr = keptGroups.get(g) ?? [];
      arr.push(idx);
      keptGroups.set(g, arr);
    }
  });
  keptGroups.forEach((indices) => {
    if (indices.length < 2) {
      indices.forEach((idx) => {
        normalized[idx] = { ...normalized[idx], sharedCartonGroupId: '' };
      });
    }
  });

  // Collect remaining partial items eligible for bin-packing
  const candidates: number[] = [];
  normalized.forEach((item, idx) => {
    const g = item.sharedCartonGroupId || '';
    if (g) return;
    const perCtn = Math.max(1, Number(item.setsPerCarton) || 1);
    const qty = Math.max(0, Number(item.quantity) || 0);
    const ratio = qty / perCtn;
    if (ratio > 0 && ratio < 0.9999) {
      candidates.push(idx);
    }
  });

  if (candidates.length < 2) {
    return normalized;
  }

  // First-Fit Decreasing bin-packing of half/partial cartons into shared cartons
  const sortedCandidates = [...candidates].sort((idxA, idxB) => {
    const rA =
      (normalized[idxA].quantity || 0) /
      Math.max(1, normalized[idxA].setsPerCarton || 1);
    const rB =
      (normalized[idxB].quantity || 0) /
      Math.max(1, normalized[idxB].setsPerCarton || 1);
    return rB - rA;
  });

  interface MixBin {
    memberIndices: number[];
    fillSum: number;
    netWeightKg: number;
  }
  const bins: MixBin[] = [];

  for (const idx of sortedCandidates) {
    const item = normalized[idx];
    const ratio =
      (item.quantity || 0) / Math.max(1, item.setsPerCarton || 1);
    const itemWeight =
      Math.max(0, Number(item.quantity) || 0) *
      Math.max(0, Number(item.unitNetWeightKg) || 0);

    let placed = false;
    for (const bin of bins) {
      if (bin.fillSum + ratio > 1.0001) continue;
      if (bin.netWeightKg + itemWeight + CARTON_TARE_WEIGHT_KG > maxWeight) {
        continue;
      }
      const compatible = bin.memberIndices.every((memberIdx) =>
        isCartonDimensionCompatible(normalized[memberIdx], item),
      );
      if (!compatible) continue;
      bin.memberIndices.push(idx);
      bin.fillSum += ratio;
      bin.netWeightKg += itemWeight;
      placed = true;
      break;
    }

    if (!placed) {
      bins.push({
        memberIndices: [idx],
        fillSum: ratio,
        netWeightKg: itemWeight,
      });
    }
  }

  const usedNumbers = new Set<number>();
  normalized.forEach((item) => {
    const m = (item.sharedCartonGroupId || '').match(/^mix-(\d+)$/);
    if (m) usedNumbers.add(Number(m[1]));
  });
  let nextMixNo = 1;
  const allocMixId = () => {
    while (usedNumbers.has(nextMixNo)) {
      nextMixNo += 1;
    }
    usedNumbers.add(nextMixNo);
    return `mix-${nextMixNo}`;
  };

  for (const bin of bins) {
    if (bin.memberIndices.length >= 2) {
      const groupId = allocMixId();
      for (const idx of bin.memberIndices) {
        normalized[idx] = {
          ...normalized[idx],
          cartons: 1,
          sharedCartonGroupId: groupId,
        };
      }
    }
  }

  return normalized;
}

export function calculatePalletPacking(
  totalCartons: number,
  options?: {
    palletThreshold?: number;
    maxCartonsPerPallet?: number;
    cartonsPerLayer?: number;
  },
): PalletPackingResult {
  const safeTotal = Math.max(0, Math.round(Number(totalCartons) || 0));
  const palletThreshold = Math.max(0, Math.round(options?.palletThreshold ?? 12));
  const maxCartonsPerPallet = Math.max(
    1,
    Math.round(options?.maxCartonsPerPallet ?? 60),
  );
  const cartonsPerLayer = Math.max(
    1,
    Math.round(options?.cartonsPerLayer ?? 12),
  );

  // <= 12 cartons: direct carton packaging without pallets
  if (safeTotal <= palletThreshold) {
    return {
      totalCartons: safeTotal,
      usesPallet: false,
      palletCount: 0,
      emptyCartons: 0,
      lastPalletCartons: 0,
      maxCartonsPerPallet,
      cartonsPerLayer,
      palletThreshold,
    };
  }

  // > 12 cartons: palletized (max 60 cartons per pallet) + fill incomplete top layer with empty cartons
  const palletCount = Math.ceil(safeTotal / maxCartonsPerPallet);
  const mod = safeTotal % maxCartonsPerPallet;
  const lastPalletCartons = mod === 0 ? maxCartonsPerPallet : mod;
  const layerRemainder = lastPalletCartons % cartonsPerLayer;
  const emptyCartons =
    layerRemainder === 0 ? 0 : cartonsPerLayer - layerRemainder;

  return {
    totalCartons: safeTotal,
    usesPallet: true,
    palletCount,
    emptyCartons,
    lastPalletCartons,
    maxCartonsPerPallet,
    cartonsPerLayer,
    palletThreshold,
  };
}

export interface CalculatedLineItem {
  id: string;
  amount: number;
  netWeightKg: number;
  grossWeightKg: number;
  cbm: number;
}

export interface IncotermCostFlags {
  includesPacking: boolean;
  includesInland: boolean;
  includesMainFreight: boolean;
  includesInsurance: boolean;
  includesDestinationHandling: boolean;
  includesImportDuty: boolean;
  recommendedModes: TransportMode[];
}

export interface OrderCalculationSummary {
  lineItems: CalculatedLineItem[];
  totalQuantity: number;
  totalCartons: number;
  unmergedCartons: number;
  palletCount: number;
  totalNetWeightKg: number;
  cartonsGrossWeightKg: number;
  palletsGrossWeightKg: number;
  totalGrossWeightKg: number;
  cartonsCbm: number;
  palletsCbm: number;
  totalCbm: number;
  goodsSubtotal: number;
  packingHandlingCost: number;
  exwTotal: number;
  inlandFreightCost: number;
  mainFreightCost: number;
  insuranceCost: number;
  destinationHandlingCost: number;
  importDutyTaxCost: number;
  incotermTotal: number;
  flags: IncotermCostFlags;
}

export function roundByCurrency(value: number, _currency: CurrencyCode): number {
  return cleanFloat(value);
}

export function roundWeight(value: number): number {
  return cleanFloat(value);
}

export function roundCbm(value: number): number {
  return cleanFloat(value);
}

export function getIncotermFlags(incoterm: IncotermCode): IncotermCostFlags {
  switch (incoterm) {
    case 'EXW':
      return {
        includesPacking: true,
        includesInland: false,
        includesMainFreight: false,
        includesInsurance: false,
        includesDestinationHandling: false,
        includesImportDuty: false,
        recommendedModes: ['SEA', 'AIR', 'EXPRESS', 'LAND'],
      };
    case 'FCA':
      return {
        includesPacking: true,
        includesInland: true,
        includesMainFreight: false,
        includesInsurance: false,
        includesDestinationHandling: false,
        includesImportDuty: false,
        recommendedModes: ['SEA', 'AIR', 'EXPRESS', 'LAND'],
      };
    case 'FOB':
      return {
        includesPacking: true,
        includesInland: true,
        includesMainFreight: false,
        includesInsurance: false,
        includesDestinationHandling: false,
        includesImportDuty: false,
        recommendedModes: ['SEA'],
      };
    case 'CFR':
      return {
        includesPacking: true,
        includesInland: true,
        includesMainFreight: true,
        includesInsurance: false,
        includesDestinationHandling: false,
        includesImportDuty: false,
        recommendedModes: ['SEA'],
      };
    case 'CIF':
      return {
        includesPacking: true,
        includesInland: true,
        includesMainFreight: true,
        includesInsurance: true,
        includesDestinationHandling: false,
        includesImportDuty: false,
        recommendedModes: ['SEA'],
      };
    case 'CPT':
      return {
        includesPacking: true,
        includesInland: true,
        includesMainFreight: true,
        includesInsurance: false,
        includesDestinationHandling: false,
        includesImportDuty: false,
        recommendedModes: ['AIR', 'EXPRESS', 'LAND', 'SEA'],
      };
    case 'CIP':
      return {
        includesPacking: true,
        includesInland: true,
        includesMainFreight: true,
        includesInsurance: true,
        includesDestinationHandling: false,
        includesImportDuty: false,
        recommendedModes: ['AIR', 'EXPRESS', 'LAND', 'SEA'],
      };
    case 'DAP':
      return {
        includesPacking: true,
        includesInland: true,
        includesMainFreight: true,
        includesInsurance: false,
        includesDestinationHandling: true,
        includesImportDuty: false,
        recommendedModes: ['EXPRESS', 'AIR', 'LAND', 'SEA'],
      };
    case 'DPU':
      return {
        includesPacking: true,
        includesInland: true,
        includesMainFreight: true,
        includesInsurance: false,
        includesDestinationHandling: true,
        includesImportDuty: false,
        recommendedModes: ['SEA', 'AIR', 'LAND', 'EXPRESS'],
      };
    case 'DDP':
      return {
        includesPacking: true,
        includesInland: true,
        includesMainFreight: true,
        includesInsurance: true,
        includesDestinationHandling: true,
        includesImportDuty: true,
        recommendedModes: ['EXPRESS', 'AIR', 'LAND', 'SEA'],
      };
  }
}

export function calculateOrderSummary(
  items: OrderItem[],
  costs: OrderCosts,
  incoterm: IncotermCode,
  _currency: CurrencyCode,
  palletCount = 0,
): OrderCalculationSummary {
  const safePalletCount = Math.max(0, Number(palletCount) || 0);

  const singleCartonVols = items.map(
    (item) =>
      (Math.max(0, Number(item.cartonLengthCm) || 0) *
        Math.max(0, Number(item.cartonWidthCm) || 0) *
        Math.max(0, Number(item.cartonHeightCm) || 0)) /
      1_000_000,
  );

  // Identify shared carton groups (sharedCartonGroupId non-empty && !== 'NONE' with >=2 members)
  const groupMemberMap = new Map<string, number[]>();
  items.forEach((item, idx) => {
    const groupId = (item.sharedCartonGroupId ?? '').trim();
    if (groupId && groupId !== 'NONE') {
      const list = groupMemberMap.get(groupId) ?? [];
      list.push(idx);
      groupMemberMap.set(groupId, list);
    }
  });

  const lineItems: CalculatedLineItem[] = items.map((item, idx) => {
    const qty = Math.max(0, Number(item.quantity) || 0);
    const price = Math.max(0, Number(item.unitPrice) || 0);
    const cartons = Math.max(0, Number(item.cartons) || 0);
    const amount = cleanFloat(qty * price);
    const netWeightKg = cleanFloat(qty * Math.max(0, Number(item.unitNetWeightKg) || 0));
    const grossWeightKg = cleanFloat(netWeightKg + cartons * CARTON_TARE_WEIGHT_KG);
    const cbm = cleanFloat(cartons * singleCartonVols[idx]);
    return {
      id: item.id,
      amount,
      netWeightKg,
      grossWeightKg,
      cbm,
    };
  });

  const unmergedCartons = items.reduce(
    (acc, item) => acc + Math.max(0, Number(item.cartons) || 0),
    0,
  );

  // Adjust shared groups so physical cartons, 0.65kg carton tare, and carton CBM count ONCE per shared carton
  let consolidatedCartons = unmergedCartons;
  let totalRawCbm = items.reduce(
    (acc, item, idx) =>
      acc + Math.max(0, Number(item.cartons) || 0) * singleCartonVols[idx],
    0,
  );

  groupMemberMap.forEach((indices) => {
    if (indices.length < 2) return;

    const rawGroupCartons = indices.reduce(
      (sum, idx) => sum + Math.max(0, Number(items[idx].cartons) || 0),
      0,
    );
    const hasQty = indices.some((idx) => (Number(items[idx].quantity) || 0) > 0);
    let physicalCartons = 0;
    if (rawGroupCartons > 0 || hasQty) {
      const allHavePerCtn = indices.every(
        (idx) => Number(items[idx].setsPerCarton) > 0,
      );
      if (allHavePerCtn) {
        const ratioSum = indices.reduce(
          (sum, idx) =>
            sum +
            Math.max(0, Number(items[idx].quantity) || 0) /
              Math.max(1, Number(items[idx].setsPerCarton) || 1),
          0,
        );
        physicalCartons =
          ratioSum <= 1.001
            ? 1
            : Math.min(Math.max(1, rawGroupCartons), Math.ceil(ratioSum - 1e-4));
      } else {
        physicalCartons = 1;
      }
    }

    consolidatedCartons = consolidatedCartons - rawGroupCartons + physicalCartons;

    // Replace raw tare sum with physicalCartons * 0.65 kg distributed proportionally by net weight
    const groupNwSum = indices.reduce(
      (sum, idx) => sum + lineItems[idx].netWeightKg,
      0,
    );
    const groupTare = physicalCartons * CARTON_TARE_WEIGHT_KG;
    indices.forEach((idx, pos) => {
      const share =
        groupNwSum > 0
          ? lineItems[idx].netWeightKg / groupNwSum
          : pos === 0
            ? 1
            : 0;
      lineItems[idx] = {
        ...lineItems[idx],
        grossWeightKg: roundWeight(lineItems[idx].netWeightKg + groupTare * share),
      };
    });

    // Replace raw CBM sum with single outer host carton volume * physicalCartons
    const rawGroupVolSum = indices.reduce(
      (sum, idx) =>
        sum +
        Math.max(0, Number(items[idx].cartons) || 0) * singleCartonVols[idx],
      0,
    );
    const hostSingleVol = Math.max(...indices.map((idx) => singleCartonVols[idx]));
    const physicalGroupVol = physicalCartons * hostSingleVol;
    totalRawCbm = totalRawCbm - rawGroupVolSum + physicalGroupVol;

    const groupShareBase = indices.reduce(
      (sum, idx) => sum + getItemFillRatio(items[idx]),
      0,
    );
    indices.forEach((idx, pos) => {
      const ratioShare =
        groupShareBase > 0
          ? getItemFillRatio(items[idx]) / groupShareBase
          : pos === 0
            ? 1
            : 0;
      lineItems[idx] = {
        ...lineItems[idx],
        cbm: cleanFloat(physicalGroupVol * ratioShare),
      };
    });
  });

  const totalQuantity = cleanFloat(
    lineItems.reduce(
      (acc, _, idx) => acc + Math.max(0, Number(items[idx].quantity) || 0),
      0,
    ),
  );
  const totalCartons = cleanFloat(Math.max(0, consolidatedCartons));
  const totalNetWeightKg = cleanFloat(
    lineItems.reduce((acc, l) => acc + l.netWeightKg, 0),
  );
  const cartonsGrossWeightKg = cleanFloat(
    totalNetWeightKg + totalCartons * CARTON_TARE_WEIGHT_KG,
  );
  const palletsGrossWeightKg = cleanFloat(safePalletCount * PALLET_WEIGHT_KG);
  const totalGrossWeightKg = cleanFloat(
    cartonsGrossWeightKg + palletsGrossWeightKg,
  );
  const cartonsCbm = cleanFloat(totalRawCbm);
  const rawPalletsCbm = safePalletCount * PALLET_VOLUME_CBM;
  const palletsCbm = cleanFloat(rawPalletsCbm);
  const totalCbm = cleanFloat(totalRawCbm + rawPalletsCbm);

  const goodsSubtotal = cleanFloat(
    lineItems.reduce((acc, l) => acc + l.amount, 0),
  );
  const packingHandlingCost = cleanFloat(
    Math.max(0, Number(costs.packingHandlingCost) || 0),
  );
  const exwTotal = cleanFloat(goodsSubtotal + packingHandlingCost);

  const inlandFreightCost = cleanFloat(
    Math.max(0, Number(costs.inlandFreightCost) || 0),
  );
  const mainFreightCost = cleanFloat(
    Math.max(0, Number(costs.mainFreightCost) || 0),
  );
  const destinationHandlingCost = cleanFloat(
    Math.max(0, Number(costs.destinationHandlingCost) || 0),
  );
  const importDutyTaxCost = cleanFloat(
    Math.max(0, Number(costs.importDutyTaxCost) || 0),
  );

  let insuranceCost = 0;
  if (costs.insuranceMode === 'AUTO_PERCENT') {
    const rate = Math.max(0, Number(costs.insuranceRatePercent) || 0);
    const insuredBase = (exwTotal + inlandFreightCost + mainFreightCost) * 1.1;
    insuranceCost = cleanFloat((insuredBase * rate) / 100);
  } else {
    insuranceCost = cleanFloat(
      Math.max(0, Number(costs.insuranceManualCost) || 0),
    );
  }

  const flags = getIncotermFlags(incoterm);

  let incotermTotal = exwTotal;
  if (flags.includesInland) incotermTotal += inlandFreightCost;
  if (flags.includesMainFreight) incotermTotal += mainFreightCost;
  if (flags.includesInsurance) incotermTotal += insuranceCost;
  if (flags.includesDestinationHandling) incotermTotal += destinationHandlingCost;
  if (flags.includesImportDuty) incotermTotal += importDutyTaxCost;

  incotermTotal = cleanFloat(incotermTotal);

  return {
    lineItems,
    totalQuantity,
    totalCartons,
    unmergedCartons,
    palletCount: safePalletCount,
    totalNetWeightKg,
    cartonsGrossWeightKg,
    palletsGrossWeightKg,
    totalGrossWeightKg,
    cartonsCbm,
    palletsCbm,
    totalCbm,
    goodsSubtotal,
    packingHandlingCost,
    exwTotal,
    inlandFreightCost,
    mainFreightCost,
    insuranceCost,
    destinationHandlingCost,
    importDutyTaxCost,
    incotermTotal,
    flags,
  };
}

export function formatMoney(amount: number, currency: CurrencyCode): string {
  const safe = cleanFloat(Number.isFinite(amount) ? amount : 0);
  const minDecimals = currency === 'JPY' ? 0 : 2;
  const formatted = safe.toLocaleString('en-US', {
    minimumFractionDigits: minDecimals,
    maximumFractionDigits: 10,
  });
  switch (currency) {
    case 'USD':
      return `$${formatted}`;
    case 'JPY':
      return `¥${formatted}`;
    case 'EUR':
      return `€${formatted}`;
    case 'CNY':
      return `RMB ${formatted}`;
  }
}

export function validateErpBackupPayload(raw: unknown): raw is ErpDataPayload {
  if (!raw || typeof raw !== 'object') return false;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.version !== 'number') return false;
  if (!Array.isArray(obj.customers)) return false;
  if (!Array.isArray(obj.suppliers)) return false;
  if (!Array.isArray(obj.logisticsProviders)) return false;
  if (!Array.isArray(obj.bankAccounts)) return false;
  if (!Array.isArray(obj.products)) return false;
  if (!Array.isArray(obj.orders)) return false;
  return true;
}

export function resolveActiveOrder(
  orders: ExportOrder[],
  activeOrderId: string,
): ExportOrder | undefined {
  if (!Array.isArray(orders) || orders.length === 0) return undefined;
  return orders.find((o) => o.id === activeOrderId) ?? orders[0];
}

export function reorderOrderItems<T>(
  items: T[],
  fromIndex: number,
  toIndex: number,
): T[] {
  if (!Array.isArray(items) || items.length < 2) return items;
  if (
    !Number.isInteger(fromIndex) ||
    !Number.isInteger(toIndex) ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= items.length ||
    toIndex >= items.length ||
    fromIndex === toIndex
  ) {
    return items;
  }
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

