import test from 'node:test';
import assert from 'node:assert/strict';
import XlsxStylePkg from 'xlsx-js-style';
import PizZipPkg from 'pizzip';
import { createInitialErpState } from '../data/seedData';
import {
  applyCustomerPricingToItems,
  buildFormalDocumentWorkbook,
  buildOrderExcelRows,
  buildOrdersWorkbook,
  buildProductImportTemplateCsv,
  mapImportedProductRows,
  parseCsvProductsText,
  parseExcelProductsBuffer,
  resolveCustomerProductPrice,
  resolveCustomerProductPricing,
} from './importExportUtils';
import {
  arrayBufferToBase64,
  buildDocxBufferFromCustomTemplate,
  buildWorkbookFromCustomXlsxTemplate,
  findMatchingCustomerTemplate,
} from './templateExportUtils';
import { buildContractDocxBuffer } from './contractDocxExport';
import { createDefaultContractSettings } from './contractDefaults';
import type { CustomerDocumentTemplate } from '../types/erp';

type XlsxModule = typeof import('xlsx-js-style');
const XLSX: XlsxModule =
  (XlsxStylePkg as unknown as { default?: XlsxModule }).default ?? XlsxStylePkg;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PizZip: typeof PizZipPkg = (PizZipPkg as any).default ?? PizZipPkg;

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
  assert.equal(res.products[0].unitPrice, 195);
  assert.equal(res.products[0].currency, 'JPY');
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

test('resolveCustomerProductPricing enforces quantity tier precedence and converts JPY base prices by exchangeRate', () => {
  const seed = createInitialErpState();
  const prod = {
    ...seed.products[0],
    unitPrice: 480,
    currency: 'JPY' as const,
    tieredPrices: [
      { minQty: 1, maxQty: 999, unitPrice: 480 },
      { minQty: 1000, maxQty: 4999, unitPrice: 450 },
      { minQty: 5000, maxQty: null, unitPrice: 420 },
    ],
  };

  // Product tier matching + USD conversion at 1 USD = 150 JPY
  const rSmallUsd = resolveCustomerProductPricing(undefined, prod, 500, 'USD', 150);
  assert.equal(rSmallUsd.basePriceJpy, 480);
  assert.equal(rSmallUsd.unitPrice, 3.2);
  assert.equal(rSmallUsd.source, 'product_tier');
  assert.equal(rSmallUsd.matchedTierLabel, '1-999');

  const rLargeUsd = resolveCustomerProductPricing(undefined, prod, 6000, 'USD', 150);
  assert.equal(rLargeUsd.basePriceJpy, 420);
  assert.equal(rLargeUsd.unitPrice, 2.8);
  assert.equal(rLargeUsd.matchedTierLabel, '5000+');

  // Customer tiered override beats product tier
  const vipCust = {
    ...seed.customers[0],
    customPrices: [
      {
        productId: prod.id,
        unitPrice: 400,
        tieredPrices: [{ minQty: 2000, maxQty: null, unitPrice: 360 }],
      },
    ],
  };
  const rVipTier = resolveCustomerProductPricing(vipCust, prod, 3000, 'CNY', 20);
  assert.equal(rVipTier.source, 'customer_tier');
  assert.equal(rVipTier.basePriceJpy, 360);
  assert.equal(rVipTier.unitPrice, 18);
  assert.equal(rVipTier.isCustom, true);

  // Customer flat custom fallback when quantity does not match customer tier
  const rVipFlat = resolveCustomerProductPricing(vipCust, prod, 500, 'CNY', 20);
  assert.equal(rVipFlat.source, 'customer_flat');
  assert.equal(rVipFlat.basePriceJpy, 400);
  assert.equal(rVipFlat.unitPrice, 20);
});

