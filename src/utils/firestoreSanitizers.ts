import type {
  AuditLogEntry,
  BankAccount,
  ContractClauseItem,
  ContractSettings,
  CurrencyCode,
  Customer,
  CustomerDocumentTemplate,
  CustomerProductPrice,
  DocLanguage,
  DocSpecialFields,
  DocTemplateFileType,
  DocTemplateScope,
  ExportOrder,
  IncotermCode,
  LogisticsProvider,
  OrderItem,
  PackingListRow,
  PriceTier,
  Product,
  Supplier,
  TemplateFieldMapping,
  TemplateSystemFieldKey,
  TransportMode,
  UiLanguage,
} from '../types/erp';
import { resolveEffectiveExchangeRate } from './exportCalculations';
import { createDefaultContractSettings } from './contractDefaults';

export const BLUEPRINT_LIMITS = {
  ID_MAX: 128,
  ID_PATTERN: /^[a-zA-Z0-9_\-]+$/,
  SHORT_MAX: 80,
  MEDIUM_MAX: 240,
  LONG_MAX: 1000,
  OVERRIDE_VAL_MAX: 2000,
  MAX_DOC_OVERRIDES: 60,
  MAX_TEMPLATES_PER_CUSTOMER: 3,
  MAX_TEMPLATE_BASE64: 450000,
  MAX_STAMP_SIG_IMAGE: 180000,
  MAX_TEMPLATE_MAPPINGS: 40,
  MAX_CONTRACT_CLAUSES: 20,
  INVOICE_MAX: 100,
  DATE_MAX: 40,
  TIMESTAMP_STR_MAX: 64,
  UNIT_MAX: 40,
  ORIGIN_MAX: 120,
  MAX_ORDER_ITEMS: 50,
  MAX_PACKING_ROWS: 100,
  MAX_MODES: 4,
  MAX_CUSTOM_PRICES: 100,
  MAX_PRICE_TIERS: 20,
} as const;

const VALID_CURRENCIES: CurrencyCode[] = ['USD', 'JPY', 'EUR', 'CNY'];
const VALID_INCOTERMS: IncotermCode[] = [
  'EXW',
  'FCA',
  'FOB',
  'CFR',
  'CIF',
  'CPT',
  'CIP',
  'DAP',
  'DPU',
  'DDP',
];
const VALID_MODES: TransportMode[] = ['SEA', 'AIR', 'EXPRESS', 'LAND'];
const VALID_UI_LANGS: UiLanguage[] = ['zh', 'ja', 'en'];
const VALID_DOC_LANGS: DocLanguage[] = ['en', 'ja', 'zh'];
const VALID_TEMPLATE_FILE_TYPES: DocTemplateFileType[] = ['xlsx', 'docx'];
const VALID_TEMPLATE_SCOPES: DocTemplateScope[] = ['invoice', 'packing', 'contract', 'all'];

export function isValidFirestoreId(id: unknown): id is string {
  return (
    typeof id === 'string' &&
    id.length >= 1 &&
    id.length <= BLUEPRINT_LIMITS.ID_MAX &&
    BLUEPRINT_LIMITS.ID_PATTERN.test(id)
  );
}

export function sanitizeId(raw: string, prefix: string): string {
  const cleaned = String(raw ?? '')
    .replace(/[^a-zA-Z0-9_\-]/g, '-')
    .slice(0, BLUEPRINT_LIMITS.ID_MAX);
  if (cleaned.length >= 1 && BLUEPRINT_LIMITS.ID_PATTERN.test(cleaned)) {
    return cleaned;
  }
  return `${prefix}-${Date.now()}`;
}

export function clampStr(val: unknown, maxLen: number, fallback = ''): string {
  const str = typeof val === 'string' ? val : val == null ? fallback : String(val);
  return str.slice(0, maxLen);
}

export function clampNonEmptyStr(val: unknown, maxLen: number, fallback: string): string {
  const str = clampStr(val, maxLen).trim();
  return str.length > 0 ? str : fallback.slice(0, maxLen);
}

const DATA_IMAGE_REGEX = /^data:image\/(png|jpeg|jpg|gif|webp);base64,[A-Za-z0-9+/=]+$/i;

