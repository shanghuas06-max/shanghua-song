import Papa from 'papaparse';
import XlsxStylePkg from 'xlsx-js-style';
import type * as XlsxTypes from 'xlsx-js-style';
import type {
  BankAccount,
  ContractSettings,
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
import {
  createDefaultContractSettings,
  interpolateContractText,
  numberToContractWords,
} from './contractDefaults';
import { sanitizeId } from './firestoreSanitizers';

type XlsxModule = typeof import('xlsx-js-style');
const XLSX: XlsxModule =
  (XlsxStylePkg as unknown as { default?: XlsxModule }).default ?? XlsxStylePkg;

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
// 3. Styled Formal 3-Sheet Commercial Workbook (INVOICE, PACKING LIST, CONTRACT)
// ---------------------------------------------------------------------------

export interface FormalDocExportContext {
  customer?: Customer;
  billToCustomer?: Customer;
  supplier?: Supplier;
  bank?: BankAccount;
  products: Product[];
  docLang?: DocLanguage;
  contractSettings?: ContractSettings;
}

const THIN_BLACK = { style: 'thin', color: { rgb: '000000' } } as const;
const MEDIUM_BLACK = { style: 'medium', color: { rgb: '000000' } } as const;
const DOUBLE_BLACK = {
  style: 'double' as XlsxTypes.BorderType,
  color: { rgb: '000000' },
};
const DOTTED_BLACK = { style: 'dotted', color: { rgb: '64748B' } } as const;

const GRID_BORDER = {
  top: THIN_BLACK,
  bottom: THIN_BLACK,
  left: THIN_BLACK,
  right: THIN_BLACK,
};

function applyCellStyle(
  sheet: XlsxTypes.WorkSheet,
  r: number,
  c: number,
  style: XlsxTypes.CellStyle,
  numFmt?: string,
): void {
  const addr = XLSX.utils.encode_cell({ r, c });
  const cell = sheet[addr] as XlsxTypes.CellObject | undefined;
  if (!cell) {
    sheet[addr] = { v: '', t: 's', s: style } as XlsxTypes.CellObject;
    return;
  }
  const prev = (cell.s ?? {}) as XlsxTypes.CellStyle;
  cell.s = {
    ...prev,
    ...style,
    font: { ...(prev.font ?? {}), ...(style.font ?? {}) },
    alignment: { ...(prev.alignment ?? {}), ...(style.alignment ?? {}) },
    border: { ...(prev.border ?? {}), ...(style.border ?? {}) },
    fill: style.fill ?? prev.fill,
    numFmt: numFmt ?? style.numFmt ?? prev.numFmt,
  };
}

function styleRange(
  sheet: XlsxTypes.WorkSheet,
  rStart: number,
  cStart: number,
  rEnd: number,
  cEnd: number,
  style: XlsxTypes.CellStyle,
  numFmt?: string,
): void {
  for (let r = rStart; r <= rEnd; r++) {
    for (let c = cStart; c <= cEnd; c++) {
      applyCellStyle(sheet, r, c, style, numFmt);
    }
  }
}

function getDocOverride(
  order: ExportOrder,
  key: string,
  fallback: string,
): string {
  const val = order.docOverrides?.[key];
  return val !== undefined ? val : fallback;
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
  overrideName?: string,
  overrideAddress?: string,
): string[] {
  const lines: string[] = [heading];
  lines.push((overrideName || party?.name || '—').toUpperCase());
  const addr = overrideAddress !== undefined ? overrideAddress : party?.address;
  if (addr) {
    addr
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

function appendSpecialFieldsExcelRows(
  aoa: (string | number)[][],
  merges: XlsxTypes.Range[],
  colCount: number,
  order: ExportOrder,
  supplier: Supplier | undefined,
  settings: ContractSettings,
): { stampRow?: number; noteRows: number[] } {
  const special = order.docSpecialFields;
  const noteRows: number[] = [];
  let stampRow: number | undefined;
  const maxCol = colCount - 1;

  if (special?.showCompanyStamp) {
    const r = aoa.length;
    const row = new Array(colCount).fill('') as (string | number)[];
    row[Math.max(0, maxCol - 3)] = `[OFFICIAL SEAL / 公章] ${settings.companyStampLabel || supplier?.name || 'HARDLOCK Industry Co., Ltd.'}`;
    aoa.push(row);
    merges.push({ s: { r, c: Math.max(0, maxCol - 3) }, e: { r, c: maxCol } });
    stampRow = r;
  }

  if (special?.showDisclaimer) {
    const rawText =
      special.disclaimerText?.trim() || settings.defaultDisclaimerText;
    const resolved = interpolateContractText(rawText, order, supplier);
    if (resolved) {
      const r = aoa.length;
      const row = new Array(colCount).fill('') as (string | number)[];
      row[0] = `Disclaimer : ${resolved}`;
      aoa.push(row);
      merges.push({ s: { r, c: 0 }, e: { r, c: maxCol } });
      noteRows.push(r);
    }
  }

  if (special?.customNote?.trim()) {
    const r = aoa.length;
    const row = new Array(colCount).fill('') as (string | number)[];
    row[0] = `Note : ${special.customNote.trim()}`;
    aoa.push(row);
    merges.push({ s: { r, c: 0 }, e: { r, c: maxCol } });
    noteRows.push(r);
  }

  return { stampRow, noteRows };
}

export function buildFormalDocumentWorkbook(
  order: ExportOrder,
  ctx: FormalDocExportContext,
): XlsxTypes.WorkBook {
  const docLang = ctx.docLang ?? 'en';
  const supplier = ctx.supplier;
  const customer = ctx.customer;
  const billTo = ctx.billToCustomer ?? customer;
  const bank = ctx.bank;
  const products = ctx.products ?? [];
  const settings = ctx.contractSettings ?? createDefaultContractSettings();

  const summary = calculateOrderSummary(
    order.items,
    order.costs,
    order.shipping.incoterm,
    order.currency,
    order.palletCount ?? 0,
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

  const invoiceNoText = getDocOverride(order, 'inv.invoiceNo', order.invoiceNo);
  const displayDate = getDocOverride(
    order,
    'inv.orderDate',
    formatDocumentDate(order.orderDate, docLang),
  );
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
  const supplierNameText = getDocOverride(
    order,
    'inv.supplierName',
    supplier?.name || 'HARDLOCK Industry Co., Ltd.',
  );
  const supplierAddressText = getDocOverride(
    order,
    'inv.supplierAddress',
    supplier?.address || '1-6-24, Kawamata, Higashi Osaka\nOsaka, Japan 577-0063',
  );
  const supAddrLines = supplierAddressText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // ---------------- SHEET 1: INVOICE (11 columns A..K) ----------------
  const invAoa: (string | number)[][] = [];
  const invMerges: XlsxTypes.Range[] = [];
  const invRowHeights: XlsxTypes.RowInfo[] = [];

  const pushInvMergedRow = (
    text: string,
    colStart = 0,
    colEnd = 10,
    hpt = 16,
  ) => {
    const r = invAoa.length;
    const row = new Array(11).fill('') as (string | number)[];
    row[colStart] = text;
    invAoa.push(row);
    invRowHeights[r] = { hpt };
    if (colEnd > colStart) {
      invMerges.push({ s: { r, c: colStart }, e: { r, c: colEnd } });
    }
    return r;
  };

  // Letterhead
  const invLetterheadRow = pushInvMergedRow(supplierNameText, 0, 10, 26);
  {
    const r = invAoa.length;
    const row = new Array(11).fill('') as (string | number)[];
    row[0] = supAddrLines[0] ?? '';
    row[9] = `Tel : ${supplier?.phone || '81-6-6784-1131'}`;
    invAoa.push(row);
    invRowHeights[r] = { hpt: 15 };
    invMerges.push({ s: { r, c: 0 }, e: { r, c: 7 } });
    invMerges.push({ s: { r, c: 9 }, e: { r, c: 10 } });
  }
  {
    const r = invAoa.length;
    const row = new Array(11).fill('') as (string | number)[];
    row[0] = supAddrLines.slice(1).join(' ');
    row[9] = supplier?.fax ? `Fax : ${supplier.fax}` : '';
    invAoa.push(row);
    invRowHeights[r] = { hpt: 15 };
    invMerges.push({ s: { r, c: 0 }, e: { r, c: 7 } });
    invMerges.push({ s: { r, c: 9 }, e: { r, c: 10 } });
  }
  if (supplier?.taxOrExporterId) {
    pushInvMergedRow(`Tax / Exporter ID : ${supplier.taxOrExporterId}`, 0, 7, 15);
  }
  invAoa.push(new Array(11).fill(''));
  invRowHeights[invAoa.length - 1] = { hpt: 8 };

  // Title & Ref
  const invTitleRow = pushInvMergedRow('INVOICE', 0, 10, 22);
  const invNoRow = pushInvMergedRow(`No. ${invoiceNoText}`, 0, 10, 17);
  {
    const r = invAoa.length;
    const row = new Array(11).fill('') as (string | number)[];
    row[9] = `Date : ${displayDate}`;
    invAoa.push(row);
    invRowHeights[r] = { hpt: 16 };
    invMerges.push({ s: { r, c: 9 }, e: { r, c: 10 } });
  }

  // BILL TO & SHIP TO
  const billToStartRow = invAoa.length;
  for (const line of buildPartyExcelLines(
    'BILL TO :',
    billTo,
    getDocOverride(order, 'inv.billToName', billTo?.name || ''),
    getDocOverride(order, 'inv.billToAddress', billTo?.address || ''),
  )) {
    pushInvMergedRow(line, 0, 8, 15);
  }
  invAoa.push(new Array(11).fill(''));
  invRowHeights[invAoa.length - 1] = { hpt: 8 };
  const shipToStartRow = invAoa.length;
  for (const line of buildPartyExcelLines(
    'SHIP TO :',
    customer,
    getDocOverride(order, 'inv.shipToName', customer?.name || ''),
    getDocOverride(order, 'inv.shipToAddress', customer?.address || ''),
  )) {
    pushInvMergedRow(line, 0, 8, 15);
  }
  invAoa.push(new Array(11).fill(''));
  invRowHeights[invAoa.length - 1] = { hpt: 8 };

  // Shipment info
  pushInvMergedRow(`Shipment : on ${shipmentDate}`, 0, 7, 15);
  pushInvMergedRow(
    `Loading port : ${getDocOverride(order, 'inv.portOfLoading', order.shipping.portOfLoading || '—')}${
      order.shipping.vesselOrFlightOrCourier
        ? ` by "${order.shipping.vesselOrFlightOrCourier}"`
        : ''
    }${etdDisplay ? ` ETD ${etdDisplay}` : ''}`,
    0,
    8,
    15,
  );
  pushInvMergedRow(
    `Destination : ${getDocOverride(order, 'inv.portOfDischarge', order.shipping.portOfDischarge || '—')}${
      etaDisplay ? ` ETA ${etaDisplay}` : ''
    }`,
    0,
    8,
    15,
  );

  // ITEM header + Currency + Exchange Rate
  const invItemHeaderRow = invAoa.length;
  {
    const r = invAoa.length;
    const row = new Array(11).fill('') as (string | number)[];
    row[0] = `ITEM : ${getDocOverride(order, 'inv.itemHeader', order.itemHeader?.trim() || 'HARDLOCK NUT (HLN)')}`;
    row[7] = '*Seller -> Buyer transaction value only';
    invAoa.push(row);
    invRowHeights[r] = { hpt: 16 };
    invMerges.push({ s: { r, c: 0 }, e: { r, c: 5 } });
    invMerges.push({ s: { r, c: 7 }, e: { r, c: 10 } });
  }
  {
    const r = invAoa.length;
    const row = new Array(11).fill('') as (string | number)[];
    row[8] = `*Currency : ${formatCurrencyLabel(order.currency)}`;
    invAoa.push(row);
    invRowHeights[r] = { hpt: 15 };
    invMerges.push({ s: { r, c: 8 }, e: { r, c: 10 } });
  }
  if (order.currency !== 'JPY') {
    const r = invAoa.length;
    const row = new Array(11).fill('') as (string | number)[];
    row[8] = `*Exchange Rate : 1 ${order.currency} = ${effectiveRate} JPY`;
    invAoa.push(row);
    invRowHeights[r] = { hpt: 15 };
    invMerges.push({ s: { r, c: 8 }, e: { r, c: 10 } });
  }

  // Invoice 2-row header
  const invTableHeaderRow1 = invAoa.length;
  const invTableHeaderRow2 = invTableHeaderRow1 + 1;
  {
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
    invAoa.push(['', '', '', '', '', '', '', '', '', 'U. Price', 'Amount']);
    invRowHeights[invTableHeaderRow1] = { hpt: 20 };
    invRowHeights[invTableHeaderRow2] = { hpt: 18 };
    for (let c = 0; c <= 8; c++) {
      invMerges.push({
        s: { r: invTableHeaderRow1, c },
        e: { r: invTableHeaderRow2, c },
      });
    }
    invMerges.push({
      s: { r: invTableHeaderRow1, c: 9 },
      e: { r: invTableHeaderRow1, c: 10 },
    });
  }

  // Line items
  const invDataStartRow = invAoa.length;
  order.items.forEach((item, idx) => {
    const prod = products.find((p) => p.id === item.productId);
    const specs = resolveItemSpecs(item, prod);
    const calc = summary.lineItems[idx];
    const r = invAoa.length;
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
    invRowHeights[r] = { hpt: 17 };
  });
  const invDataEndRow = invAoa.length - 1;

  // Subtotal row aligned under Q'ty and N.W
  const invSubtotalRow = invAoa.length;
  {
    const row = new Array(11).fill('') as (string | number)[];
    row[0] = footnotes[0] ?? '';
    row[6] = summary.totalQuantity;
    row[8] = Number(summary.totalNetWeightKg.toFixed(1));
    invAoa.push(row);
    invRowHeights[invSubtotalRow] = { hpt: 16 };
    invMerges.push({ s: { r: invSubtotalRow, c: 0 }, e: { r: invSubtotalRow, c: 5 } });
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

  const invCostStartRow = invAoa.length;
  costRows.forEach((cr, rIdx) => {
    const r = invAoa.length;
    const row = new Array(11).fill('') as (string | number)[];
    row[0] =
      rIdx === 0 ? footnotes[1] ?? '' : rIdx === 1 ? footnotes[2] ?? '' : '';
    row[6] = cr.label;
    row[10] = formatDocMoney(cr.amount, order.currency);
    invAoa.push(row);
    invRowHeights[r] = { hpt: 16 };
    invMerges.push({ s: { r, c: 0 }, e: { r, c: 5 } });
    invMerges.push({ s: { r, c: 6 }, e: { r, c: 9 } });
  });

  // Final Incoterm Total
  const invFinalTotalRow = invAoa.length;
  {
    const row = new Array(11).fill('') as (string | number)[];
    row[6] = `${order.shipping.incoterm} ${placeShort}`;
    row[10] = formatDocMoney(summary.incotermTotal, order.currency);
    invAoa.push(row);
    invRowHeights[invFinalTotalRow] = { hpt: 19 };
    invMerges.push({ s: { r: invFinalTotalRow, c: 6 }, e: { r: invFinalTotalRow, c: 9 } });
  }

  invAoa.push(new Array(11).fill(''));
  invRowHeights[invAoa.length - 1] = { hpt: 8 };

  // Lower Packing + Freight Prepaid & Origin
  pushInvMergedRow(
    getDocOverride(
      order,
      'inv.packingSummary',
      `Packing : ${pallets > 0 ? `${pallets} pallets (` : ''}${
        summary.totalCartons
      } cartons total${emptyCartons > 0 ? ` + ${emptyCartons} empty carton` : ''}${
        pallets > 0 ? ')' : ''
      }`,
    ),
    0,
    7,
  );
  pushInvMergedRow(
    getDocOverride(order, 'inv.cartonSize', `Carton size : ${cartonDims}`),
    0,
    7,
  );
  pushInvMergedRow(
    getDocOverride(
      order,
      'inv.netWeightSummary',
      `N/W : approx. ${formatWeight1(summary.totalNetWeightKg)} kg`,
    ),
    0,
    7,
  );
  const invFreightFlagRow = invAoa.length;
  {
    const row = new Array(11).fill('') as (string | number)[];
    row[0] = getDocOverride(
      order,
      'inv.grossWeightSummary',
      `G/W : approx. ${formatWeight1(summary.totalGrossWeightKg)} kg`,
    );
    row[8] = freightLabel;
    invAoa.push(row);
    invRowHeights[invFreightFlagRow] = { hpt: 16 };
    invMerges.push({ s: { r: invFreightFlagRow, c: 0 }, e: { r: invFreightFlagRow, c: 7 } });
    invMerges.push({ s: { r: invFreightFlagRow, c: 8 }, e: { r: invFreightFlagRow, c: 10 } });
  }
  const invOriginRow = invAoa.length;
  {
    const row = new Array(11).fill('') as (string | number)[];
    row[0] = getDocOverride(
      order,
      'inv.volumeSummary',
      `Vol. : approx. ${summary.totalCbm.toFixed(3)}M3`,
    );
    row[8] = `COUNTRY OF ORIGIN : ${originCountry}`;
    invAoa.push(row);
    invRowHeights[invOriginRow] = { hpt: 16 };
    invMerges.push({ s: { r: invOriginRow, c: 0 }, e: { r: invOriginRow, c: 7 } });
    invMerges.push({ s: { r: invOriginRow, c: 8 }, e: { r: invOriginRow, c: 10 } });
  }

  invAoa.push(new Array(11).fill(''));
  invRowHeights[invAoa.length - 1] = { hpt: 8 };

  // Payment Terms & Bank Info
  const invPaymentRow = pushInvMergedRow(
    `Payment terms : ${getDocOverride(order, 'inv.paymentTerms', order.paymentTerms || '—')}`,
    0,
    10,
  );
  const invBankHeadingRow = pushInvMergedRow('Bank Information', 0, 10);
  if (bank) {
    pushInvMergedRow(
      `${bank.bankName}${bank.swiftCode ? ` (BIC : ${bank.swiftCode})` : ''}`,
      0,
      10,
    );
    if (bank.branchName) pushInvMergedRow(bank.branchName, 0, 10);
    pushInvMergedRow(`Account No. : ${bank.accountNumber}`, 0, 10);
  }
  const remarksText = getDocOverride(order, 'inv.remarks', order.remarks || '');
  if (remarksText) {
    pushInvMergedRow(`Remarks : ${remarksText}`, 0, 10);
  }

  invAoa.push(new Array(11).fill(''));
  invRowHeights[invAoa.length - 1] = { hpt: 10 };

  // Footer: Marks + Signatory
  const ctnFooterLine =
    pallets > 1
      ? `CTN NO. 1 / ${pallets} - ${pallets} / ${pallets}`
      : `CTN NO. 1 - ${Math.max(1, summary.totalCartons)}`;
  const invFooterStart = invAoa.length;
  {
    const r = invAoa.length;
    const row = new Array(11).fill('') as (string | number)[];
    row[0] = getDocOverride(
      order,
      'inv.shippingMarks',
      order.shipping.shippingMarksMain || '',
    );
    row[7] = supplierNameText;
    invAoa.push(row);
    invRowHeights[r] = { hpt: 16 };
    invMerges.push({ s: { r, c: 0 }, e: { r, c: 5 } });
    invMerges.push({ s: { r, c: 7 }, e: { r, c: 10 } });
  }
  const invSignatoryNameRow = invAoa.length;
  {
    const row = new Array(11).fill('') as (string | number)[];
    row[0] = `HARDLOCK No. ${invoiceNoText}`;
    row[7] =
      order.docSpecialFields?.showSignature === false
        ? ''
        : supplier?.signatoryName || 'Mr. Song Shanghua';
    invAoa.push(row);
    invRowHeights[invSignatoryNameRow] = { hpt: 22 };
    invMerges.push({ s: { r: invSignatoryNameRow, c: 0 }, e: { r: invSignatoryNameRow, c: 5 } });
    invMerges.push({ s: { r: invSignatoryNameRow, c: 7 }, e: { r: invSignatoryNameRow, c: 10 } });
  }
  {
    const r = invAoa.length;
    const row = new Array(11).fill('') as (string | number)[];
    row[0] = ctnFooterLine;
    row[7] = supplier?.signatoryTitle || 'Overseas Sales';
    invAoa.push(row);
    invRowHeights[r] = { hpt: 16 };
    invMerges.push({ s: { r, c: 0 }, e: { r, c: 5 } });
    invMerges.push({ s: { r, c: 7 }, e: { r, c: 10 } });
  }
  pushInvMergedRow(`MADE IN ${originCountry}`, 0, 5);

  const invSpecial = appendSpecialFieldsExcelRows(
    invAoa,
    invMerges,
    11,
    order,
    supplier,
    settings,
  );

  const invoiceSheet = XLSX.utils.aoa_to_sheet(invAoa);
  invoiceSheet['!merges'] = invMerges;
  invoiceSheet['!rows'] = invRowHeights;
  invoiceSheet['!cols'] = [
    { wch: 8 },
    { wch: 18 },
    { wch: 12 },
    { wch: 13 },
    { wch: 11 },
    { wch: 10 },
    { wch: 12 },
    { wch: 10 },
    { wch: 12 },
    { wch: 14 },
    { wch: 17 },
  ];

  // Apply commercial styling to INVOICE sheet
  styleRange(invoiceSheet, 0, 0, invAoa.length - 1, 10, {
    font: { name: 'Times New Roman', sz: 10, color: { rgb: '0F172A' } },
    alignment: { vertical: 'center' },
  });
  styleRange(invoiceSheet, invLetterheadRow, 0, invLetterheadRow, 10, {
    font: { name: 'Times New Roman', sz: 18, bold: true, color: { rgb: '000000' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: { bottom: MEDIUM_BLACK },
  });
  styleRange(invoiceSheet, invTitleRow, 0, invTitleRow, 10, {
    font: { name: 'Times New Roman', sz: 14, bold: true, underline: true },
    alignment: { horizontal: 'center', vertical: 'center' },
  });
  styleRange(invoiceSheet, invNoRow, 0, invNoRow, 10, {
    font: { name: 'Times New Roman', sz: 11, bold: true },
    alignment: { horizontal: 'center', vertical: 'center' },
  });
  applyCellStyle(invoiceSheet, invNoRow + 1, 9, {
    font: { name: 'Times New Roman', sz: 10, bold: true },
    alignment: { horizontal: 'right', vertical: 'center' },
  });
  applyCellStyle(invoiceSheet, billToStartRow, 0, {
    font: { name: 'Times New Roman', sz: 10, bold: true, underline: true },
  });
  applyCellStyle(invoiceSheet, billToStartRow + 1, 0, {
    font: { name: 'Times New Roman', sz: 10, bold: true },
  });
  applyCellStyle(invoiceSheet, shipToStartRow, 0, {
    font: { name: 'Times New Roman', sz: 10, bold: true, underline: true },
  });
  applyCellStyle(invoiceSheet, shipToStartRow + 1, 0, {
    font: { name: 'Times New Roman', sz: 10, bold: true },
  });
  applyCellStyle(invoiceSheet, invItemHeaderRow, 0, {
    font: { name: 'Times New Roman', sz: 10.5, bold: true },
  });
  applyCellStyle(invoiceSheet, invItemHeaderRow, 7, {
    font: { name: 'Times New Roman', sz: 9.5, bold: true, italic: true },
    alignment: { horizontal: 'right', vertical: 'center' },
  });
  applyCellStyle(invoiceSheet, invItemHeaderRow + 1, 8, {
    font: { name: 'Times New Roman', sz: 10, bold: true },
    alignment: { horizontal: 'right', vertical: 'center' },
  });
  if (order.currency !== 'JPY') {
    applyCellStyle(invoiceSheet, invItemHeaderRow + 2, 8, {
      font: { name: 'Times New Roman', sz: 10, bold: true },
      alignment: { horizontal: 'right', vertical: 'center' },
    });
  }
  // Table headers
  styleRange(invoiceSheet, invTableHeaderRow1, 0, invTableHeaderRow2, 10, {
    font: { name: 'Times New Roman', sz: 10, bold: true, color: { rgb: '000000' } },
    fill: { fgColor: { rgb: 'EEF2F6' } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: GRID_BORDER,
  });
  // Data rows
  if (invDataEndRow >= invDataStartRow) {
    styleRange(invoiceSheet, invDataStartRow, 0, invDataEndRow, 10, {
      font: { name: 'Times New Roman', sz: 10 },
      border: GRID_BORDER,
      alignment: { vertical: 'center' },
    });
    for (let r = invDataStartRow; r <= invDataEndRow; r++) {
      applyCellStyle(invoiceSheet, r, 0, { alignment: { horizontal: 'center' } });
      applyCellStyle(invoiceSheet, r, 1, { font: { bold: true } });
      applyCellStyle(invoiceSheet, r, 4, { alignment: { horizontal: 'center' } });
      applyCellStyle(invoiceSheet, r, 5, { alignment: { horizontal: 'center' } });
      applyCellStyle(
        invoiceSheet,
        r,
        6,
        { alignment: { horizontal: 'right' } },
        '#,##0',
      );
      applyCellStyle(
        invoiceSheet,
        r,
        7,
        { alignment: { horizontal: 'right' } },
        '0.0000',
      );
      applyCellStyle(
        invoiceSheet,
        r,
        8,
        { alignment: { horizontal: 'right' } },
        '#,##0.0',
      );
      applyCellStyle(
        invoiceSheet,
        r,
        9,
        { alignment: { horizontal: 'right' } },
        order.currency === 'JPY' ? '#,##0' : '#,##0.00',
      );
      applyCellStyle(
        invoiceSheet,
        r,
        10,
        { alignment: { horizontal: 'right' } },
        order.currency === 'JPY' ? '#,##0' : '#,##0.00',
      );
    }
  }
  // Subtotal & Cost Breakdown
  applyCellStyle(invoiceSheet, invSubtotalRow, 6, {
    font: { bold: true },
    alignment: { horizontal: 'right' },
    numFmt: '#,##0',
  });
  applyCellStyle(invoiceSheet, invSubtotalRow, 8, {
    font: { bold: true },
    alignment: { horizontal: 'right' },
    numFmt: '#,##0.0',
  });
  for (let r = invCostStartRow; r < invFinalTotalRow; r++) {
    applyCellStyle(invoiceSheet, r, 6, {
      font: { bold: true },
      alignment: { horizontal: 'right', vertical: 'center' },
    });
    applyCellStyle(invoiceSheet, r, 10, {
      font: { bold: true },
      alignment: { horizontal: 'right', vertical: 'center' },
      border: { bottom: DOTTED_BLACK },
    });
  }
  applyCellStyle(invoiceSheet, invFinalTotalRow, 6, {
    font: { bold: true, sz: 10.5 },
    alignment: { horizontal: 'right', vertical: 'center' },
  });
  applyCellStyle(invoiceSheet, invFinalTotalRow, 10, {
    font: { bold: true, sz: 10.5 },
    fill: { fgColor: { rgb: 'F8FAFC' } },
    alignment: { horizontal: 'right', vertical: 'center' },
    border: { top: THIN_BLACK, bottom: DOUBLE_BLACK },
  });
  applyCellStyle(invoiceSheet, invFreightFlagRow, 8, {
    font: { bold: true, underline: true },
    alignment: { horizontal: 'right' },
  });
  applyCellStyle(invoiceSheet, invOriginRow, 8, {
    font: { bold: true, underline: true },
    alignment: { horizontal: 'right' },
  });
  applyCellStyle(invoiceSheet, invPaymentRow, 0, { font: { bold: true } });
  applyCellStyle(invoiceSheet, invBankHeadingRow, 0, {
    font: { bold: true, underline: true },
  });
  for (let r = invFooterStart; r <= invFooterStart + 3; r++) {
    applyCellStyle(invoiceSheet, r, 0, { font: { bold: true } });
  }
  applyCellStyle(invoiceSheet, invSignatoryNameRow, 7, {
    font: { bold: true },
    border: { bottom: THIN_BLACK },
  });
  if (invSpecial.stampRow !== undefined) {
    applyCellStyle(invoiceSheet, invSpecial.stampRow, 7, {
      font: { bold: true, color: { rgb: 'B91C1C' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: GRID_BORDER,
    });
  }
  for (const nr of invSpecial.noteRows) {
    applyCellStyle(invoiceSheet, nr, 0, {
      font: { sz: 9, italic: true, color: { rgb: '475569' } },
      alignment: { wrapText: true, vertical: 'center' },
    });
  }

  // ---------------- SHEET 2: PACKING LIST (11 columns A..K) ----------------
  const plAoa: (string | number)[][] = [];
  const plMerges: XlsxTypes.Range[] = [];
  const plRowHeights: XlsxTypes.RowInfo[] = [];

  const pushPlMergedRow = (
    text: string,
    colStart = 0,
    colEnd = 10,
    hpt = 16,
  ) => {
    const r = plAoa.length;
    const row = new Array(11).fill('') as (string | number)[];
    row[colStart] = text;
    plAoa.push(row);
    plRowHeights[r] = { hpt };
    if (colEnd > colStart) {
      plMerges.push({ s: { r, c: colStart }, e: { r, c: colEnd } });
    }
    return r;
  };

  const plLetterheadRow = pushPlMergedRow(supplierNameText, 0, 10, 26);
  {
    const r = plAoa.length;
    const row = new Array(11).fill('') as (string | number)[];
    row[0] = supAddrLines[0] ?? '';
    row[9] = `Tel : ${supplier?.phone || '81-6-6784-1131'}`;
    plAoa.push(row);
    plRowHeights[r] = { hpt: 15 };
    plMerges.push({ s: { r, c: 0 }, e: { r, c: 7 } });
    plMerges.push({ s: { r, c: 9 }, e: { r, c: 10 } });
  }
  {
    const r = plAoa.length;
    const row = new Array(11).fill('') as (string | number)[];
    row[0] = supAddrLines.slice(1).join(' ');
    row[9] = supplier?.fax ? `Fax : ${supplier.fax}` : '';
    plAoa.push(row);
    plRowHeights[r] = { hpt: 15 };
    plMerges.push({ s: { r, c: 0 }, e: { r, c: 7 } });
    plMerges.push({ s: { r, c: 9 }, e: { r, c: 10 } });
  }
  if (supplier?.taxOrExporterId) {
    pushPlMergedRow(`Tax / Exporter ID : ${supplier.taxOrExporterId}`, 0, 7, 15);
  }
  plAoa.push(new Array(11).fill(''));
  plRowHeights[plAoa.length - 1] = { hpt: 8 };

  const plTitleRow = pushPlMergedRow('PACKING LIST', 0, 10, 22);
  const plNoRow = pushPlMergedRow(`INVOICE No. ${invoiceNoText}`, 0, 10, 17);
  {
    const r = plAoa.length;
    const row = new Array(11).fill('') as (string | number)[];
    row[9] = `Date : ${displayDate}`;
    plAoa.push(row);
    plRowHeights[r] = { hpt: 16 };
    plMerges.push({ s: { r, c: 9 }, e: { r, c: 10 } });
  }

  const plBillStart = plAoa.length;
  for (const line of buildPartyExcelLines(
    'BILL TO :',
    billTo,
    getDocOverride(order, 'inv.billToName', billTo?.name || ''),
    getDocOverride(order, 'inv.billToAddress', billTo?.address || ''),
  )) {
    pushPlMergedRow(line, 0, 8, 15);
  }
  plAoa.push(new Array(11).fill(''));
  plRowHeights[plAoa.length - 1] = { hpt: 8 };
  const plDeliverStart = plAoa.length;
  for (const line of buildPartyExcelLines(
    'DELIVER TO :',
    customer,
    getDocOverride(order, 'inv.shipToName', customer?.name || ''),
    getDocOverride(order, 'inv.shipToAddress', customer?.address || ''),
  )) {
    pushPlMergedRow(line, 0, 8, 15);
  }
  plAoa.push(new Array(11).fill(''));
  plRowHeights[plAoa.length - 1] = { hpt: 8 };

  pushPlMergedRow(`Shipment : on ${shipmentDate}`, 0, 7);
  pushPlMergedRow(
    `Loading port : ${getDocOverride(order, 'inv.portOfLoading', order.shipping.portOfLoading || '—')}${
      order.shipping.vesselOrFlightOrCourier
        ? ` by "${order.shipping.vesselOrFlightOrCourier}"`
        : ''
    }${etdDisplay ? ` ETD ${etdDisplay}` : ''}`,
    0,
    8,
  );
  pushPlMergedRow(
    `Destination : ${getDocOverride(order, 'inv.portOfDischarge', order.shipping.portOfDischarge || '—')}${
      etaDisplay ? ` ETA ${etaDisplay}` : ''
    }`,
    0,
    8,
  );

  const compactHsDigits = formatCompactHsCode(firstItem?.hsCode).replace(
    /\./g,
    '',
  );
  const plItemHeaderRow = pushPlMergedRow(
    `ITEM : ${getDocOverride(order, 'inv.itemHeader', order.itemHeader?.trim() || 'HARDLOCK NUT')} (HS CODE : ${compactHsDigits})`,
    0,
    9,
    17,
  );

  // Table header
  const plTableHeaderRow = plAoa.length;
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
  plRowHeights[plTableHeaderRow] = { hpt: 24 };

  const displayRows = buildPackingListDisplayRows(
    order.items,
    products,
    order.packingRows,
  );

  const plDataStartRow = plAoa.length;
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
    plRowHeights[r] = { hpt: 17 };
  });
  const plDataEndRow = plAoa.length - 1;

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
  const plSummaryRow = plAoa.length;
  {
    const row = new Array(11).fill('') as (string | number)[];
    row[0] = footnotes.join(' | ');
    row[7] = `${plTotalCartons} cartons`;
    row[8] = plTotalQty;
    row[10] = Number(plTotalTw.toFixed(1));
    plAoa.push(row);
    plRowHeights[plSummaryRow] = { hpt: 18 };
    plMerges.push({ s: { r: plSummaryRow, c: 0 }, e: { r: plSummaryRow, c: 6 } });
  }

  plAoa.push(new Array(11).fill(''));
  plRowHeights[plAoa.length - 1] = { hpt: 8 };

  pushPlMergedRow(
    getDocOverride(
      order,
      'pl.packingSummary',
      `Packing : ${pallets > 0 ? `${pallets} pallets (` : ''}${plTotalCartons} cartons total${
        emptyCartons > 0 ? ` + ${emptyCartons} empty carton` : ''
      }${pallets > 0 ? ')' : ''}`,
    ),
    0,
    7,
  );
  pushPlMergedRow(
    getDocOverride(order, 'pl.cartonSize', `Carton size : ${cartonDims}`),
    0,
    7,
  );
  const plOriginRow = plAoa.length;
  {
    const row = new Array(11).fill('') as (string | number)[];
    row[0] = getDocOverride(
      order,
      'pl.netWeightSummary',
      `N/W : approx. ${formatWeight1(plTotalTw)} kg`,
    );
    row[8] = `Country of Origin : ${originSentence}`;
    plAoa.push(row);
    plRowHeights[plOriginRow] = { hpt: 16 };
    plMerges.push({ s: { r: plOriginRow, c: 0 }, e: { r: plOriginRow, c: 7 } });
    plMerges.push({ s: { r: plOriginRow, c: 8 }, e: { r: plOriginRow, c: 10 } });
  }
  pushPlMergedRow(
    getDocOverride(
      order,
      'pl.grossWeightSummary',
      `G/W : approx. ${formatWeight1(summary.totalGrossWeightKg)} kg`,
    ),
    0,
    7,
  );
  pushPlMergedRow(
    getDocOverride(
      order,
      'pl.volumeSummary',
      `Vol. : approx. ${summary.totalCbm.toFixed(3)}M3`,
    ),
    0,
    7,
  );
  if (order.palletVolumeDetails) {
    order.palletVolumeDetails
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .forEach((line) => pushPlMergedRow(line, 0, 7));
  }

  plAoa.push(new Array(11).fill(''));
  plRowHeights[plAoa.length - 1] = { hpt: 10 };
  const plFooterStart = plAoa.length;
  {
    const r = plAoa.length;
    const row = new Array(11).fill('') as (string | number)[];
    row[0] = getDocOverride(
      order,
      'inv.shippingMarks',
      order.shipping.shippingMarksMain || '',
    );
    row[7] = supplierNameText;
    plAoa.push(row);
    plRowHeights[r] = { hpt: 16 };
    plMerges.push({ s: { r, c: 0 }, e: { r, c: 5 } });
    plMerges.push({ s: { r, c: 7 }, e: { r, c: 10 } });
  }
  const plSignRow = plAoa.length;
  {
    const row = new Array(11).fill('') as (string | number)[];
    row[0] = `HARDLOCK No. ${invoiceNoText}`;
    row[7] =
      order.docSpecialFields?.showSignature === false
        ? ''
        : supplier?.signatoryName || 'Mr. Song Shanghua';
    plAoa.push(row);
    plRowHeights[plSignRow] = { hpt: 22 };
    plMerges.push({ s: { r: plSignRow, c: 0 }, e: { r: plSignRow, c: 5 } });
    plMerges.push({ s: { r: plSignRow, c: 7 }, e: { r: plSignRow, c: 10 } });
  }
  {
    const r = plAoa.length;
    const row = new Array(11).fill('') as (string | number)[];
    row[0] = ctnFooterLine;
    row[7] = supplier?.signatoryTitle || 'Overseas Sales';
    plAoa.push(row);
    plRowHeights[r] = { hpt: 16 };
    plMerges.push({ s: { r, c: 0 }, e: { r, c: 5 } });
    plMerges.push({ s: { r, c: 7 }, e: { r, c: 10 } });
  }
  pushPlMergedRow(`MADE IN ${originCountry}`, 0, 5);

  const plSpecial = appendSpecialFieldsExcelRows(
    plAoa,
    plMerges,
    11,
    order,
    supplier,
    settings,
  );

  const packingSheet = XLSX.utils.aoa_to_sheet(plAoa);
  packingSheet['!merges'] = plMerges;
  packingSheet['!rows'] = plRowHeights;
  packingSheet['!cols'] = [
    { wch: 11 },
    { wch: 12 },
    { wch: 9 },
    { wch: 18 },
    { wch: 11 },
    { wch: 13 },
    { wch: 11 },
    { wch: 24 },
    { wch: 12 },
    { wch: 10 },
    { wch: 12 },
  ];

  // Commercial styling for PACKING LIST sheet
  styleRange(packingSheet, 0, 0, plAoa.length - 1, 10, {
    font: { name: 'Times New Roman', sz: 10, color: { rgb: '0F172A' } },
    alignment: { vertical: 'center' },
  });
  styleRange(packingSheet, plLetterheadRow, 0, plLetterheadRow, 10, {
    font: { name: 'Times New Roman', sz: 18, bold: true, color: { rgb: '000000' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: { bottom: MEDIUM_BLACK },
  });
  styleRange(packingSheet, plTitleRow, 0, plTitleRow, 10, {
    font: { name: 'Times New Roman', sz: 14, bold: true, underline: true },
    alignment: { horizontal: 'center', vertical: 'center' },
  });
  styleRange(packingSheet, plNoRow, 0, plNoRow, 10, {
    font: { name: 'Times New Roman', sz: 11, bold: true },
    alignment: { horizontal: 'center', vertical: 'center' },
  });
  applyCellStyle(packingSheet, plNoRow + 1, 9, {
    font: { bold: true },
    alignment: { horizontal: 'right', vertical: 'center' },
  });
  applyCellStyle(packingSheet, plBillStart, 0, {
    font: { bold: true, underline: true },
  });
  applyCellStyle(packingSheet, plBillStart + 1, 0, { font: { bold: true } });
  applyCellStyle(packingSheet, plDeliverStart, 0, {
    font: { bold: true, underline: true },
  });
  applyCellStyle(packingSheet, plDeliverStart + 1, 0, { font: { bold: true } });
  applyCellStyle(packingSheet, plItemHeaderRow, 0, {
    font: { bold: true, sz: 10.5 },
  });
  styleRange(packingSheet, plTableHeaderRow, 0, plTableHeaderRow, 10, {
    font: { bold: true, color: { rgb: '000000' } },
    fill: { fgColor: { rgb: 'EEF2F6' } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: GRID_BORDER,
  });
  if (plDataEndRow >= plDataStartRow) {
    styleRange(packingSheet, plDataStartRow, 0, plDataEndRow, 10, {
      font: { name: 'Times New Roman', sz: 10 },
      border: GRID_BORDER,
      alignment: { vertical: 'center' },
    });
    for (let r = plDataStartRow; r <= plDataEndRow; r++) {
      const dRow = displayRows[r - plDataStartRow];
      if (dRow?.isSubRowInSameCtn) {
        for (let c = 2; c <= 10; c++) {
          applyCellStyle(packingSheet, r, c, {
            border: {
              top: DOTTED_BLACK,
              bottom: THIN_BLACK,
              left: THIN_BLACK,
              right: THIN_BLACK,
            },
          });
        }
      }
      applyCellStyle(packingSheet, r, 0, { alignment: { horizontal: 'center', vertical: 'center' } });
      applyCellStyle(packingSheet, r, 1, { alignment: { horizontal: 'center', vertical: 'center' } });
      applyCellStyle(packingSheet, r, 2, { alignment: { horizontal: 'center' } });
      applyCellStyle(packingSheet, r, 3, { font: { bold: true } });
      applyCellStyle(packingSheet, r, 6, { alignment: { horizontal: 'center' } });
      applyCellStyle(packingSheet, r, 8, { alignment: { horizontal: 'right' } }, '#,##0');
      applyCellStyle(packingSheet, r, 9, { alignment: { horizontal: 'right' } }, '0.0000');
      applyCellStyle(packingSheet, r, 10, { alignment: { horizontal: 'right' } }, '#,##0.0');
    }
  }
  applyCellStyle(packingSheet, plSummaryRow, 7, {
    font: { bold: true },
    alignment: { horizontal: 'right' },
  });
  applyCellStyle(packingSheet, plSummaryRow, 8, {
    font: { bold: true },
    alignment: { horizontal: 'right' },
    numFmt: '#,##0',
  });
  applyCellStyle(packingSheet, plSummaryRow, 10, {
    font: { bold: true },
    alignment: { horizontal: 'right' },
    numFmt: '#,##0.0',
  });
  applyCellStyle(packingSheet, plOriginRow, 8, {
    font: { bold: true, underline: true },
    alignment: { horizontal: 'right' },
  });
  for (let r = plFooterStart; r <= plFooterStart + 3; r++) {
    applyCellStyle(packingSheet, r, 0, { font: { bold: true } });
  }
  applyCellStyle(packingSheet, plSignRow, 7, {
    font: { bold: true },
    border: { bottom: THIN_BLACK },
  });
  if (plSpecial.stampRow !== undefined) {
    applyCellStyle(packingSheet, plSpecial.stampRow, 7, {
      font: { bold: true, color: { rgb: 'B91C1C' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: GRID_BORDER,
    });
  }
  for (const nr of plSpecial.noteRows) {
    applyCellStyle(packingSheet, nr, 0, {
      font: { sz: 9, italic: true, color: { rgb: '475569' } },
      alignment: { wrapText: true, vertical: 'center' },
    });
  }

  // ---------------- SHEET 3: CONTRACT (8 columns A..H) ----------------
  const ctAoa: (string | number)[][] = [];
  const ctMerges: XlsxTypes.Range[] = [];
  const ctRowHeights: XlsxTypes.RowInfo[] = [];

  const pushCtMergedRow = (
    text: string,
    colStart = 0,
    colEnd = 7,
    hpt = 16,
  ) => {
    const r = ctAoa.length;
    const row = new Array(8).fill('') as (string | number)[];
    row[colStart] = text;
    ctAoa.push(row);
    ctRowHeights[r] = { hpt };
    if (colEnd > colStart) {
      ctMerges.push({ s: { r, c: colStart }, e: { r, c: colEnd } });
    }
    return r;
  };

  const contractNo = getDocOverride(order, 'contract.no', invoiceNoText);
  const contractDate = getDocOverride(order, 'contract.date', displayDate);
  const buyerParty = billTo ?? customer;
  const buyerName = getDocOverride(order, 'contract.buyerName', buyerParty?.name || '—');
  const buyerAddr = getDocOverride(
    order,
    'contract.buyerAddress',
    [buyerParty?.address, buyerParty?.country].filter(Boolean).join(', ') || '—',
  );
  const buyerPhone = getDocOverride(order, 'contract.buyerPhone', buyerParty?.phone || '-');
  const buyerFax = getDocOverride(order, 'contract.buyerFax', buyerParty?.fax || '-');
  const sellerName = getDocOverride(
    order,
    'contract.sellerName',
    supplier?.name || 'HARDLOCK INDUSTRY CO., LTD.',
  );
  const sellerAddr = getDocOverride(
    order,
    'contract.sellerAddress',
    supplier?.address || '1-6-24, KAWAMATA, HIGASHI-OSAKA, OSAKA, JAPAN 577-0063',
  );
  const sellerPhone = getDocOverride(
    order,
    'contract.sellerPhone',
    supplier?.phone || '+81 6-6784-1131',
  );
  const sellerFax = getDocOverride(
    order,
    'contract.sellerFax',
    supplier?.fax || '+81 6-6784-1161',
  );

  const ctHeaderBanner = pushCtMergedRow(`CONTRACT No. ${contractNo}`, 0, 7, 16);
  const ctTitleCnRow = pushCtMergedRow('合 同', 0, 7, 22);
  const ctTitleEnRow = pushCtMergedRow('C O N T R A C T', 0, 7, 24);
  {
    const r = ctAoa.length;
    const row = new Array(8).fill('') as (string | number)[];
    row[5] = `编号 NO. : ${contractNo}`;
    ctAoa.push(row);
    ctRowHeights[r] = { hpt: 15 };
    ctMerges.push({ s: { r, c: 5 }, e: { r, c: 7 } });
  }
  {
    const r = ctAoa.length;
    const row = new Array(8).fill('') as (string | number)[];
    row[5] = `日期 DATE : ${contractDate}`;
    ctAoa.push(row);
    ctRowHeights[r] = { hpt: 15 };
    ctMerges.push({ s: { r, c: 5 }, e: { r, c: 7 } });
  }
  ctAoa.push(new Array(8).fill(''));
  ctRowHeights[ctAoa.length - 1] = { hpt: 6 };

  pushCtMergedRow(`买 方 THE BUYERS : ${buyerName}`, 0, 7, 17);
  pushCtMergedRow(`地 址 ADDRESS : ${buyerAddr.replace(/\r?\n/g, ' ')}`, 0, 7, 26);
  pushCtMergedRow(
    `电 话 TELEPHONE : ${buyerPhone}        传 真 FAX : ${buyerFax}`,
    0,
    7,
    16,
  );
  ctAoa.push(new Array(8).fill(''));
  ctRowHeights[ctAoa.length - 1] = { hpt: 6 };

  pushCtMergedRow(`卖 方 THE SELLERS : ${sellerName}`, 0, 7, 17);
  pushCtMergedRow(`地 址 ADDRESS : ${sellerAddr.replace(/\r?\n/g, ' ')}`, 0, 7, 22);
  pushCtMergedRow(
    `电 话 TELEPHONE : ${sellerPhone}        传 真 FAX : ${sellerFax}`,
    0,
    7,
    16,
  );
  const preambleZhText = getDocOverride(
    order,
    'contract.preambleZh',
    '兹经买卖双方同意按照以下条款由买方购进卖方售出以下商品。',
  );
  const preambleEnText = getDocOverride(
    order,
    'contract.preambleEn',
    'THIS CONTRACT IS MADE BY AND BETWEEN THE BUYERS AND THE SELLERS, WHEREBY THE BUYERS AGREE TO BUY AND THE SELLERS AGREE TO SELL THE UNDER-MENTIONED GOODS SUBJECT TO THE TERMS AND CONDITIONS, AS STIPULATED HEREAFTER:',
  );
  const ctPreambleRow = pushCtMergedRow(
    getDocOverride(
      order,
      'contract.preamble',
      `${preambleZhText}\n${preambleEnText}`,
    ),
    0,
    7,
    38,
  );

  // Contract Commodity Table (cols A..H)
  const ctTableHead1 = ctAoa.length;
  const ctTableHead2 = ctTableHead1 + 1;
  ctAoa.push([
    '项目\nITEM NO.',
    '商品名称及规格\nNAME OF COMMODITY & SPECIFICATION',
    '',
    '',
    '数量\nQUANTITY',
    '单价\nUNIT PRICE',
    '总价\nTOTAL PRICE',
    '',
  ]);
  ctAoa.push([
    '',
    'ITEM',
    'SIZE / PITCH',
    'MATERIAL / FINISH',
    primaryUnit.toUpperCase(),
    order.currency,
    order.currency,
    '',
  ]);
  ctRowHeights[ctTableHead1] = { hpt: 26 };
  ctRowHeights[ctTableHead2] = { hpt: 18 };
  ctMerges.push({ s: { r: ctTableHead1, c: 0 }, e: { r: ctTableHead2, c: 0 } });
  ctMerges.push({ s: { r: ctTableHead1, c: 1 }, e: { r: ctTableHead1, c: 3 } });
  ctMerges.push({ s: { r: ctTableHead1, c: 6 }, e: { r: ctTableHead1, c: 7 } });
  ctMerges.push({ s: { r: ctTableHead2, c: 6 }, e: { r: ctTableHead2, c: 7 } });

  const ctDataStart = ctAoa.length;
  order.items.forEach((item, idx) => {
    const prod = products.find((p) => p.id === item.productId);
    const specs = resolveItemSpecs(item, prod);
    const calc = summary.lineItems[idx];
    const r = ctAoa.length;
    ctAoa.push([
      `${idx + 1}.`,
      item.sku || item.description || '—',
      specs.size,
      [specs.material, specs.surfaceFinish].filter(Boolean).join(' / '),
      item.quantity,
      item.unitPrice,
      calc?.amount ?? 0,
      '',
    ]);
    ctRowHeights[r] = { hpt: 17 };
    ctMerges.push({ s: { r, c: 6 }, e: { r, c: 7 } });
  });
  const ctDataEnd = ctAoa.length - 1;

  // Ex-works Total, Freight, Final Incoterm Total
  const ctExwRow = ctAoa.length;
  {
    const row = new Array(8).fill('') as (string | number)[];
    row[1] = 'Ex-works Total';
    row[6] = formatDocMoney(summary.exwTotal, order.currency);
    ctAoa.push(row);
    ctRowHeights[ctExwRow] = { hpt: 17 };
    ctMerges.push({ s: { r: ctExwRow, c: 1 }, e: { r: ctExwRow, c: 5 } });
    ctMerges.push({ s: { r: ctExwRow, c: 6 }, e: { r: ctExwRow, c: 7 } });
  }
  const ctFreightCost =
    (summary.flags.includesInland ? summary.inlandFreightCost : 0) +
    (summary.flags.includesMainFreight ? summary.mainFreightCost : 0) +
    (summary.flags.includesInsurance ? summary.insuranceCost : 0) +
    (summary.flags.includesDestinationHandling ? summary.destinationHandlingCost : 0) +
    (summary.flags.includesImportDuty ? summary.importDutyTaxCost : 0);
  if (ctFreightCost > 0) {
    const r = ctAoa.length;
    const row = new Array(8).fill('') as (string | number)[];
    row[1] = `${getModeFreightLabel(order.shipping.mode)} & Charges`;
    row[6] = formatDocMoney(ctFreightCost, order.currency);
    ctAoa.push(row);
    ctRowHeights[r] = { hpt: 17 };
    ctMerges.push({ s: { r, c: 1 }, e: { r, c: 5 } });
    ctMerges.push({ s: { r, c: 6 }, e: { r, c: 7 } });
  }
  const ctFinalTotalRow = ctAoa.length;
  {
    const row = new Array(8).fill('') as (string | number)[];
    row[1] = `${order.shipping.incoterm} ${placeShort}`;
    row[6] = formatDocMoney(summary.incotermTotal, order.currency);
    ctAoa.push(row);
    ctRowHeights[ctFinalTotalRow] = { hpt: 18 };
    ctMerges.push({ s: { r: ctFinalTotalRow, c: 1 }, e: { r: ctFinalTotalRow, c: 5 } });
    ctMerges.push({ s: { r: ctFinalTotalRow, c: 6 }, e: { r: ctFinalTotalRow, c: 7 } });
  }
  const ctWordsRow = pushCtMergedRow(
    `总价 TOTAL VALUE : ${getDocOverride(
      order,
      'contract.totalWords',
      numberToContractWords(summary.incotermTotal, order.currency),
    )}`,
    0,
    7,
    20,
  );

  ctAoa.push(new Array(8).fill(''));
  ctRowHeights[ctAoa.length - 1] = { hpt: 8 };

  // Clauses 1..N
  const ctClausesStart = ctAoa.length;
  settings.clauses.forEach((clause) => {
    const defaultTitle = `${clause.titleZh}  ${clause.titleEn} :`;
    const titleCombined = getDocOverride(
      order,
      `contract.clause.${clause.number}.title`,
      defaultTitle,
    );
    const bodyZh = getDocOverride(
      order,
      `contract.clause.${clause.number}.zh`,
      getDocOverride(
        order,
        `contract.clause.${clause.id}.bodyZh`,
        interpolateContractText(clause.bodyZh, order, supplier),
      ),
    );
    const bodyEn = getDocOverride(
      order,
      `contract.clause.${clause.number}.en`,
      getDocOverride(
        order,
        `contract.clause.${clause.id}.bodyEn`,
        interpolateContractText(clause.bodyEn, order, supplier),
      ),
    );
    const text = `${clause.number}.  ${titleCombined}\n${bodyZh}\n${bodyEn}`;
    const lineEstimate = Math.max(3, Math.ceil(text.length / 95));
    pushCtMergedRow(text, 0, 7, Math.min(95, lineEstimate * 14));
  });
  const ctClausesEnd = ctAoa.length - 1;

  ctAoa.push(new Array(8).fill(''));
  ctRowHeights[ctAoa.length - 1] = { hpt: 12 };

  // Dual Buyer & Seller Signature Footer
  const ctSignHeaderRow = ctAoa.length;
  {
    const row = new Array(8).fill('') as (string | number)[];
    row[0] = `买方 THE BUYER : ${buyerName}`;
    row[4] = `卖方 THE SELLER : ${sellerName}`;
    ctAoa.push(row);
    ctRowHeights[ctSignHeaderRow] = { hpt: 20 };
    ctMerges.push({ s: { r: ctSignHeaderRow, c: 0 }, e: { r: ctSignHeaderRow, c: 3 } });
    ctMerges.push({ s: { r: ctSignHeaderRow, c: 4 }, e: { r: ctSignHeaderRow, c: 7 } });
  }
  {
    const r = ctAoa.length;
    const row = new Array(8).fill('') as (string | number)[];
    row[0] = `DATE : `;
    row[4] = `DATE : ${contractDate}`;
    ctAoa.push(row);
    ctRowHeights[r] = { hpt: 18 };
    ctMerges.push({ s: { r, c: 0 }, e: { r, c: 3 } });
    ctMerges.push({ s: { r, c: 4 }, e: { r, c: 7 } });
  }
  const ctSignLineRow = ctAoa.length;
  {
    const row = new Array(8).fill('') as (string | number)[];
    row[0] = getDocOverride(
      order,
      'contract.buyerSignatory',
      buyerParty?.contactName || 'Authorized Buyer Signature',
    );
    row[4] =
      order.docSpecialFields?.showSignature === false
        ? ''
        : getDocOverride(
            order,
            'contract.sellerSignatory',
            supplier?.signatoryName || 'Mr. Song Shanghua',
          );
    ctAoa.push(row);
    ctRowHeights[ctSignLineRow] = { hpt: 26 };
    ctMerges.push({ s: { r: ctSignLineRow, c: 0 }, e: { r: ctSignLineRow, c: 3 } });
    ctMerges.push({ s: { r: ctSignLineRow, c: 4 }, e: { r: ctSignLineRow, c: 7 } });
  }
  {
    const r = ctAoa.length;
    const row = new Array(8).fill('') as (string | number)[];
    row[0] = getDocOverride(
      order,
      'contract.buyerSignatoryTitle',
      'MANAGING DIRECTOR / BUYER',
    );
    row[4] = getDocOverride(
      order,
      'contract.sellerSignatoryTitle',
      supplier?.signatoryTitle || 'OVERSEAS SALES',
    );
    ctAoa.push(row);
    ctRowHeights[r] = { hpt: 16 };
    ctMerges.push({ s: { r, c: 0 }, e: { r, c: 3 } });
    ctMerges.push({ s: { r, c: 4 }, e: { r, c: 7 } });
  }

  const ctSpecial = appendSpecialFieldsExcelRows(
    ctAoa,
    ctMerges,
    8,
    order,
    supplier,
    settings,
  );

  const contractSheet = XLSX.utils.aoa_to_sheet(ctAoa);
  contractSheet['!merges'] = ctMerges;
  contractSheet['!rows'] = ctRowHeights;
  contractSheet['!cols'] = [
    { wch: 9 },
    { wch: 20 },
    { wch: 14 },
    { wch: 18 },
    { wch: 12 },
    { wch: 13 },
    { wch: 10 },
    { wch: 10 },
  ];

  // Style CONTRACT sheet
  styleRange(contractSheet, 0, 0, ctAoa.length - 1, 7, {
    font: { name: 'Times New Roman', sz: 10, color: { rgb: '0F172A' } },
    alignment: { vertical: 'center' },
  });
  styleRange(contractSheet, ctHeaderBanner, 0, ctHeaderBanner, 7, {
    font: { sz: 10, bold: true },
    alignment: { horizontal: 'right', vertical: 'center' },
    border: { bottom: THIN_BLACK },
  });
  styleRange(contractSheet, ctTitleCnRow, 0, ctTitleCnRow, 7, {
    font: { sz: 16, bold: true },
    alignment: { horizontal: 'center', vertical: 'center' },
  });
  styleRange(contractSheet, ctTitleEnRow, 0, ctTitleEnRow, 7, {
    font: { sz: 16, bold: true },
    alignment: { horizontal: 'center', vertical: 'center' },
  });
  applyCellStyle(contractSheet, ctPreambleRow, 0, {
    alignment: { wrapText: true, vertical: 'center' },
  });
  styleRange(contractSheet, ctTableHead1, 0, ctTableHead2, 7, {
    font: { bold: true, color: { rgb: '000000' } },
    fill: { fgColor: { rgb: 'EEF2F6' } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: GRID_BORDER,
  });
  if (ctDataEnd >= ctDataStart) {
    styleRange(contractSheet, ctDataStart, 0, ctDataEnd, 7, {
      border: GRID_BORDER,
      alignment: { vertical: 'center' },
    });
    for (let r = ctDataStart; r <= ctDataEnd; r++) {
      applyCellStyle(contractSheet, r, 0, { alignment: { horizontal: 'center' } });
      applyCellStyle(contractSheet, r, 4, { alignment: { horizontal: 'right' } }, '#,##0');
      applyCellStyle(
        contractSheet,
        r,
        5,
        { alignment: { horizontal: 'right' } },
        order.currency === 'JPY' ? '#,##0' : '#,##0.00',
      );
      applyCellStyle(
        contractSheet,
        r,
        6,
        { alignment: { horizontal: 'right' } },
        order.currency === 'JPY' ? '#,##0' : '#,##0.00',
      );
    }
  }
  styleRange(contractSheet, ctExwRow, 0, ctWordsRow, 7, {
    border: GRID_BORDER,
    font: { bold: true },
  });
  for (let r = ctExwRow; r <= ctFinalTotalRow; r++) {
    applyCellStyle(contractSheet, r, 1, { alignment: { horizontal: 'right' } });
    applyCellStyle(contractSheet, r, 6, { alignment: { horizontal: 'right' } });
  }
  applyCellStyle(contractSheet, ctFinalTotalRow, 6, {
    fill: { fgColor: { rgb: 'F8FAFC' } },
    border: { top: THIN_BLACK, bottom: DOUBLE_BLACK, left: THIN_BLACK, right: THIN_BLACK },
  });
  for (let r = ctClausesStart; r <= ctClausesEnd; r++) {
    applyCellStyle(contractSheet, r, 0, {
      font: { sz: 9.5 },
      alignment: { wrapText: true, vertical: 'top' },
    });
  }
  applyCellStyle(contractSheet, ctSignHeaderRow, 0, { font: { bold: true } });
  applyCellStyle(contractSheet, ctSignHeaderRow, 4, { font: { bold: true } });
  applyCellStyle(contractSheet, ctSignLineRow, 0, { border: { bottom: THIN_BLACK } });
  applyCellStyle(contractSheet, ctSignLineRow, 4, { border: { bottom: THIN_BLACK } });
  if (ctSpecial.stampRow !== undefined) {
    applyCellStyle(contractSheet, ctSpecial.stampRow, 4, {
      font: { bold: true, color: { rgb: 'B91C1C' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: GRID_BORDER,
    });
  }
  for (const nr of ctSpecial.noteRows) {
    applyCellStyle(contractSheet, nr, 0, {
      font: { sz: 9, italic: true, color: { rgb: '475569' } },
      alignment: { wrapText: true, vertical: 'center' },
    });
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, invoiceSheet, 'INVOICE');
  XLSX.utils.book_append_sheet(wb, packingSheet, 'PACKING LIST');
  XLSX.utils.book_append_sheet(wb, contractSheet, 'CONTRACT');
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
      order.palletCount ?? 0,
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
      order.palletCount ?? 0,
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
): XlsxTypes.WorkBook {
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
  styleRange(detailSheet, 0, 0, 0, 14, {
    font: { name: 'Plus Jakarta Sans', sz: 10, bold: true },
    fill: { fgColor: { rgb: 'EEF2F6' } },
    border: GRID_BORDER,
    alignment: { horizontal: 'center', vertical: 'center' },
  });
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
  styleRange(summarySheet, 0, 0, 0, 14, {
    font: { name: 'Plus Jakarta Sans', sz: 10, bold: true },
    fill: { fgColor: { rgb: 'EEF2F6' } },
    border: GRID_BORDER,
    alignment: { horizontal: 'center', vertical: 'center' },
  });
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
