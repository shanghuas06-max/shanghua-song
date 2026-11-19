import test from 'node:test';
import assert from 'node:assert/strict';
import {
  autoConsolidateHalfCartons,
  calculateItemCartons,
  calculateOrderSummary,
  calculatePalletPacking,
  formatMoney,
  getDefaultExchangeRate,
  getIncotermFlags,
  resolveEffectiveExchangeRate,
  validateErpBackupPayload,
} from './exportCalculations';
import type { OrderCosts, OrderItem } from '../types/erp';

const sampleItems: OrderItem[] = [
  {
    id: 'item-1',
    productId: 'prod-1',
    sku: 'HLN-M16-SS',
    description: 'HARDLOCK Nut M16 Stainless Steel SUS304',
    hsCode: '7318.16.00',
    quantity: 1000,
    unit: 'PCS',
    unitPrice: 2.5,
    cartons: 10,
    unitNetWeightKg: 0.045,
    unitGrossWeightKg: 0.048,
    cartonLengthCm: 40,
    cartonWidthCm: 30,
    cartonHeightCm: 20,
    originCountry: 'JAPAN',
  },
  {
    id: 'item-2',
    productId: 'prod-2',
    sku: 'HLN-M20-HDG',
    description: 'HARDLOCK Nut M20 Hot-Dip Galvanized',
    hsCode: '7318.16.00',
    quantity: 500,
    unit: 'PCS',
    unitPrice: 4.0,
    cartons: 10,
    unitNetWeightKg: 0.08,
    unitGrossWeightKg: 0.085,
    cartonLengthCm: 40,
    cartonWidthCm: 30,
    cartonHeightCm: 25,
    originCountry: 'JAPAN',
  },
];

const sampleCosts: OrderCosts = {
  packingHandlingCost: 150,
  inlandFreightCost: 220,
  mainFreightCost: 850,
  insuranceMode: 'MANUAL',
  insuranceManualCost: 65,
  insuranceRatePercent: 0.5,
  destinationHandlingCost: 180,
  importDutyTaxCost: 420,
};

test('calculates goods subtotal, EXW total, weights, and CBM automatically', () => {
  const summary = calculateOrderSummary(sampleItems, sampleCosts, 'EXW', 'USD');
  // 1000*2.5 + 500*4.0 = 2500 + 2000 = 4500
  assert.equal(summary.goodsSubtotal, 4500);
  // EXW = 4500 + 150 packing = 4650
  assert.equal(summary.exwTotal, 4650);
  assert.equal(summary.incotermTotal, 4650);
  assert.equal(summary.totalQuantity, 1500);
  assert.equal(summary.totalCartons, 20);
  // Net weight: 1000*0.045 + 500*0.08 = 45 + 40 = 85 kg
  assert.equal(summary.totalNetWeightKg, 85);
  // Gross weight (0 pallets): 85 + 20 cartons * 0.65 kg = 98 kg
  assert.equal(summary.cartonsGrossWeightKg, 98);
  assert.equal(summary.palletsGrossWeightKg, 0);
  assert.equal(summary.totalGrossWeightKg, 98);
  // CBM (0 pallets): 10*(0.4*0.3*0.2) + 10*(0.4*0.3*0.25) = 0.24 + 0.30 = 0.54 m3
  assert.equal(summary.cartonsCbm, 0.54);
  assert.equal(summary.palletsCbm, 0);
  assert.equal(summary.totalCbm, 0.54);
});

test('includes pallet tare (17 kg/pallet) and pallet volume (1.1x1.1x0.14 CBM/pallet) in total G.W. and CBM', () => {
  const summary = calculateOrderSummary(sampleItems, sampleCosts, 'EXW', 'USD', 2);
  assert.equal(summary.palletCount, 2);
  // Cartons G.W. = 85 + 20 * 0.65 = 98 kg; Pallets G.W. = 2 * 17 = 34 kg; Total G.W. = 132 kg
  assert.equal(summary.cartonsGrossWeightKg, 98);
  assert.equal(summary.palletsGrossWeightKg, 34);
  assert.equal(summary.totalGrossWeightKg, 132);
  // Cartons CBM = 0.54; Pallets CBM = 2 * (1.1 * 1.1 * 0.14 = 0.1694) = 0.3388 -> 0.339
  // Total CBM = 0.54 + 0.3388 = 0.8788 -> 0.879
  assert.equal(summary.cartonsCbm, 0.54);
  assert.equal(summary.palletsCbm, 0.339);
  assert.equal(summary.totalCbm, 0.879);
});

