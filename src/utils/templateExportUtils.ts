import XlsxStylePkg from 'xlsx-js-style';
import type * as XlsxTypes from 'xlsx-js-style';
import PizZipPkg from 'pizzip';
import DocxtemplaterPkg from 'docxtemplater';
import type {
  BankAccount,
  ContractSettings,
  Customer,
  CustomerDocumentTemplate,
  DocLanguage,
  DocTemplateScope,
  ExportOrder,
  Product,
  Supplier,
  TemplateSystemFieldKey,
} from '../types/erp';
import {
  calculateOrderSummary,
  cleanFloat,
  resolveEffectiveExchangeRate,
} from './exportCalculations';
import {
  formatCurrencyLabel,
  formatDocMoney,
  formatDocumentDate,
  resolveItemSpecs,
  resolveOrderItemPartName,
} from './documentHelpers';
import {
  createDefaultContractSettings,
  interpolateContractText,
  numberToContractWords,
} from './contractDefaults';

type XlsxModule = typeof import('xlsx-js-style');
const XLSX: XlsxModule =
  (XlsxStylePkg as unknown as { default?: XlsxModule }).default ?? XlsxStylePkg;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PizZip: typeof PizZipPkg = (PizZipPkg as any).default ?? PizZipPkg;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Docxtemplater: typeof DocxtemplaterPkg =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (DocxtemplaterPkg as any).default ?? DocxtemplaterPkg;

export interface TemplateFieldDefinition {
  key: TemplateSystemFieldKey;
  labelZh: string;
  labelEn: string;
  sample: string;
}

