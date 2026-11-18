import React, { useMemo, useState } from 'react';
import {
  Printer,
  Download,
  Umbrella,
  ArrowUpFromLine,
  Package,
} from 'lucide-react';
import type {
  BankAccount,
  Customer,
  DocLanguage,
  DocumentTab,
  ExportOrder,
  LogisticsProvider,
  Supplier,
} from '../types/erp';
import type { UiDictionary } from '../i18n/uiTranslations';
import { DOC_TEXT, type DocDictionary } from '../i18n/docTranslations';
import {
  calculateOrderSummary,
  formatMoney,
} from '../utils/exportCalculations';

interface DocumentGeneratorProps {
  order: ExportOrder;
  customer: Customer | undefined;
  supplier: Supplier | undefined;
  bank: BankAccount | undefined;
  logistics: LogisticsProvider | undefined;
  docLang: DocLanguage;
  onChangeDocLang: (lang: DocLanguage) => void;
  t: UiDictionary;
}

export const DocumentGenerator: React.FC<DocumentGeneratorProps> = ({
  order,
  customer,
  supplier,
  bank,
  logistics,
  docLang,
  onChangeDocLang,
  t,
}) => {
  const [activeDoc, setActiveDoc] = useState<DocumentTab>('invoice');
  const d = DOC_TEXT[docLang];

  const summary = useMemo(
    () =>
      calculateOrderSummary(
        order.items,
        order.costs,
        order.shipping.incoterm,
        order.currency,
      ),
    [order.items, order.costs, order.shipping.incoterm, order.currency],
  );

  // Compute sequential case ranges per line item (e.g. 1-10, 11-20)
  const caseRanges = useMemo(() => {
    let cursor = 1;
    return order.items.map((item) => {
      const count = Math.max(0, Number(item.cartons) || 0);
      if (count === 0) return '-';
      const start = cursor;
      const end = cursor + count - 1;
      cursor = end + 1;
      const prefix = order.shipping.caseNumberPrefix
        ? `${order.shipping.caseNumberPrefix}-`
        : '';
      return start === end ? `${prefix}${start}` : `${prefix}${start} ~ ${end}`;
    });
  }, [order.items, order.shipping.caseNumberPrefix]);

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
  body { font-family: "Helvetica Neue", Arial, "Hiragino Kaku Gothic ProN", sans-serif; color: #0f172a; margin: 24px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #cbd5e1; padding: 6px 8px; font-size: 12px; }
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
          {/* Document Sheet Switcher */}
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
            {/* Independent Document Language Switcher */}
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
            className={`bg-white border border-slate-300 shadow-xs mx-auto max-w-[900px] p-8 md:p-10 text-slate-900 print:border-0 print:shadow-none print:p-0 ${
              activeDoc === 'all' ? 'print-page-break' : ''
            }`}
          >
            <InvoiceSheet
              order={order}
              customer={customer}
              supplier={supplier}
              bank={bank}
              logistics={logistics}
              summary={summary}
              caseRanges={caseRanges}
              d={d}
            />
          </div>
        )}

        {(activeDoc === 'packing' || activeDoc === 'all') && (
          <div
            className={`bg-white border border-slate-300 shadow-xs mx-auto max-w-[900px] p-8 md:p-10 text-slate-900 print:border-0 print:shadow-none print:p-0 ${
              activeDoc === 'all' ? 'print-page-break' : ''
            }`}
          >
            <PackingListSheet
              order={order}
              customer={customer}
              supplier={supplier}
              logistics={logistics}
              summary={summary}
              caseRanges={caseRanges}
              d={d}
            />
          </div>
        )}

        {(activeDoc === 'casemark' || activeDoc === 'all') && (
          <div className="bg-white border border-slate-300 shadow-xs mx-auto max-w-[900px] p-8 md:p-10 text-slate-900 print:border-0 print:shadow-none print:p-0">
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
  supplier: Supplier | undefined;
  logistics: LogisticsProvider | undefined;
  summary: ReturnType<typeof calculateOrderSummary>;
  caseRanges: string[];
  d: DocDictionary;
}

const DocumentHeaderBanner: React.FC<{
  title: string;
  supplier: Supplier | undefined;
}> = ({ title, supplier }) => (
  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-5 border-b-2 border-slate-900">
    <div className="min-w-0">
      <div className="text-xl font-bold tracking-tight text-slate-900">
        {supplier?.name ?? 'HARDLOCK Industry Co., Ltd.'}
      </div>
      <div className="text-xs text-slate-600 mt-1 max-w-md">
        {supplier?.address}
      </div>
      <div className="text-xs text-slate-600 mt-0.5 font-mono-tabular">
        TEL: {supplier?.phone} · EMAIL: {supplier?.email} · ID:{' '}
        {supplier?.taxOrExporterId}
      </div>
    </div>
    <div className="sm:text-right shrink-0">
      <div className="text-lg font-bold tracking-wide text-slate-900 whitespace-nowrap">
        {title}
      </div>
      <div className="text-[11px] font-mono-tabular text-slate-500 mt-1 whitespace-nowrap">
        HARDLOCK STANDARD EXPORT FORMAT
      </div>
    </div>
  </div>
);

const InvoiceSheet: React.FC<
  SheetCommonProps & { bank: BankAccount | undefined }
> = ({
  order,
  customer,
  supplier,
  bank,
  logistics,
  summary,
  caseRanges,
  d,
}) => (
  <div className="space-y-6 text-xs leading-relaxed">
    <DocumentHeaderBanner title={d.commercialInvoice} supplier={supplier} />

    {/* Parties + Invoice Metadata Grid */}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-b border-slate-300 pb-5">
      <div className="space-y-4">
        <div>
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            {d.consignee}
          </div>
          <div className="font-bold text-sm text-slate-900 mt-1">
            {customer?.name ?? '—'}
          </div>
          <div className="text-slate-700 whitespace-pre-line">
            {customer?.address}
          </div>
          <div className="text-slate-600 mt-0.5">
            ATTN: {customer?.contactName} · {customer?.phone}
          </div>
        </div>

        {customer?.notifyParty && (
          <div>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              {d.notifyParty}
            </div>
            <div className="text-slate-700 mt-0.5">{customer.notifyParty}</div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 content-start">
        <DocMetaCell label={d.invoiceNo} value={order.invoiceNo} mono />
        <DocMetaCell label={d.date} value={order.orderDate} mono />
        <DocMetaCell label={d.poNo} value={order.poNo} mono />
        <DocMetaCell
          label={d.tradeTerms}
          value={`${order.shipping.incoterm} ${order.shipping.incotermPlace}`}
          bold
        />
        <DocMetaCell
          label={d.transportMode}
          value={d.modeNames[order.shipping.mode]}
        />
        <DocMetaCell label={d.logisticsCarrier} value={logistics?.name ?? '—'} />
        <DocMetaCell
          label={d.portOfLoading}
          value={order.shipping.portOfLoading}
        />
        <DocMetaCell
          label={d.portOfDischarge}
          value={order.shipping.portOfDischarge}
        />
        <DocMetaCell
          label={d.carrierRef}
          value={order.shipping.vesselOrFlightOrCourier}
        />
        <DocMetaCell
          label={d.docNumberRef}
          value={order.shipping.trackingOrBlNo}
          mono
        />
        <DocMetaCell label={d.paymentTerms} value={order.paymentTerms} span2 />
      </div>
    </div>

    {/* Goods Table */}
    <table className="w-full border-collapse border border-slate-300">
      <thead>
        <tr className="bg-slate-100 text-[11px] font-bold text-slate-800">
          <th className="border border-slate-300 py-2 px-2.5 text-left w-28">
            {d.marksAndNumbers}
          </th>
          <th className="border border-slate-300 py-2 px-2.5 text-left">
            {d.descriptionOfGoods}
          </th>
          <th className="border border-slate-300 py-2 px-2.5 text-center w-24">
            {d.hsCode}
          </th>
          <th className="border border-slate-300 py-2 px-2.5 text-right w-24">
            {d.quantity}
          </th>
          <th className="border border-slate-300 py-2 px-2.5 text-right w-24">
            {d.unitPrice}
          </th>
          <th className="border border-slate-300 py-2 px-2.5 text-right w-28">
            {d.amount} ({order.currency})
          </th>
        </tr>
      </thead>
      <tbody>
        {order.items.map((item, idx) => (
          <tr key={item.id}>
            <td className="border border-slate-300 py-2 px-2.5 align-top font-mono-tabular text-[11px]">
              <div>{order.shipping.shippingMarksMain}</div>
              <div className="text-slate-500">C/No. {caseRanges[idx]}</div>
            </td>
            <td className="border border-slate-300 py-2 px-2.5 align-top">
              <div className="font-semibold text-slate-900">{item.sku}</div>
              <div className="text-slate-700">{item.description}</div>
              <div className="text-[11px] text-slate-500">
                {d.countryOfOrigin}: {item.originCountry}
              </div>
            </td>
            <td className="border border-slate-300 py-2 px-2.5 align-top text-center font-mono-tabular">
              {item.hsCode}
            </td>
            <td className="border border-slate-300 py-2 px-2.5 align-top text-right font-mono-tabular">
              {item.quantity.toLocaleString()} {item.unit}
            </td>
            <td className="border border-slate-300 py-2 px-2.5 align-top text-right font-mono-tabular">
              {formatMoney(item.unitPrice, order.currency)}
            </td>
            <td className="border border-slate-300 py-2 px-2.5 align-top text-right font-mono-tabular font-semibold">
              {formatMoney(summary.lineItems[idx]?.amount ?? 0, order.currency)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>

    {/* Financial Breakdown + Bank Remittance Split */}
    <div className="grid grid-cols-1 md:grid-cols-12 gap-6 pt-2 print-avoid-break">
      <div className="md:col-span-6 space-y-3">
        <div className="border border-slate-300 p-3.5 space-y-1.5">
          <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
            {d.remittanceBank}
          </div>
          {bank ? (
            <div className="space-y-0.5 text-[11px] text-slate-700">
              <div>
                <span className="font-semibold">{d.bankName}:</span>{' '}
                {bank.bankName} ({bank.branchName})
              </div>
              <div className="font-mono-tabular">
                <span className="font-semibold font-sans">{d.swiftCode}:</span>{' '}
                {bank.swiftCode}
              </div>
              <div>
                <span className="font-semibold">{d.accountName}:</span>{' '}
                {bank.accountName}
              </div>
              <div className="font-mono-tabular">
                <span className="font-semibold font-sans">{d.accountNo}:</span>{' '}
                {bank.accountNumber} ({bank.currency})
              </div>
            </div>
          ) : (
            <div>—</div>
          )}
        </div>

        {order.remarks && (
          <div className="text-[11px] text-slate-600">
            <span className="font-bold text-slate-800">{d.remarks}: </span>
            {order.remarks}
          </div>
        )}
      </div>

      <div className="md:col-span-6">
        <div className="border border-slate-300 divide-y divide-slate-200">
          <BreakdownRow
            label={d.goodsSubtotal}
            value={formatMoney(summary.goodsSubtotal, order.currency)}
          />
          {summary.packingHandlingCost > 0 && (
            <BreakdownRow
              label={d.packingHandling}
              value={formatMoney(summary.packingHandlingCost, order.currency)}
            />
          )}
          <BreakdownRow
            label={d.exwValue}
            value={formatMoney(summary.exwTotal, order.currency)}
            subtle
          />
          {summary.flags.includesInland && summary.inlandFreightCost > 0 && (
            <BreakdownRow
              label={d.inlandClearance}
              value={formatMoney(summary.inlandFreightCost, order.currency)}
            />
          )}
          {summary.flags.includesMainFreight && summary.mainFreightCost > 0 && (
            <BreakdownRow
              label={d.mainFreight}
              value={formatMoney(summary.mainFreightCost, order.currency)}
            />
          )}
          {summary.flags.includesInsurance && summary.insuranceCost > 0 && (
            <BreakdownRow
              label={d.insurance}
              value={formatMoney(summary.insuranceCost, order.currency)}
            />
          )}
          {summary.flags.includesDestinationHandling &&
            summary.destinationHandlingCost > 0 && (
              <BreakdownRow
                label={d.destHandling}
                value={formatMoney(
                  summary.destinationHandlingCost,
                  order.currency,
                )}
              />
            )}
          {summary.flags.includesImportDuty && summary.importDutyTaxCost > 0 && (
            <BreakdownRow
              label={d.importDuty}
              value={formatMoney(summary.importDutyTaxCost, order.currency)}
            />
          )}
          <div className="flex items-center justify-between px-3 py-2.5 bg-slate-900 text-white font-bold">
            <span>
              {d.totalAmount} ({order.shipping.incoterm})
            </span>
            <span className="font-mono-tabular text-sm">
              {order.currency} {formatMoney(summary.incotermTotal, order.currency)}
            </span>
          </div>
        </div>

        {/* Signature Block */}
        <div className="mt-8 pt-8 border-t border-slate-400 text-right">
          <div className="font-bold text-slate-900">
            {supplier?.signatoryName}
          </div>
          <div className="text-[11px] text-slate-600">
            {supplier?.signatoryTitle}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {d.authorizedSignature}
          </div>
        </div>
      </div>
    </div>
  </div>
);

const PackingListSheet: React.FC<SheetCommonProps> = ({
  order,
  customer,
  supplier,
  logistics,
  summary,
  caseRanges,
  d,
}) => (
  <div className="space-y-6 text-xs leading-relaxed">
    <DocumentHeaderBanner title={d.packingList} supplier={supplier} />

    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-b border-slate-300 pb-5">
      <div>
        <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
          {d.consignee}
        </div>
        <div className="font-bold text-sm text-slate-900 mt-1">
          {customer?.name ?? '—'}
        </div>
        <div className="text-slate-700">{customer?.address}</div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 content-start">
        <DocMetaCell label={d.invoiceNo} value={order.invoiceNo} mono />
        <DocMetaCell label={d.date} value={order.orderDate} mono />
        <DocMetaCell label={d.poNo} value={order.poNo} mono />
        <DocMetaCell
          label={d.transportMode}
          value={d.modeNames[order.shipping.mode]}
        />
        <DocMetaCell label={d.logisticsCarrier} value={logistics?.name ?? '—'} />
        <DocMetaCell
          label={d.docNumberRef}
          value={order.shipping.trackingOrBlNo}
          mono
        />
      </div>
    </div>

    <table className="w-full border-collapse border border-slate-300">
      <thead>
        <tr className="bg-slate-100 text-[11px] font-bold text-slate-800">
          <th className="border border-slate-300 py-2 px-2.5 text-left w-24">
            {d.caseNo}
          </th>
          <th className="border border-slate-300 py-2 px-2.5 text-left">
            {d.descriptionOfGoods}
          </th>
          <th className="border border-slate-300 py-2 px-2.5 text-right w-24">
            {d.quantity}
          </th>
          <th className="border border-slate-300 py-2 px-2.5 text-right w-20">
            C/TNS
          </th>
          <th className="border border-slate-300 py-2 px-2.5 text-right w-24">
            {d.netWeight}
          </th>
          <th className="border border-slate-300 py-2 px-2.5 text-right w-24">
            {d.grossWeight}
          </th>
          <th className="border border-slate-300 py-2 px-2.5 text-right w-24">
            {d.measurement}
          </th>
        </tr>
      </thead>
      <tbody>
        {order.items.map((item, idx) => {
          const calc = summary.lineItems[idx];
          return (
            <tr key={item.id}>
              <td className="border border-slate-300 py-2 px-2.5 font-mono-tabular">
                {caseRanges[idx]}
              </td>
              <td className="border border-slate-300 py-2 px-2.5">
                <div className="font-semibold text-slate-900">{item.sku}</div>
                <div className="text-slate-700">{item.description}</div>
                <div className="text-[11px] font-mono-tabular text-slate-500">
                  {item.cartonLengthCm}×{item.cartonWidthCm}×
                  {item.cartonHeightCm} cm
                </div>
              </td>
              <td className="border border-slate-300 py-2 px-2.5 text-right font-mono-tabular">
                {item.quantity.toLocaleString()} {item.unit}
              </td>
              <td className="border border-slate-300 py-2 px-2.5 text-right font-mono-tabular">
                {item.cartons}
              </td>
              <td className="border border-slate-300 py-2 px-2.5 text-right font-mono-tabular">
                {calc?.netWeightKg.toFixed(2)}
              </td>
              <td className="border border-slate-300 py-2 px-2.5 text-right font-mono-tabular">
                {calc?.grossWeightKg.toFixed(2)}
              </td>
              <td className="border border-slate-300 py-2 px-2.5 text-right font-mono-tabular">
                {calc?.cbm.toFixed(3)}
              </td>
            </tr>
          );
        })}
        <tr className="bg-slate-50 font-bold">
          <td colSpan={2} className="border border-slate-300 py-2.5 px-2.5">
            {d.totalPackages}
          </td>
          <td className="border border-slate-300 py-2.5 px-2.5 text-right font-mono-tabular">
            {summary.totalQuantity.toLocaleString()}
          </td>
          <td className="border border-slate-300 py-2.5 px-2.5 text-right font-mono-tabular">
            {summary.totalCartons}
          </td>
          <td className="border border-slate-300 py-2.5 px-2.5 text-right font-mono-tabular">
            {summary.totalNetWeightKg.toFixed(2)} kg
          </td>
          <td className="border border-slate-300 py-2.5 px-2.5 text-right font-mono-tabular">
            {summary.totalGrossWeightKg.toFixed(2)} kg
          </td>
          <td className="border border-slate-300 py-2.5 px-2.5 text-right font-mono-tabular">
            {summary.totalCbm.toFixed(3)} m³
          </td>
        </tr>
      </tbody>
    </table>

    <div className="pt-8 text-right print-avoid-break">
      <div className="inline-block border-t border-slate-400 pt-2 min-w-[240px]">
        <div className="font-bold">{supplier?.signatoryName}</div>
        <div className="text-[11px] text-slate-600">
          {supplier?.signatoryTitle}
        </div>
      </div>
    </div>
  </div>
);

const CaseMarkSheet: React.FC<
  Omit<SheetCommonProps, 'logistics'>
> = ({ order, customer, supplier, summary, caseRanges, d }) => (
  <div className="space-y-6">
    <DocumentHeaderBanner title={d.caseMarkSheet} supplier={supplier} />

    {/* Primary Master Case Mark Label */}
    <div className="border-2 border-slate-900 p-6 space-y-5 print-avoid-break">
      <div className="flex items-start justify-between gap-4 border-b-2 border-slate-900 pb-4">
        <div>
          <div className="text-xs font-bold text-slate-500 tracking-widest uppercase">
            {d.marksAndNumbers}
          </div>
          <div className="text-2xl font-bold tracking-tight text-slate-900 mt-1">
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
            {summary.totalNetWeightKg.toFixed(2)} kg
          </div>
        </div>
        <div>
          <div className="text-[11px] font-bold text-slate-500 uppercase">
            {d.grossWeight}
          </div>
          <div className="font-mono-tabular font-bold text-slate-900 mt-0.5">
            {summary.totalGrossWeightKg.toFixed(2)} kg
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

      {/* Individual SKU Case Breakdown */}
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

const DocMetaCell: React.FC<{
  label: string;
  value: string;
  mono?: boolean;
  bold?: boolean;
  span2?: boolean;
}> = ({ label, value, mono, bold, span2 }) => (
  <div className={span2 ? 'col-span-2' : ''}>
    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
      {label}
    </div>
    <div
      className={`text-xs text-slate-900 mt-0.5 ${
        mono ? 'font-mono-tabular' : ''
      } ${bold ? 'font-bold' : ''}`}
    >
      {value || '—'}
    </div>
  </div>
);

const BreakdownRow: React.FC<{
  label: string;
  value: string;
  subtle?: boolean;
}> = ({ label, value, subtle }) => (
  <div
    className={`flex items-center justify-between px-3 py-1.5 text-xs ${
      subtle ? 'bg-slate-50 font-semibold' : 'bg-white'
    }`}
  >
    <span className="text-slate-700">{label}</span>
    <span className="font-mono-tabular font-semibold text-slate-900">
      {value}
    </span>
  </div>
);