export function sanitizeDataImageUrl(
  val: unknown,
  maxLen: number = BLUEPRINT_LIMITS.MAX_STAMP_SIG_IMAGE,
): string {
  if (typeof val !== 'string') return '';
  const trimmed = val.trim();
  if (!trimmed || trimmed.length > maxLen) return '';
  if (!DATA_IMAGE_REGEX.test(trimmed)) return '';
  return trimmed;
}

export function nonNegNum(val: unknown, fallback = 0): number {
  const num = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(num) || num < 0) return fallback;
  return num;
}

export function clampCurrency(val: unknown, fallback: CurrencyCode = 'JPY'): CurrencyCode {
  return VALID_CURRENCIES.includes(val as CurrencyCode) ? (val as CurrencyCode) : fallback;
}

export function clampIncoterm(val: unknown, fallback: IncotermCode = 'FOB'): IncotermCode {
  return VALID_INCOTERMS.includes(val as IncotermCode) ? (val as IncotermCode) : fallback;
}

export function clampTransportMode(val: unknown, fallback: TransportMode = 'SEA'): TransportMode {
  return VALID_MODES.includes(val as TransportMode) ? (val as TransportMode) : fallback;
}

export function clampUiLang(val: unknown, fallback: UiLanguage = 'zh'): UiLanguage {
  return VALID_UI_LANGS.includes(val as UiLanguage) ? (val as UiLanguage) : fallback;
}

export function clampDocLang(val: unknown, fallback: DocLanguage = 'en'): DocLanguage {
  return VALID_DOC_LANGS.includes(val as DocLanguage) ? (val as DocLanguage) : fallback;
}

export function sanitizePriceTiers(tiers: unknown): PriceTier[] {
  if (!Array.isArray(tiers)) return [];
  const cleaned: PriceTier[] = [];
  for (const t of tiers) {
    if (!t || typeof t !== 'object') continue;
    const rawMin = nonNegNum((t as { minQty?: unknown }).minQty, 0);
    const minQty = Math.max(1, Math.round(rawMin));
    const rawMax = (t as { maxQty?: unknown }).maxQty;
    let maxQty: number | null = null;
    if (rawMax !== null && rawMax !== undefined && rawMax !== '') {
      const parsedMax = Math.round(nonNegNum(rawMax, minQty));
      maxQty = Math.max(minQty, parsedMax);
    }
    const unitPrice = nonNegNum((t as { unitPrice?: unknown }).unitPrice, 0);
    cleaned.push({ minQty, maxQty, unitPrice });
    if (cleaned.length >= BLUEPRINT_LIMITS.MAX_PRICE_TIERS) break;
  }
  return cleaned.sort((a, b) => a.minQty - b.minQty);
}

export function sanitizeCustomerCustomPrices(
  prices: unknown,
): CustomerProductPrice[] {
  if (!Array.isArray(prices)) return [];
  const deduped = new Map<string, CustomerProductPrice>();
  for (const entry of prices) {
    if (!entry || typeof entry !== 'object') continue;
    const rawId = (entry as { productId?: unknown }).productId;
    if (!isValidFirestoreId(rawId)) continue;
    const price = nonNegNum((entry as { unitPrice?: unknown }).unitPrice, 0);
    const tieredPrices = sanitizePriceTiers(
      (entry as { tieredPrices?: unknown }).tieredPrices,
    );
    deduped.set(rawId, {
      productId: rawId,
      unitPrice: price,
      tieredPrices,
    });
    if (deduped.size >= BLUEPRINT_LIMITS.MAX_CUSTOM_PRICES) break;
  }
  return Array.from(deduped.values());
}