export const TEMPLATE_SYSTEM_FIELDS: TemplateFieldDefinition[] = [
  { key: 'invoiceNo', labelZh: '发票号 / 合同编号', labelEn: 'Invoice / Contract No.', sample: 'H249406' },
  { key: 'contractNo', labelZh: '合同编号', labelEn: 'Contract No.', sample: 'H251699' },
  { key: 'poNo', labelZh: '客户订单号 (PO No.)', labelEn: 'Customer PO No.', sample: 'PO-2026-01' },
  { key: 'orderDate', labelZh: '单据日期', labelEn: 'Order Date', sample: 'Oct. 16, 2026' },
  { key: 'currency', labelZh: '结算币种', labelEn: 'Currency', sample: 'USD' },
  { key: 'exchangeRate', labelZh: '汇率 (对日元)', labelEn: 'Exchange Rate', sample: '150' },
  { key: 'incoterm', labelZh: '贸易术语 (Incoterm)', labelEn: 'Incoterm', sample: 'FOB' },
  { key: 'incotermPlace', labelZh: '交货地点 / 目的港', labelEn: 'Incoterm Place', sample: 'OSAKA' },
  { key: 'paymentTerms', labelZh: '付款方式', labelEn: 'Payment Terms', sample: 'T/T IN ADVANCE' },
  { key: 'portOfLoading', labelZh: '起运港', labelEn: 'Port of Loading', sample: 'OSAKA PORT' },
  { key: 'portOfDischarge', labelZh: '目的港', labelEn: 'Port of Discharge', sample: 'DALIAN, CHINA' },
  { key: 'vesselOrFlight', labelZh: '船名 / 航班 / 快递', labelEn: 'Vessel / Flight', sample: 'AN DA 2643W' },
  { key: 'etd', labelZh: '预计发运日 (ETD)', labelEn: 'ETD', sample: 'Oct. 27, 2026' },
  { key: 'eta', labelZh: '预计到达日 (ETA)', labelEn: 'ETA', sample: 'Nov. 5, 2026' },
  { key: 'customerName', labelZh: '客户公司全称 (收货人)', labelEn: 'Customer / Ship To Name', sample: 'NANJING HAOXUN' },
  { key: 'customerAddress', labelZh: '客户详细地址', labelEn: 'Customer Address', sample: 'No. 102...' },
  { key: 'customerCountry', labelZh: '客户国家/地区', labelEn: 'Customer Country', sample: 'CHINA' },
  { key: 'customerContact', labelZh: '客户联系人', labelEn: 'Customer Contact', sample: 'Ms. Zhou' },
  { key: 'customerPhone', labelZh: '客户电话', labelEn: 'Customer Phone', sample: '+86-137-7099-7449' },
  { key: 'customerFax', labelZh: '客户传真 (Fax)', labelEn: 'Customer Fax', sample: '-' },
  { key: 'customerTaxId', labelZh: '客户税号 / 进口商代码', labelEn: 'Customer Tax ID', sample: '913201...' },
  { key: 'billToName', labelZh: '账单抬头 / 买方名称', labelEn: 'Bill To Name', sample: 'HARDLOCK JIANGSU' },
  { key: 'billToAddress', labelZh: '账单抬头 / 买方地址', labelEn: 'Bill To Address', sample: 'Plant four...' },
  { key: 'supplierName', labelZh: '出口方 / 卖方名称', labelEn: 'Supplier / Seller Name', sample: 'HARDLOCK Industry Co., Ltd.' },
  { key: 'supplierAddress', labelZh: '出口方 / 卖方地址', labelEn: 'Supplier Address', sample: '1-6-24, Kawamata...' },
  { key: 'supplierPhone', labelZh: '出口方电话', labelEn: 'Supplier Phone', sample: '81-6-6784-1131' },
  { key: 'supplierFax', labelZh: '出口方传真', labelEn: 'Supplier Fax', sample: '81-6-6784-1161' },
  { key: 'supplierTaxId', labelZh: '出口方税号', labelEn: 'Supplier Tax ID', sample: 'JP-T1234567' },
  { key: 'bankName', labelZh: '收款银行名称', labelEn: 'Bank Name', sample: 'MUFG Bank, LTD.' },
  { key: 'bankSwift', labelZh: '银行 SWIFT 代码', labelEn: 'Bank SWIFT', sample: 'BOTKJPJT' },
  { key: 'bankAccountNo', labelZh: '收款银行账号', labelEn: 'Bank Account No.', sample: '0051892' },
  { key: 'totalQty', labelZh: '总数量', labelEn: 'Total Quantity', sample: '78,110' },
  { key: 'totalCartons', labelZh: '总箱数', labelEn: 'Total Cartons', sample: '569' },
  { key: 'palletCount', labelZh: '托盘总数量', labelEn: 'Pallet Count', sample: '10' },
  { key: 'emptyCartons', labelZh: '空箱补足数量', labelEn: 'Empty Cartons', sample: '7' },
  { key: 'totalNetWeight', labelZh: '总净重 (kg)', labelEn: 'Total Net Weight', sample: '8249.1' },
  { key: 'totalGrossWeight', labelZh: '总毛重 (kg)', labelEn: 'Total Gross Weight', sample: '8794.0' },
  { key: 'totalCbm', labelZh: '总体积 (CBM)', labelEn: 'Total CBM', sample: '8.663' },
  { key: 'exwTotal', labelZh: 'EXW 货值小计', labelEn: 'EXW Total', sample: 'JPY 689,250' },
  { key: 'freightTotal', labelZh: '运费合计', labelEn: 'Freight Total', sample: 'JPY 93,000' },
  { key: 'totalAmount', labelZh: '单据最终总金额', labelEn: 'Total Amount', sample: 'JPY 782,250' },
  { key: 'totalAmountWords', labelZh: '总金额英文大写', labelEn: 'Total Amount in Words', sample: 'JPY SEVEN HUNDRED...' },
  { key: 'remarks', labelZh: '单据备注', labelEn: 'Remarks', sample: 'Special handling...' },
  { key: 'itemsSummary', labelZh: '产品明细汇总文本', labelEn: 'Items Summary', sample: 'HLN-R10C x 800...' },
  { key: 'firstItemSku', labelZh: '首行产品编号 (SKU)', labelEn: 'First Item SKU', sample: 'HLN-R27C-8MP' },
  { key: 'firstItemName', labelZh: '首行产品名称', labelEn: 'First Item Name', sample: 'HARDLOCK NUT M27x3.0' },
];

export interface TemplateContextInput {
  customer?: Customer;
  billToCustomer?: Customer;
  supplier?: Supplier;
  bank?: BankAccount;
  products: Product[];
  docLang?: DocLanguage;
  contractSettings?: ContractSettings;
}

export function getOverride(
  order: ExportOrder,
  key: string,
  fallback: string,
): string {
  const ov = order.docOverrides?.[key];
  return ov !== undefined ? ov : fallback;
}

