import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import type {
  BankAccount,
  CurrencyCode,
  Customer,
  DocLanguage,
  ExportOrder,
  OrderItem,
  PriceTier,
  Product,
  Supplier,
  TransportMode,
} from '../types/erp';
import {
  calculateOrderSummary,
  getDefaultExchangeRate,
  resolveEffectiveExchangeRate,
  roundByCurrency,
} from './exportCalculations';
import {
  buildPackingListDisplayRows,
  extractSurfaceFootnotes,
  formatCompactHsCode,
  formatCurrencyLabel,
  formatDocMoney,
  formatDocumentDate,
  resolveItemSpecs,
} from './documentHelpers';
import { sanitizeId } from './firestoreSanitizers';

const VALID_CURRENCIES = new Set<CurrencyCode>(['USD', 'JPY', 'EUR', 'CNY']);
const PREPAID_INCOTERMS = new Set([
  'CFR',
  'CIF',
  'CPT',
  'CIP',
  'DAP',
  'DPU',
  'DDP',
]);

// ---------------------------------------------------------------------------
// 1. Customer-Specific & Quantity-Tiered Pricing + JPY Base Conversion
// ---------------------------------------------------------------------------

export type ResolvedPriceSource =
  | 'customer_tier'
  | 'customer_flat'
  | 'product_tier'
  | 'product_base';

export interface ResolvedPricingResult {
  unitPrice: number;
  basePriceJpy: number;
  isCustom: boolean;
  isTiered: boolean;
  matchedTierLabel?: string;
  source: ResolvedPriceSource;
}

export function matchTierPrice(
  tiers: PriceTier[] | undefined,
  quantity: number,
): PriceTier | undefined {
  if (!Array.isArray(tiers) || tiers.length === 0) return undefined;
  const qty = Math.max(0, Number(quantity) || 0);
  const matching = tiers.filter(
    (t) =>
      Number.isFinite(t.minQty) &&
      Number.isFinite(t.unitPrice) &&
      qty >= t.minQty &&
      (t.maxQty === null || t.maxQty === undefined || qty <= t.maxQty),
  );
  if (matching.length === 0) return undefined;
  matching.sort((a, b) => b.minQty - a.minQty);
  return matching[0];
}

export function formatTierRangeLabel(tier: PriceTier): string {
  return tier.maxQty === null || tier.maxQty === undefined
    ? `${tier.minQty}+`
    : `${tier.minQty}-${tier.maxQty}`;
}

export function convertJpyToCurrency(
  jpyAmount: number,
  targetCurrency: CurrencyCode,
  exchangeRate?: number,
): number {
  const safeJpy = Number.isFinite(jpyAmount) ? jpyAmount : 0;
  if (targetCurrency === 'JPY') {
    return roundByCurrency(safeJpy, 'JPY');
  }
  const rate = resolveEffectiveExchangeRate(targetCurrency, exchangeRate);
  return roundByCurrency(safeJpy / rate, targetCurrency);
}

export function convertPriceToJpy(
  price: number,
  sourceCurrency: CurrencyCode,
  exchangeRate?: number,
): number {
  const safe = Number.isFinite(price) ? price : 0;
  if (sourceCurrency === 'JPY') return safe;
  const rate = resolveEffectiveExchangeRate(sourceCurrency, exchangeRate);
  return safe * rate;
}

