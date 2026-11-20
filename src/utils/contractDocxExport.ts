import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  ImageRun,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx';
import type {
  ContractSettings,
  Customer,
  DocLanguage,
  ExportOrder,
  Product,
  Supplier,
  TransportMode,
} from '../types/erp';
import { calculateOrderSummary } from './exportCalculations';
import {
  formatDocMoney,
  formatDocumentDate,
  formatDocumentPartDisplay,
  resolveItemSpecs,
} from './documentHelpers';
import {
  createDefaultContractSettings,
  interpolateContractText,
  numberToContractWords,
} from './contractDefaults';
import {
  computeDocxImageBox,
  parseDataUrlImage,
} from './imageUploadUtils';

export interface ContractDocxExportContext {
  customer?: Customer;
  billToCustomer?: Customer;
  supplier?: Supplier;
  products: Product[];
  docLang?: DocLanguage;
  contractSettings?: ContractSettings;
}

const FONT_CONFIG = {
  ascii: 'Times New Roman',
  hAnsi: 'Times New Roman',
  cs: 'Times New Roman',
  eastAsia: 'SimSun',
};

const THIN_BORDER = {
  style: BorderStyle.SINGLE,
  size: 6,
  color: '000000',
};

const NO_BORDER = {
  style: BorderStyle.NONE,
  size: 0,
  color: 'FFFFFF',
};

const CELL_ALL_BORDERS = {
  top: THIN_BORDER,
  bottom: THIN_BORDER,
  left: THIN_BORDER,
  right: THIN_BORDER,
};

const CELL_NO_BORDERS = {
  top: NO_BORDER,
  bottom: NO_BORDER,
  left: NO_BORDER,
  right: NO_BORDER,
};

function getDocOverride(
  order: ExportOrder,
  key: string,
  fallback: string,
): string {
  const val = order.docOverrides?.[key];
  return val !== undefined ? val : fallback;
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

function getShortPlace(place: string | undefined): string {
  const raw = (place ?? '').trim();
  if (!raw) return '';
  return raw.split(',')[0].trim();
}

function makeRuns(
  text: string,
  opts?: {
    bold?: boolean;
    italics?: boolean;
    size?: number;
    color?: string;
    font?: typeof FONT_CONFIG;
  },
): TextRun[] {
  const lines = String(text ?? '').split(/\r?\n/);
  const runs: TextRun[] = [];
  lines.forEach((line, idx) => {
    if (idx > 0) {
      runs.push(new TextRun({ break: 1 }));
    }
    runs.push(
      new TextRun({
        text: line,
        bold: opts?.bold,
        italics: opts?.italics,
        size: opts?.size ?? 20, // 10pt
        color: opts?.color ?? '000000',
        font: opts?.font ?? FONT_CONFIG,
      }),
    );
  });
  return runs;
}

function makeCell(
  text: string,
  opts?: {
    widthPct?: number;
    colSpan?: number;
    rowSpan?: number;
    align?: (typeof AlignmentType)[keyof typeof AlignmentType];
    bold?: boolean;
    size?: number;
    shading?: string;
    borders?: typeof CELL_ALL_BORDERS;
  },
): TableCell {
  const lines = String(text ?? '').split(/\r?\n/);
  const paragraphs = lines.map(
    (line) =>
      new Paragraph({
        alignment: opts?.align ?? AlignmentType.LEFT,
        spacing: { before: 30, after: 30, line: 260 },
        children: [
          new TextRun({
            text: line,
            bold: opts?.bold,
            size: opts?.size ?? 19, // 9.5pt
            color: '000000',
            font: FONT_CONFIG,
          }),
        ],
      }),
  );

  return new TableCell({
    width:
      opts?.widthPct !== undefined
        ? { size: opts.widthPct, type: WidthType.PERCENTAGE }
        : undefined,
    columnSpan: opts?.colSpan,
    rowSpan: opts?.rowSpan,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 60, bottom: 60, left: 90, right: 90 },
    shading: opts?.shading
      ? { type: ShadingType.SOLID, color: opts.shading, fill: opts.shading }
      : undefined,
    borders: opts?.borders ?? CELL_ALL_BORDERS,
    children: paragraphs,
  });
}

