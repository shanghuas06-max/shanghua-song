import type {
  CurrencyCode,
  ErpDataPayload,
  ExportOrder,
  IncotermCode,
  OrderCosts,
  OrderItem,
  TransportMode,
} from '../types/erp';

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
  totalNetWeightKg: number;
  totalGrossWeightKg: number;
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

export function roundByCurrency(value: number, currency: CurrencyCode): number {
  if (!Number.isFinite(value)) return 0;
  if (currency === 'JPY') {
    return Math.round(value);
  }
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function roundWeight(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function roundCbm(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
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
  currency: CurrencyCode,
): OrderCalculationSummary {
  const lineItems: CalculatedLineItem[] = items.map((item) => {
    const qty = Math.max(0, Number(item.quantity) || 0);
    const price = Math.max(0, Number(item.unitPrice) || 0);
    const cartons = Math.max(0, Number(item.cartons) || 0);
    const amount = roundByCurrency(qty * price, currency);
    const netWeightKg = roundWeight(qty * Math.max(0, Number(item.unitNetWeightKg) || 0));
    const grossWeightKg = roundWeight(qty * Math.max(0, Number(item.unitGrossWeightKg) || 0));
    const cartonVolumeM3 =
      (Math.max(0, Number(item.cartonLengthCm) || 0) *
        Math.max(0, Number(item.cartonWidthCm) || 0) *
        Math.max(0, Number(item.cartonHeightCm) || 0)) /
      1_000_000;
    const cbm = roundCbm(cartons * cartonVolumeM3);
    return {
      id: item.id,
      amount,
      netWeightKg,
      grossWeightKg,
      cbm,
    };
  });

  const totalQuantity = lineItems.reduce(
    (acc, _, idx) => acc + Math.max(0, Number(items[idx].quantity) || 0),
    0,
  );
  const totalCartons = items.reduce(
    (acc, item) => acc + Math.max(0, Number(item.cartons) || 0),
    0,
  );
  const totalNetWeightKg = roundWeight(
    lineItems.reduce((acc, l) => acc + l.netWeightKg, 0),
  );
  const totalGrossWeightKg = roundWeight(
    lineItems.reduce((acc, l) => acc + l.grossWeightKg, 0),
  );
  const totalCbm = roundCbm(lineItems.reduce((acc, l) => acc + l.cbm, 0));

  const goodsSubtotal = roundByCurrency(
    lineItems.reduce((acc, l) => acc + l.amount, 0),
    currency,
  );
  const packingHandlingCost = roundByCurrency(
    Math.max(0, Number(costs.packingHandlingCost) || 0),
    currency,
  );
  const exwTotal = roundByCurrency(goodsSubtotal + packingHandlingCost, currency);

  const inlandFreightCost = roundByCurrency(
    Math.max(0, Number(costs.inlandFreightCost) || 0),
    currency,
  );
  const mainFreightCost = roundByCurrency(
    Math.max(0, Number(costs.mainFreightCost) || 0),
    currency,
  );
  const destinationHandlingCost = roundByCurrency(
    Math.max(0, Number(costs.destinationHandlingCost) || 0),
    currency,
  );
  const importDutyTaxCost = roundByCurrency(
    Math.max(0, Number(costs.importDutyTaxCost) || 0),
    currency,
  );

  let insuranceCost = 0;
  if (costs.insuranceMode === 'AUTO_PERCENT') {
    const rate = Math.max(0, Number(costs.insuranceRatePercent) || 0);
    // Standard marine/cargo insured value is 110% of (EXW + Inland + Main Freight)
    const insuredBase = (exwTotal + inlandFreightCost + mainFreightCost) * 1.1;
    insuranceCost = roundByCurrency((insuredBase * rate) / 100, currency);
  } else {
    insuranceCost = roundByCurrency(
      Math.max(0, Number(costs.insuranceManualCost) || 0),
      currency,
    );
  }

  const flags = getIncotermFlags(incoterm);

  let incotermTotal = exwTotal;
  if (flags.includesInland) incotermTotal += inlandFreightCost;
  if (flags.includesMainFreight) incotermTotal += mainFreightCost;
  if (flags.includesInsurance) incotermTotal += insuranceCost;
  if (flags.includesDestinationHandling) incotermTotal += destinationHandlingCost;
  if (flags.includesImportDuty) incotermTotal += importDutyTaxCost;

  incotermTotal = roundByCurrency(incotermTotal, currency);

  return {
    lineItems,
    totalQuantity,
    totalCartons,
    totalNetWeightKg,
    totalGrossWeightKg,
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
  const safe = Number.isFinite(amount) ? amount : 0;
  const decimals = currency === 'JPY' ? 0 : 2;
  const formatted = safe.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
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