export function resolveCustomerProductPricing(
  customer: Customer | undefined,
  product: Product,
  quantity = 1,
  orderCurrency?: CurrencyCode,
  exchangeRate?: number,
): ResolvedPricingResult {
  const custEntry = Array.isArray(customer?.customPrices)
    ? customer.customPrices.find((entry) => entry.productId === product.id)
    : undefined;

  let rawPrice = product.unitPrice;
  let isCustom = false;
  let isTiered = false;
  let matchedTierLabel: string | undefined;
  let source: ResolvedPriceSource = 'product_base';

  const custTier = matchTierPrice(custEntry?.tieredPrices, quantity);
  if (custTier) {
    rawPrice = custTier.unitPrice;
    isCustom = true;
    isTiered = true;
    matchedTierLabel = formatTierRangeLabel(custTier);
    source = 'customer_tier';
  } else if (
    custEntry &&
    typeof custEntry.unitPrice === 'number' &&
    Number.isFinite(custEntry.unitPrice) &&
    custEntry.unitPrice >= 0 &&
    (custEntry.unitPrice > 0 || !custEntry.tieredPrices?.length)
  ) {
    rawPrice = custEntry.unitPrice;
    isCustom = true;
    isTiered = false;
    source = 'customer_flat';
  } else {
    const prodTier = matchTierPrice(product.tieredPrices, quantity);
    if (prodTier) {
      rawPrice = prodTier.unitPrice;
      isCustom = false;
      isTiered = true;
      matchedTierLabel = formatTierRangeLabel(prodTier);
      source = 'product_tier';
    }
  }

  const productCurrency: CurrencyCode = product.currency || 'JPY';
  const basePriceJpy =
    productCurrency === 'JPY'
      ? rawPrice
      : convertPriceToJpy(rawPrice, productCurrency);

  const targetCurrency: CurrencyCode = orderCurrency ?? productCurrency;
  let unitPrice: number;
  if (
    orderCurrency === undefined ||
    (targetCurrency === productCurrency && exchangeRate === undefined)
  ) {
    unitPrice = rawPrice;
  } else if (targetCurrency === 'JPY') {
    unitPrice =
      productCurrency === 'JPY'
        ? roundByCurrency(rawPrice, 'JPY')
        : roundByCurrency(basePriceJpy, 'JPY');
  } else if (targetCurrency === productCurrency) {
    unitPrice = roundByCurrency(rawPrice, targetCurrency);
  } else {
    unitPrice = convertJpyToCurrency(basePriceJpy, targetCurrency, exchangeRate);
  }

  return {
    unitPrice,
    basePriceJpy,
    isCustom,
    isTiered,
    matchedTierLabel,
    source,
  };
}

export function resolveCustomerProductPrice(
  customer: Customer | undefined,
  product: Product,
  quantity = 1,
  orderCurrency?: CurrencyCode,
  exchangeRate?: number,
): { unitPrice: number; isCustom: boolean } {
  const res = resolveCustomerProductPricing(
    customer,
    product,
    quantity,
    orderCurrency,
    exchangeRate,
  );
  return {
    unitPrice: res.unitPrice,
    isCustom: res.isCustom,
  };
}