export function sanitizeCustomerTemplates(
  templates: unknown,
): CustomerDocumentTemplate[] {
  if (!Array.isArray(templates)) return [];
  const result: CustomerDocumentTemplate[] = [];
  for (let i = 0; i < templates.length; i++) {
    const t = templates[i];
    if (!t || typeof t !== 'object') continue;
    const raw = t as Record<string, unknown>;
    const fileType = VALID_TEMPLATE_FILE_TYPES.includes(raw.fileType as DocTemplateFileType)
      ? (raw.fileType as DocTemplateFileType)
      : 'xlsx';
    const docScope = VALID_TEMPLATE_SCOPES.includes(raw.docScope as DocTemplateScope)
      ? (raw.docScope as DocTemplateScope)
      : 'all';
    const fileBase64 = clampStr(raw.fileBase64, BLUEPRINT_LIMITS.MAX_TEMPLATE_BASE64);
    if (!fileBase64) continue;
    const rawMappings = Array.isArray(raw.mappings) ? raw.mappings : [];
    const mappings: TemplateFieldMapping[] = [];
    for (let mIdx = 0; mIdx < rawMappings.length; mIdx++) {
      const m = rawMappings[mIdx];
      if (!m || typeof m !== 'object') continue;
      const mObj = m as Record<string, unknown>;
      const targetRef = clampStr(mObj.targetRef, BLUEPRINT_LIMITS.SHORT_MAX).trim();
      const systemField = clampStr(
        mObj.systemField,
        BLUEPRINT_LIMITS.SHORT_MAX,
      ).trim() as TemplateSystemFieldKey;
      if (!systemField || !targetRef) continue;
      mappings.push({
        id: sanitizeId(String(mObj.id ?? ''), `map-${mIdx}`),
        systemField,
        targetRef,
      });
      if (mappings.length >= BLUEPRINT_LIMITS.MAX_TEMPLATE_MAPPINGS) break;
    }
    const itemsStartRowRaw = Number(raw.itemsStartRow);
    const itemsStartRow =
      Number.isFinite(itemsStartRowRaw) && itemsStartRowRaw > 0
        ? Math.min(500, Math.round(itemsStartRowRaw))
        : 0;
    result.push({
      id: sanitizeId(String(raw.id ?? ''), `tpl-${i}`),
      name: clampNonEmptyStr(raw.name, BLUEPRINT_LIMITS.MEDIUM_MAX, `Template ${i + 1}`),
      fileName: clampNonEmptyStr(raw.fileName, BLUEPRINT_LIMITS.MEDIUM_MAX, `template.${fileType}`),
      fileType,
      docScope,
      fileBase64,
      mappings,
      itemsStartRow,
      uploadedAt: clampStr(
        raw.uploadedAt,
        BLUEPRINT_LIMITS.TIMESTAMP_STR_MAX,
        new Date().toISOString(),
      ),
    });
    if (result.length >= BLUEPRINT_LIMITS.MAX_TEMPLATES_PER_CUSTOMER) break;
  }
  return result;
}

export function sanitizeDocOverrides(
  overrides: unknown,
): Record<string, string> {
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) {
    return {};
  }
  const clean: Record<string, string> = {};
  let count = 0;
  for (const [k, v] of Object.entries(overrides as Record<string, unknown>)) {
    const cleanKey = clampStr(k, BLUEPRINT_LIMITS.SHORT_MAX).trim();
    if (!cleanKey) continue;
    clean[cleanKey] = clampStr(v, BLUEPRINT_LIMITS.OVERRIDE_VAL_MAX);
    count += 1;
    if (count >= BLUEPRINT_LIMITS.MAX_DOC_OVERRIDES) break;
  }
  return clean;
}

export function sanitizeDocSpecialFields(
  fields: unknown,
): DocSpecialFields {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
    return {
      showCompanyStamp: false,
      showSignature: true,
      showDisclaimer: false,
      disclaimerText: '',
      customNote: '',
    };
  }
  const raw = fields as Record<string, unknown>;
  return {
    showCompanyStamp: Boolean(raw.showCompanyStamp),
    showSignature: raw.showSignature === undefined ? true : Boolean(raw.showSignature),
    showDisclaimer: Boolean(raw.showDisclaimer),
    disclaimerText: clampStr(raw.disclaimerText, BLUEPRINT_LIMITS.LONG_MAX),
    customNote: clampStr(raw.customNote, BLUEPRINT_LIMITS.LONG_MAX),
  };
}

