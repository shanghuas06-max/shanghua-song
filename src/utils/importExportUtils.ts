import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import type {
  CurrencyCode,
  Customer,
  ExportOrder,
  OrderItem,
  Product,
} from '../types/erp';
import { calculateOrderSummary } from './exportCalculations';
import { sanitizeId } from './firestoreSanitizers';

const VALID_CURRENCIES = new Set<CurrencyCode>(['USD', 'JPY', 'EUR', 'CNY']);

// ---------------------------------------------------------------------------
// 1. Customer-Specific Pricing (一客一价)
// ---------------------------------------------------------------------------

export function resolveCustomerProductPrice(
  customer: Customer | undefined,
  product: Product,
): { unitPrice: number; isCustom: boolean } {
  if (!customer || !Array.isArray(customer.customPrices)) {
    return { unitPrice: product.unitPrice, isCustom: false };
  }
  const match = customer.customPrices.find(
    (entry) => entry.productId === product.id,
  );
  if (
    match &&
    typeof match.unitPrice === 'number' &&
    Number.isFinite(match.unitPrice) &&
    match.unitPrice >= 0
  ) {
    return { unitPrice: match.unitPrice, isCustom: true };
  }
  return { unitPrice: product.unitPrice, isCustom: false };
}

export function applyCustomerPricingToItems(
  items: OrderItem[],
  customer: Customer | undefined,
  products: Product[],
): OrderItem[] {
  return items.map((item) => {
    if (!item.productId) return item;
    const prod = products.find((p) => p.id === item.productId);
    if (!prod) return item;
    const { unitPrice } = resolveCustomerProductPrice(customer, prod);
    return {
      ...item,
      unitPrice,
    };
  });
}

// ---------------------------------------------------------------------------
// 2. Bulk Product Import (CSV via PapaParse & Excel via SheetJS)
// ---------------------------------------------------------------------------

export const PRODUCT_IMPORT_TEMPLATE_HEADERS = [
  '产品编号(SKU)',
  '英文品名(Name)',
  '中文/日文品名',
  '规格尺寸(Size)',
  '材质(Material)',
  '表面处理(Finish)',
  'HS编码',
  '单位(Unit)',
  '基础单价(Unit Price)',
  '币种(Currency)',
  '单件净重kg(N.W)',
  '单件毛重kg(G.W)',
  '每箱数量(Pcs/Ctn)',
  '原产地(Origin)',
] as const;

export function buildProductImportTemplateCsv(): string {
  const sampleRows = [
    [
      'HLN-R10C-4CR',
      'HARDLOCK NUT M10x1.5',
      '防松螺母 M10',
      'M10x1.5',
      'SS400',
      'CR3',
      '7318.16',
      'SETS',
      '1.31',
      'USD',
      '0.018',
      '0.020',
      '800',
      'JAPAN',
    ],
    [
      'HLN-R12C-8MP',
      'HARDLOCK NUT M12x1.75',
      '防松螺母 M12 磷化',
      'M12x1.75',
      'S45C',
      'MP',
      '7318.16',
      'SETS',
      '3.05',
      'USD',
      '0.026',
      '0.029',
      '600',
      'JAPAN',
    ],
  ];

  const papaUnparse =
    (Papa as unknown as { unparse?: typeof Papa.unparse; default?: typeof Papa })
      .unparse ??
    (Papa as unknown as { default?: typeof Papa }).default?.unparse;

  const csvBody = papaUnparse
    ? papaUnparse({
        fields: [...PRODUCT_IMPORT_TEMPLATE_HEADERS],
        data: sampleRows,
      })
    : [PRODUCT_IMPORT_TEMPLATE_HEADERS.join(','), ...sampleRows.map((r) => r.join(','))].join(
        '\r\n',
      );

  // UTF-8 BOM ensures Excel opens Chinese headers cleanly without mojibake
  return `\uFEFF${csvBody}`;
}