export function buildContractDocxDocument(
  order: ExportOrder,
  ctx: ContractDocxExportContext,
): Document {
  const docLang = ctx.docLang ?? 'en';
  const supplier = ctx.supplier;
  const customer = ctx.customer;
  const buyer = ctx.billToCustomer ?? customer;
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
  const displayDate = getDocOverride(
    order,
    'contract.date',
    getDocOverride(
      order,
      'inv.orderDate',
      formatDocumentDate(order.orderDate, docLang),
    ),
  );
  const contractNo = getDocOverride(
    order,
    'contract.no',
    getDocOverride(order, 'inv.invoiceNo', order.invoiceNo),
  );

  const buyerName = getDocOverride(
    order,
    'contract.buyerName',
    buyer?.name || '—',
  );
  const buyerAddress = getDocOverride(
    order,
    'contract.buyerAddress',
    [buyer?.address, buyer?.country].filter(Boolean).join(', ') || '—',
  );
  const buyerPhone = getDocOverride(
    order,
    'contract.buyerPhone',
    buyer?.phone || '—',
  );
  const buyerFax = getDocOverride(
    order,
    'contract.buyerFax',
    buyer?.fax || '-',
  );

  const sellerName = getDocOverride(
    order,
    'contract.sellerName',
    supplier?.name || 'HARDLOCK INDUSTRY CO., LTD.',
  );
  const sellerAddress = getDocOverride(
    order,
    'contract.sellerAddress',
    supplier?.address ||
      '1-6-24, KAWAMATA, HIGASHI-OSAKA, OSAKA, JAPAN 577-0063',
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

  const preambleZh = getDocOverride(
    order,
    'contract.preambleZh',
    '兹经买卖双方同意按照以下条款由买方购进卖方售出以下商品。',
  );
  const preambleEn = getDocOverride(
    order,
    'contract.preambleEn',
    'THIS CONTRACT IS MADE BY AND BETWEEN THE BUYERS AND THE SELLERS, WHEREBY THE BUYERS AGREE TO BUY AND THE SELLERS AGREE TO SELL THE UNDER-MENTIONED GOODS SUBJECT TO THE TERMS AND CONDITIONS, AS STIPULATED HEREAFTER:',
  );

  const primaryUnit = order.items[0]?.unit || 'SET';
  const freightTotal =
    (summary.flags.includesInland ? summary.inlandFreightCost : 0) +
    (summary.flags.includesMainFreight ? summary.mainFreightCost : 0) +
    (summary.flags.includesInsurance ? summary.insuranceCost : 0) +
    (summary.flags.includesDestinationHandling
      ? summary.destinationHandlingCost
      : 0) +
    (summary.flags.includesImportDuty ? summary.importDutyTaxCost : 0);

  const totalWords = getDocOverride(
    order,
    'contract.totalWords',
    numberToContractWords(summary.incotermTotal, order.currency),
  );

  const special = order.docSpecialFields ?? {};
  const showSig = special.showSignature !== false;
  const stampLabel =
    settings.companyStampLabel || supplier?.name || 'HARDLOCK Industry Co., Ltd.';

  // Commodity table rows
  const tableRows: TableRow[] = [
    new TableRow({
      tableHeader: true,
      children: [
        makeCell('项目\nITEM\nNO.', {
          widthPct: 8,
          rowSpan: 2,
          align: AlignmentType.CENTER,
          bold: true,
          size: 18,
          shading: 'F8FAFC',
        }),
        makeCell('商品名称及规格\nNAME OF COMMODITY & SPECIFICATION', {
          widthPct: 50,
          colSpan: 3,
          align: AlignmentType.CENTER,
          bold: true,
          size: 18,
          shading: 'F8FAFC',
        }),
        makeCell('数量\nQUANTITY', {
          widthPct: 12,
          align: AlignmentType.CENTER,
          bold: true,
          size: 18,
          shading: 'F8FAFC',
        }),
        makeCell('单价\nUNIT PRICE', {
          widthPct: 14,
          align: AlignmentType.CENTER,
          bold: true,
          size: 18,
          shading: 'F8FAFC',
        }),
        makeCell('总价\nTOTAL PRICE', {
          widthPct: 16,
          align: AlignmentType.CENTER,
          bold: true,
          size: 18,
          shading: 'F8FAFC',
        }),
      ],
    }),
    new TableRow({
      tableHeader: true,
      children: [
        makeCell('ITEM', {
          widthPct: 18,
          align: AlignmentType.CENTER,
          bold: true,
          size: 18,
          shading: 'F8FAFC',
        }),
        makeCell('SIZE/PITCH', {
          widthPct: 14,
          align: AlignmentType.CENTER,
          bold: true,
          size: 18,
          shading: 'F8FAFC',
        }),
        makeCell('MATERIAL / FINISH', {
          widthPct: 18,
          align: AlignmentType.CENTER,
          bold: true,
          size: 18,
          shading: 'F8FAFC',
        }),
        makeCell(primaryUnit, {
          widthPct: 12,
          align: AlignmentType.CENTER,
          bold: true,
          size: 18,
          shading: 'F8FAFC',
        }),
        makeCell(order.currency, {
          widthPct: 14,
          align: AlignmentType.CENTER,
          bold: true,
          size: 18,
          shading: 'F8FAFC',
        }),
        makeCell(order.currency, {
          widthPct: 16,
          align: AlignmentType.CENTER,
          bold: true,
          size: 18,
          shading: 'F8FAFC',
        }),
      ],
    }),
  ];

  order.items.forEach((item, idx) => {
    const prod = products.find((p) => p.id === item.productId);
    const specs = resolveItemSpecs(item, prod);
    const partDisplay = formatDocumentPartDisplay(item, customer, products);
    const calc = summary.lineItems[idx];
    const matFinish = [specs.material, specs.surfaceFinish]
      .filter(Boolean)
      .join(' / ');
    tableRows.push(
      new TableRow({
        children: [
          makeCell(`${idx + 1}.`, {
            align: AlignmentType.CENTER,
            size: 19,
          }),
          makeCell(partDisplay.combinedLabel, {
            bold: true,
            size: 19,
          }),
          makeCell(specs.size || '—', {
            align: AlignmentType.CENTER,
            size: 19,
          }),
          makeCell(matFinish || '—', {
            align: AlignmentType.CENTER,
            size: 19,
          }),
          makeCell(item.quantity.toLocaleString(), {
            align: AlignmentType.RIGHT,
            size: 19,
          }),
          makeCell(formatDocMoney(item.unitPrice, order.currency), {
            align: AlignmentType.RIGHT,
            size: 19,
          }),
          makeCell(formatDocMoney(calc?.amount ?? 0, order.currency), {
            align: AlignmentType.RIGHT,
            size: 19,
          }),
        ],
      }),
    );
  });

  tableRows.push(
    new TableRow({
      children: [
        makeCell('Ex-works Total', {
          colSpan: 6,
          align: AlignmentType.RIGHT,
          bold: true,
          size: 19,
        }),
        makeCell(formatDocMoney(summary.exwTotal, order.currency), {
          align: AlignmentType.RIGHT,
          bold: true,
          size: 19,
        }),
      ],
    }),
  );

  if (freightTotal > 0) {
    tableRows.push(
      new TableRow({
        children: [
          makeCell(getModeFreightLabel(order.shipping.mode), {
            colSpan: 6,
            align: AlignmentType.RIGHT,
            bold: true,
            size: 19,
          }),
          makeCell(formatDocMoney(freightTotal, order.currency), {
            align: AlignmentType.RIGHT,
            bold: true,
            size: 19,
          }),
        ],
      }),
    );
  }

  tableRows.push(
    new TableRow({
      children: [
        makeCell(`${order.shipping.incoterm} ${placeShort}`.trim(), {
          colSpan: 6,
          align: AlignmentType.RIGHT,
          bold: true,
          size: 19,
        }),
        makeCell(formatDocMoney(summary.incotermTotal, order.currency), {
          align: AlignmentType.RIGHT,
          bold: true,
          size: 19,
        }),
      ],
    }),
  );

  tableRows.push(
    new TableRow({
      children: [
        makeCell(`总 价 TOTAL VALUE : ${totalWords}`, {
          colSpan: 7,
          align: AlignmentType.LEFT,
          bold: true,
          size: 19,
        }),
      ],
    }),
  );

  const commodityTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    rows: tableRows,
  });

  // Bilingual clauses rows
  const clauseParagraphs: Paragraph[] = [];
  settings.clauses.forEach((clause) => {
    const titleLine = getDocOverride(
      order,
      `contract.clause.${clause.number}.title`,
      `${clause.titleZh}   ${clause.titleEn} :`,
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

    clauseParagraphs.push(
      new Paragraph({
        spacing: { before: 140, after: 40 },
        keepNext: true,
        children: makeRuns(`${clause.number}.   ${titleLine}`, {
          bold: true,
          size: 20,
        }),
      }),
    );

    if (bodyZh.trim()) {
      clauseParagraphs.push(
        new Paragraph({
          indent: { left: 420 },
          spacing: { before: 20, after: 40, line: 280 },
          children: makeRuns(bodyZh, { size: 19 }),
        }),
      );
    }

    if (bodyEn.trim()) {
      clauseParagraphs.push(
        new Paragraph({
          indent: { left: 420 },
          spacing: { before: 20, after: 80, line: 280 },
          children: makeRuns(bodyEn.toUpperCase(), { size: 19 }),
        }),
      );
    }
  });

  // Dual Buyer & Seller signature table
  const buyerSignatory = getDocOverride(
    order,
    'contract.buyerSignatory',
    buyer?.contactName || 'AUTHORIZED REPRESENTATIVE',
  );
  const buyerSignatoryTitle = getDocOverride(
    order,
    'contract.buyerSignatoryTitle',
    'MANAGING DIRECTOR',
  );
  const sellerSignatory = getDocOverride(
    order,
    'contract.sellerSignatory',
    supplier?.signatoryName || 'MR. SONG SHANGHUA',
  );
  const sellerSignatoryTitle = getDocOverride(
    order,
    'contract.sellerSignatoryTitle',
    supplier?.signatoryTitle || 'OVERSEAS SALES',
  );
  const sigMark = showSig
    ? supplier?.signatoryName?.replace(/^(Mr\.|Ms\.)\s*/i, '') ||
      'Song Shanghua'
    : '';
  const parsedSignatureImage = showSig
    ? parseDataUrlImage(settings.signatureImage ?? '')
    : null;
  const parsedStampImage = special.showCompanyStamp
    ? parseDataUrlImage(settings.companyStampImage ?? '')
    : null;

  const sellerSignParagraphs: Paragraph[] = [
    new Paragraph({
      spacing: { before: 40, after: 40 },
      children: makeRuns('卖方 : THE SELLER:', { size: 20 }),
    }),
    new Paragraph({
      spacing: { before: 20, after: 40 },
      children: makeRuns(sellerName.toUpperCase(), { bold: true, size: 20 }),
    }),
    new Paragraph({
      spacing: { before: 20, after: 120 },
      children: makeRuns(`DATE : ${displayDate}`, { size: 20 }),
    }),
    new Paragraph({
      spacing: { before: 140, after: 40 },
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000' },
      },
      children: parsedSignatureImage
        ? [
            new ImageRun({
              type: parsedSignatureImage.docxType,
              data: parsedSignatureImage.bytes,
              transformation: computeDocxImageBox(
                parsedSignatureImage.bytes,
                parsedSignatureImage.docxType,
                150,
                42,
              ),
            }),
          ]
        : sigMark
          ? makeRuns(sigMark, {
              italics: true,
              size: 30,
              color: '475569',
            })
          : makeRuns(' ', { size: 24 }),
    }),
    new Paragraph({
      spacing: { before: 40, after: 20 },
      children: makeRuns(sellerSignatory, { size: 19 }),
    }),
    new Paragraph({
      spacing: { before: 10, after: 20 },
      children: makeRuns(sellerSignatoryTitle, { size: 19 }),
    }),
  ];

  if (special.showCompanyStamp) {
    if (parsedStampImage) {
      sellerSignParagraphs.push(
        new Paragraph({
          spacing: { before: 80, after: 40 },
          alignment: AlignmentType.RIGHT,
          children: [
            new ImageRun({
              type: parsedStampImage.docxType,
              data: parsedStampImage.bytes,
              transformation: computeDocxImageBox(
                parsedStampImage.bytes,
                parsedStampImage.docxType,
                92,
                92,
              ),
            }),
          ],
        }),
      );
    } else {
      sellerSignParagraphs.push(
        new Paragraph({
          spacing: { before: 100, after: 40 },
          border: {
            top: { style: BorderStyle.SINGLE, size: 6, color: 'B91C1C' },
            bottom: { style: BorderStyle.SINGLE, size: 6, color: 'B91C1C' },
            left: { style: BorderStyle.SINGLE, size: 6, color: 'B91C1C' },
            right: { style: BorderStyle.SINGLE, size: 6, color: 'B91C1C' },
          },
          alignment: AlignmentType.CENTER,
          children: makeRuns(`[AUTHORIZED SEAL / 公章] ${stampLabel}`, {
            bold: true,
            size: 18,
            color: 'B91C1C',
          }),
        }),
      );
    }
  }

  const signatureTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            width: { size: 48, type: WidthType.PERCENTAGE },
            borders: CELL_NO_BORDERS,
            margins: { top: 80, bottom: 80, left: 0, right: 240 },
            children: [
              new Paragraph({
                spacing: { before: 40, after: 40 },
                children: makeRuns('买方 : THE BUYER:', { size: 20 }),
              }),
              new Paragraph({
                spacing: { before: 20, after: 40 },
                children: makeRuns(buyerName.toUpperCase(), {
                  bold: true,
                  size: 20,
                }),
              }),
              new Paragraph({
                spacing: { before: 20, after: 120 },
                children: makeRuns('DATE :', { size: 20 }),
              }),
              new Paragraph({
                spacing: { before: 140, after: 40 },
                border: {
                  bottom: {
                    style: BorderStyle.SINGLE,
                    size: 6,
                    color: '000000',
                  },
                },
                children: makeRuns(' ', { size: 30 }),
              }),
              new Paragraph({
                spacing: { before: 40, after: 20 },
                children: makeRuns(buyerSignatory, { size: 19 }),
              }),
              new Paragraph({
                spacing: { before: 10, after: 20 },
                children: makeRuns(buyerSignatoryTitle, { size: 19 }),
              }),
            ],
          }),
          new TableCell({
            width: { size: 4, type: WidthType.PERCENTAGE },
            borders: CELL_NO_BORDERS,
            children: [new Paragraph({ children: [] })],
          }),
          new TableCell({
            width: { size: 48, type: WidthType.PERCENTAGE },
            borders: CELL_NO_BORDERS,
            margins: { top: 80, bottom: 80, left: 240, right: 0 },
            children: sellerSignParagraphs,
          }),
        ],
      }),
    ],
  });

  // Optional disclaimer & custom note
  const specialFooterParagraphs: Paragraph[] = [];
  if (special.showDisclaimer) {
    const rawDisclaimer =
      special.disclaimerText?.trim() || settings.defaultDisclaimerText;
    const resolvedDisclaimer = interpolateContractText(
      rawDisclaimer,
      order,
      supplier,
    );
    if (resolvedDisclaimer) {
      specialFooterParagraphs.push(
        new Paragraph({
          spacing: { before: 160, after: 40 },
          border: {
            top: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
          },
          children: [
            new TextRun({
              text: 'Disclaimer : ',
              bold: true,
              size: 18,
              color: '334155',
              font: FONT_CONFIG,
            }),
            ...makeRuns(resolvedDisclaimer, {
              italics: true,
              size: 18,
              color: '334155',
            }),
          ],
        }),
      );
    }
  }
  if (special.customNote?.trim()) {
    specialFooterParagraphs.push(
      new Paragraph({
        spacing: { before: 60, after: 40 },
        children: [
          new TextRun({
            text: 'Note : ',
            bold: true,
            size: 18,
            color: '334155',
            font: FONT_CONFIG,
          }),
          ...makeRuns(special.customNote.trim(), {
            size: 18,
            color: '334155',
          }),
        ],
      }),
    );
  }

  return new Document({
    styles: {
      default: {
        document: {
          run: {
            font: FONT_CONFIG,
            size: 20,
            color: '000000',
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 }, // A4 portrait in twips
            margin: { top: 1000, bottom: 1000, left: 1100, right: 1100 },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                border: {
                  bottom: {
                    style: BorderStyle.SINGLE,
                    size: 6,
                    color: '000000',
                  },
                },
                spacing: { after: 80 },
                children: makeRuns(`CONTRACT No. ${contractNo}`, {
                  bold: true,
                  size: 18,
                }),
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    children: [PageNumber.CURRENT, '/', PageNumber.TOTAL_PAGES],
                    size: 18,
                    font: FONT_CONFIG,
                  }),
                ],
              }),
            ],
          }),
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 120, after: 40 },
            children: makeRuns('合   同', { bold: true, size: 36 }),
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 0, after: 140 },
            children: makeRuns('C O N T R A C T', { bold: true, size: 34 }),
          }),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            spacing: { before: 20, after: 20 },
            children: makeRuns(`编 号 NO. : ${contractNo}`, { size: 20 }),
          }),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            spacing: { before: 0, after: 160 },
            children: makeRuns(`日 期 DATE : ${displayDate}`, { size: 20 }),
          }),

          // Buyers
          new Paragraph({
            spacing: { before: 40, after: 30 },
            children: [
              ...makeRuns('买 方 THE BUYERS : ', { size: 20 }),
              ...makeRuns(buyerName, { bold: true, size: 20 }),
            ],
          }),
          new Paragraph({
            spacing: { before: 20, after: 30 },
            children: makeRuns(`地 址 ADDRESS : ${buyerAddress}`, { size: 20 }),
          }),
          new Paragraph({
            spacing: { before: 20, after: 120 },
            children: makeRuns(
              `电 话 TELEPHONE : ${buyerPhone}        传 真 FAX : ${buyerFax}`,
              { size: 20 },
            ),
          }),

          // Sellers
          new Paragraph({
            spacing: { before: 40, after: 30 },
            children: [
              ...makeRuns('卖 方 THE SELLERS : ', { size: 20 }),
              ...makeRuns(sellerName, { bold: true, size: 20 }),
            ],
          }),
          new Paragraph({
            spacing: { before: 20, after: 30 },
            children: makeRuns(`地 址 ADDRESS : ${sellerAddress}`, {
              size: 20,
            }),
          }),
          new Paragraph({
            spacing: { before: 20, after: 140 },
            children: makeRuns(
              `电 话 TELEPHONE : ${sellerPhone}        传 真 FAX : ${sellerFax}`,
              { size: 20 },
            ),
          }),

          // Preamble
          new Paragraph({
            spacing: { before: 40, after: 30, line: 260 },
            children: makeRuns(preambleZh, { size: 20 }),
          }),
          new Paragraph({
            spacing: { before: 0, after: 160, line: 260 },
            children: makeRuns(preambleEn.toUpperCase(), { size: 19 }),
          }),

          // Commodity & Pricing Table
          commodityTable,

          // Clauses
          ...clauseParagraphs,

          // Spacing before signature block
          new Paragraph({
            spacing: { before: 240, after: 40 },
            children: [],
          }),
          signatureTable,

          ...specialFooterParagraphs,
        ],
      },
    ],
  });
}

export async function buildContractDocxBuffer(
  order: ExportOrder,
  ctx: ContractDocxExportContext,
): Promise<Uint8Array> {
  const doc = buildContractDocxDocument(order, ctx);
  return Packer.toBuffer(doc);
}

export async function exportContractToDocx(
  order: ExportOrder,
  ctx: ContractDocxExportContext,
): Promise<void> {
  const doc = buildContractDocxDocument(order, ctx);
  const blob = await Packer.toBlob(doc);
  const safeNo = (
    getDocOverride(order, 'contract.no', order.invoiceNo || 'hardlock-contract')
  ).replace(/[^a-zA-Z0-9_\-]/g, '_');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeNo}-Contract.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