export function sanitizeContractSettings(
  settings: unknown,
): ContractSettings {
  const defaults = createDefaultContractSettings();
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return defaults;
  }
  const raw = settings as Record<string, unknown>;
  const rawClauses = Array.isArray(raw.clauses) ? raw.clauses : defaults.clauses;
  const clauses: ContractClauseItem[] = rawClauses
    .slice(0, BLUEPRINT_LIMITS.MAX_CONTRACT_CLAUSES)
    .map((c, idx) => {
      const obj = (c && typeof c === 'object' ? c : {}) as Record<string, unknown>;
      return {
        id: sanitizeId(String(obj.id ?? ''), `clause-${idx + 1}`),
        number: Math.max(1, Math.round(nonNegNum(obj.number, idx + 1))),
        titleZh: clampStr(obj.titleZh, BLUEPRINT_LIMITS.MEDIUM_MAX),
        titleEn: clampStr(obj.titleEn, BLUEPRINT_LIMITS.MEDIUM_MAX),
        bodyZh: clampStr(obj.bodyZh, BLUEPRINT_LIMITS.OVERRIDE_VAL_MAX),
        bodyEn: clampStr(obj.bodyEn, BLUEPRINT_LIMITS.OVERRIDE_VAL_MAX),
      };
    });

  return {
    defaultDeliveryTime: clampStr(
      raw.defaultDeliveryTime,
      BLUEPRINT_LIMITS.LONG_MAX,
      defaults.defaultDeliveryTime,
    ),
    defaultDeliveryTimeEn: clampStr(
      raw.defaultDeliveryTimeEn,
      BLUEPRINT_LIMITS.LONG_MAX,
      defaults.defaultDeliveryTimeEn,
    ),
    defaultPackingClause: clampStr(
      raw.defaultPackingClause,
      BLUEPRINT_LIMITS.LONG_MAX,
      defaults.defaultPackingClause,
    ),
    defaultPackingClauseEn: clampStr(
      raw.defaultPackingClauseEn,
      BLUEPRINT_LIMITS.LONG_MAX,
      defaults.defaultPackingClauseEn,
    ),
    defaultPaymentClause: clampStr(
      raw.defaultPaymentClause,
      BLUEPRINT_LIMITS.LONG_MAX,
      defaults.defaultPaymentClause,
    ),
    defaultPaymentClauseEn: clampStr(
      raw.defaultPaymentClauseEn,
      BLUEPRINT_LIMITS.LONG_MAX,
      defaults.defaultPaymentClauseEn,
    ),
    defaultArbitrationClause: clampStr(
      raw.defaultArbitrationClause,
      BLUEPRINT_LIMITS.LONG_MAX,
      defaults.defaultArbitrationClause,
    ),
    defaultArbitrationClauseEn: clampStr(
      raw.defaultArbitrationClauseEn,
      BLUEPRINT_LIMITS.LONG_MAX,
      defaults.defaultArbitrationClauseEn,
    ),
    defaultDisclaimerText: clampStr(
      raw.defaultDisclaimerText,
      BLUEPRINT_LIMITS.LONG_MAX,
      defaults.defaultDisclaimerText,
    ),
    companyStampLabel: clampStr(
      raw.companyStampLabel,
      BLUEPRINT_LIMITS.MEDIUM_MAX,
      defaults.companyStampLabel,
    ),
    companyStampImage: sanitizeDataImageUrl(raw.companyStampImage),
    signatureImage: sanitizeDataImageUrl(raw.signatureImage),
    clauses: clauses.length > 0 ? clauses : defaults.clauses,
  };
}