test('computes all 10 Incoterms 2020 totals accurately while keeping EXW linked', () => {
  const fca = calculateOrderSummary(sampleItems, sampleCosts, 'FCA', 'USD');
  assert.equal(fca.exwTotal, 4650);
  assert.equal(fca.incotermTotal, 4650 + 220);

  const fob = calculateOrderSummary(sampleItems, sampleCosts, 'FOB', 'USD');
  assert.equal(fob.incotermTotal, 4870);

  const cfr = calculateOrderSummary(sampleItems, sampleCosts, 'CFR', 'USD');
  assert.equal(cfr.incotermTotal, 4870 + 850);

  const cif = calculateOrderSummary(sampleItems, sampleCosts, 'CIF', 'USD');
  assert.equal(cif.incotermTotal, 4870 + 850 + 65);

  const cpt = calculateOrderSummary(sampleItems, sampleCosts, 'CPT', 'USD');
  assert.equal(cpt.incotermTotal, 5720);

  const cip = calculateOrderSummary(sampleItems, sampleCosts, 'CIP', 'USD');
  assert.equal(cip.incotermTotal, 5785);

  const dap = calculateOrderSummary(sampleItems, sampleCosts, 'DAP', 'USD');
  assert.equal(dap.incotermTotal, 4650 + 220 + 850 + 180);

  const dpu = calculateOrderSummary(sampleItems, sampleCosts, 'DPU', 'USD');
  assert.equal(dpu.incotermTotal, 4650 + 220 + 850 + 180);

  const ddp = calculateOrderSummary(sampleItems, sampleCosts, 'DDP', 'USD');
  assert.equal(ddp.incotermTotal, 4650 + 220 + 850 + 65 + 180 + 420);
});

test('computes auto-insurance at 110% of (EXW + inland + main freight) * rate%', () => {
  const autoCosts: OrderCosts = {
    ...sampleCosts,
    insuranceMode: 'AUTO_PERCENT',
    insuranceRatePercent: 0.5,
  };
  const cif = calculateOrderSummary(sampleItems, autoCosts, 'CIF', 'USD');
  // Base = (4650 + 220 + 850) * 1.1 = 5720 * 1.1 = 6292
  // 0.5% of 6292 = 31.46
  assert.equal(cif.insuranceCost, 31.46);
  assert.equal(cif.incotermTotal, 5720 + 31.46);
});

test('rounds JPY to integers and formats currencies properly', () => {
  const jpyItems: OrderItem[] = [
    { ...sampleItems[0], quantity: 3, unitPrice: 333.4 },
  ];
  const jpyCosts: OrderCosts = {
    ...sampleCosts,
    packingHandlingCost: 1000,
    inlandFreightCost: 0,
    mainFreightCost: 0,
  };
  const summary = calculateOrderSummary(jpyItems, jpyCosts, 'EXW', 'JPY');
  assert.equal(summary.goodsSubtotal, 1000);
  assert.equal(summary.exwTotal, 2000);
  assert.equal(formatMoney(summary.exwTotal, 'JPY'), '¥2,000');
  assert.equal(formatMoney(1234.5, 'USD'), '$1,234.50');
});

test('getIncotermFlags distinguishes sea-only vs multimodal Incoterms', () => {
  assert.deepEqual(getIncotermFlags('FOB').recommendedModes, ['SEA']);
  assert.ok(getIncotermFlags('CIP').recommendedModes.includes('EXPRESS'));
  assert.ok(getIncotermFlags('EXW').recommendedModes.includes('AIR'));
});

test('validateErpBackupPayload validates valid payloads and rejects invalid payloads', () => {
  const valid = {
    version: 3,
    exportedAt: '2026-11-17T00:00:00Z',
    customers: [],
    suppliers: [],
    logisticsProviders: [],
    bankAccounts: [],
    products: [],
    orders: [],
    auditLogs: [],
  };
  assert.equal(validateErpBackupPayload(valid), true);
  assert.equal(validateErpBackupPayload(null), false);
  assert.equal(validateErpBackupPayload({ version: 3 }), false);
});