export function buildTemplateDataContext(
  order: ExportOrder,
  ctx: TemplateContextInput,
): {
  fields: Record<TemplateSystemFieldKey, string | number>;
  items: {
    index: number;
    sku: string;
    description: string;
    size: string;
    material: string;
    surfaceFinish: string;
    hsCode: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    unitPriceFormatted: string;
    amount: number;
    amountFormatted: string;
    cartons: number;
    netWeightKg: number;
    grossWeightKg: number;
  }[];
  disclaimer: string;
  customNote: string;
  stampLabel: string;
} {
  const docLang = ctx.docLang ?? 'en';
  const summary = calculateOrderSummary(
    order.items,
    order.costs,
    order.shipping.incoterm,
    order.currency,
    order.palletCount ?? 0,
  );
  const customer = ctx.customer;
  const billTo = ctx.billToCustomer ?? customer;
  const supplier = ctx.supplier;
  const bank = ctx.bank;
  const products = ctx.products ?? [];
  const rate = resolveEffectiveExchangeRate(order.currency, order.exchangeRate);
  const settings = ctx.contractSettings ?? createDefaultContractSettings();

  const invoiceNo = getOverride(order, 'inv.invoiceNo', order.invoiceNo || '');
  const contractNo = getOverride(order, 'contract.no', order.invoiceNo || '');
  const orderDateFormatted = getOverride(
    order,
    'inv.orderDate',
    formatDocumentDate(order.orderDate, docLang),
  );
  const freightTotal =
    (summary.flags.includesInland ? summary.inlandFreightCost : 0) +
    (summary.flags.includesMainFreight ? summary.mainFreightCost : 0);

  const firstItem = order.items[0];
  const items = order.items.map((item, idx) => {
    const prod = products.find((p) => p.id === item.productId);
    const specs = resolveItemSpecs(item, prod);
    const calc = summary.lineItems[idx];
    const resolvedPartName = resolveOrderItemPartName(item, customer, products);
    return {
      index: idx + 1,
      sku: item.sku || '',
      description: resolvedPartName === '—' ? '' : resolvedPartName,
      size: specs.size,
      material: specs.material,
      surfaceFinish: specs.surfaceFinish,
      hsCode: item.hsCode || '',
      quantity: item.quantity,
      unit: item.unit || 'SETS',
      unitPrice: item.unitPrice,
      unitPriceFormatted: formatDocMoney(item.unitPrice, order.currency),
      amount: calc?.amount ?? 0,
      amountFormatted: formatDocMoney(calc?.amount ?? 0, order.currency),
      cartons: item.cartons,
      netWeightKg: cleanFloat(calc?.netWeightKg ?? 0),
      grossWeightKg: cleanFloat(calc?.grossWeightKg ?? 0),
    };
  });

  const totalAmountWords = getOverride(
    order,
    'contract.totalWords',
    numberToContractWords(summary.incotermTotal, order.currency),
  );

  const fields: Record<TemplateSystemFieldKey, string | number> = {
    invoiceNo,
    contractNo,
    poNo: order.poNo || '',
    orderDate: orderDateFormatted,
    currency: formatCurrencyLabel(order.currency),
    exchangeRate: rate,
    incoterm: order.shipping.incoterm,
    incotermPlace: order.shipping.incotermPlace || order.shipping.portOfDischarge || '',
    paymentTerms: getOverride(order, 'inv.paymentTerms', order.paymentTerms || ''),
    portOfLoading: getOverride(order, 'inv.portOfLoading', order.shipping.portOfLoading || ''),
    portOfDischarge: getOverride(order, 'inv.portOfDischarge', order.shipping.portOfDischarge || ''),
    vesselOrFlight: order.shipping.vesselOrFlightOrCourier || '',
    etd: order.shipping.etd ? formatDocumentDate(order.shipping.etd, docLang) : '',
    eta: order.shipping.eta ? formatDocumentDate(order.shipping.eta, docLang) : '',
    customerName: getOverride(order, 'inv.shipToName', customer?.name || ''),
    customerAddress: getOverride(order, 'inv.shipToAddress', customer?.address || ''),
    customerCountry: customer?.country || '',
    customerContact: customer?.contactName || '',
    customerPhone: customer?.phone || '',
    customerFax: customer?.fax || '',
    customerTaxId: customer?.taxOrImporterId || '',
    billToName: getOverride(order, 'inv.billToName', billTo?.name || ''),
    billToAddress: getOverride(order, 'inv.billToAddress', billTo?.address || ''),
    supplierName: getOverride(order, 'inv.supplierName', supplier?.name || 'HARDLOCK Industry Co., Ltd.'),
    supplierAddress: getOverride(order, 'inv.supplierAddress', supplier?.address || ''),
    supplierPhone: supplier?.phone || '',
    supplierFax: supplier?.fax || '',
    supplierTaxId: supplier?.taxOrExporterId || '',
    bankName: bank?.bankName || '',
    bankSwift: bank?.swiftCode || '',
    bankAccountNo: bank?.accountNumber || '',
    totalQty: summary.totalQuantity,
    totalCartons: summary.totalCartons,
    palletCount: order.palletCount ?? 0,
    emptyCartons: order.emptyCartons ?? 0,
    totalNetWeight: cleanFloat(summary.totalNetWeightKg),
    totalGrossWeight: cleanFloat(summary.totalGrossWeightKg),
    totalCbm: cleanFloat(summary.totalCbm),
    exwTotal: formatDocMoney(summary.exwTotal, order.currency),
    freightTotal: formatDocMoney(freightTotal, order.currency),
    totalAmount: formatDocMoney(summary.incotermTotal, order.currency),
    totalAmountWords,
    remarks: getOverride(order, 'inv.remarks', order.remarks || ''),
    itemsSummary: items
      .map(
        (i) =>
          `${
            i.description && i.sku && i.description !== i.sku
              ? `${i.description} (${i.sku})`
              : i.description || i.sku
          } × ${i.quantity} ${i.unit}`,
      )
      .join('; '),
    firstItemSku: firstItem?.sku || '',
    firstItemName:
      items[0]?.description ||
      (firstItem
        ? resolveOrderItemPartName(firstItem, customer, products)
        : ''),
  };

  const special = order.docSpecialFields;
  const rawDisclaimer =
    special?.disclaimerText?.trim() || settings.defaultDisclaimerText;
  const disclaimer = special?.showDisclaimer
    ? interpolateContractText(rawDisclaimer, order, supplier)
    : '';
  const customNote = special?.customNote?.trim() || '';
  const stampLabel = special?.showCompanyStamp ? settings.companyStampLabel : '';

  return {
    fields,
    items,
    disclaimer,
    customNote,
    stampLabel,
  };
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  if (typeof btoa === 'function') {
    return btoa(binary);
  }
  return Buffer.from(bytes).toString('base64');
}