export function sanitizeCustomerPayload(c: Customer, ownerId: string) {
  return {
    id: sanitizeId(c.id, 'cust'),
    ownerId,
    code: clampNonEmptyStr(c.code, BLUEPRINT_LIMITS.SHORT_MAX, 'CUST'),
    name: clampNonEmptyStr(c.name, BLUEPRINT_LIMITS.MEDIUM_MAX, 'Customer'),
    country: clampStr(c.country, BLUEPRINT_LIMITS.MEDIUM_MAX),
    address: clampStr(c.address, BLUEPRINT_LIMITS.LONG_MAX),
    contactName: clampStr(c.contactName, BLUEPRINT_LIMITS.MEDIUM_MAX),
    email: clampStr(c.email, BLUEPRINT_LIMITS.MEDIUM_MAX),
    phone: clampStr(c.phone, BLUEPRINT_LIMITS.MEDIUM_MAX),
    fax: clampStr(c.fax, BLUEPRINT_LIMITS.MEDIUM_MAX),
    taxOrImporterId: clampStr(c.taxOrImporterId, 100),
    defaultCurrency: clampCurrency(c.defaultCurrency, 'USD'),
    defaultIncoterm: clampIncoterm(c.defaultIncoterm),
    notifyParty: clampStr(c.notifyParty, BLUEPRINT_LIMITS.LONG_MAX),
    customPrices: sanitizeCustomerCustomPrices(c.customPrices),
    documentTemplates: sanitizeCustomerTemplates(c.documentTemplates),
  };
}

export function sanitizeSupplierPayload(s: Supplier, ownerId: string) {
  return {
    id: sanitizeId(s.id, 'sup'),
    ownerId,
    code: clampNonEmptyStr(s.code, BLUEPRINT_LIMITS.SHORT_MAX, 'SUP'),
    name: clampNonEmptyStr(s.name, BLUEPRINT_LIMITS.MEDIUM_MAX, 'Supplier'),
    country: clampStr(s.country, BLUEPRINT_LIMITS.MEDIUM_MAX),
    address: clampStr(s.address, BLUEPRINT_LIMITS.LONG_MAX),
    contactName: clampStr(s.contactName, BLUEPRINT_LIMITS.MEDIUM_MAX),
    email: clampStr(s.email, BLUEPRINT_LIMITS.MEDIUM_MAX),
    phone: clampStr(s.phone, BLUEPRINT_LIMITS.MEDIUM_MAX),
    fax: clampStr(s.fax, BLUEPRINT_LIMITS.MEDIUM_MAX),
    taxOrExporterId: clampStr(s.taxOrExporterId, 100),
    signatoryName: clampStr(s.signatoryName, BLUEPRINT_LIMITS.MEDIUM_MAX),
    signatoryTitle: clampStr(s.signatoryTitle, BLUEPRINT_LIMITS.MEDIUM_MAX),
  };
}

export function sanitizeLogisticsPayload(l: LogisticsProvider, ownerId: string) {
  const modes = Array.isArray(l.supportedModes)
    ? Array.from(new Set(l.supportedModes.filter((m) => VALID_MODES.includes(m)))).slice(
        0,
        BLUEPRINT_LIMITS.MAX_MODES,
      )
    : [];
  return {
    id: sanitizeId(l.id, 'log'),
    ownerId,
    code: clampNonEmptyStr(l.code, BLUEPRINT_LIMITS.SHORT_MAX, 'LOG'),
    name: clampNonEmptyStr(l.name, BLUEPRINT_LIMITS.MEDIUM_MAX, 'Logistics Provider'),
    supportedModes: modes.length > 0 ? modes : (['SEA'] as TransportMode[]),
    contactName: clampStr(l.contactName, BLUEPRINT_LIMITS.MEDIUM_MAX),
    phone: clampStr(l.phone, BLUEPRINT_LIMITS.MEDIUM_MAX),
    email: clampStr(l.email, BLUEPRINT_LIMITS.MEDIUM_MAX),
    accountNo: clampStr(l.accountNo, BLUEPRINT_LIMITS.MEDIUM_MAX),
    defaultPortOrHub: clampStr(l.defaultPortOrHub, BLUEPRINT_LIMITS.MEDIUM_MAX),
  };
}