export function applyCustomerPricingToItems(
  items: OrderItem[],
  customer: Customer | undefined,
  products: Product[],
  orderCurrency?: CurrencyCode,
  exchangeRate?: number,
): OrderItem[] {
  return items.map((item) => {
    if (!item.productId) {
      if (
        orderCurrency &&
        typeof item.baseUnitPriceJpy === 'number' &&
        Number.isFinite(item.baseUnitPriceJpy) &&
        item.baseUnitPriceJpy > 0
      ) {
        return {
          ...item,
          unitPrice: convertJpyToCurrency(
            item.baseUnitPriceJpy,
            orderCurrency,
            exchangeRate,
          ),
        };
      }
      return item;
    }
    const prod = products.find((p) => p.id === item.productId);
    if (!prod) return item;
    const resolved = resolveCustomerProductPricing(
      customer,
      prod,
      item.quantity,
      orderCurrency,
      exchangeRate,
    );
    return {
      ...item,
      unitPrice: resolved.unitPrice,
      baseUnitPriceJpy: resolved.basePriceJpy,
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
      '195',
      'JPY',
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
      '450',
      'JPY',
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
    : [
        PRODUCT_IMPORT_TEMPLATE_HEADERS.join(','),
        ...sampleRows.map((r) => r.join(',')),
      ].join('\r\n');

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
    const rowNum = idx + 2;
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
    const currencyRaw = pickField(map, [
      '币种(Currency)',
      '币种',
      'currency',
    ]).toUpperCase();
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
      : existing?.currency ?? 'JPY';

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
      tieredPrices: existing?.tieredPrices ?? [],
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
    return {
      products: [],
      createdCount: 0,
      updatedCount: 0,
      errors: ['Excel 文件不包含工作表'],
    };
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
// 3. Formal 2-Sheet Invoice + Packing List Excel Workbook (.xlsx via SheetJS)
// ---------------------------------------------------------------------------

export interface FormalDocExportContext {
  customer?: Customer;
  billToCustomer?: Customer;
  supplier?: Supplier;
  bank?: BankAccount;
  products: Product[];
  docLang?: DocLanguage;
}

function getShortPlace(place: string | undefined): string {
  const raw = (place ?? '').trim();
  if (!raw) return '';
  return raw.split(',')[0].trim();
}

function getModeFreightLabel(mode: TransportMode): string {
  switch (mode) {
    case 'SEA':
      return 'Ocean freight';
    case 'AIR':
      return 'Air freight';
    case 'EXPRESS':
      return 'Express freight';
    case 'LAND':
      return 'Land freight';
  }
}

function formatWeight1(kg: number): string {
  const safe = Number.isFinite(kg) ? kg : 0;
  return safe.toLocaleString('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function buildPartyExcelLines(
  heading: string,
  party: Customer | undefined,
): string[] {
  const lines: string[] = [heading];
  lines.push((party?.name || '—').toUpperCase());
  if (party?.address) {
    party.address
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .forEach((l) => lines.push(l));
  }
  if (party?.country) lines.push(party.country);
  if (party?.contactName) lines.push(`Attn : ${party.contactName}`);
  if (party?.phone) lines.push(`Mobile : ${party.phone}`);
  if (party?.fax) lines.push(`Fax : ${party.fax}`);
  if (party?.taxOrImporterId) lines.push(`Tax ID : ${party.taxOrImporterId}`);
  return lines;
}

export function buildFormalDocumentWorkbook(
  order: ExportOrder,
  ctx: FormalDocExportContext,
): XLSX.WorkBook {
  const docLang = ctx.docLang ?? 'en';
  const supplier = ctx.supplier;
  const customer = ctx.customer;
  const billTo = ctx.billToCustomer ?? customer;
  const bank = ctx.bank;
  const products = ctx.products ?? [];

  const summary = calculateOrderSummary(
    order.items,
    order.costs,
    order.shipping.incoterm,
    order.currency,
  );
  const placeShort = getShortPlace(
    order.shipping.incotermPlace || order.shipping.portOfDischarge,
  );
  const footnotes = extractSurfaceFootnotes(
    order.items,
    products,
    order.surfaceFootnotes,
  );
  const pallets = order.palletCount ?? 0;
  const emptyCartons = order.emptyCartons ?? 0;
  const firstItem = order.items[0];
  const primaryUnit = (firstItem?.unit || 'sets').toLowerCase();
  const cartonDims = firstItem
    ? `${firstItem.cartonLengthCm} x ${firstItem.cartonWidthCm} x ${firstItem.cartonHeightCm} cm`
    : '33 x 25 x 12 cm';
  const originCountry = (
    firstItem?.originCountry ||
    supplier?.country ||
    'JAPAN'
  ).toUpperCase();
  const originSentence =
    originCountry.charAt(0) + originCountry.slice(1).toLowerCase();
  const isPrepaid = PREPAID_INCOTERMS.has(order.shipping.incoterm);
  const freightLabel = isPrepaid ? 'FREIGHT PREPAID' : 'FREIGHT COLLECT';
  const displayDate = formatDocumentDate(order.orderDate, docLang);
  const shipmentDate = formatDocumentDate(
    order.shipping.etd || order.orderDate,
    docLang,
  );
  const etdDisplay = order.shipping.etd
    ? formatDocumentDate(order.shipping.etd, docLang)
    : '';
  const etaDisplay = order.shipping.eta
    ? formatDocumentDate(order.shipping.eta, docLang)
    : '';
  const effectiveRate = resolveEffectiveExchangeRate(
    order.currency,
    order.exchangeRate,
  );

  // ---------------- SHEET 1: INVOICE (11 columns A..K) ----------------
  const invAoa: (string | number)[][] = [];
  const invMerges: XLSX.Range[] = [];

  const pushInvMergedRow = (text: string, colStart = 0, colEnd = 10) => {
    const r = invAoa.length;
    const row = new Array(11).fill('') as (string | number)[];
    row[colStart] = text;
    invAoa.push(row);
    if (colEnd > colStart) {
      invMerges.push({ s: { r, c: colStart }, e: { r, c: colEnd } });
    }
    return r;
  };

  // Letterhead
  pushInvMergedRow(supplier?.name || 'HARDLOCK Industry Co., Ltd.');
  const supAddrLines = (
    supplier?.address ||
    '1-6-24, Kawamata, Higashi Osaka\nOsaka, Japan 577-0063'
  )
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  {
    const r = invAoa.length;
    const row = new Array(11).fill('') as (string | number)[];
    row[0] = supAddrLines[0] ?? '';
    row[9] = `Tel : ${supplier?.phone || '81-6-6784-1131'}`;
    invAoa.push(row);
    invMerges.push({ s: { r, c: 0 }, e: { r, c: 7 } });
    invMerges.push({ s: { r, c: 9 }, e: { r, c: 10 } });
  }
  {
    const r = invAoa.length;
    const row = new Array(11).fill('') as (string | number)[];
    row[0] = supAddrLines.slice(1).join(' ');
    row[9] = supplier?.fax ? `Fax : ${supplier.fax}` : '';
    invAoa.push(row);
    invMerges.push({ s: { r, c: 0 }, e: { r, c: 7 } });
    invMerges.push({ s: { r, c: 9 }, e: { r, c: 10 } });
  }
  if (supplier?.taxOrExporterId) {
    pushInvMergedRow(`Tax / Exporter ID : ${supplier.taxOrExporterId}`, 0, 7);
  }
  invAoa.push(new Array(11).fill(''));

  // Title & Ref
  pushInvMergedRow('INVOICE');
  pushInvMergedRow(`No. ${order.invoiceNo}`);
  {
    const r = invAoa.length;
    const row = new Array(11).fill('') as (string | number)[];
    row[9] = `Date : ${displayDate}`;
    invAoa.push(row);
    invMerges.push({ s: { r, c: 9 }, e: { r, c: 10 } });
  }

  // BILL TO & SHIP TO
  for (const line of buildPartyExcelLines('BILL TO :', billTo)) {
    pushInvMergedRow(line, 0, 8);
  }
  invAoa.push(new Array(11).fill(''));
  for (const line of buildPartyExcelLines('SHIP TO :', customer)) {
    pushInvMergedRow(line, 0, 8);
  }
  invAoa.push(new Array(11).fill(''));

  // Shipment info
  pushInvMergedRow(`Shipment : on ${shipmentDate}`, 0, 7);
  pushInvMergedRow(
    `Loading port : ${order.shipping.portOfLoading || '—'}${
      order.shipping.vesselOrFlightOrCourier
        ? ` by "${order.shipping.vesselOrFlightOrCourier}"`
        : ''
    }${etdDisplay ? ` ETD ${etdDisplay}` : ''}`,
    0,
    8,
  );
  pushInvMergedRow(
    `Destination : ${order.shipping.portOfDischarge || '—'}${
      etaDisplay ? ` ETA ${etaDisplay}` : ''
    }`,
    0,
    8,
  );

  // ITEM header + Currency + Exchange Rate
  {
    const r = invAoa.length;
    const row = new Array(11).fill('') as (string | number)[];
    row[0] = `ITEM : ${order.itemHeader?.trim() || 'HARDLOCK NUT (HLN)'}`;
    row[7] = '*Seller -> Buyer transaction value only';
    invAoa.push(row);
    invMerges.push({ s: { r, c: 0 }, e: { r, c: 5 } });
    invMerges.push({ s: { r, c: 7 }, e: { r, c: 10 } });
  }
  {
    const r = invAoa.length;
    const row = new Array(11).fill('') as (string | number)[];
    row[8] = `*Currency : ${formatCurrencyLabel(order.currency)}`;
    invAoa.push(row);
    invMerges.push({ s: { r, c: 8 }, e: { r, c: 10 } });
  }
  if (order.currency !== 'JPY') {
    const r = invAoa.length;
    const row = new Array(11).fill('') as (string | number)[];
    row[8] = `*Exchange Rate : 1 ${order.currency} = ${effectiveRate} JPY`;
    invAoa.push(row);
    invMerges.push({ s: { r, c: 8 }, e: { r, c: 10 } });
  }

  // Invoice 2-row header
  {
    const h1 = invAoa.length;
    invAoa.push([
      'Item No.',
      'Item code',
      'Size',
      'Material',
      'Surface Finish',
      'HS code',
      `Q'ty (${primaryUnit})`,
      'U.W (kg)',
      'N.W (kg)',
      `${order.shipping.incoterm} ${placeShort} in ${order.currency}`,
      '',
    ]);
    const h2 = invAoa.length;
    invAoa.push(['', '', '', '', '', '', '', '', '', 'U. Price', 'Amount']);
    for (let c = 0; c <= 8; c++) {
      invMerges.push({ s: { r: h1, c }, e: { r: h2, c } });
    }
    invMerges.push({ s: { r: h1, c: 9 }, e: { r: h1, c: 10 } });
  }

  // Line items
  order.items.forEach((item, idx) => {
    const prod = products.find((p) => p.id === item.productId);
    const specs = resolveItemSpecs(item, prod);
    const calc = summary.lineItems[idx];
    invAoa.push([
      idx + 1,
      item.sku || '—',
      specs.size,
      specs.material,
      specs.surfaceFinish,
      formatCompactHsCode(item.hsCode),
      item.quantity,
      Number((item.unitNetWeightKg || 0).toFixed(4)),
      Number((calc?.netWeightKg ?? 0).toFixed(1)),
      item.unitPrice,
      calc?.amount ?? 0,
    ]);
  });

  // Subtotal row aligned under Q'ty and N.W
  {
    const r = invAoa.length;
    const row = new Array(11).fill('') as (string | number)[];
    row[0] = footnotes[0] ?? '';
    row[6] = summary.totalQuantity;
    row[8] = Number(summary.totalNetWeightKg.toFixed(1));
    invAoa.push(row);
    invMerges.push({ s: { r, c: 0 }, e: { r, c: 5 } });
  }

  // Cost breakdown
  const costRows: { label: string; amount: number }[] = [
    { label: 'Ex-works Total', amount: summary.exwTotal },
  ];
  if (summary.flags.includesInland && summary.inlandFreightCost > 0) {
    costRows.push({
      label: 'FOB charge & Inland freight',
      amount: summary.inlandFreightCost,
    });
  }
  if (summary.flags.includesMainFreight && summary.mainFreightCost > 0) {
    costRows.push({
      label: getModeFreightLabel(order.shipping.mode),
      amount: summary.mainFreightCost,
    });
  }
  if (summary.flags.includesInsurance && summary.insuranceCost > 0) {
    costRows.push({ label: 'Insurance', amount: summary.insuranceCost });
  }
  if (
    summary.flags.includesDestinationHandling &&
    summary.destinationHandlingCost > 0
  ) {
    costRows.push({
      label: 'Destination handling',
      amount: summary.destinationHandlingCost,
    });
  }
  if (summary.flags.includesImportDuty && summary.importDutyTaxCost > 0) {
    costRows.push({
      label: 'Import duty & tax',
      amount: summary.importDutyTaxCost,
    });
  }

  costRows.forEach((cr, rIdx) => {
    const r = invAoa.length;
    const row = new Array(11).fill('') as (string | number)[];
    row[0] =
      rIdx === 0 ? footnotes[1] ?? '' : rIdx === 1 ? footnotes[2] ?? '' : '';
    row[6] = cr.label;
    row[10] = formatDocMoney(cr.amount, order.currency);
    invAoa.push(row);
    invMerges.push({ s: { r, c: 0 }, e: { r, c: 5 } });
    invMerges.push({ s: { r, c: 6 }, e: { r, c: 9 } });
  });

  // Final Incoterm Total
  {
    const r = invAoa.length;
    const row = new Array(11).fill('') as (string | number)[];
    row[6] = `${order.shipping.incoterm} ${placeShort}`;
    row[10] = formatDocMoney(summary.incotermTotal, order.currency);
    invAoa.push(row);
    invMerges.push({ s: { r, c: 6 }, e: { r, c: 9 } });
  }

  invAoa.push(new Array(11).fill(''));

  // Lower Packing + Freight Prepaid & Origin
  pushInvMergedRow(
    `Packing : ${pallets > 0 ? `${pallets} pallets (` : ''}${
      summary.totalCartons
    } cartons total${emptyCartons > 0 ? ` + ${emptyCartons} empty carton` : ''}${
      pallets > 0 ? ')' : ''
    }`,
    0,
    7,
  );
  pushInvMergedRow(`Carton size : ${cartonDims}`, 0, 7);
  pushInvMergedRow(
    `N/W : approx. ${formatWeight1(summary.totalNetWeightKg)} kg`,
    0,
    7,
  );
  {
    const r = invAoa.length;
    const row = new Array(11).fill('') as (string | number)[];
    row[0] = `G/W : approx. ${formatWeight1(summary.totalGrossWeightKg)} kg`;
    row[8] = freightLabel;
    invAoa.push(row);
    invMerges.push({ s: { r, c: 0 }, e: { r, c: 7 } });
    invMerges.push({ s: { r, c: 8 }, e: { r, c: 10 } });
  }
  {
    const r = invAoa.length;
    const row = new Array(11).fill('') as (string | number)[];
    row[0] = `Vol. : approx. ${summary.totalCbm.toFixed(3)}M3`;
    row[8] = `COUNTRY OF ORIGIN : ${originCountry}`;
    invAoa.push(row);
    invMerges.push({ s: { r, c: 0 }, e: { r, c: 7 } });
    invMerges.push({ s: { r, c: 8 }, e: { r, c: 10 } });
  }

  invAoa.push(new Array(11).fill(''));

  // Payment Terms & Bank Info
  pushInvMergedRow(`Payment terms : ${order.paymentTerms || '—'}`, 0, 10);
  pushInvMergedRow('Bank Information', 0, 10);
  if (bank) {
    pushInvMergedRow(
      `${bank.bankName}${bank.swiftCode ? ` (BIC : ${bank.swiftCode})` : ''}`,
      0,
      10,
    );
    if (bank.branchName) pushInvMergedRow(bank.branchName, 0, 10);
    pushInvMergedRow(`Account No. : ${bank.accountNumber}`, 0, 10);
  }
  if (order.remarks) {
    pushInvMergedRow(`Remarks : ${order.remarks}`, 0, 10);
  }

  invAoa.push(new Array(11).fill(''));

  // Footer: Marks + Signatory
  const ctnFooterLine =
    pallets > 1
      ? `CTN NO. 1 / ${pallets} - ${pallets} / ${pallets}`
      : `CTN NO. 1 - ${Math.max(1, summary.totalCartons)}`;
  {
    const r = invAoa.length;
    const row = new Array(11).fill('') as (string | number)[];
    row[0] = order.shipping.shippingMarksMain || '';
    row[7] = supplier?.name || 'HARDLOCK Industry Co., Ltd.';
    invAoa.push(row);
    invMerges.push({ s: { r, c: 0 }, e: { r, c: 5 } });
    invMerges.push({ s: { r, c: 7 }, e: { r, c: 10 } });
  }
  {
    const r = invAoa.length;
    const row = new Array(11).fill('') as (string | number)[];
    row[0] = `HARDLOCK No. ${order.invoiceNo}`;
    row[7] = supplier?.signatoryName || 'Mr. Song Shanghua';
    invAoa.push(row);
    invMerges.push({ s: { r, c: 0 }, e: { r, c: 5 } });
    invMerges.push({ s: { r, c: 7 }, e: { r, c: 10 } });
  }
  {
    const r = invAoa.length;
    const row = new Array(11).fill('') as (string | number)[];
    row[0] = ctnFooterLine;
    row[7] = supplier?.signatoryTitle || 'Overseas Sales';
    invAoa.push(row);
    invMerges.push({ s: { r, c: 0 }, e: { r, c: 5 } });
    invMerges.push({ s: { r, c: 7 }, e: { r, c: 10 } });
  }
  pushInvMergedRow(`MADE IN ${originCountry}`, 0, 5);

  const invoiceSheet = XLSX.utils.aoa_to_sheet(invAoa);
  invoiceSheet['!merges'] = invMerges;
  invoiceSheet['!cols'] = [
    { wch: 8 },
    { wch: 18 },
    { wch: 11 },
    { wch: 13 },
    { wch: 11 },
    { wch: 10 },
    { wch: 11 },
    { wch: 10 },
    { wch: 11 },
    { wch: 13 },
    { wch: 16 },
  ];

  // ---------------- SHEET 2: PACKING LIST (11 columns A..K) ----------------
  const plAoa: (string | number)[][] = [];
  const plMerges: XLSX.Range[] = [];

  const pushPlMergedRow = (text: string, colStart = 0, colEnd = 10) => {
    const r = plAoa.length;
    const row = new Array(11).fill('') as (string | number)[];
    row[colStart] = text;
    plAoa.push(row);
    if (colEnd > colStart) {
      plMerges.push({ s: { r, c: colStart }, e: { r, c: colEnd } });
    }
    return r;
  };

  pushPlMergedRow(supplier?.name || 'HARDLOCK Industry Co., Ltd.');
  {
    const r = plAoa.length;
    const row = new Array(11).fill('') as (string | number)[];
    row[0] = supAddrLines[0] ?? '';
    row[9] = `Tel : ${supplier?.phone || '81-6-6784-1131'}`;
    plAoa.push(row);
    plMerges.push({ s: { r, c: 0 }, e: { r, c: 7 } });
    plMerges.push({ s: { r, c: 9 }, e: { r, c: 10 } });
  }
  {
    const r = plAoa.length;
    const row = new Array(11).fill('') as (string | number)[];
    row[0] = supAddrLines.slice(1).join(' ');
    row[9] = supplier?.fax ? `Fax : ${supplier.fax}` : '';
    plAoa.push(row);
    plMerges.push({ s: { r, c: 0 }, e: { r, c: 7 } });
    plMerges.push({ s: { r, c: 9 }, e: { r, c: 10 } });
  }
  if (supplier?.taxOrExporterId) {
    pushPlMergedRow(`Tax / Exporter ID : ${supplier.taxOrExporterId}`, 0, 7);
  }
  plAoa.push(new Array(11).fill(''));

  pushPlMergedRow('PACKING LIST');
  pushPlMergedRow(`INVOICE No. ${order.invoiceNo}`);
  {
    const r = plAoa.length;
    const row = new Array(11).fill('') as (string | number)[];
    row[9] = `Date : ${displayDate}`;
    plAoa.push(row);
    plMerges.push({ s: { r, c: 9 }, e: { r, c: 10 } });
  }

  for (const line of buildPartyExcelLines('BILL TO :', billTo)) {
    pushPlMergedRow(line, 0, 8);
  }
  plAoa.push(new Array(11).fill(''));
  for (const line of buildPartyExcelLines('DELIVER TO :', customer)) {
    pushPlMergedRow(line, 0, 8);
  }
  plAoa.push(new Array(11).fill(''));

  pushPlMergedRow(`Shipment : on ${shipmentDate}`, 0, 7);
  pushPlMergedRow(
    `Loading port : ${order.shipping.portOfLoading || '—'}${
      order.shipping.vesselOrFlightOrCourier
        ? ` by "${order.shipping.vesselOrFlightOrCourier}"`
        : ''
    }${etdDisplay ? ` ETD ${etdDisplay}` : ''}`,
    0,
    8,
  );
  pushPlMergedRow(
    `Destination : ${order.shipping.portOfDischarge || '—'}${
      etaDisplay ? ` ETA ${etaDisplay}` : ''
    }`,
    0,
    8,
  );

  const compactHsDigits = formatCompactHsCode(firstItem?.hsCode).replace(
    /\./g,
    '',
  );
  pushPlMergedRow(
    `ITEM : ${order.itemHeader?.trim() || 'HARDLOCK NUT'} (HS CODE : ${compactHsDigits})`,
    0,
    9,
  );

  // Table header
  plAoa.push([
    'Pallet No.',
    'Ctn. No.',
    'Item No.',
    'Type',
    'Size',
    'Material',
    'Surface Finish',
    'Description',
    `Q'ty (${primaryUnit})`,
    'U.W (kg)',
    'T.W (kg)',
  ]);

  const displayRows = buildPackingListDisplayRows(
    order.items,
    products,
    order.packingRows,
  );

  displayRows.forEach((dRow) => {
    const r = plAoa.length;
    if (dRow.showPalletCell && dRow.palletRowSpan > 1) {
      plMerges.push({
        s: { r, c: 0 },
        e: { r: r + dRow.palletRowSpan - 1, c: 0 },
      });
    }
    if (dRow.showCtnCell && dRow.ctnRowSpan > 1) {
      plMerges.push({
        s: { r, c: 1 },
        e: { r: r + dRow.ctnRowSpan - 1, c: 1 },
      });
    }
    plAoa.push([
      dRow.showPalletCell ? dRow.palletNo : '',
      dRow.showCtnCell ? dRow.ctnNo : '',
      dRow.itemNo,
      dRow.type || '—',
      dRow.size,
      dRow.material,
      dRow.surfaceFinish,
      `${dRow.setsPerCarton.toLocaleString()} ${dRow.unitLabel} x ${dRow.cartonCount} carton`,
      dRow.qty,
      Number((dRow.unitWeightKg || 0).toFixed(4)),
      Number((dRow.totalWeightKg || 0).toFixed(1)),
    ]);
  });

  const plTotalCartons =
    order.packingRows && order.packingRows.length > 0
      ? displayRows.reduce(
          (sum, r) => sum + (r.isSubRowInSameCtn ? 0 : r.cartonCount),
          0,
        )
      : summary.totalCartons;
  const plTotalQty =
    order.packingRows && order.packingRows.length > 0
      ? displayRows.reduce((sum, r) => sum + r.qty, 0)
      : summary.totalQuantity;
  const plTotalTw =
    order.packingRows && order.packingRows.length > 0
      ? displayRows.reduce((sum, r) => sum + r.totalWeightKg, 0)
      : summary.totalNetWeightKg;

  // Summary row
  {
    const r = plAoa.length;
    const row = new Array(11).fill('') as (string | number)[];
    row[0] = footnotes.join(' | ');
    row[7] = `${plTotalCartons} cartons`;
    row[8] = plTotalQty;
    row[10] = Number(plTotalTw.toFixed(1));
    plAoa.push(row);
    plMerges.push({ s: { r, c: 0 }, e: { r, c: 6 } });
  }

  plAoa.push(new Array(11).fill(''));

  pushPlMergedRow(
    `Packing : ${pallets > 0 ? `${pallets} pallets (` : ''}${plTotalCartons} cartons total${
      emptyCartons > 0 ? ` + ${emptyCartons} empty carton` : ''
    }${pallets > 0 ? ')' : ''}`,
    0,
    7,
  );
  pushPlMergedRow(`Carton size : ${cartonDims}`, 0, 7);
  {
    const r = plAoa.length;
    const row = new Array(11).fill('') as (string | number)[];
    row[0] = `N/W : approx. ${formatWeight1(plTotalTw)} kg`;
    row[8] = `Country of Origin : ${originSentence}`;
    plAoa.push(row);
    plMerges.push({ s: { r, c: 0 }, e: { r, c: 7 } });
    plMerges.push({ s: { r, c: 8 }, e: { r, c: 10 } });
  }
  pushPlMergedRow(
    `G/W : approx. ${formatWeight1(summary.totalGrossWeightKg)} kg`,
    0,
    7,
  );
  pushPlMergedRow(`Vol. : approx. ${summary.totalCbm.toFixed(3)}M3`, 0, 7);
  if (order.palletVolumeDetails) {
    order.palletVolumeDetails
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .forEach((line) => pushPlMergedRow(line, 0, 7));
  }

  plAoa.push(new Array(11).fill(''));
  {
    const r = plAoa.length;
    const row = new Array(11).fill('') as (string | number)[];
    row[0] = order.shipping.shippingMarksMain || '';
    row[7] = supplier?.name || 'HARDLOCK Industry Co., Ltd.';
    plAoa.push(row);
    plMerges.push({ s: { r, c: 0 }, e: { r, c: 5 } });
    plMerges.push({ s: { r, c: 7 }, e: { r, c: 10 } });
  }
  {
    const r = plAoa.length;
    const row = new Array(11).fill('') as (string | number)[];
    row[0] = `HARDLOCK No. ${order.invoiceNo}`;
    row[7] = supplier?.signatoryName || 'Mr. Song Shanghua';
    plAoa.push(row);
    plMerges.push({ s: { r, c: 0 }, e: { r, c: 5 } });
    plMerges.push({ s: { r, c: 7 }, e: { r, c: 10 } });
  }
  {
    const r = plAoa.length;
    const row = new Array(11).fill('') as (string | number)[];
    row[0] = ctnFooterLine;
    row[7] = supplier?.signatoryTitle || 'Overseas Sales';
    plAoa.push(row);
    plMerges.push({ s: { r, c: 0 }, e: { r, c: 5 } });
    plMerges.push({ s: { r, c: 7 }, e: { r, c: 10 } });
  }
  pushPlMergedRow(`MADE IN ${originCountry}`, 0, 5);

  const packingSheet = XLSX.utils.aoa_to_sheet(plAoa);
  packingSheet['!merges'] = plMerges;
  packingSheet['!cols'] = [
    { wch: 9 },
    { wch: 11 },
    { wch: 8 },
    { wch: 18 },
    { wch: 11 },
    { wch: 13 },
    { wch: 11 },
    { wch: 24 },
    { wch: 12 },
    { wch: 10 },
    { wch: 11 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, invoiceSheet, 'INVOICE');
  XLSX.utils.book_append_sheet(wb, packingSheet, 'PACKING LIST');
  return wb;
}

export function exportDocumentToExcel(
  order: ExportOrder,
  ctx: FormalDocExportContext,
): void {
  const wb = buildFormalDocumentWorkbook(order, ctx);
  const safeInv = (order.invoiceNo || 'hardlock-doc').replace(
    /[^a-zA-Z0-9_\-]/g,
    '_',
  );
  XLSX.writeFile(wb, `${safeInv}.xlsx`);
}

// ---------------------------------------------------------------------------
// 4. Batch Order History Export (.xlsx via SheetJS)
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
  汇率: number;
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
  托盘数: number;
  空箱数: number;
  '总净重(kg)': number;
  '总毛重(kg)': number;
  币种: string;
  汇率: number;
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
    const rate = resolveEffectiveExchangeRate(order.currency, order.exchangeRate);

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
        汇率: rate,
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
        汇率: rate,
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
    const rate = resolveEffectiveExchangeRate(order.currency, order.exchangeRate);
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
      托盘数: order.palletCount ?? 0,
      空箱数: order.emptyCartons ?? 0,
      '总净重(kg)': summary.totalNetWeightKg,
      '总毛重(kg)': summary.totalGrossWeightKg,
      币种: order.currency,
      汇率: rate,
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
    { wch: 10 },
    { wch: 10 },
    { wch: 12 },
    { wch: 12 },
    { wch: 8 },
    { wch: 10 },
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

export { getDefaultExchangeRate };