test('buildFormalDocumentWorkbook creates styled 3-sheet INVOICE, PACKING LIST, CONTRACT workbook preserving docOverrides & specialFields', () => {
  const seed = createInitialErpState();
  const order = {
    ...seed.orders[0],
    currency: 'USD' as const,
    exchangeRate: 152,
    palletCount: 1,
    emptyCartons: 11,
    docOverrides: {
      'inv.remarks': 'CUSTOM WYSIWYG REMARK 999',
    },
    docSpecialFields: {
      showCompanyStamp: true,
      showSignature: true,
      showDisclaimer: true,
      disclaimerText: 'Valid for {invoiceNo} ({currency})',
      customNote: 'Handle pallets gently.',
    },
  };
  const customer = {
    ...seed.customers.find((c) => c.id === order.customerId)!,
    fax: '+49-711-000-999',
    taxOrImporterId: 'DE-TAX-888999',
  };
  const supplier = seed.suppliers.find((s) => s.id === order.supplierId)!;
  const bank = seed.bankAccounts.find((b) => b.id === order.bankAccountId)!;

  const wb = buildFormalDocumentWorkbook(order, {
    customer,
    billToCustomer: customer,
    supplier,
    bank,
    products: seed.products,
    docLang: 'en',
  });

  assert.deepEqual(wb.SheetNames, ['INVOICE', 'PACKING LIST', 'CONTRACT']);
  // Verify xlsx-js-style metadata is populated
  const invSheetPre = wb.Sheets['INVOICE'];
  assert.ok(invSheetPre['A1']?.s?.font?.bold);
  assert.ok(Array.isArray(invSheetPre['!cols']) && invSheetPre['!cols'].length === 11);
  assert.ok(Array.isArray(invSheetPre['!rows']) && invSheetPre['!rows'].length > 10);

  const bytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  const parsed = XLSX.read(bytes, { type: 'array' });

  const invText = XLSX.utils.sheet_to_csv(parsed.Sheets['INVOICE']);
  assert.match(invText, /HARDLOCK Industry Co\., Ltd\./);
  assert.match(invText, /INVOICE/);
  assert.match(invText, /BILL TO :/);
  assert.match(invText, /Fax : \+49-711-000-999/);
  assert.match(invText, /Tax ID : DE-TAX-888999/);
  assert.match(invText, /\*Exchange Rate : 1 USD = 152 JPY/);
  assert.match(invText, /1 pallets \(.*cartons total \+ 11 empty carton\)/);
  assert.match(invText, /CUSTOM WYSIWYG REMARK 999/);
  assert.match(invText, /OFFICIAL SEAL/);
  assert.match(invText, /Valid for .* \(USD\)/);
  assert.match(invText, /Handle pallets gently\./);

  const plText = XLSX.utils.sheet_to_csv(parsed.Sheets['PACKING LIST']);
  assert.match(plText, /PACKING LIST/);
  assert.match(plText, /DELIVER TO :/);
  assert.match(plText, /Pallet No\.,Ctn\. No\.,Item No\.,Type/);
  assert.ok((parsed.Sheets['PACKING LIST']['!merges']?.length ?? 0) > 5);

  const contractText = XLSX.utils.sheet_to_csv(parsed.Sheets['CONTRACT']);
  assert.match(contractText, /CONTRACT/);
  assert.match(contractText, /THE BUYERS/);
  assert.match(contractText, /THE SELLERS/);
  assert.match(contractText, /TOTAL VALUE/);
  assert.match(contractText, /Ex-works Total/);
});

test('custom customer .xlsx and .docx templates match scope and populate mapped cells/tags', () => {
  const seed = createInitialErpState();
  const order = seed.orders[0];
  const customer = seed.customers.find((c) => c.id === order.customerId)!;
  const supplier = seed.suppliers.find((s) => s.id === order.supplierId)!;
  const bank = seed.bankAccounts.find((b) => b.id === order.bankAccountId)!;

  // Build synthetic xlsx template with {invoiceNo} placeholder + empty B10 & D20 targets
  const tplWb = XLSX.utils.book_new();
  const tplWs = XLSX.utils.aoa_to_sheet([
    ['Template Inv:', '{invoiceNo}'],
    ['', ''],
  ]);
  tplWs['B10'] = {
    v: 'PLACEHOLDER',
    t: 's',
    s: { fill: { patternType: 'solid', fgColor: { rgb: 'EEF2F6' } }, font: { bold: true } },
  };
  tplWs['!ref'] = 'A1:K30';
  XLSX.utils.book_append_sheet(tplWb, tplWs, 'CustomInv');
  const xlsxBuf = XLSX.write(tplWb, { type: 'array', bookType: 'xlsx', cellStyles: true }) as ArrayBuffer;

  const xlsxTemplate: CustomerDocumentTemplate = {
    id: 'tpl-xlsx-1',
    name: 'VIP Excel Invoice',
    fileName: 'vip-inv.xlsx',
    fileType: 'xlsx',
    docScope: 'invoice',
    fileBase64: arrayBufferToBase64(xlsxBuf),
    itemsStartRow: 15,
    mappings: [
      { id: 'm1', systemField: 'customerName', targetRef: 'B10' },
      { id: 'm2', systemField: 'totalAmount', targetRef: 'D20' },
    ],
    uploadedAt: '2026-11-18T00:00:00.000Z',
  };

  const custWithTpls = {
    ...customer,
    documentTemplates: [xlsxTemplate],
  };

  assert.equal(findMatchingCustomerTemplate(custWithTpls, 'invoice')?.id, 'tpl-xlsx-1');
  assert.equal(findMatchingCustomerTemplate(custWithTpls, 'packing'), undefined);

  const outWb = buildWorkbookFromCustomXlsxTemplate(order, xlsxTemplate, {
    customer: custWithTpls,
    supplier,
    bank,
    products: seed.products,
    docLang: 'en',
  });
  const outSheet = outWb.Sheets['CustomInv'];
  assert.equal(outSheet['B1']?.v, order.invoiceNo);
  assert.equal(outSheet['B10']?.v, customer.name);
  assert.ok(outSheet['B10']?.s, 'existing cell style object should be preserved');
  assert.ok(String(outSheet['D20']?.v ?? '').length > 0);
  assert.equal(outSheet['B15']?.v, order.items[0].sku);

  // Build synthetic docx template via PizZip and verify docxtemplater fill
  const zip = new PizZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    'word/document.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Buyer: {CUSTOM_BUYER} / Inv: {invoiceNo} / Total: {totalAmount}</w:t></w:r></w:p></w:body></w:document>',
  );
  const docxArr = zip.generate({ type: 'uint8array' });
  const docxTemplate: CustomerDocumentTemplate = {
    id: 'tpl-docx-1',
    name: 'VIP Word Contract',
    fileName: 'vip-contract.docx',
    fileType: 'docx',
    docScope: 'contract',
    fileBase64: arrayBufferToBase64(docxArr.buffer as ArrayBuffer),
    mappings: [
      { id: 'dm1', systemField: 'customerName', targetRef: '{CUSTOM_BUYER}' },
    ],
    uploadedAt: '2026-11-18T00:00:00.000Z',
  };

  const renderedDocxBytes = buildDocxBufferFromCustomTemplate(order, docxTemplate, {
    customer: custWithTpls,
    supplier,
    bank,
    products: seed.products,
    docLang: 'en',
  });
  const renderedZip = new PizZip(renderedDocxBytes);
  const renderedXml = renderedZip.file('word/document.xml')?.asText() ?? '';
  assert.ok(renderedXml.includes(customer.name));
  assert.ok(renderedXml.includes(order.invoiceNo));
});