export function triggerProductTemplateDownload(): void {
  const csv = buildProductImportTemplateCsv();
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'hardlock-product-import-template.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function normalizeHeaderKey(raw: string): string {
  return String(raw ?? '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_\-()（）/.,:：]+/g, '');
}

function normalizeRowMap(row: Record<string, unknown>): Map<string, string> {
  const map = new Map<string, string>();
  for (const [k, v] of Object.entries(row)) {
    const norm = normalizeHeaderKey(k);
    if (!norm) continue;
    const val = v == null ? '' : String(v).trim();
    map.set(norm, val);
  }
  return map;
}

function pickField(map: Map<string, string>, aliases: string[]): string {
  for (const alias of aliases) {
    const norm = normalizeHeaderKey(alias);
    const val = map.get(norm);
    if (val !== undefined && val !== '') {
      return val;
    }
  }
  return '';
}

function parseNonNegNumber(
  raw: string,
  fallback: number,
): { ok: true; value: number } | { ok: false } {
  if (!raw) return { ok: true, value: fallback };
  const cleaned = raw.replace(/[,$\s¥€]/g, '');
  const num = Number(cleaned);
  if (!Number.isFinite(num) || num < 0) return { ok: false };
  return { ok: true, value: num };
}

export interface ProductImportResult {
  products: Product[];
  createdCount: number;
  updatedCount: number;
  errors: string[];
}

export function mapImportedProductRows(
  rows: Record<string, unknown>[],
  existingProducts: Product[],
): ProductImportResult {
  const existingBySku = new Map<string, Product>();
  for (const p of existingProducts) {
    existingBySku.set(p.sku.trim().toLowerCase(), p);
  }

  const parsedMap = new Map<string, Product>();
  const errors: string[] = [];
  let createdCount = 0;
  let updatedCount = 0;

  rows.forEach((rawRow, idx) => {
    const rowNum = idx + 2; // 1-indexed spreadsheet row (header = row 1)
    const map = normalizeRowMap(rawRow);
    const hasAnyValue = Array.from(map.values()).some((v) => v.length > 0);
    if (!hasAnyValue) return;

    const sku = pickField(map, [
      '产品编号(SKU)',
      '产品编号',
      '产品编码',
      '型号',
      'sku',
      'itemcode',
      'partno',
      'code',
    ]);
    const nameEn = pickField(map, [
      '英文品名(Name)',
      '英文品名',
      '名称',
      '品名',
      '产品名称',
      'nameEn',
      'name',
      'description',
    ]);
    const nameLocal = pickField(map, [
      '中文/日文品名',
      '中文品名',
      '日文品名',
      '本地名称',
      'nameLocal',
    ]);
    const size = pickField(map, ['规格尺寸(Size)', '规格尺寸', '规格', 'size']);
    const material = pickField(map, ['材质(Material)', '材质', 'material']);
    const surfaceFinish = pickField(map, [
      '表面处理(Finish)',
      '表面处理',
      'surfaceFinish',
      'finish',
    ]);
    const hsCode = pickField(map, ['HS编码', 'hsCode', '海关编码']);
    const unit = pickField(map, ['单位(Unit)', '单位', 'unit']);
    const priceRaw = pickField(map, [
      '基础单价(Unit Price)',
      '基础单价',
      '单价',
      'unitPrice',
      'price',
    ]);
    const currencyRaw = pickField(map, ['币种(Currency)', '币种', 'currency']).toUpperCase();
    const nwRaw = pickField(map, [
      '单件净重kg(N.W)',
      '单件净重',
      '净重',
      'unitNetWeightKg',
      'nw',
      'uw',
    ]);
    const gwRaw = pickField(map, [
      '单件毛重kg(G.W)',
      '单件毛重',
      '毛重',
      'unitGrossWeightKg',
      'gw',
    ]);
    const pcsRaw = pickField(map, [
      '每箱数量(Pcs/Ctn)',
      '每箱数量',
      '每箱套数',
      'defaultUnitsPerCarton',
      'pcsPerCtn',
    ]);
    const originCountry = pickField(map, [
      '原产地(Origin)',
      '原产地',
      'originCountry',
      'origin',
    ]);

    if (!sku) {
      errors.push(`Row ${rowNum}: 缺少产品编号 (SKU)`);
      return;
    }

    const existing = existingBySku.get(sku.toLowerCase());
    if (!nameEn && !existing?.nameEn) {
      errors.push(`Row ${rowNum} (${sku}): 缺少产品名称`);
      return;
    }

    const priceRes = parseNonNegNumber(priceRaw, existing?.unitPrice ?? 0);
    if (!priceRes.ok) {
      errors.push(`Row ${rowNum} (${sku}): 基础单价无效 "${priceRaw}"`);
      return;
    }

    const nwRes = parseNonNegNumber(nwRaw, existing?.unitNetWeightKg ?? 0.05);
    const gwRes = parseNonNegNumber(
      gwRaw,
      existing?.unitGrossWeightKg ?? (nwRes.ok ? nwRes.value * 1.08 : 0.055),
    );
    const pcsRes = parseNonNegNumber(
      pcsRaw,
      existing?.defaultUnitsPerCarton ?? 100,
    );
    if (!nwRes.ok || !gwRes.ok || !pcsRes.ok) {
      errors.push(`Row ${rowNum} (${sku}): 重量或每箱数量必须为非负数字`);
      return;
    }

    const currency: CurrencyCode = VALID_CURRENCIES.has(currencyRaw as CurrencyCode)
      ? (currencyRaw as CurrencyCode)
      : existing?.currency ?? 'USD';

    const generatedId =
      existing?.id ??
      sanitizeId(
        `prod-${sku.toLowerCase()}-${idx + 1}`,
        `prod-${Date.now()}-${idx}`,
      );

    const product: Product = {
      id: generatedId,
      sku,
      nameEn: nameEn || existing?.nameEn || sku,
      nameLocal: nameLocal || existing?.nameLocal || '',
      size: size || existing?.size || '',
      material: material || existing?.material || '',
      surfaceFinish: surfaceFinish || existing?.surfaceFinish || '',
      hsCode: hsCode || existing?.hsCode || '7318.16',
      unit: unit || existing?.unit || 'SETS',
      unitPrice: priceRes.value,
      currency,
      unitNetWeightKg: nwRes.value,
      unitGrossWeightKg: gwRes.value,
      defaultUnitsPerCarton: Math.max(1, Math.round(pcsRes.value)),
      cartonLengthCm: existing?.cartonLengthCm ?? 33,
      cartonWidthCm: existing?.cartonWidthCm ?? 25,
      cartonHeightCm: existing?.cartonHeightCm ?? 12,
      originCountry: originCountry || existing?.originCountry || 'JAPAN',
    };

    if (!parsedMap.has(sku.toLowerCase())) {
      if (existing) {
        updatedCount += 1;
      } else {
        createdCount += 1;
      }
    }
    parsedMap.set(sku.toLowerCase(), product);
  });

  return {
    products: Array.from(parsedMap.values()),
    createdCount,
    updatedCount,
    errors,
  };
}

export function parseCsvProductsText(
  csvText: string,
  existingProducts: Product[],
): ProductImportResult {
  const cleaned = csvText.replace(/^\uFEFF/, '');
  const papaParse =
    (Papa as unknown as { parse?: typeof Papa.parse; default?: typeof Papa })
      .parse ??
    (Papa as unknown as { default?: typeof Papa }).default?.parse;

  if (!papaParse) {
    throw new Error('PapaParse parser unavailable');
  }

  const parsed = papaParse<Record<string, unknown>>(cleaned, {
    header: true,
    skipEmptyLines: true,
  });

  const rows = Array.isArray(parsed.data) ? parsed.data : [];
  const result = mapImportedProductRows(rows, existingProducts);
  if (parsed.errors && parsed.errors.length > 0 && result.products.length === 0) {
    return {
      ...result,
      errors: [
        ...parsed.errors.slice(0, 5).map((e) => `CSV Parse Error: ${e.message}`),
        ...result.errors,
      ],
    };
  }
  return result;
}

export function parseExcelProductsBuffer(
  buffer: ArrayBuffer,
  existingProducts: Product[],
): ProductImportResult {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return { products: [], createdCount: 0, updatedCount: 0, errors: ['Excel 文件不包含工作表'] };
  }
  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
  });
  return mapImportedProductRows(rows, existingProducts);
}