export function base64ToUint8Array(base64: string): Uint8Array {
  if (typeof atob === 'function') {
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    return bytes;
  }
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

export interface InspectedTemplateResult {
  fileType: 'xlsx' | 'docx';
  fileName: string;
  fileBase64: string;
  detectedPlaceholders: string[];
  detectedCells: string[];
  error?: string;
}

export async function inspectUploadedTemplate(
  file: File,
): Promise<InspectedTemplateResult> {
  const lower = file.name.toLowerCase();
  const isXlsx = lower.endsWith('.xlsx');
  const isDocx = lower.endsWith('.docx');

  if (!isXlsx && !isDocx) {
    return {
      fileType: 'xlsx',
      fileName: file.name,
      fileBase64: '',
      detectedPlaceholders: [],
      detectedCells: [],
      error: '仅支持上传 .xlsx 或 .docx 模板文件',
    };
  }

  // Keep base64 well under 450,000 chars so Firestore 1MB document limit is respected
  if (file.size > 330 * 1024) {
    return {
      fileType: isXlsx ? 'xlsx' : 'docx',
      fileName: file.name,
      fileBase64: '',
      detectedPlaceholders: [],
      detectedCells: [],
      error: '模板文件超过 330KB 云端限制，请精简模板内嵌图片或格式后重试',
    };
  }

  const buffer = await file.arrayBuffer();
  const fileBase64 = arrayBufferToBase64(buffer);
  const placeholders = new Set<string>();
  const cells: string[] = [];

  if (isXlsx) {
    const wb = XLSX.read(buffer, { type: 'array', cellStyles: true });
    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      if (!ws) continue;
      for (const addr of Object.keys(ws)) {
        if (addr.startsWith('!')) continue;
        const cell = ws[addr] as XlsxTypes.CellObject | undefined;
        if (!cell || cell.v === undefined || cell.v === null) continue;
        const text = String(cell.v);
        if (cells.length < 40) {
          cells.push(addr);
        }
        const matches = text.match(/\{([a-zA-Z0-9_]+)\}/g);
        if (matches) {
          matches.forEach((m) => placeholders.add(m.slice(1, -1)));
        }
      }
    }
    return {
      fileType: 'xlsx',
      fileName: file.name,
      fileBase64,
      detectedPlaceholders: Array.from(placeholders),
      detectedCells: cells,
    };
  }

  const zip = new PizZip(buffer);
  const xmlFiles = Object.keys(zip.files).filter(
    (name) => name.startsWith('word/') && name.endsWith('.xml'),
  );
  for (const name of xmlFiles) {
    const rawXml = zip.file(name)?.asText() ?? '';
    const stripped = rawXml.replace(/<[^>]+>/g, '');
    const matches = stripped.match(/\{([a-zA-Z0-9_#\/]+)\}/g);
    if (matches) {
      matches.forEach((m) => placeholders.add(m.replace(/[{}#\/]/g, '')));
    }
  }

  return {
    fileType: 'docx',
    fileName: file.name,
    fileBase64,
    detectedPlaceholders: Array.from(placeholders),
    detectedCells: [],
  };
}

export function findMatchingCustomerTemplate(
  customer: Customer | undefined,
  scope: DocTemplateScope,
): CustomerDocumentTemplate | undefined {
  const templates = customer?.documentTemplates;
  if (!Array.isArray(templates) || templates.length === 0) return undefined;
  return (
    templates.find((tpl) => tpl.docScope === scope) ??
    templates.find((tpl) => tpl.docScope === 'all') ??
    (scope === 'all' ? templates[0] : undefined)
  );
}

function setCellValuePreservingStyle(
  ws: XlsxTypes.WorkSheet,
  addr: string,
  val: string | number,
): void {
  const existing = ws[addr] as XlsxTypes.CellObject | undefined;
  const isNum = typeof val === 'number' && Number.isFinite(val);
  if (existing) {
    existing.v = val;
    existing.t = isNum ? 'n' : 's';
    delete existing.w;
  } else {
    ws[addr] = {
      v: val,
      t: isNum ? 'n' : 's',
      s: {
        font: { name: 'Times New Roman', sz: 10 },
      },
    } as XlsxTypes.CellObject;
  }

  // Expand !ref if addr is outside current sheet range
  const decoded = XLSX.utils.decode_cell(addr);
  const curRef = ws['!ref']
    ? XLSX.utils.decode_range(ws['!ref'])
    : { s: { r: decoded.r, c: decoded.c }, e: { r: decoded.r, c: decoded.c } };
  if (decoded.r < curRef.s.r) curRef.s.r = decoded.r;
  if (decoded.c < curRef.s.c) curRef.s.c = decoded.c;
  if (decoded.r > curRef.e.r) curRef.e.r = decoded.r;
  if (decoded.c > curRef.e.c) curRef.e.c = decoded.c;
  ws['!ref'] = XLSX.utils.encode_range(curRef);
}

const EXCEL_CELL_REF_RE = /^(?:([A-Za-z0-9_\- ]+)!)?([A-Z]{1,3}[0-9]{1,5})$/;

export function buildWorkbookFromCustomXlsxTemplate(
  order: ExportOrder,
  template: CustomerDocumentTemplate,
  ctx: TemplateContextInput,
): XlsxTypes.WorkBook {
  const bytes = base64ToUint8Array(template.fileBase64);
  const wb = XLSX.read(bytes, { type: 'array', cellStyles: true });
  const dataCtx = buildTemplateDataContext(order, ctx);
  const firstSheetName = wb.SheetNames[0];
  if (!firstSheetName) {
    throw new Error('Uploaded Excel template has no sheets');
  }

  // 1. Replace any {fieldKey} placeholders already present in any sheet
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    for (const addr of Object.keys(ws)) {
      if (addr.startsWith('!')) continue;
      const cell = ws[addr] as XlsxTypes.CellObject | undefined;
      if (!cell || typeof cell.v !== 'string') continue;
      if (!cell.v.includes('{')) continue;
      let next = cell.v;
      for (const [k, v] of Object.entries(dataCtx.fields)) {
        next = next.split(`{${k}}`).join(String(v ?? ''));
      }
      next = next
        .split('{disclaimer}')
        .join(dataCtx.disclaimer)
        .split('{customNote}')
        .join(dataCtx.customNote)
        .split('{stampLabel}')
        .join(dataCtx.stampLabel);
      if (next !== cell.v) {
        setCellValuePreservingStyle(ws, addr, next);
      }
    }
  }

  // 2. Apply explicit cell/tag mappings configured in UI
  for (const mapping of template.mappings) {
    const val = dataCtx.fields[mapping.systemField];
    if (val === undefined) continue;
    const rawTarget = mapping.targetRef.trim();
    if (!rawTarget) continue;

    const cellMatch = rawTarget.match(EXCEL_CELL_REF_RE);
    if (cellMatch) {
      const targetSheetName =
        cellMatch[1] && wb.Sheets[cellMatch[1]]
          ? cellMatch[1]
          : firstSheetName;
      const ws = wb.Sheets[targetSheetName];
      if (ws) {
        setCellValuePreservingStyle(ws, cellMatch[2], val);
      }
    } else {
      // Tag replacement mode (e.g. {CLIENT_NAME} or CLIENT_NAME)
      const needle = rawTarget.startsWith('{') ? rawTarget : `{${rawTarget}}`;
      for (const sheetName of wb.SheetNames) {
        const ws = wb.Sheets[sheetName];
        if (!ws) continue;
        for (const addr of Object.keys(ws)) {
          if (addr.startsWith('!')) continue;
          const cell = ws[addr] as XlsxTypes.CellObject | undefined;
          if (!cell || cell.v === undefined || cell.v === null) continue;
          const text = String(cell.v);
          if (text.includes(needle)) {
            setCellValuePreservingStyle(ws, addr, text.split(needle).join(String(val)));
          }
        }
      }
    }
  }

  // 3. Optional line-item table injection starting at itemsStartRow (1-indexed Excel row)
  if (template.itemsStartRow && template.itemsStartRow > 0) {
    const ws = wb.Sheets[firstSheetName];
    if (ws) {
      const startRowZero = template.itemsStartRow - 1;
      dataCtx.items.forEach((item, idx) => {
        const r = startRowZero + idx;
        const cols: (string | number)[] = [
          item.index,
          item.sku,
          item.description,
          item.size,
          item.material,
          item.surfaceFinish,
          item.hsCode,
          item.quantity,
          item.unit,
          item.unitPrice,
          item.amount,
        ];
        cols.forEach((colVal, cIdx) => {
          const addr = XLSX.utils.encode_cell({ r, c: cIdx });
          setCellValuePreservingStyle(ws, addr, colVal);
        });
      });
    }
  }

  return wb;
}

export function buildDocxBufferFromCustomTemplate(
  order: ExportOrder,
  template: CustomerDocumentTemplate,
  ctx: TemplateContextInput,
): Uint8Array {
  const bytes = base64ToUint8Array(template.fileBase64);
  const zip = new PizZip(bytes);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '{', end: '}' },
    nullGetter: () => '',
  });

  const dataCtx = buildTemplateDataContext(order, ctx);
  const renderPayload: Record<string, unknown> = {
    ...dataCtx.fields,
    items: dataCtx.items,
    disclaimer: dataCtx.disclaimer,
    customNote: dataCtx.customNote,
    stampLabel: dataCtx.stampLabel,
  };

  for (const mapping of template.mappings) {
    const val = dataCtx.fields[mapping.systemField];
    if (val === undefined) continue;
    const tagKey = mapping.targetRef.trim().replace(/^\{|\}$/g, '');
    if (tagKey) {
      renderPayload[tagKey] = val;
    }
  }

  doc.render(renderPayload);
  return doc.getZip().generate({
    type: 'uint8array',
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

export function exportWithCustomerTemplate(
  order: ExportOrder,
  template: CustomerDocumentTemplate,
  ctx: TemplateContextInput,
): void {
  const safeInv = (order.invoiceNo || 'hardlock-doc').replace(
    /[^a-zA-Z0-9_\-]/g,
    '_',
  );
  const safeTpl = (template.name || 'custom').replace(
    /[^a-zA-Z0-9_\-\u4e00-\u9fa5]/g,
    '_',
  );

  if (template.fileType === 'xlsx') {
    const wb = buildWorkbookFromCustomXlsxTemplate(order, template, ctx);
    XLSX.writeFile(wb, `${safeInv}-${safeTpl}.xlsx`);
    return;
  }

  const outBytes = buildDocxBufferFromCustomTemplate(order, template, ctx);
  const blob = new Blob([new Uint8Array(outBytes)], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${safeInv}-${safeTpl}.docx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