export function sanitizeBankPayload(b: BankAccount, ownerId: string) {
  return {
    id: sanitizeId(b.id, 'bank'),
    ownerId,
    label: clampNonEmptyStr(b.label, BLUEPRINT_LIMITS.MEDIUM_MAX, 'Bank Account'),
    bankName: clampNonEmptyStr(b.bankName, BLUEPRINT_LIMITS.MEDIUM_MAX, 'Bank'),
    branchName: clampStr(b.branchName, BLUEPRINT_LIMITS.MEDIUM_MAX),
    swiftCode: clampStr(b.swiftCode, BLUEPRINT_LIMITS.SHORT_MAX),
    accountName: clampStr(b.accountName, BLUEPRINT_LIMITS.MEDIUM_MAX),
    accountNumber: clampStr(b.accountNumber, BLUEPRINT_LIMITS.MEDIUM_MAX),
    currency: clampCurrency(b.currency, 'USD'),
    bankAddress: clampStr(b.bankAddress, BLUEPRINT_LIMITS.LONG_MAX),
  };
}

export function sanitizeProductPayload(p: Product, ownerId: string) {
  return {
    id: sanitizeId(p.id, 'prod'),
    ownerId,
    sku: clampNonEmptyStr(p.sku, BLUEPRINT_LIMITS.SHORT_MAX, 'SKU'),
    nameEn: clampNonEmptyStr(p.nameEn, BLUEPRINT_LIMITS.LONG_MAX, 'Product'),
    nameLocal: clampStr(p.nameLocal, BLUEPRINT_LIMITS.LONG_MAX),
    size: clampStr(p.size, BLUEPRINT_LIMITS.SHORT_MAX),
    material: clampStr(p.material, BLUEPRINT_LIMITS.SHORT_MAX),
    surfaceFinish: clampStr(p.surfaceFinish, BLUEPRINT_LIMITS.SHORT_MAX),
    hsCode: clampStr(p.hsCode, BLUEPRINT_LIMITS.SHORT_MAX),
    unit: clampNonEmptyStr(p.unit, BLUEPRINT_LIMITS.UNIT_MAX, 'PCS'),
    unitPrice: nonNegNum(p.unitPrice, 0),
    currency: clampCurrency(p.currency, 'JPY'),
    tieredPrices: sanitizePriceTiers(p.tieredPrices),
    unitNetWeightKg: nonNegNum(p.unitNetWeightKg, 0),
    unitGrossWeightKg: nonNegNum(p.unitGrossWeightKg, 0),
    defaultUnitsPerCarton: Math.max(1, nonNegNum(p.defaultUnitsPerCarton, 1)),
    cartonLengthCm: nonNegNum(p.cartonLengthCm, 0),
    cartonWidthCm: nonNegNum(p.cartonWidthCm, 0),
    cartonHeightCm: nonNegNum(p.cartonHeightCm, 0),
    originCountry: clampStr(p.originCountry, BLUEPRINT_LIMITS.ORIGIN_MAX),
  };
}

export function sanitizeOrderItem(item: OrderItem, idx: number): OrderItem {
  return {
    id: sanitizeId(item.id, `oi-${idx}`),
    productId: clampStr(item.productId, BLUEPRINT_LIMITS.ID_MAX),
    sku: clampStr(item.sku, BLUEPRINT_LIMITS.SHORT_MAX),
    description: clampStr(item.description, BLUEPRINT_LIMITS.LONG_MAX),
    size: clampStr(item.size, BLUEPRINT_LIMITS.SHORT_MAX),
    material: clampStr(item.material, BLUEPRINT_LIMITS.SHORT_MAX),
    surfaceFinish: clampStr(item.surfaceFinish, BLUEPRINT_LIMITS.SHORT_MAX),
    hsCode: clampStr(item.hsCode, BLUEPRINT_LIMITS.SHORT_MAX),
    quantity: nonNegNum(item.quantity, 0),
    unit: clampNonEmptyStr(item.unit, BLUEPRINT_LIMITS.UNIT_MAX, 'PCS'),
    unitPrice: nonNegNum(item.unitPrice, 0),
    baseUnitPriceJpy: nonNegNum(item.baseUnitPriceJpy, 0),
    cartons: nonNegNum(item.cartons, 0),
    unitNetWeightKg: nonNegNum(item.unitNetWeightKg, 0),
    unitGrossWeightKg: nonNegNum(item.unitGrossWeightKg, 0),
    cartonLengthCm: nonNegNum(item.cartonLengthCm, 0),
    cartonWidthCm: nonNegNum(item.cartonWidthCm, 0),
    cartonHeightCm: nonNegNum(item.cartonHeightCm, 0),
    originCountry: clampStr(item.originCountry, BLUEPRINT_LIMITS.ORIGIN_MAX),
    palletNo: clampStr(item.palletNo, BLUEPRINT_LIMITS.SHORT_MAX),
    cartonRange: clampStr(item.cartonRange, BLUEPRINT_LIMITS.SHORT_MAX),
    setsPerCarton: nonNegNum(item.setsPerCarton, 0),
    sharedCartonGroupId: clampStr(item.sharedCartonGroupId, BLUEPRINT_LIMITS.SHORT_MAX),
  };
}

