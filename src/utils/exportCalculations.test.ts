import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateOrderSummary,
  formatMoney,
  getIncotermFlags,
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
  // Gross weight: 1000*0.048 + 500*0.085 = 48 + 42.5 = 90.5 kg
  assert.equal(summary.totalGrossWeightKg, 90.5);
  // CBM: 10*(0.4*0.3*0.2) + 10*(0.4*0.3*0.25) = 0.24 + 0.30 = 0.54 m3
  assert.equal(summary.totalCbm, 0.54);
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