test('calculateItemCartons and calculatePalletPacking enforce <=12 direct vs >12 palletized rules', () => {
  assert.equal(calculateItemCartons(0, 800), 0);
  assert.equal(calculateItemCartons(800, 800), 1);
  assert.equal(calculateItemCartons(801, 800), 2);

  // <= 12 cartons: no pallets, 0 empty cartons
  const direct = calculatePalletPacking(12);
  assert.equal(direct.usesPallet, false);
  assert.equal(direct.palletCount, 0);
  assert.equal(direct.emptyCartons, 0);

  // 13 cartons: 1 pallet, 13 % 12 = 1 -> 11 empty cartons
  const thirteen = calculatePalletPacking(13, { cartonsPerLayer: 12 });
  assert.equal(thirteen.usesPallet, true);
  assert.equal(thirteen.palletCount, 1);
  assert.equal(thirteen.emptyCartons, 11);

  // User invoice example: 569 cartons -> 10 pallets, 569 % 60 = 29, 29 % 12 = 5 -> 7 empty cartons
  const invoiceSample = calculatePalletPacking(569, { cartonsPerLayer: 12 });
  assert.equal(invoiceSample.usesPallet, true);
  assert.equal(invoiceSample.palletCount, 10);
  assert.equal(invoiceSample.lastPalletCartons, 29);
  assert.equal(invoiceSample.emptyCartons, 7);

  // Full pallet (60 cartons = 5 layers of 12) -> 0 empty cartons
  const exactFull = calculatePalletPacking(60, { cartonsPerLayer: 12 });
  assert.equal(exactFull.palletCount, 1);
  assert.equal(exactFull.emptyCartons, 0);
});

test('exchange rate helpers return JPY=1 and valid fallback rates for foreign currencies', () => {
  assert.equal(getDefaultExchangeRate('JPY'), 1);
  assert.equal(getDefaultExchangeRate('USD'), 150);
  assert.equal(resolveEffectiveExchangeRate('JPY', 150), 1);
  assert.equal(resolveEffectiveExchangeRate('USD', 148.5), 148.5);
  assert.equal(resolveEffectiveExchangeRate('CNY', 0), 21);
});

test('autoConsolidateHalfCartons pairs compatible half-carton items and calculateOrderSummary charges tare & CBM once', () => {
  const halfA: OrderItem = {
    ...sampleItems[0],
    id: 'half-a',
    sku: 'HLN-M10',
    quantity: 400,
    setsPerCarton: 800,
    cartons: 1,
    unitNetWeightKg: 0.018,
    cartonLengthCm: 33,
    cartonWidthCm: 25,
    cartonHeightCm: 12,
  };
  const halfB: OrderItem = {
    ...sampleItems[0],
    id: 'half-b',
    sku: 'HLN-M12',
    quantity: 300,
    setsPerCarton: 600,
    cartons: 1,
    unitNetWeightKg: 0.026,
    cartonLengthCm: 33,
    cartonWidthCm: 25,
    cartonHeightCm: 12,
  };
  const optOut: OrderItem = {
    ...sampleItems[0],
    id: 'half-none',
    sku: 'HLN-M16',
    quantity: 150,
    setsPerCarton: 300,
    cartons: 1,
    unitNetWeightKg: 0.046,
    cartonLengthCm: 33,
    cartonWidthCm: 25,
    cartonHeightCm: 12,
    sharedCartonGroupId: 'NONE',
  };

  const consolidated = autoConsolidateHalfCartons([halfA, halfB, optOut]);
  assert.equal(consolidated[0].sharedCartonGroupId, 'mix-1');
  assert.equal(consolidated[1].sharedCartonGroupId, 'mix-1');
  assert.equal(consolidated[2].sharedCartonGroupId, 'NONE');

  // Linked totals: A+B share 1 physical carton + optOut is 1 carton = 2 cartons total (vs 3 raw)
  const summary = calculateOrderSummary(consolidated, sampleCosts, 'FOB', 'USD', 0);
  assert.equal(summary.unmergedCartons, 3);
  assert.equal(summary.totalCartons, 2);
  // N.W. = 400*0.018 (7.2) + 300*0.026 (7.8) + 150*0.046 (6.9) = 21.9 kg
  assert.equal(summary.totalNetWeightKg, 21.9);
  // G.W. = 21.9 + 2 * 0.65 = 23.2 kg (tare charged twice, NOT three times)
  assert.equal(summary.cartonsGrossWeightKg, 23.2);
  // Single carton vol = 0.33 * 0.25 * 0.12 = 0.0099 m3; 2 physical cartons = 0.020 m3 (0.0198 rounded)
  assert.equal(summary.cartonsCbm, 0.02);
});


