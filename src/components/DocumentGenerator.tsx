import React, { useMemo, useState } from 'react';
import {
  Printer,
  Download,
  FileSpreadsheet,
  Umbrella,
  ArrowUpFromLine,
  Package,
  FilePlus2,
} from 'lucide-react';
import type {
  BankAccount,
  Customer,
  DocLanguage,
  DocumentTab,
  ExportOrder,
  LogisticsProvider,
  Product,
  Supplier,
  TransportMode,
} from '../types/erp';
import type { UiDictionary } from '../i18n/uiTranslations';
import { DOC_TEXT, type DocDictionary } from '../i18n/docTranslations';
import {
  calculateOrderSummary,
  formatMoney,
} from '../utils/exportCalculations';
import {
  buildPackingListDisplayRows,
  extractSurfaceFootnotes,
  formatCompactHsCode,
  formatCurrencyLabel,
  formatDocMoney,
  formatDocumentDate,
  resolveItemSpecs,
} from '../utils/documentHelpers';
import { exportOrdersToExcel } from '../utils/importExportUtils';

interface DocumentGeneratorProps {
  order: ExportOrder | undefined;
  customer: Customer | undefined;
  billToCustomer?: Customer | undefined;
  supplier: Supplier | undefined;
  bank: BankAccount | undefined;
  logistics: LogisticsProvider | undefined;
  products: Product[];
  docLang: DocLanguage;
  initialDocTab?: DocumentTab;
  onChangeDocLang: (lang: DocLanguage) => void;
  onCreateNewOrder: () => void;
  t: UiDictionary;
}

const DEFAULT_EMPTY_COSTS: ExportOrder['costs'] = {
  packingHandlingCost: 0,
  inlandFreightCost: 0,
  mainFreightCost: 0,
  insuranceMode: 'MANUAL',
  insuranceManualCost: 0,
  insuranceRatePercent: 0.5,
  destinationHandlingCost: 0,
  importDutyTaxCost: 0,
};

const PREPAID_INCOTERMS = new Set(['CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP']);

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