export function sanitizePackingRow(row: PackingListRow, idx: number): PackingListRow {
  return {
    id: sanitizeId(row.id, `pk-${idx}`),
    palletNo: clampStr(row.palletNo, BLUEPRINT_LIMITS.SHORT_MAX),
    ctnNo: clampStr(row.ctnNo, BLUEPRINT_LIMITS.SHORT_MAX),
    itemNo: Math.max(1, nonNegNum(row.itemNo, 1)),
    type: clampStr(row.type, BLUEPRINT_LIMITS.SHORT_MAX),
    size: clampStr(row.size, BLUEPRINT_LIMITS.SHORT_MAX),
    material: clampStr(row.material, BLUEPRINT_LIMITS.SHORT_MAX),
    surfaceFinish: clampStr(row.surfaceFinish, BLUEPRINT_LIMITS.SHORT_MAX),
    setsPerCarton: nonNegNum(row.setsPerCarton, 0),
    cartonCount: nonNegNum(row.cartonCount, 0),
    sharedCarton: Boolean(row.sharedCarton),
    qty: nonNegNum(row.qty, 0),
    unitWeightKg: nonNegNum(row.unitWeightKg, 0),
    totalWeightKg: nonNegNum(row.totalWeightKg, 0),
  };
}

export function sanitizeOrderPayload(o: ExportOrder, ownerId: string) {
  const safeItems = Array.isArray(o.items)
    ? o.items.slice(0, BLUEPRINT_LIMITS.MAX_ORDER_ITEMS).map(sanitizeOrderItem)
    : [];
  const safePackingRows = Array.isArray(o.packingRows)
    ? o.packingRows.slice(0, BLUEPRINT_LIMITS.MAX_PACKING_ROWS).map(sanitizePackingRow)
    : [];
  const currency = clampCurrency(o.currency, 'USD');

  return {
    id: sanitizeId(o.id, 'ord'),
    ownerId,
    invoiceNo: clampNonEmptyStr(o.invoiceNo, BLUEPRINT_LIMITS.INVOICE_MAX, `HL-INV-${Date.now()}`),
    poNo: clampStr(o.poNo, BLUEPRINT_LIMITS.INVOICE_MAX),
    orderDate: clampStr(o.orderDate, BLUEPRINT_LIMITS.DATE_MAX),
    paymentTerms: clampStr(o.paymentTerms, BLUEPRINT_LIMITS.MEDIUM_MAX),
    currency,
    exchangeRate: resolveEffectiveExchangeRate(currency, o.exchangeRate),
    supplierId: clampStr(o.supplierId, BLUEPRINT_LIMITS.ID_MAX),
    customerId: clampStr(o.customerId, BLUEPRINT_LIMITS.ID_MAX),
    billToCustomerId: clampStr(o.billToCustomerId, BLUEPRINT_LIMITS.ID_MAX),
    bankAccountId: clampStr(o.bankAccountId, BLUEPRINT_LIMITS.ID_MAX),
    itemHeader: clampStr(o.itemHeader, BLUEPRINT_LIMITS.MEDIUM_MAX),
    palletCount: nonNegNum(o.palletCount, 0),
    emptyCartons: nonNegNum(o.emptyCartons, 0),
    cartonsPerLayer: Math.max(1, Math.round(nonNegNum(o.cartonsPerLayer, 12))),
    palletVolumeDetails: clampStr(o.palletVolumeDetails, BLUEPRINT_LIMITS.LONG_MAX),
    surfaceFootnotes: clampStr(o.surfaceFootnotes, BLUEPRINT_LIMITS.LONG_MAX),
    packingRows: safePackingRows,
    items: safeItems,
    shipping: {
      mode: clampTransportMode(o.shipping?.mode),
      logisticsProviderId: clampStr(o.shipping?.logisticsProviderId, BLUEPRINT_LIMITS.ID_MAX),
      incoterm: clampIncoterm(o.shipping?.incoterm),
      incotermPlace: clampStr(o.shipping?.incotermPlace, BLUEPRINT_LIMITS.MEDIUM_MAX),
      portOfLoading: clampStr(o.shipping?.portOfLoading, BLUEPRINT_LIMITS.MEDIUM_MAX),
      portOfDischarge: clampStr(o.shipping?.portOfDischarge, BLUEPRINT_LIMITS.MEDIUM_MAX),
      vesselOrFlightOrCourier: clampStr(
        o.shipping?.vesselOrFlightOrCourier,
        BLUEPRINT_LIMITS.MEDIUM_MAX,
      ),
      trackingOrBlNo: clampStr(o.shipping?.trackingOrBlNo, BLUEPRINT_LIMITS.MEDIUM_MAX),
      etd: clampStr(o.shipping?.etd, BLUEPRINT_LIMITS.DATE_MAX),
      eta: clampStr(o.shipping?.eta, BLUEPRINT_LIMITS.DATE_MAX),
      shippingMarksMain: clampStr(o.shipping?.shippingMarksMain, BLUEPRINT_LIMITS.MEDIUM_MAX),
      caseNumberPrefix: clampStr(o.shipping?.caseNumberPrefix, BLUEPRINT_LIMITS.SHORT_MAX),
    },
    costs: {
      packingHandlingCost: nonNegNum(o.costs?.packingHandlingCost, 0),
      inlandFreightCost: nonNegNum(o.costs?.inlandFreightCost, 0),
      mainFreightCost: nonNegNum(o.costs?.mainFreightCost, 0),
      insuranceMode:
        o.costs?.insuranceMode === 'AUTO_PERCENT'
          ? ('AUTO_PERCENT' as const)
          : ('MANUAL' as const),
      insuranceManualCost: nonNegNum(o.costs?.insuranceManualCost, 0),
      insuranceRatePercent: nonNegNum(o.costs?.insuranceRatePercent, 0),
      destinationHandlingCost: nonNegNum(o.costs?.destinationHandlingCost, 0),
      importDutyTaxCost: nonNegNum(o.costs?.importDutyTaxCost, 0),
    },
    remarks: clampStr(o.remarks, BLUEPRINT_LIMITS.LONG_MAX),
    docOverrides: sanitizeDocOverrides(o.docOverrides),
    docSpecialFields: sanitizeDocSpecialFields(o.docSpecialFields),
    orderCreatedAt: clampStr(o.createdAt, BLUEPRINT_LIMITS.TIMESTAMP_STR_MAX),
    orderUpdatedAt: clampStr(o.updatedAt, BLUEPRINT_LIMITS.TIMESTAMP_STR_MAX),
  };
}

export function sanitizeAuditLogPayload(log: AuditLogEntry, ownerId: string) {
  const validActions: AuditLogEntry['action'][] = [
    'CREATE_ORDER',
    'UPDATE_ORDER',
    'DELETE_ORDER',
    'DUPLICATE_ORDER',
    'MASTER_UPDATE',
    'RESTORE_BACKUP',
  ];
  return {
    id: sanitizeId(log.id, 'log'),
    ownerId,
    timestamp: clampNonEmptyStr(
      log.timestamp,
      BLUEPRINT_LIMITS.TIMESTAMP_STR_MAX,
      new Date().toISOString(),
    ),
    action: validActions.includes(log.action) ? log.action : 'UPDATE_ORDER',
    targetLabel: clampStr(log.targetLabel, BLUEPRINT_LIMITS.MEDIUM_MAX),
    summary: clampStr(log.summary, BLUEPRINT_LIMITS.LONG_MAX),
  };
}
