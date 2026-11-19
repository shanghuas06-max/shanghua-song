import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPackingListDisplayRows,
  extractSurfaceFootnotes,
  formatCompactHsCode,
  formatCurrencyLabel,
  formatDocMoney,
  formatDocumentDate,
  parseProductSpecFallback,
  resolveItemSpecs,
} from './documentHelpers';
import type { OrderItem, PackingListRow, Product } from '../types/erp';

test('formatDocumentDate formats English and CJK dates properly', () => {
  assert.equal(formatDocumentDate('2026-10-16', 'en'), 'Oct. 16, 2026');
  assert.equal(formatDocumentDate('2026-10-16', 'ja'), '2026年10月16日');
  assert.equal(formatDocumentDate('2026-10-16', 'zh'), '2026年10月16日');
  assert.equal(formatDocumentDate('', 'en'), '—');
});

test('formatCurrencyLabel and formatDocMoney match HARDLOCK Invoice notation', () => {
  assert.equal(formatCurrencyLabel('CNY'), 'CNY (RMB)');
  assert.equal(formatCurrencyLabel('USD'), 'USD ($)');
  assert.equal(formatDocMoney(2790, 'CNY'), 'CNY 2,790.00');
  assert.equal(formatDocMoney(125000, 'JPY'), 'JPY 125,000');
});

test('parseProductSpecFallback extracts Size, Material, and Surface Finish from SKU', () => {
  assert.deepEqual(
    parseProductSpecFallback('HLN-R8C-4CR', 'HARDLOCK Nut M8x1.25 SS400'),
    { size: 'M8x1.25', material: 'SS400', surfaceFinish: 'CR3' },
  );
  assert.deepEqual(
    parseProductSpecFallback('HLN-R12C-8/4CR', 'HARDLOCK Nut M12x1.75'),
    { size: 'M12x1.75', material: 'S45C/SS400', surfaceFinish: 'CR3' },
  );
  assert.deepEqual(
    parseProductSpecFallback('HLN-R22C-8MP', 'HARDLOCK Nut M22x2.5'),
    { size: 'M22x2.5', material: 'S45C', surfaceFinish: 'MP' },
  );
});

test('buildPackingListDisplayRows computes pallet rowspan and mixed-carton dotted dividers', () => {
  const mixedRows: PackingListRow[] = [
    {
      id: 'pk-1',
      palletNo: '7',
      ctnNo: '391',
      itemNo: 3,
      type: 'HLN-R10C-8CR',
      size: 'M10x1.5',
      material: 'S45C',
      surfaceFinish: 'CR3',
      setsPerCarton: 400,
      cartonCount: 1,
      sharedCarton: true,
      qty: 400,
      unitWeightKg: 0.018,
      totalWeightKg: 7.2,
    },
    {
      id: 'pk-2',
      palletNo: '7',
      ctnNo: '391',
      itemNo: 6,
      type: 'HLN-R12C-8/4CR',
      size: 'M12x1.75',
      material: 'S45C/SS400',
      surfaceFinish: 'CR3',
      setsPerCarton: 200,
      cartonCount: 1,
      sharedCarton: true,
      qty: 200,
      unitWeightKg: 0.026,
      totalWeightKg: 5.2,
    },
    {
      id: 'pk-3',
      palletNo: '7',
      ctnNo: '392-414',
      itemNo: 6,
      type: 'HLN-R12C-8/4CR',
      size: 'M12x1.75',
      material: 'S45C/SS400',
      surfaceFinish: 'CR3',
      setsPerCarton: 600,
      cartonCount: 23,
      sharedCarton: false,
      qty: 13800,
      unitWeightKg: 0.026,
      totalWeightKg: 358.8,
    },
  ];

  const display = buildPackingListDisplayRows([], [], mixedRows);
  assert.equal(display.length, 3);
  assert.equal(display[0].showPalletCell, true);
  assert.equal(display[0].palletRowSpan, 3);
  assert.equal(display[1].showPalletCell, false);
  assert.equal(display[0].showCtnCell, true);
  assert.equal(display[0].ctnRowSpan, 2);
  assert.equal(display[1].showCtnCell, false);
  assert.equal(display[1].isSubRowInSameCtn, true);
  assert.equal(display[2].showCtnCell, true);
  assert.equal(display[2].ctnRowSpan, 1);
  assert.equal(display[2].isSubRowInSameCtn, false);
});

test('extractSurfaceFootnotes and formatCompactHsCode match HARDLOCK defaults', () => {
  const items: OrderItem[] = [
    {
      id: 'oi-1',
      productId: 'p1',
      sku: 'HLN-R8C-4CR',
      description: 'Nut M8x1.25',
      size: 'M8x1.25',
      material: 'SS400',
      surfaceFinish: 'CR3',
      hsCode: '7318.16.00',
      quantity: 3000,
      unit: 'SETS',
      unitPrice: 0.93,
      cartons: 2,
      unitNetWeightKg: 0.0089,
      unitGrossWeightKg: 0.0095,
      cartonLengthCm: 33,
      cartonWidthCm: 25,
      cartonHeightCm: 12,
      originCountry: 'JAPAN',
    },
  ];
  const products: Product[] = [];
  assert.deepEqual(resolveItemSpecs(items[0], undefined), {
    size: 'M8x1.25',
    material: 'SS400',
    surfaceFinish: 'CR3',
  });
  assert.deepEqual(extractSurfaceFootnotes(items, products), [
    '*CR3:ZINC TRIVALENT CHROMATE',
  ]);
  assert.equal(formatCompactHsCode('7318.16.00'), '7318.16');
});