export async function parseProductImportFile(
  file: File,
  existingProducts: Product[],
): Promise<ProductImportResult> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv')) {
    const text = await file.text();
    return parseCsvProductsText(text, existingProducts);
  }
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const buffer = await file.arrayBuffer();
    return parseExcelProductsBuffer(buffer, existingProducts);
  }
  return {
    products: [],
    createdCount: 0,
    updatedCount: 0,
    errors: ['不支持的文件格式，请上传 .csv、.xlsx 或 .xls 文件'],
  };
}

// ---------------------------------------------------------------------------
// 3. Export Documents / Orders to Excel (.xlsx via SheetJS)
// ---------------------------------------------------------------------------

export interface OrderExcelDetailRow {
  订单号: string;
  客户PO号: string;
  单据日期: string;
  客户名称: string;
  产品编号: string;
  产品明细: string;
  数量: number;
  单位: string;
  单价: number;
  总价: number;
  币种: string;
  贸易术语: string;
  运输方式: string;
  订单总价: number;
}

export interface OrderExcelSummaryRow {
  订单号: string;
  客户PO号: string;
  单据日期: string;
  客户名称: string;
  产品明细汇总: string;
  总数量: number;
  总箱数: number;
  '总净重(kg)': number;
  '总毛重(kg)': number;
  币种: string;
  贸易术语: string;
  总价: number;
}