function formatWeight1(kg: number): string {
  const safe = Number.isFinite(kg) ? kg : 0;
  return safe.toLocaleString('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

export const DocumentGenerator: React.FC<DocumentGeneratorProps> = ({
  order,
  customer,
  billToCustomer,
  supplier,
  bank,
  logistics,
  products,
  docLang,
  initialDocTab = 'invoice',
  onChangeDocLang,
  onCreateNewOrder,
  t,
}) => {
  const [activeDoc, setActiveDoc] = useState<DocumentTab>(initialDocTab);
  const d = DOC_TEXT[docLang];

  const summary = useMemo(
    () =>
      calculateOrderSummary(
        order?.items ?? [],
        order?.costs ?? DEFAULT_EMPTY_COSTS,
        order?.shipping.incoterm ?? 'FOB',
        order?.currency ?? 'USD',
      ),
    [order?.items, order?.costs, order?.shipping.incoterm, order?.currency],
  );

  // Compute sequential case ranges per line item (e.g. 1-10, 11-20)
  const caseRanges = useMemo(() => {
    let cursor = 1;
    const prefix = order?.shipping.caseNumberPrefix
      ? `${order.shipping.caseNumberPrefix}-`
      : '';
    return (order?.items ?? []).map((item) => {
      const count = Math.max(0, Number(item.cartons) || 0);
      if (count === 0) return '-';
      const start = cursor;
      const end = cursor + count - 1;
      cursor = end + 1;
      return start === end ? `${prefix}${start}` : `${prefix}${start} ~ ${end}`;
    });
  }, [order?.items, order?.shipping.caseNumberPrefix]);

  if (!order) {
    return (
      <section
        data-testid="empty-doc-state"
        className="bg-white border border-dashed border-slate-300 rounded-lg px-6 py-14 text-center max-w-2xl mx-auto space-y-4"
      >
        <div className="w-11 h-11 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
          <Printer className="w-5 h-5" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-base font-bold text-slate-900">
            {t.emptyOrdersWorkspaceTitle}
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            {t.emptyDocWorkspaceDesc}
          </p>
        </div>
        <div className="pt-2">
          <button
            type="button"
            onClick={onCreateNewOrder}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-md hover:bg-blue-800 transition-colors"
          >
            <FilePlus2 className="w-3.5 h-3.5" />
            <span>{t.btnNewOrder}</span>
          </button>
        </div>
      </section>
    );
  }

  const resolvedBillTo = billToCustomer ?? customer;

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadHtml = () => {
    const el = document.getElementById('hardlock-print-area');
    if (!el) return;
    const html = `<!doctype html>
<html lang="${docLang}">
<head>
<meta charset="utf-8" />
<title>${order.invoiceNo} - HARDLOCK Export Documents</title>
<style>
  @page { size: A4 portrait; margin: 10mm 12mm; }
  body { font-family: "Times New Roman", Times, Georgia, "Noto Serif JP", "Noto Serif SC", serif; color: #000000; margin: 16px; background: #ffffff; }
  .hardlock-doc-sheet { font-family: "Times New Roman", Times, Georgia, "Noto Serif JP", "Noto Serif SC", serif; color: #000000; }
  table { width: 100%; border-collapse: collapse; }
  .hl-grid th, .hl-grid td { border: 1px solid #000000; padding: 3px 5px; font-size: 10.5px; }
  .hl-dotted-top td { border-top: 1px dotted #000000 !important; }
  .hl-double-total { border-top: 1px solid #000000 !important; border-bottom: 3px double #000000 !important; }
  .print-page-break { page-break-after: always; margin-top: 32px; border-top: 2px dashed #cbd5e1; padding-top: 24px; }
</style>
</head>
<body>${el.innerHTML}</body>
</html>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${order.invoiceNo || 'hardlock-doc'}-${activeDoc}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const docTabs: { id: DocumentTab; label: string }[] = [
    { id: 'invoice', label: t.docTabInvoice },
    { id: 'packing', label: t.docTabPacking },
    { id: 'casemark', label: t.docTabCaseMark },
    { id: 'all', label: t.docTabAll },
  ];

  const docLangOptions: { code: DocLanguage; label: string }[] = [
    { code: 'en', label: 'English' },
    { code: 'ja', label: '日本語' },
    { code: 'zh', label: '中文' },
  ];

  return (
    <div id="hardlock-print-root" className="space-y-5">
      {/* Interactive Document Controls Toolbar (hidden on print) */}
      <div className="no-print bg-white border border-slate-200 rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div
            role="tablist"
            aria-label="Document type"
            className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-md"
          >
            {docTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeDoc === tab.id}
                onClick={() => setActiveDoc(tab.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors whitespace-nowrap ${
                  activeDoc === tab.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-600">
                {t.docLangLabel}:
              </span>
              <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded">
                {docLangOptions.map((opt) => (
                  <button
                    key={opt.code}
                    type="button"
                    onClick={() => onChangeDocLang(opt.code)}
                    className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                      docLang === opt.code
                        ? 'bg-blue-700 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={handleDownloadHtml}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>HTML</span>
            </button>

            <button
              type="button"
              onClick={() =>
                exportOrdersToExcel(
                  [order],
                  customer ? [customer] : [],
                  order.invoiceNo || 'hardlock-order',
                )
              }
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md hover:bg-emerald-100 transition-colors whitespace-nowrap"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>{t.btnExportExcel}</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-md hover:bg-blue-800 transition-colors whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{t.btnPrintDoc}</span>
            </button>
          </div>
        </div>

        <p className="text-xs text-slate-500">{t.docPrintHint}</p>
      </div>

      {/* Printable A4 Document Container */}
      <div id="hardlock-print-area" className="space-y-8">
        {(activeDoc === 'invoice' || activeDoc === 'all') && (
          <div
            data-testid="sheet-invoice"
            className={`hardlock-doc-sheet bg-white border border-slate-300 shadow-xs mx-auto max-w-[920px] px-7 py-6 md:px-9 md:py-7 text-black print:border-0 print:shadow-none print:p-0 ${
              activeDoc === 'all' ? 'print-page-break' : ''
            }`}
          >
            <InvoiceSheet
              order={order}
              customer={customer}
              billToCustomer={resolvedBillTo}
              supplier={supplier}
              bank={bank}
              logistics={logistics}
              products={products}
              summary={summary}
              caseRanges={caseRanges}
              docLang={docLang}
              d={d}
            />
          </div>
        )}

        {(activeDoc === 'packing' || activeDoc === 'all') && (
          <div
            data-testid="sheet-packing-list"
            className={`hardlock-doc-sheet bg-white border border-slate-300 shadow-xs mx-auto max-w-[920px] px-7 py-6 md:px-9 md:py-7 text-black print:border-0 print:shadow-none print:p-0 ${
              activeDoc === 'all' ? 'print-page-break' : ''
            }`}
          >
            <PackingListSheet
              order={order}
              customer={customer}
              billToCustomer={resolvedBillTo}
              supplier={supplier}
              logistics={logistics}
              products={products}
              summary={summary}
              caseRanges={caseRanges}
              docLang={docLang}
              d={d}
            />
          </div>
        )}

        {(activeDoc === 'casemark' || activeDoc === 'all') && (
          <div
            data-testid="sheet-case-mark"
            className="bg-white border border-slate-300 shadow-xs mx-auto max-w-[920px] p-8 md:p-10 text-slate-900 print:border-0 print:shadow-none print:p-0"
          >
            <CaseMarkSheet
              order={order}
              customer={customer}
              supplier={supplier}
              summary={summary}
              caseRanges={caseRanges}
              d={d}
            />
          </div>
        )}
      </div>
    </div>
  );
};

interface SheetCommonProps {
  order: ExportOrder;
  customer: Customer | undefined;
  billToCustomer: Customer | undefined;
  supplier: Supplier | undefined;
  logistics: LogisticsProvider | undefined;
  products: Product[];
  summary: ReturnType<typeof calculateOrderSummary>;
  caseRanges: string[];
  docLang: DocLanguage;
  d: DocDictionary;
}

const HardlockLetterhead: React.FC<{ supplier: Supplier | undefined }> = ({
  supplier,
}) => (
  <div>
    <div className="text-center text-[22px] md:text-[24px] font-bold tracking-tight text-black pb-1 border-b-2 border-black leading-tight">
      {supplier?.name || 'HARDLOCK Industry Co., Ltd.'}
    </div>
    <div className="flex justify-between items-start gap-4 pt-1 text-[11px] leading-[1.35] text-black">
      <div className="whitespace-pre-line">
        {supplier?.address || '1-6-24, Kawamata, Higashi Osaka\nOsaka, Japan 577-0063'}
      </div>
      <div className="text-right shrink-0 tabular-nums">
        <div>Tel : {supplier?.phone || '81-6-6784-1131'}</div>
        {supplier?.fax && <div>Fax : {supplier.fax}</div>}
      </div>
    </div>
  </div>
);

const PartyAddressBlock: React.FC<{
  heading: string;
  party: Customer | undefined;
}> = ({ heading, party }) => (
  <div className="text-[11px] leading-[1.32] text-black">
    <div className="font-bold underline underline-offset-2">{heading}</div>
    <div className="font-bold mt-0.5 uppercase">
      {party?.name || '—'}
    </div>
    {party?.address && (
      <div className="whitespace-pre-line">{party.address}</div>
    )}
    {party?.country && <div>{party.country}</div>}
    {party?.contactName && <div>Attn : {party.contactName}</div>}
    {party?.phone && <div>Mobile : {party.phone}</div>}
  </div>
);

const HardlockFooterSplit: React.FC<{
  order: ExportOrder;
  supplier: Supplier | undefined;
  totalCartons: number;
  originCountry: string;
}> = ({ order, supplier, totalCartons, originCountry }) => {
  const pallets = order.palletCount && order.palletCount > 0 ? order.palletCount : 0;
  const ctnLine =
    pallets > 1
      ? `CTN NO. 1 / ${pallets} - ${pallets} / ${pallets}`
      : `CTN NO. 1 - ${Math.max(1, totalCartons)}`;

  return (
    <div className="mt-5 flex justify-between items-end gap-6 print-avoid-break text-[11px] leading-[1.38] text-black">
      <div className="font-bold">
        {order.shipping.shippingMarksMain && (
          <div className="whitespace-pre-line uppercase">
            {order.shipping.shippingMarksMain}
          </div>
        )}
        <div>HARDLOCK No. {order.invoiceNo}</div>
        <div>{ctnLine}</div>
        <div>MADE IN {originCountry}</div>
      </div>

      <div className="min-w-[220px] max-w-[260px]">
        <div className="text-[11px]">{supplier?.name || 'HARDLOCK Industry Co., Ltd.'}</div>
        <div className="pt-1 pb-0.5 border-b border-black">
          <div
            className="text-[19px] leading-none text-slate-600/80 select-none italic tracking-wide"
            style={{ fontFamily: '"Brush Script MT", "Segoe Script", Georgia, serif' }}
          >
            {supplier?.signatoryName?.replace(/^(Mr\.|Ms\.)\s*/i, '') || 'Song Shanghua'}
          </div>
        </div>
        <div className="mt-0.5 text-[11px]">{supplier?.signatoryName || 'Mr. Song Shanghua'}</div>
        <div className="text-[11px]">{supplier?.signatoryTitle || 'Overseas Sales'}</div>
      </div>
    </div>
  );
};

const InvoiceSheet: React.FC<
  SheetCommonProps & { bank: BankAccount | undefined }
> = ({
  order,
  customer,
  billToCustomer,
  supplier,
  bank,
  products,
  summary,
  docLang,
}) => {
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
  const cartonDims = firstItem
    ? `${firstItem.cartonLengthCm} x ${firstItem.cartonWidthCm} x ${firstItem.cartonHeightCm} cm`
    : '33 x 25 x 12 cm';
  const originCountry = (
    firstItem?.originCountry ||
    supplier?.country ||
    'JAPAN'
  ).toUpperCase();
  const isPrepaid = PREPAID_INCOTERMS.has(order.shipping.incoterm);
  const freightLabel = isPrepaid ? 'FREIGHT PREPAID' : 'FREIGHT COLLECT';
  const primaryUnit = (firstItem?.unit || 'sets').toLowerCase();
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
    costRows.push({
      label: 'Insurance',
      amount: summary.insuranceCost,
    });
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

  return (
    <div className="space-y-2 text-[11px] leading-[1.35] text-black">
      <HardlockLetterhead supplier={supplier} />

      {/* Title & Reference */}
      <div className="pt-2">
        <div className="text-center text-[18px] font-bold underline underline-offset-4 tracking-wide">
          {docLang === 'en'
            ? 'INVOICE'
            : docLang === 'ja'
              ? 'INVOICE（商業送り状）'
              : 'INVOICE（商业发票）'}
        </div>
        <div className="text-center text-[12px] font-bold mt-0.5">
          No. {order.invoiceNo}
        </div>
        <div className="text-right text-[11px] font-bold -mt-1">
          Date : {displayDate}
        </div>
      </div>

      {/* BILL TO & SHIP TO */}
      <div className="space-y-3 pt-1">
        <PartyAddressBlock heading="BILL TO :" party={billToCustomer} />
        <PartyAddressBlock heading="SHIP TO :" party={customer} />
      </div>

      {/* Shipment Details + Right Notes */}
      <div className="pt-2 space-y-0.5 text-[11px]">
        <div>Shipment : on {shipmentDate}</div>
        <div>
          Loading port : {order.shipping.portOfLoading || '—'}
          {order.shipping.vesselOrFlightOrCourier
            ? ` by "${order.shipping.vesselOrFlightOrCourier}"`
            : ''}
          {etdDisplay ? ` ETD ${etdDisplay}` : ''}
        </div>
        <div>
          Destination : {order.shipping.portOfDischarge || '—'}
          {etaDisplay ? ` ETA ${etaDisplay}` : ''}
        </div>
      </div>

      <div className="flex justify-between items-end pt-1">
        <div className="font-bold text-[11.5px]">
          ITEM : {order.itemHeader?.trim() || 'HARDLOCK NUT (HLN)'}
        </div>
        <div className="text-right text-[10.5px] font-bold leading-tight">
          <div className="italic">*Seller → Buyer transaction value only</div>
          <div>*Currency : {formatCurrencyLabel(order.currency)}</div>
        </div>
      </div>

      {/* 11-Column Invoice Table + Column-Aligned Summary & Cost Breakdown */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[10.5px] tabular-nums">
          <thead>
            <tr className="font-bold text-center bg-white">
              <th
                rowSpan={2}
                className="border border-black px-1 py-1 w-9 leading-tight"
              >
                Item
                <br />
                No.
              </th>
              <th rowSpan={2} className="border border-black px-1.5 py-1">
                Item code
              </th>
              <th rowSpan={2} className="border border-black px-1.5 py-1">
                Size
              </th>
              <th rowSpan={2} className="border border-black px-1.5 py-1">
                Material
              </th>
              <th
                rowSpan={2}
                className="border border-black px-1 py-1 w-16 leading-tight"
              >
                Surface
                <br />
                Finish
              </th>
              <th
                rowSpan={2}
                className="border border-black px-1 py-1 w-14 leading-tight"
              >
                HS
                <br />
                code
              </th>
              <th
                rowSpan={2}
                className="border border-black px-1 py-1 w-14 leading-tight"
              >
                Q&apos;ty
                <br />({primaryUnit})
              </th>
              <th
                rowSpan={2}
                className="border border-black px-1 py-1 w-14 leading-tight"
              >
                U.W
                <br />
                (kg)
              </th>
              <th
                rowSpan={2}
                className="border border-black px-1 py-1 w-16 leading-tight"
              >
                N.W
                <br />
                (kg)
              </th>
              <th
                colSpan={2}
                className="border border-black px-1.5 py-0.5 text-center leading-tight"
              >
                {order.shipping.incoterm} {placeShort} in {order.currency}
              </th>
            </tr>
            <tr className="font-bold text-center bg-white">
              <th className="border border-black px-1.5 py-0.5 w-20">
                U. Price
              </th>
              <th className="border border-black px-1.5 py-0.5 w-24">Amount</th>
            </tr>
          </thead>

          <tbody>
            {order.items.map((item, idx) => {
              const prod = products.find((p) => p.id === item.productId);
              const specs = resolveItemSpecs(item, prod);
              const calc = summary.lineItems[idx];
              return (
                <tr key={item.id}>
                  <td className="border border-black px-1 py-0.5 text-center">
                    {idx + 1}
                  </td>
                  <td className="border border-black px-1.5 py-0.5 font-semibold whitespace-nowrap">
                    {item.sku || '—'}
                  </td>
                  <td className="border border-black px-1.5 py-0.5 whitespace-nowrap">
                    {specs.size}
                  </td>
                  <td className="border border-black px-1.5 py-0.5 whitespace-nowrap">
                    {specs.material}
                  </td>
                  <td className="border border-black px-1 py-0.5 text-center whitespace-nowrap">
                    {specs.surfaceFinish}
                  </td>
                  <td className="border border-black px-1 py-0.5 text-center whitespace-nowrap">
                    {formatCompactHsCode(item.hsCode)}
                  </td>
                  <td className="border border-black px-1.5 py-0.5 text-right whitespace-nowrap">
                    {item.quantity.toLocaleString()}
                  </td>
                  <td className="border border-black px-1.5 py-0.5 text-right whitespace-nowrap">
                    {(item.unitNetWeightKg || 0).toFixed(4)}
                  </td>
                  <td className="border border-black px-1.5 py-0.5 text-right whitespace-nowrap">
                    {formatWeight1(calc?.netWeightKg ?? 0)}
                  </td>
                  <td className="border border-black px-1.5 py-0.5 text-right whitespace-nowrap">
                    {formatDocMoney(item.unitPrice, order.currency)}
                  </td>
                  <td className="border border-black px-1.5 py-0.5 text-right whitespace-nowrap">
                    {formatDocMoney(calc?.amount ?? 0, order.currency)}
                  </td>
                </tr>
              );
            })}

            {/* Row immediately below grid: footnotes left + Q'ty / N.W aligned totals */}
            <tr className="font-bold">
              <td colSpan={6} className="px-0.5 pt-1 text-[10px]">
                {footnotes[0] ?? ''}
              </td>
              <td className="px-1.5 pt-1 text-right">
                {summary.totalQuantity.toLocaleString()}
              </td>
              <td />
              <td className="px-1.5 pt-1 text-right">
                {formatWeight1(summary.totalNetWeightKg)}
              </td>
              <td colSpan={2} />
            </tr>

            {/* Cost breakdown rows aligned under Amount column */}
            {costRows.map((row, rIdx) => (
              <tr key={row.label}>
                <td colSpan={6} className="px-0.5 text-[10px] font-bold">
                  {rIdx === 0 ? (footnotes[1] ?? '') : rIdx === 1 ? (footnotes[2] ?? '') : ''}
                </td>
                <td
                  colSpan={4}
                  className="px-2 py-0.5 text-right font-bold whitespace-nowrap"
                >
                  {row.label}
                </td>
                <td className="px-1.5 py-0.5 text-right font-bold border-b border-dotted border-black whitespace-nowrap">
                  {formatDocMoney(row.amount, order.currency)}
                </td>
              </tr>
            ))}

            {/* Double-underlined final Incoterm total */}
            <tr>
              <td colSpan={6} />
              <td
                colSpan={4}
                className="px-2 py-0.5 text-right font-bold whitespace-nowrap"
              >
                {order.shipping.incoterm} {placeShort}
              </td>
              <td className="px-1.5 py-0.5 text-right font-bold border-t border-black border-b-4 border-double whitespace-nowrap">
                {formatDocMoney(summary.incotermTotal, order.currency)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Lower Packing Summary + Freight Prepaid/Origin Split */}
      <div className="flex justify-between items-end gap-6 pt-2 text-[11px] leading-[1.45]">
        <div>
          <div>
            Packing :{' '}
            {pallets > 0 ? `${pallets} pallets (` : ''}
            {summary.totalCartons} cartons total
            {emptyCartons > 0 ? ` + ${emptyCartons} empty carton` : ''}
            {pallets > 0 ? ')' : ''}
          </div>
          <div>Carton size : {cartonDims}</div>
          <div>N/W : approx. {formatWeight1(summary.totalNetWeightKg)} kg</div>
          <div>G/W : approx. {formatWeight1(summary.totalGrossWeightKg)} kg</div>
          <div>Vol. : approx. {summary.totalCbm.toFixed(3)}M3</div>
        </div>

        <div className="text-right font-bold space-y-3">
          <div className="underline underline-offset-2">{freightLabel}</div>
          <div className="underline underline-offset-2">
            COUNTRY OF ORIGIN : {originCountry}
          </div>
        </div>
      </div>

      {/* Payment Terms & Bank Information */}
      <div className="pt-2 space-y-2 text-[11px] leading-[1.4]">
        <div>
          <span className="font-bold underline underline-offset-2">
            Payment terms
          </span>{' '}
          : {order.paymentTerms || '—'}
        </div>

        <div>
          <div className="font-bold underline underline-offset-2">
            Bank Information
          </div>
          {bank ? (
            <div>
              <div>
                {bank.bankName}
                {bank.swiftCode ? `(BIC : ${bank.swiftCode})` : ''}
              </div>
              {bank.branchName && <div>{bank.branchName}</div>}
              <div>Account No. : {bank.accountNumber}</div>
            </div>
          ) : (
            <div>—</div>
          )}
        </div>

        {order.remarks && (
          <div className="text-[10.5px] text-slate-800 pt-0.5">
            Remarks : {order.remarks}
          </div>
        )}
      </div>

      <HardlockFooterSplit
        order={order}
        supplier={supplier}
        totalCartons={summary.totalCartons}
        originCountry={originCountry}
      />
    </div>
  );
};

const PackingListSheet: React.FC<SheetCommonProps> = ({
  order,
  customer,
  billToCustomer,
  supplier,
  products,
  summary,
  docLang,
}) => {
  const displayRows = useMemo(
    () =>
      buildPackingListDisplayRows(
        order.items,
        products,
        order.packingRows,
      ),
    [order.items, products, order.packingRows],
  );

  const footnotes = extractSurfaceFootnotes(
    order.items,
    products,
    order.surfaceFootnotes,
  );
  const firstItem = order.items[0];
  const primaryUnit = (firstItem?.unit || 'sets').toLowerCase();
  const compactHsDigits = formatCompactHsCode(firstItem?.hsCode).replace(
    /\./g,
    '',
  );
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

  const pallets = order.palletCount ?? 0;
  const emptyCartons = order.emptyCartons ?? 0;
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

  return (
    <div className="space-y-2 text-[11px] leading-[1.35] text-black">
      <HardlockLetterhead supplier={supplier} />

      {/* Title & Reference */}
      <div className="pt-2">
        <div className="text-center text-[18px] font-bold underline underline-offset-4 tracking-wide">
          {docLang === 'en'
            ? 'PACKING LIST'
            : docLang === 'ja'
              ? 'PACKING LIST（梱包明細書）'
              : 'PACKING LIST（装箱单）'}
        </div>
        <div className="text-center text-[12px] font-bold mt-0.5">
          INVOICE No. {order.invoiceNo}
        </div>
        <div className="text-right text-[11px] font-bold -mt-1">
          Date : {displayDate}
        </div>
      </div>

      {/* BILL TO & DELIVER TO */}
      <div className="space-y-3 pt-1">
        <PartyAddressBlock heading="BILL TO :" party={billToCustomer} />
        <PartyAddressBlock heading="DELIVER TO :" party={customer} />
      </div>

      {/* Shipment Details */}
      <div className="pt-2 space-y-0.5 text-[11px]">
        <div>Shipment : on {shipmentDate}</div>
        <div>
          Loading port : {order.shipping.portOfLoading || '—'}
          {order.shipping.vesselOrFlightOrCourier
            ? ` by "${order.shipping.vesselOrFlightOrCourier}"`
            : ''}
          {etdDisplay ? ` ETD ${etdDisplay}` : ''}
        </div>
        <div>
          Destination : {order.shipping.portOfDischarge || '—'}
          {etaDisplay ? ` ETA ${etaDisplay}` : ''}
        </div>
      </div>

      <div className="font-bold text-[11.5px] pt-1">
        ITEM : {order.itemHeader?.trim() || 'HARDLOCK NUT'} (HS CODE :{' '}
        {compactHsDigits})
      </div>

      {/* 11-Column Pallet-Merged Packing List Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[10.5px] tabular-nums">
          <thead>
            <tr className="font-bold text-center bg-white">
              <th className="border border-black px-1 py-1 w-10 leading-tight">
                Pallet
                <br />
                No.
              </th>
              <th className="border border-black px-1 py-1 w-14 leading-tight">
                Ctn.
                <br />
                No.
              </th>
              <th className="border border-black px-1 py-1 w-10 leading-tight">
                Item
                <br />
                No.
              </th>
              <th className="border border-black px-1.5 py-1">Type</th>
              <th className="border border-black px-1.5 py-1">Size</th>
              <th className="border border-black px-1.5 py-1">Material</th>
              <th className="border border-black px-1 py-1 w-14 leading-tight">
                Surface
                <br />
                Finish
              </th>
              <th className="border border-black px-2 py-1 min-w-[140px]">
                Description
              </th>
              <th className="border border-black px-1 py-1 w-14 leading-tight">
                Q&apos;ty
                <br />({primaryUnit})
              </th>
              <th className="border border-black px-1 py-1 w-14 leading-tight">
                U.W
                <br />
                (kg)
              </th>
              <th className="border border-black px-1 py-1 w-14 leading-tight">
                T.W
                <br />
                (kg)
              </th>
            </tr>
          </thead>

          <tbody>
            {displayRows.map((row) => {
              const cellBorder = row.isSubRowInSameCtn
                ? 'border border-solid border-black [border-top-style:dotted]'
                : 'border border-solid border-black';
              return (
                <tr key={row.id}>
                  {row.showPalletCell && (
                    <td
                      rowSpan={row.palletRowSpan}
                      className="border border-black px-1 py-0.5 text-center align-middle font-semibold"
                    >
                      {row.palletNo}
                    </td>
                  )}
                  {row.showCtnCell && (
                    <td
                      rowSpan={row.ctnRowSpan}
                      className="border border-black px-1 py-0.5 text-center align-middle whitespace-nowrap"
                    >
                      {row.ctnNo}
                    </td>
                  )}
                  <td className={`${cellBorder} px-1 py-0.5 text-center`}>
                    {row.itemNo}
                  </td>
                  <td
                    className={`${cellBorder} px-1.5 py-0.5 font-semibold whitespace-nowrap`}
                  >
                    {row.type || '—'}
                  </td>
                  <td className={`${cellBorder} px-1.5 py-0.5 whitespace-nowrap`}>
                    {row.size}
                  </td>
                  <td className={`${cellBorder} px-1.5 py-0.5 whitespace-nowrap`}>
                    {row.material}
                  </td>
                  <td className={`${cellBorder} px-1 py-0.5 text-center`}>
                    {row.surfaceFinish}
                  </td>
                  <td className={`${cellBorder} px-2 py-0.5 whitespace-nowrap`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-right min-w-[62px]">
                        {row.setsPerCarton.toLocaleString()} {row.unitLabel}
                      </span>
                      <span>x</span>
                      <span className="text-right min-w-[52px]">
                        {row.cartonCount} carton
                      </span>
                    </div>
                  </td>
                  <td
                    className={`${cellBorder} px-1.5 py-0.5 text-right whitespace-nowrap`}
                  >
                    {row.qty.toLocaleString()}
                  </td>
                  <td
                    className={`${cellBorder} px-1.5 py-0.5 text-right whitespace-nowrap`}
                  >
                    {(row.unitWeightKg || 0).toFixed(4)}
                  </td>
                  <td
                    className={`${cellBorder} px-1.5 py-0.5 text-right whitespace-nowrap`}
                  >
                    {formatWeight1(row.totalWeightKg || 0)}
                  </td>
                </tr>
              );
            })}

            {/* Summary Row directly aligned under Carton Count, Q'ty, T.W */}
            <tr className="font-bold">
              <td colSpan={7} className="px-0.5 pt-1 text-[10px] align-top">
                {footnotes.map((fn) => (
                  <div key={fn}>{fn}</div>
                ))}
              </td>
              <td className="px-2 pt-1 text-right align-top whitespace-nowrap">
                {plTotalCartons} cartons
              </td>
              <td className="px-1.5 pt-1 text-right align-top whitespace-nowrap">
                {plTotalQty.toLocaleString()}
              </td>
              <td />
              <td className="px-1.5 pt-1 text-right align-top whitespace-nowrap">
                {formatWeight1(plTotalTw)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Lower Packing Summary + Pallet Volume Breakdown + Origin */}
      <div className="flex justify-between items-start gap-6 pt-3 text-[11px] leading-[1.45]">
        <div>
          <div>
            Packing :{' '}
            {pallets > 0 ? `${pallets} pallets (` : ''}
            {plTotalCartons} cartons total
            {emptyCartons > 0 ? ` + ${emptyCartons} empty carton` : ''}
            {pallets > 0 ? ')' : ''}
          </div>
          <div>Carton size : {cartonDims}</div>
          <div>N/W : approx. {formatWeight1(plTotalTw)} kg</div>
          <div>G/W : approx. {formatWeight1(summary.totalGrossWeightKg)} kg</div>
          <div>Vol. : approx. {summary.totalCbm.toFixed(3)}M3</div>
          {order.palletVolumeDetails && (
            <div className="font-bold whitespace-pre-line mt-1">
              {order.palletVolumeDetails}
            </div>
          )}
        </div>

        <div className="text-right font-bold pt-4">
          <div className="underline underline-offset-2">
            Country of Origin : {originSentence}
          </div>
        </div>
      </div>

      <HardlockFooterSplit
        order={order}
        supplier={supplier}
        totalCartons={plTotalCartons}
        originCountry={originCountry}
      />
    </div>
  );
};

const CaseMarkSheet: React.FC<
  Omit<SheetCommonProps, 'logistics' | 'billToCustomer' | 'products' | 'docLang'>
> = ({ order, customer, supplier, summary, caseRanges, d }) => (
  <div className="space-y-6">
    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-5 border-b-2 border-slate-900">
      <div className="min-w-0">
        <div className="text-xl font-bold tracking-tight text-slate-900">
          {supplier?.name ?? 'HARDLOCK Industry Co., Ltd.'}
        </div>
        <div className="text-xs text-slate-600 mt-1 max-w-md whitespace-pre-line">
          {supplier?.address}
        </div>
        <div className="text-xs text-slate-600 mt-0.5 font-mono-tabular">
          TEL: {supplier?.phone} {supplier?.fax ? `· FAX: ${supplier.fax}` : ''} · ID:{' '}
          {supplier?.taxOrExporterId}
        </div>
      </div>
      <div className="sm:text-right shrink-0">
        <div className="text-lg font-bold tracking-wide text-slate-900 whitespace-nowrap">
          {d.caseMarkSheet}
        </div>
        <div className="text-[11px] font-mono-tabular text-slate-500 mt-1 whitespace-nowrap">
          HARDLOCK STANDARD EXPORT FORMAT
        </div>
      </div>
    </div>

    <div className="border-2 border-slate-900 p-6 space-y-5 print-avoid-break">
      <div className="flex items-start justify-between gap-4 border-b-2 border-slate-900 pb-4">
        <div>
          <div className="text-xs font-bold text-slate-500 tracking-widest uppercase">
            {d.marksAndNumbers}
          </div>
          <div className="text-2xl font-bold tracking-tight text-slate-900 mt-1 whitespace-pre-line">
            {order.shipping.shippingMarksMain || customer?.name}
          </div>
          <div className="text-sm font-semibold text-slate-700 mt-1">
            {customer?.name}
          </div>
        </div>
        <div className="text-right font-mono-tabular">
          <div className="text-xs text-slate-500">{d.caseNo}</div>
          <div className="text-2xl font-bold text-slate-900">
            {order.shipping.caseNumberPrefix
              ? `${order.shipping.caseNumberPrefix}-1 ~ ${summary.totalCartons}`
              : `1 ~ ${summary.totalCartons}`}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
        <div>
          <div className="text-[11px] font-bold text-slate-500 uppercase">
            {d.destination}
          </div>
          <div className="font-bold text-slate-900 mt-0.5">
            {order.shipping.portOfDischarge}
          </div>
        </div>
        <div>
          <div className="text-[11px] font-bold text-slate-500 uppercase">
            {d.poNo}
          </div>
          <div className="font-mono-tabular font-bold text-slate-900 mt-0.5">
            {order.poNo}
          </div>
        </div>
        <div>
          <div className="text-[11px] font-bold text-slate-500 uppercase">
            {d.invoiceNo}
          </div>
          <div className="font-mono-tabular font-bold text-slate-900 mt-0.5">
            {order.invoiceNo}
          </div>
        </div>
        <div>
          <div className="text-[11px] font-bold text-slate-500 uppercase">
            {d.netWeight}
          </div>
          <div className="font-mono-tabular font-bold text-slate-900 mt-0.5">
            {summary.totalNetWeightKg.toFixed(1)} kg
          </div>
        </div>
        <div>
          <div className="text-[11px] font-bold text-slate-500 uppercase">
            {d.grossWeight}
          </div>
          <div className="font-mono-tabular font-bold text-slate-900 mt-0.5">
            {summary.totalGrossWeightKg.toFixed(1)} kg
          </div>
        </div>
        <div>
          <div className="text-[11px] font-bold text-slate-500 uppercase">
            {d.measurement}
          </div>
          <div className="font-mono-tabular font-bold text-slate-900 mt-0.5">
            {summary.totalCbm.toFixed(3)} m³
          </div>
        </div>
      </div>

      <div className="border-t border-slate-300 pt-3">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-300 text-slate-600">
              <th className="py-1.5 text-left">{d.caseNo}</th>
              <th className="py-1.5 text-left">SKU / Item</th>
              <th className="py-1.5 text-right">{d.quantity}</th>
              <th className="py-1.5 text-right">C/TNS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {order.items.map((item, idx) => (
              <tr key={item.id}>
                <td className="py-1.5 font-mono-tabular font-semibold">
                  {caseRanges[idx]}
                </td>
                <td className="py-1.5">
                  {item.sku} · {item.description}
                </td>
                <td className="py-1.5 text-right font-mono-tabular">
                  {item.quantity.toLocaleString()} {item.unit}
                </td>
                <td className="py-1.5 text-right font-mono-tabular">
                  {item.cartons}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 border-t-2 border-slate-900 pt-4">
        <div className="text-sm font-bold tracking-wider uppercase text-slate-900">
          {d.madeIn} {order.items[0]?.originCountry || supplier?.country || 'JAPAN'}
        </div>
        <div className="flex items-center gap-4 text-slate-800">
          <span className="inline-flex items-center gap-1 text-xs font-semibold">
            <ArrowUpFromLine className="w-4 h-4" />
            <span>THIS SIDE UP</span>
          </span>
          <span className="inline-flex items-center gap-1 text-xs font-semibold">
            <Umbrella className="w-4 h-4" />
            <span>KEEP DRY</span>
          </span>
          <span className="inline-flex items-center gap-1 text-xs font-semibold">
            <Package className="w-4 h-4" />
            <span>{d.modeNames[order.shipping.mode]}</span>
          </span>
        </div>
      </div>
    </div>
  </div>
);