test('buildPackingListDisplayRows auto-merges <60 cartons into Pallet 1 and splits >=60 carton boundaries across Pallet 1 / Pallet 2', () => {
  const base: Omit<OrderItem, 'id' | 'sku' | 'quantity' | 'cartons' | 'setsPerCarton'> = {
    productId: '',
    description: 'HARDLOCK Nut M16',
    size: 'M16x2.0',
    material: 'SS400',
    surfaceFinish: 'CR3',
    hsCode: '7318.16.00',
    unit: 'SETS',
    unitPrice: 3,
    unitNetWeightKg: 0.046,
    unitGrossWeightKg: 0.05,
    cartonLengthCm: 33,
    cartonWidthCm: 25,
    cartonHeightCm: 12,
    originCountry: 'JAPAN',
    palletNo: '',
    cartonRange: '',
  };

  // Case 1: 50 cartons across 3 items -> all merged into Pallet 1
  const rows50 = buildPackingListDisplayRows(
    [
      { ...base, id: 'i1', sku: 'SKU-1', quantity: 6000, cartons: 20, setsPerCarton: 300 },
      { ...base, id: 'i2', sku: 'SKU-2', quantity: 6000, cartons: 20, setsPerCarton: 300 },
      { ...base, id: 'i3', sku: 'SKU-3', quantity: 3000, cartons: 10, setsPerCarton: 300 },
    ],
    [],
  );
  assert.equal(rows50.length, 3);
  assert.equal(rows50[0].palletNo, 'Pallet 1');
  assert.equal(rows50[0].palletRowSpan, 3);
  assert.equal(rows50[1].showPalletCell, false);
  assert.equal(rows50[2].showPalletCell, false);
  assert.equal(rows50[2].ctnNo, '41 - 50');

  // Case 2: 80 cartons on a single item -> automatically split into Pallet 1 (1 - 60) and Pallet 2 (61 - 80)
  const rows80 = buildPackingListDisplayRows(
    [
      { ...base, id: 'i80', sku: 'SKU-80', quantity: 8000, cartons: 80, setsPerCarton: 100 },
    ],
    [],
  );
  assert.equal(rows80.length, 2);
  assert.equal(rows80[0].palletNo, 'Pallet 1');
  assert.equal(rows80[0].ctnNo, '1 - 60');
  assert.equal(rows80[0].cartonCount, 60);
  assert.equal(rows80[0].qty, 6000);
  assert.equal(rows80[1].palletNo, 'Pallet 2');
  assert.equal(rows80[1].ctnNo, '61 - 80');
  assert.equal(rows80[1].cartonCount, 20);
  assert.equal(rows80[1].qty, 2000);
});

test('buildPackingListDisplayRows groups sharedCartonGroupId half-carton items into one merged Ctn. No. with dotted divider', () => {
  const halfItems: OrderItem[] = [
    {
      id: 'h1',
      productId: '',
      sku: 'HLN-R10C-8CR',
      description: 'M10',
      size: 'M10x1.5',
      material: 'S45C',
      surfaceFinish: 'CR3',
      hsCode: '7318.16.00',
      quantity: 400,
      unit: 'SETS',
      unitPrice: 2,
      cartons: 1,
      setsPerCarton: 800,
      sharedCartonGroupId: 'mix-1',
      unitNetWeightKg: 0.018,
      unitGrossWeightKg: 0.02,
      cartonLengthCm: 33,
      cartonWidthCm: 25,
      cartonHeightCm: 12,
      originCountry: 'JAPAN',
      palletNo: '',
      cartonRange: '',
    },
    {
      id: 'h2',
      productId: '',
      sku: 'HLN-R12C-8/4CR',
      description: 'M12',
      size: 'M12x1.75',
      material: 'S45C/SS400',
      surfaceFinish: 'CR3',
      hsCode: '7318.16.00',
      quantity: 200,
      unit: 'SETS',
      unitPrice: 3,
      cartons: 1,
      setsPerCarton: 600,
      sharedCartonGroupId: 'mix-1',
      unitNetWeightKg: 0.026,
      unitGrossWeightKg: 0.028,
      cartonLengthCm: 33,
      cartonWidthCm: 25,
      cartonHeightCm: 12,
      originCountry: 'JAPAN',
      palletNo: '',
      cartonRange: '',
    },
  ];
  const display = buildPackingListDisplayRows(halfItems, []);
  assert.equal(display.length, 2);
  assert.equal(display[0].palletNo, 'Pallet 1');
  assert.equal(display[0].palletRowSpan, 2);
  assert.equal(display[0].ctnNo, '1');
  assert.equal(display[0].ctnRowSpan, 2);
  assert.equal(display[0].setsPerCarton, 400);
  assert.equal(display[1].showCtnCell, false);
  assert.equal(display[1].isSubRowInSameCtn, true);
  assert.equal(display[1].setsPerCarton, 200);
});