export function buildOrderExcelRows(
  orders: ExportOrder[],
  customers: Customer[],
): OrderExcelDetailRow[] {
  const rows: OrderExcelDetailRow[] = [];

  for (const order of orders) {
    const customer = customers.find((c) => c.id === order.customerId);
    const customerName = customer?.name ?? '—';
    const summary = calculateOrderSummary(
      order.items,
      order.costs,
      order.shipping.incoterm,
      order.currency,
    );

    if (order.items.length === 0) {
      rows.push({
        订单号: order.invoiceNo,
        客户PO号: order.poNo,
        单据日期: order.orderDate,
        客户名称: customerName,
        产品编号: '—',
        产品明细: '（无产品明细）',
        数量: 0,
        单位: '—',
        单价: 0,
        总价: 0,
        币种: order.currency,
        贸易术语: order.shipping.incoterm,
        运输方式: order.shipping.mode,
        订单总价: summary.incotermTotal,
      });
      continue;
    }

    order.items.forEach((item, idx) => {
      const calc = summary.lineItems[idx];
      const specParts = [item.size, item.material, item.surfaceFinish].filter(
        Boolean,
      );
      const detailText =
        specParts.length > 0
          ? `${item.description} (${specParts.join(' / ')})`
          : item.description;

      rows.push({
        订单号: order.invoiceNo,
        客户PO号: order.poNo,
        单据日期: order.orderDate,
        客户名称: customerName,
        产品编号: item.sku || '—',
        产品明细: detailText || item.sku || '—',
        数量: item.quantity,
        单位: item.unit,
        单价: item.unitPrice,
        总价: calc?.amount ?? item.quantity * item.unitPrice,
        币种: order.currency,
        贸易术语: order.shipping.incoterm,
        运输方式: order.shipping.mode,
        订单总价: summary.incotermTotal,
      });
    });
  }

  return rows;
}

export function buildOrderSummaryExcelRows(
  orders: ExportOrder[],
  customers: Customer[],
): OrderExcelSummaryRow[] {
  return orders.map((order) => {
    const customer = customers.find((c) => c.id === order.customerId);
    const summary = calculateOrderSummary(
      order.items,
      order.costs,
      order.shipping.incoterm,
      order.currency,
    );
    const itemsPreview =
      order.items.length > 0
        ? order.items
            .map((i) => `${i.sku || i.description} × ${i.quantity}`)
            .join('; ')
        : '（无产品明细）';

    return {
      订单号: order.invoiceNo,
      客户PO号: order.poNo,
      单据日期: order.orderDate,
      客户名称: customer?.name ?? '—',
      产品明细汇总: itemsPreview,
      总数量: summary.totalQuantity,
      总箱数: summary.totalCartons,
      '总净重(kg)': summary.totalNetWeightKg,
      '总毛重(kg)': summary.totalGrossWeightKg,
      币种: order.currency,
      贸易术语: order.shipping.incoterm,
      总价: summary.incotermTotal,
    };
  });
}

export function buildOrdersWorkbook(
  orders: ExportOrder[],
  customers: Customer[],
): XLSX.WorkBook {
  const detailRows = buildOrderExcelRows(orders, customers);
  const summaryRows = buildOrderSummaryExcelRows(orders, customers);

  const wb = XLSX.utils.book_new();

  const detailSheet = XLSX.utils.json_to_sheet(detailRows);
  detailSheet['!cols'] = [
    { wch: 18 },
    { wch: 14 },
    { wch: 12 },
    { wch: 28 },
    { wch: 18 },
    { wch: 34 },
    { wch: 10 },
    { wch: 8 },
    { wch: 12 },
    { wch: 14 },
    { wch: 8 },
    { wch: 10 },
    { wch: 10 },
    { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, detailSheet, '订单明细');

  const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
  summarySheet['!cols'] = [
    { wch: 18 },
    { wch: 14 },
    { wch: 12 },
    { wch: 28 },
    { wch: 42 },
    { wch: 10 },
    { wch: 10 },
    { wch: 12 },
    { wch: 12 },
    { wch: 8 },
    { wch: 10 },
    { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, summarySheet, '订单汇总');

  return wb;
}

export function exportOrdersToExcel(
  orders: ExportOrder[],
  customers: Customer[],
  filenamePrefix = 'hardlock-export-orders',
): void {
  if (orders.length === 0) return;
  const wb = buildOrdersWorkbook(orders, customers);
  const dateStamp = new Date().toISOString().slice(0, 10);
  const safePrefix = filenamePrefix.replace(/[^a-zA-Z0-9_\-]/g, '_');
  XLSX.writeFile(wb, `${safePrefix}-${dateStamp}.xlsx`);
}
