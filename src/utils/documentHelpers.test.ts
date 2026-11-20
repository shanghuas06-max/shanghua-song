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

import { numberToContractWords } from './contractDefaults';

test('formatCurrencyLabel and formatDocMoney match HARDLOCK Invoice notation without rounding decimals', () => {
  assert.equal(formatCurrencyLabel('CNY'), 'CNY (RMB)');
  assert.equal(formatCurrencyLabel('USD'), 'USD ($)');
  assert.equal(formatDocMoney(2790, 'CNY'), 'CNY 2,790.00');
  assert.equal(formatDocMoney(125000, 'JPY'), 'JPY 125,000');
  assert.equal(formatDocMoney(125.75, 'JPY'), 'JPY 125.75');
  assert.equal(formatDocMoney(0.0855, 'USD'), 'USD 0.0855');
  assert.match(numberToContractWords(125.75, 'JPY'), /POINT SEVEN FIVE/);
  assert.match(numberToContractWords(10.125, 'USD'), /POINT ONE TWO FIVE/);
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

test('buildPackingListDisplayRows packs full pallets first, then minimizes product kinds and splits via exact-sum grouping', () => {
  const mkItem = (
    id: string,
    sku: string,
    cartons: number,
    setsPerCarton = 100,
    sharedCartonGroupId?: string,
    quantity?: number,
  ): OrderItem => ({
    id,
    productId: '',
    sku,
    description: sku,
    size: 'M16x2.0',
    material: 'SS400',
    surfaceFinish: 'CR3',
    hsCode: '7318.16.00',
    quantity: quantity ?? cartons * setsPerCarton,
    unit: 'SETS',
    unitPrice: 2,
    cartons,
    setsPerCarton,
    sharedCartonGroupId,
    unitNetWeightKg: 0.05,
    unitGrossWeightKg: 0.055,
    cartonLengthCm: 33,
    cartonWidthCm: 25,
    cartonHeightCm: 12,
    originCountry: 'JAPAN',
    palletNo: '',
    cartonRange: '',
  });

  // Case A: Full pallets first (Item 2: 60, Item 4: 130 -> 60+60+10), then exact 60 remainder pair (Item 1: 15 + Item 3: 45 = 60), then Item 4 rem (10)
  const caseA = buildPackingListDisplayRows(
    [
      mkItem('a1', 'SKU-1', 15),
      mkItem('a2', 'SKU-2', 60),
      mkItem('a3', 'SKU-3', 45),
      mkItem('a4', 'SKU-4', 130),
    ],
    [],
  );
  assert.deepEqual(
    caseA.map((r) => ({
      palletNo: r.palletNo,
      itemNo: r.itemNo,
      ctnNo: r.ctnNo,
      cartonCount: r.cartonCount,
      qty: r.qty,
    })),
    [
      { palletNo: 'Pallet 1', itemNo: 2, ctnNo: '1 - 60', cartonCount: 60, qty: 6000 },
      { palletNo: 'Pallet 2', itemNo: 4, ctnNo: '61 - 120', cartonCount: 60, qty: 6000 },
      { palletNo: 'Pallet 3', itemNo: 4, ctnNo: '121 - 180', cartonCount: 60, qty: 6000 },
      { palletNo: 'Pallet 4', itemNo: 1, ctnNo: '181 - 195', cartonCount: 15, qty: 1500 },
      { palletNo: 'Pallet 4', itemNo: 3, ctnNo: '196 - 240', cartonCount: 45, qty: 4500 },
      { palletNo: 'Pallet 5', itemNo: 4, ctnNo: '241 - 250', cartonCount: 10, qty: 1000 },
    ],
  );
  assert.equal(caseA[3].palletRowSpan, 2);
  assert.equal(caseA[4].showPalletCell, false);

  // Case B: Exact-fit subset chooses minimum product kinds per pallet (20+40=60 [2 kinds] before 10+15+15+20=60 [4 kinds])
  const caseB = buildPackingListDisplayRows(
    [
      mkItem('b1', 'B-10', 10),
      mkItem('b2', 'B-20A', 20),
      mkItem('b3', 'B-15A', 15),
      mkItem('b4', 'B-40', 40),
      mkItem('b5', 'B-15B', 15),
      mkItem('b6', 'B-20B', 20),
    ],
    [],
  );
  const p1Items = caseB.filter((r) => r.palletNo === 'Pallet 1');
  const p2Items = caseB.filter((r) => r.palletNo === 'Pallet 2');
  assert.equal(p1Items.length, 2, 'Pallet 1 should pick the 2-product exact pair (20 + 40 = 60)');
  assert.equal(p1Items.reduce((s, r) => s + r.cartonCount, 0), 60);
  assert.equal(p2Items.length, 4);
  assert.equal(p2Items.reduce((s, r) => s + r.cartonCount, 0), 60);

  // Case C: Non-exact remainders [45, 30, 20, 12] fill Pallet 1 to 60 with 2 kinds (45 + 15) and only 1 split
  const caseC = buildPackingListDisplayRows(
    [
      mkItem('c1', 'C-45', 45),
      mkItem('c2', 'C-30', 30),
      mkItem('c3', 'C-20', 20),
      mkItem('c4', 'C-12', 12),
    ],
    [],
  );
  const cp1 = caseC.filter((r) => r.palletNo === 'Pallet 1');
  const cp2 = caseC.filter((r) => r.palletNo === 'Pallet 2');
  assert.equal(cp1.reduce((s, r) => s + r.cartonCount, 0), 60);
  assert.equal(cp1.length, 2, 'Pallet 1 fills 60 cartons using only 2 product types (45 + 15)');
  assert.equal(cp2.reduce((s, r) => s + r.cartonCount, 0), 47);
  assert.equal(caseC.reduce((s, r) => s + r.qty, 0), (45 + 30 + 20 + 12) * 100);

  // Case D: Shared half-carton group + full pallet + 59-carton remainder
  const caseD = buildPackingListDisplayRows(
    [
      mkItem('d1', 'D-HALF1', 1, 200, 'mix-1', 100),
      mkItem('d2', 'D-HALF2', 1, 200, 'mix-1', 100),
      mkItem('d3', 'D-FULL60', 60),
      mkItem('d4', 'D-REM59', 59),
    ],
    [],
  );
  assert.equal(caseD[0].palletNo, 'Pallet 1');
  assert.equal(caseD[0].itemNo, 3);
  assert.equal(caseD[0].ctnNo, '1 - 60');
  assert.equal(caseD[1].palletNo, 'Pallet 2');
  assert.equal(caseD[1].ctnNo, '61');
  assert.equal(caseD[2].palletNo, 'Pallet 2');
  assert.equal(caseD[2].isSubRowInSameCtn, true);
  assert.equal(caseD[3].palletNo, 'Pallet 2');
  assert.equal(caseD[3].ctnNo, '62 - 120');

  // Case E: Decimal carton counts (no rounding): 12.5 + 47.5 = 60 exact after 60-carton full pallet
  const caseE = buildPackingListDisplayRows(
    [
      mkItem('e1', 'E-12.5', 12.5),
      mkItem('e2', 'E-60', 60),
      mkItem('e3', 'E-47.5', 47.5),
    ],
    [],
  );
  assert.equal(caseE[0].palletNo, 'Pallet 1');
  assert.equal(caseE[0].itemNo, 2);
  assert.equal(caseE[1].palletNo, 'Pallet 2');
  assert.equal(caseE[1].cartonCount, 12.5);
  assert.equal(caseE[2].palletNo, 'Pallet 2');
  assert.equal(caseE[2].cartonCount, 47.5);
});