test('buildContractDocxBuffer generates valid standalone Contract .docx preserving bilingual clauses and WYSIWYG docOverrides across Word and Excel', async () => {
  const seed = createInitialErpState();
  const settings = createDefaultContractSettings();
  const order = {
    ...seed.orders[0],
    palletCount: 2,
    docOverrides: {
      'contract.buyerPhone': '+86-411-9999-8888',
      'contract.preambleZh': '定制前言条款 WYSIWYG 校验文本',
      'contract.clause.1.zh': '定制条款1内容：DAP 客户指定仓库交货。',
      'contract.totalWords': 'JPY ONE MILLION CUSTOM TEST ONLY.',
    },
    docSpecialFields: {
      showCompanyStamp: true,
      showSignature: true,
      showDisclaimer: true,
      disclaimerText: 'Contract disclaimer for {invoiceNo}',
      customNote: 'Word special note XYZ',
    },
  };
  const customer = seed.customers.find((c) => c.id === order.customerId)!;
  const supplier = seed.suppliers.find((s) => s.id === order.supplierId)!;
  const bank = seed.bankAccounts.find((b) => b.id === order.bankAccountId)!;

  const docxBytes = await buildContractDocxBuffer(order, {
    customer,
    billToCustomer: customer,
    supplier,
    products: seed.products,
    docLang: 'en',
    contractSettings: settings,
  });

  assert.ok(docxBytes instanceof Uint8Array && docxBytes.length > 2000);
  // ZIP magic bytes 'PK'
  assert.equal(docxBytes[0], 0x50);
  assert.equal(docxBytes[1], 0x4b);

  const zip = new PizZip(docxBytes);
  const docXml = zip.file('word/document.xml')?.asText() ?? '';
  assert.ok(docXml.includes('C O N T R A C T'));
  assert.ok(docXml.includes('NAME OF COMMODITY'));
  assert.ok(docXml.includes('+86-411-9999-8888'));
  assert.ok(docXml.includes('定制前言条款 WYSIWYG 校验文本'));
  assert.ok(docXml.includes('定制条款1内容：DAP 客户指定仓库交货。'));
  assert.ok(docXml.includes('JPY ONE MILLION CUSTOM TEST ONLY.'));
  assert.ok(docXml.includes('ARBITRATION'));
  assert.ok(docXml.includes('AUTHORIZED SEAL'));
  assert.ok(docXml.includes(`Contract disclaimer for ${order.invoiceNo}`));
  assert.ok(docXml.includes('Word special note XYZ'));
  assert.ok(!docXml.includes('undefined'));
  assert.ok(!docXml.includes('NaN'));

  // Verify Excel CONTRACT sheet also receives the exact same WYSIWYG overrides
  const wb = buildFormalDocumentWorkbook(order, {
    customer,
    billToCustomer: customer,
    supplier,
    bank,
    products: seed.products,
    docLang: 'en',
    contractSettings: settings,
  });
  const contractCsv = XLSX.utils.sheet_to_csv(wb.Sheets['CONTRACT']);
  assert.match(contractCsv, /\+86-411-9999-8888/);
  assert.match(contractCsv, /定制前言条款 WYSIWYG 校验文本/);
  assert.match(contractCsv, /定制条款1内容：DAP 客户指定仓库交货。/);
  assert.match(contractCsv, /JPY ONE MILLION CUSTOM TEST ONLY\./);
});


