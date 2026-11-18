import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { createInitialErpState } from '../data/seedData';
import {
  applyCustomerPricingToItems,
  buildOrderExcelRows,
  buildOrdersWorkbook,
  buildProductImportTemplateCsv,
  mapImportedProductRows,
  parseCsvProductsText,
  parseExcelProductsBuffer,
  resolveCustomerProductPrice,
} from './importExportUtils';

test('resolveCustomerProductPrice uses custom price when bound and falls back to base unitPrice', () => {
  const seed = createInitialErpState();
  const baseProd = seed.products[0];
  const otherProd = seed.products[1];
  const custWithCustom = {
    ...seed.customers[0],
    customPrices: [{ productId: baseProd.id, unitPrice: 99.5 }],
  };

  assert.deepEqual(resolveCustomerProductPrice(custWithCustom, baseProd), {
    unitPrice: 99.5,
    isCustom: true,
  });
  assert.deepEqual(resolveCustomerProductPrice(custWithCustom, otherProd), {
    unitPrice: otherProd.unitPrice,
    isCustom: false,
  });
  assert.deepEqual(resolveCustomerProductPrice(undefined, baseProd), {
    unitPrice: baseProd.unitPrice,
    isCustom: false,
  });
});

test('applyCustomerPricingToItems re-prices catalog items when customer changes while preserving custom rows', () => {
  const seed = createInitialErpState();
  const order = seed.orders[0];
  const cust = {
    ...seed.customers[0],
    customPrices: [{ productId: seed.products[0].id, unitPrice: 12.34 }],
  };
  const customBlankItem = {
    ...order.items[0],
    id: 'oi-manual',
    productId: '',
    unitPrice: 55.0,
  };

  const updated = applyCustomerPricingToItems(
    [order.items[0], customBlankItem],
    cust,
    seed.products,
  );
  assert.equal(updated[0].unitPrice, 12.34);
  assert.equal(updated[1].unitPrice, 55.0);
});

test('parseCsvProductsText parses UTF-8 CSV template and updates matching SKU or creates new products', () => {
  const seed = createInitialErpState();
  const csv = buildProductImportTemplateCsv();
  const res = parseCsvProductsText(csv, seed.products);

  assert.equal(res.errors.length, 0);
  assert.equal(res.products.length, 2);
  assert.equal(res.products[0].sku, 'HLN-R10C-4CR');
  assert.equal(res.products[0].unitPrice, 1.31);
  assert.equal(res.products[1].surfaceFinish, 'MP');
});

test('mapImportedProductRows preserves existing product ID on SKU match and reports invalid rows', () => {
  const seed = createInitialErpState();
  const existing = seed.products[0];
  const res = mapImportedProductRows(
    [
      {
        产品编号: existing.sku,
        英文品名: existing.nameEn,
        基础单价: '8.88',
      },
      {
        产品编号: '',
        英文品名: 'Missing SKU',
        基础单价: '2.00',
      },
      {
        产品编号: 'NEW-001',
        英文品名: 'New Nut',
        基础单价: '-10',
      },
    ],
    seed.products,
  );

  assert.equal(res.updatedCount, 1);
  assert.equal(res.createdCount, 0);
  assert.equal(res.products[0].id, existing.id);
  assert.equal(res.products[0].unitPrice, 8.88);
  assert.equal(res.errors.length, 2);
});

test('parseExcelProductsBuffer reads xlsx bytes into Product list via SheetJS', () => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet([
    {
      '产品编号(SKU)': 'HLN-XLSX-01',
      '英文品名(Name)': 'HARDLOCK NUT M16',
      '规格尺寸(Size)': 'M16x2.0',
      '材质(Material)': 'SS400',
      '表面处理(Finish)': 'CR3',
      'HS编码': '7318.16',
      '单位(Unit)': 'SETS',
      '基础单价(Unit Price)': 4.25,
      '币种(Currency)': 'USD',
      '单件净重kg(N.W)': 0.046,
      '单件毛重kg(G.W)': 0.05,
      '每箱数量(Pcs/Ctn)': 300,
      '原产地(Origin)': 'JAPAN',
    },
  ]);
  XLSX.utils.book_append_sheet(wb, ws, 'Products');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

  const res = parseExcelProductsBuffer(buf, []);
  assert.equal(res.errors.length, 0);
  assert.equal(res.createdCount, 1);
  assert.equal(res.products[0].sku, 'HLN-XLSX-01');
  assert.equal(res.products[0].unitPrice, 4.25);
  assert.equal(res.products[0].defaultUnitsPerCarton, 300);
});

test('buildOrdersWorkbook produces Excel workbook with required Chinese headers and core fields', () => {
  const seed = createInitialErpState();
  const rows = buildOrderExcelRows([seed.orders[0]], seed.customers);
  assert.ok(rows.length >= 1);
  assert.equal(rows[0].订单号, seed.orders[0].invoiceNo);
  assert.ok(rows[0].客户名称.length > 0);
  assert.ok(rows[0].产品明细.length > 0);
  assert.equal(rows[0].数量, seed.orders[0].items[0].quantity);
  assert.equal(rows[0].单价, seed.orders[0].items[0].unitPrice);
  assert.ok(rows[0].总价 > 0);

  const wb = buildOrdersWorkbook(seed.orders, seed.customers);
  assert.deepEqual(wb.SheetNames, ['订单明细', '订单汇总']);
  const bytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  const parsedWb = XLSX.read(bytes, { type: 'array' });
  const parsedRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
    parsedWb.Sheets['订单明细'],
  );
  assert.equal(parsedRows[0]['订单号'], seed.orders[0].invoiceNo);
  assert.equal(parsedRows[0]['客户名称'], rows[0].客户名称);
});
