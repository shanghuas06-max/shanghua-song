import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Printer,
  Download,
  FileSpreadsheet,
  FileText,
  Umbrella,
  ArrowUpFromLine,
  Package,
  FilePlus2,
  Stamp,
  RotateCcw,
  ChevronDown,
  Upload,
} from 'lucide-react';
import type {
  BankAccount,
  ContractSettings,
  Customer,
  DocLanguage,
  DocSpecialFields,
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
  formatNumberNoRound,
  resolveEffectiveExchangeRate,
} from '../utils/exportCalculations';
import {
  buildPackingListDisplayRows,
  extractSurfaceFootnotes,
  formatCompactHsCode,
  formatCurrencyLabel,
  formatDocMoney,
  formatDocumentDate,
  formatDocumentPartDisplay,
  resolveItemSpecs,
} from '../utils/documentHelpers';
import {
  createDefaultContractSettings,
  interpolateContractText,
  numberToContractWords,
} from '../utils/contractDefaults';
import { exportDocumentToExcel } from '../utils/importExportUtils';
import { exportContractToDocx } from '../utils/contractDocxExport';
import {
  exportWithCustomerTemplate,
  findMatchingCustomerTemplate,
} from '../utils/templateExportUtils';

import { compressImageFileToDataUrl } from '../utils/imageUploadUtils';

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
  contractSettings?: ContractSettings;
  onChangeOrder?: (updated: ExportOrder) => void;
  onChangeDocLang: (lang: DocLanguage) => void;
  onUpdateContractSettings?: (next: ContractSettings) => void | Promise<void>;
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

const PREPAID_INCOTERMS = new Set([
  'CFR',
  'CIF',
  'CPT',
  'CIP',
  'DAP',
  'DPU',
  'DDP',
]);

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
  return formatNumberNoRound(kg, 1);
}

function getOverride(
  order: ExportOrder,
  key: string,
  fallback: string,
): string {
  const val = order.docOverrides?.[key];
  return val !== undefined ? val : fallback;
}

const EditableText: React.FC<{
  order: ExportOrder;
  fieldKey: string;
  fallback: string;
  onCommit?: (fieldKey: string, nextValue: string) => void;
  className?: string;
  multiline?: boolean;
}> = ({ order, fieldKey, fallback, onCommit, className = '', multiline }) => {
  const current = getOverride(order, fieldKey, fallback);
  const spanRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const el = spanRef.current;
    if (!el) return;
    if (typeof document !== 'undefined' && document.activeElement === el) {
      return;
    }
    const domText = multiline
      ? (el.innerText ?? el.textContent ?? '').replace(/\r/g, '').trimEnd()
      : (el.textContent ?? '').trim();
    if (domText !== current) {
      el.textContent = current;
    }
  }, [current, multiline]);

  if (!onCommit) {
    return <span className={className}>{current}</span>;
  }
  return (
    <span
      ref={spanRef}
      contentEditable
      suppressContentEditableWarning
      data-editable-key={fieldKey}
      onBlur={(e) => {
        const raw = e.currentTarget.innerText ?? e.currentTarget.textContent ?? '';
        const cleaned = multiline ? raw.replace(/\r/g, '').trimEnd() : raw.trim();
        if (cleaned !== current) {
          onCommit(fieldKey, cleaned);
        }
      }}
      className={`editable-doc-field ${multiline ? 'whitespace-pre-line inline-block' : 'inline-block'} ${className}`}
    >
      {current}
    </span>
  );
};

const CompanyStampSvg: React.FC<{ label: string }> = ({ label }) => (
  <svg
    viewBox="0 0 110 110"
    className="w-20 h-20 text-red-700/85 pointer-events-none select-none"
    aria-label="Company Stamp"
  >
    <circle
      cx="55"
      cy="55"
      r="49"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
    />
    <circle
      cx="55"
      cy="55"
      r="42"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
    />
    <polygon
      points="55,22 58,31 67,31 60,36 63,45 55,40 47,45 50,36 43,31 52,31"
      fill="currentColor"
    />
    <text
      x="55"
      y="62"
      textAnchor="middle"
      fontSize="8.5"
      fontWeight="bold"
      fill="currentColor"
      fontFamily="serif"
    >
      {label.slice(0, 18)}
    </text>
    <text
      x="55"
      y="76"
      textAnchor="middle"
      fontSize="7"
      fontWeight="bold"
      letterSpacing="1.2"
      fill="currentColor"
    >
      AUTHORIZED SEAL
    </text>
  </svg>
);

const SpecialFieldsFooterBlock: React.FC<{
  order: ExportOrder;
  supplier: Supplier | undefined;
  settings: ContractSettings;
}> = ({ order, supplier, settings }) => {
  const special = order.docSpecialFields;
  if (!special?.showDisclaimer && !special?.customNote?.trim()) {
    return null;
  }
  const rawDisclaimer =
    special.disclaimerText?.trim() || settings.defaultDisclaimerText;
  const disclaimerResolved = special.showDisclaimer
    ? interpolateContractText(rawDisclaimer, order, supplier)
    : '';

  return (
    <div className="mt-4 pt-2 border-t border-slate-300 space-y-1 text-[10px] text-slate-700 leading-snug">
      {disclaimerResolved && (
        <div className="italic">
          <span className="font-bold not-italic">Disclaimer : </span>
          {disclaimerResolved}
        </div>
      )}
      {special.customNote?.trim() && (
        <div className="whitespace-pre-line">
          <span className="font-bold">Note : </span>
          {special.customNote.trim()}
        </div>
      )}
    </div>
  );
};

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
  contractSettings,
  onChangeOrder,
  onChangeDocLang,
  onUpdateContractSettings,
  onCreateNewOrder,
  t,
}) => {
  const [activeDoc, setActiveDoc] = useState<DocumentTab>(initialDocTab);
  const [specialMenuOpen, setSpecialMenuOpen] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const d = DOC_TEXT[docLang];
  const settings = contractSettings ?? createDefaultContractSettings();

  const summary = useMemo(
    () =>
      calculateOrderSummary(
        order?.items ?? [],
        order?.costs ?? DEFAULT_EMPTY_COSTS,
        order?.shipping.incoterm ?? 'FOB',
        order?.currency ?? 'USD',
        order?.palletCount ?? 0,
      ),
    [
      order?.items,
      order?.costs,
      order?.shipping.incoterm,
      order?.currency,
      order?.palletCount,
    ],
  );

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
  const matchedTemplate = findMatchingCustomerTemplate(
    customer,
    activeDoc === 'casemark' ? 'all' : activeDoc,
  );
  const overrideCount = Object.keys(order.docOverrides ?? {}).length;

  const handleCommitOverride = onChangeOrder
    ? (fieldKey: string, nextValue: string) => {
        onChangeOrder({
          ...order,
          docOverrides: {
            ...(order.docOverrides ?? {}),
            [fieldKey]: nextValue,
          },
          updatedAt: new Date().toISOString(),
        });
      }
    : undefined;

  const handleUpdateSpecialFields = (patch: Partial<DocSpecialFields>) => {
    if (!onChangeOrder) return;
    onChangeOrder({
      ...order,
      docSpecialFields: {
        showSignature: true,
        ...(order.docSpecialFields ?? {}),
        ...patch,
      },
      updatedAt: new Date().toISOString(),
    });
  };

  const handleUploadSealOrSig = async (
    target: 'companyStampImage' | 'signatureImage',
    file: File | undefined,
  ) => {
    if (!file || !onUpdateContractSettings) return;
    setUploadError(null);
    try {
      const dataUrl = await compressImageFileToDataUrl(file);
      await onUpdateContractSettings({
        ...settings,
        [target]: dataUrl,
      });
      if (target === 'companyStampImage') {
        handleUpdateSpecialFields({ showCompanyStamp: true });
      } else {
        handleUpdateSpecialFields({ showSignature: true });
      }
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : 'Image upload failed.',
      );
    }
  };

  const handleClearSealOrSig = async (
    target: 'companyStampImage' | 'signatureImage',
  ) => {
    if (!onUpdateContractSettings) return;
    setUploadError(null);
    await onUpdateContractSettings({
      ...settings,
      [target]: '',
    });
  };

  const handleResetOverrides = () => {
    if (!onChangeOrder) return;
    onChangeOrder({
      ...order,
      docOverrides: {},
      updatedAt: new Date().toISOString(),
    });
  };

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
  .editable-doc-field { border: none !important; background: transparent !important; }
  table { width: 100%; border-collapse: collapse; }
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
    { id: 'contract', label: t.docTabContract },
    { id: 'casemark', label: t.docTabCaseMark },
    { id: 'all', label: t.docTabAll },
  ];

  const docLangOptions: { code: DocLanguage; label: string }[] = [
    { code: 'en', label: 'English' },
    { code: 'ja', label: '日本語' },
    { code: 'zh', label: '中文' },
  ];

  const special = order.docSpecialFields ?? {};

  return (
    <div id="hardlock-print-root" className="space-y-5">
      {/* Interactive Document Controls Toolbar (hidden on print) */}
      <div className="no-print bg-white border border-slate-200 rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
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

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-slate-600">
                {t.docLangLabel}:
              </span>
              <div className="flex items-center gap-0.5 p-0.5 bg-slate-100 rounded">
                {docLangOptions.map((opt) => (
                  <button
                    key={opt.code}
                    type="button"
                    onClick={() => onChangeDocLang(opt.code)}
                    className={`px-2 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
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
              onClick={() => setSpecialMenuOpen((v) => !v)}
              aria-expanded={specialMenuOpen}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-md border transition-colors whitespace-nowrap ${
                specialMenuOpen ||
                special.showCompanyStamp ||
                special.showDisclaimer ||
                special.customNote
                  ? 'text-amber-800 bg-amber-50 border-amber-300 hover:bg-amber-100'
                  : 'text-slate-700 bg-white border-slate-300 hover:bg-slate-50'
              }`}
            >
              <Stamp className="w-3.5 h-3.5" />
              <span>{t.btnInsertSpecialField}</span>
              <ChevronDown className="w-3.5 h-3.5" />
            </button>

            {overrideCount > 0 && onChangeOrder && (
              <button
                type="button"
                onClick={handleResetOverrides}
                className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>
                  {t.btnResetOverrides} ({overrideCount})
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={handleDownloadHtml}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>HTML</span>
            </button>

            {matchedTemplate && (
              <button
                type="button"
                onClick={() =>
                  exportWithCustomerTemplate(order, matchedTemplate, {
                    customer,
                    billToCustomer: resolvedBillTo,
                    supplier,
                    bank,
                    products,
                    docLang,
                    contractSettings: settings,
                  })
                }
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-emerald-700 rounded-md hover:bg-emerald-800 transition-colors whitespace-nowrap"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>
                  {t.tplExportCustomBtn} ({matchedTemplate.fileType})
                </span>
              </button>
            )}

            <button
              type="button"
              data-testid="export-contract-docx-btn"
              onClick={() =>
                void exportContractToDocx(order, {
                  customer,
                  billToCustomer: resolvedBillTo,
                  supplier,
                  products,
                  docLang,
                  contractSettings: settings,
                })
              }
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-md border transition-colors whitespace-nowrap ${
                activeDoc === 'contract' || activeDoc === 'all'
                  ? 'text-white bg-indigo-700 border-indigo-700 hover:bg-indigo-800'
                  : 'text-indigo-700 bg-indigo-50 border-indigo-200 hover:bg-indigo-100'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>{t.btnExportContractDocx}</span>
            </button>

            <button
              type="button"
              onClick={() =>
                exportDocumentToExcel(order, {
                  customer,
                  billToCustomer: resolvedBillTo,
                  supplier,
                  bank,
                  products,
                  docLang,
                  contractSettings: settings,
                })
              }
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md hover:bg-emerald-100 transition-colors whitespace-nowrap"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>
                {matchedTemplate ? t.tplExportDefaultBtn : t.btnExportExcel}
              </span>
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

        {/* Special Field Insertion Drawer */}
        {specialMenuOpen && (
          <div
            data-testid="special-fields-panel"
            className="p-3.5 bg-slate-50 border border-slate-200 rounded-md space-y-3 text-xs"
          >
            <div className="flex flex-wrap items-center gap-5">
              <label className="inline-flex items-center gap-2 font-medium text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(special.showCompanyStamp)}
                  onChange={(e) =>
                    handleUpdateSpecialFields({
                      showCompanyStamp: e.target.checked,
                    })
                  }
                />
                <span>{t.specialStampLabel}</span>
              </label>

              <label className="inline-flex items-center gap-2 font-medium text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={special.showSignature !== false}
                  onChange={(e) =>
                    handleUpdateSpecialFields({
                      showSignature: e.target.checked,
                    })
                  }
                />
                <span>{t.specialSignatureLabel}</span>
              </label>

              <label className="inline-flex items-center gap-2 font-medium text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(special.showDisclaimer)}
                  onChange={(e) =>
                    handleUpdateSpecialFields({
                      showDisclaimer: e.target.checked,
                    })
                  }
                />
                <span>{t.specialDisclaimerLabel}</span>
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  {t.specialDisclaimerLabel}
                </label>
                <input
                  type="text"
                  placeholder={t.specialDisclaimerPlaceholder}
                  value={special.disclaimerText ?? ''}
                  onChange={(e) =>
                    handleUpdateSpecialFields({
                      showDisclaimer: true,
                      disclaimerText: e.target.value,
                    })
                  }
                  className="w-full h-8 px-2.5 text-xs bg-white border border-slate-300 rounded"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  {t.specialCustomNoteLabel}
                </label>
                <input
                  type="text"
                  placeholder={t.specialCustomNotePlaceholder}
                  value={special.customNote ?? ''}
                  onChange={(e) =>
                    handleUpdateSpecialFields({
                      customNote: e.target.value,
                    })
                  }
                  className="w-full h-8 px-2.5 text-xs bg-white border border-slate-300 rounded"
                />
              </div>
            </div>

            {onUpdateContractSettings && (
              <div className="pt-2.5 border-t border-slate-200 space-y-2">
                {uploadError && (
                  <div className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded px-2.5 py-1.5">
                    {uploadError}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-3">
                  <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-blue-700 bg-white border border-blue-200 rounded hover:bg-blue-50 cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{t.uploadStampImageBtn}</span>
                    <input
                      type="file"
                      accept="image/*"
                      data-testid="doc-upload-stamp-input"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        void handleUploadSealOrSig('companyStampImage', file);
                        e.target.value = '';
                      }}
                    />
                  </label>
                  {settings.companyStampImage && (
                    <button
                      type="button"
                      onClick={() =>
                        void handleClearSealOrSig('companyStampImage')
                      }
                      className="px-2 py-1 text-[11px] text-red-600 bg-white border border-red-200 rounded hover:bg-red-50"
                    >
                      {t.clearImageBtn} ({t.uploadStampImageBtn})
                    </button>
                  )}

                  <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-blue-700 bg-white border border-blue-200 rounded hover:bg-blue-50 cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{t.uploadSignatureImageBtn}</span>
                    <input
                      type="file"
                      accept="image/*"
                      data-testid="doc-upload-signature-input"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        void handleUploadSealOrSig('signatureImage', file);
                        e.target.value = '';
                      }}
                    />
                  </label>
                  {settings.signatureImage && (
                    <button
                      type="button"
                      onClick={() =>
                        void handleClearSealOrSig('signatureImage')
                      }
                      className="px-2 py-1 text-[11px] text-red-600 bg-white border border-red-200 rounded hover:bg-red-50"
                    >
                      {t.clearImageBtn} ({t.uploadSignatureImageBtn})
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span>{onChangeOrder ? t.docWysiwygHint : t.docPrintHint}</span>
          {matchedTemplate && (
            <span className="font-medium text-emerald-700">
              {t.tplUsingCustomBadge}: {matchedTemplate.name} (
              {matchedTemplate.fileName})
            </span>
          )}
        </div>
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
              settings={settings}
              onCommitOverride={handleCommitOverride}
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
              settings={settings}
              onCommitOverride={handleCommitOverride}
            />
          </div>
        )}

        {(activeDoc === 'contract' || activeDoc === 'all') && (
          <div
            data-testid="sheet-contract"
            className={`hardlock-doc-sheet bg-white border border-slate-300 shadow-xs mx-auto max-w-[920px] px-7 py-6 md:px-9 md:py-7 text-black print:border-0 print:shadow-none print:p-0 ${
              activeDoc === 'all' ? 'print-page-break' : ''
            }`}
          >
            <ContractSheet
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
              settings={settings}
              onCommitOverride={handleCommitOverride}
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
              settings={settings}
              onCommitOverride={handleCommitOverride}
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
  settings: ContractSettings;
  onCommitOverride?: (fieldKey: string, nextValue: string) => void;
}

const HardlockLetterhead: React.FC<{
  order: ExportOrder;
  supplier: Supplier | undefined;
  onCommitOverride?: (fieldKey: string, nextValue: string) => void;
}> = ({ order, supplier, onCommitOverride }) => (
  <div>
    <div className="text-center text-[22px] md:text-[24px] font-bold tracking-tight text-black pb-1 border-b-2 border-black leading-tight">
      <EditableText
        order={order}
        fieldKey="inv.supplierName"
        fallback={supplier?.name || 'HARDLOCK Industry Co., Ltd.'}
        onCommit={onCommitOverride}
      />
    </div>
    <div className="flex justify-between items-start gap-4 pt-1 text-[11px] leading-[1.35] text-black">
      <div className="whitespace-pre-line">
        <EditableText
          order={order}
          fieldKey="inv.supplierAddress"
          fallback={
            supplier?.address ||
            '1-6-24, Kawamata, Higashi Osaka\nOsaka, Japan 577-0063'
          }
          onCommit={onCommitOverride}
          multiline
        />
        {supplier?.taxOrExporterId
          ? `\nTax ID : ${supplier.taxOrExporterId}`
          : ''}
      </div>
      <div className="text-right shrink-0 tabular-nums">
        <div>Tel : {supplier?.phone || '81-6-6784-1131'}</div>
        {supplier?.fax && <div>Fax : {supplier.fax}</div>}
      </div>
    </div>
  </div>
);

const PartyAddressBlock: React.FC<{
  order: ExportOrder;
  heading: string;
  party: Customer | undefined;
  nameKey: string;
  addressKey: string;
  onCommitOverride?: (fieldKey: string, nextValue: string) => void;
}> = ({ order, heading, party, nameKey, addressKey, onCommitOverride }) => (
  <div className="text-[11px] leading-[1.32] text-black">
    <div className="font-bold underline underline-offset-2">{heading}</div>
    <div className="font-bold mt-0.5 uppercase">
      <EditableText
        order={order}
        fieldKey={nameKey}
        fallback={party?.name || '—'}
        onCommit={onCommitOverride}
      />
    </div>
    {(party?.address || order.docOverrides?.[addressKey]) && (
      <div className="whitespace-pre-line">
        <EditableText
          order={order}
          fieldKey={addressKey}
          fallback={party?.address || ''}
          onCommit={onCommitOverride}
          multiline
        />
      </div>
    )}
    {party?.country && <div>{party.country}</div>}
    {party?.contactName && <div>Attn : {party.contactName}</div>}
    {party?.phone && <div>Mobile : {party.phone}</div>}
    {party?.fax && <div>Fax : {party.fax}</div>}
    {party?.taxOrImporterId && <div>Tax ID : {party.taxOrImporterId}</div>}
  </div>
);

const HardlockFooterSplit: React.FC<{
  order: ExportOrder;
  supplier: Supplier | undefined;
  totalCartons: number;
  originCountry: string;
  settings: ContractSettings;
  onCommitOverride?: (fieldKey: string, nextValue: string) => void;
}> = ({
  order,
  supplier,
  totalCartons,
  originCountry,
  settings,
  onCommitOverride,
}) => {
  const pallets =
    order.palletCount && order.palletCount > 0 ? order.palletCount : 0;
  const ctnLine =
    pallets > 1
      ? `CTN NO. 1 / ${pallets} - ${pallets} / ${pallets}`
      : `CTN NO. 1 - ${Math.max(1, totalCartons)}`;
  const special = order.docSpecialFields ?? {};
  const showSig = special.showSignature !== false;
  const stampLabel =
    settings.companyStampLabel || supplier?.name || 'HARDLOCK Industry Co., Ltd.';

  return (
    <div className="mt-5 flex justify-between items-end gap-6 print-avoid-break text-[11px] leading-[1.38] text-black">
      <div className="font-bold">
        {(order.shipping.shippingMarksMain ||
          order.docOverrides?.['inv.shippingMarks']) && (
          <div className="whitespace-pre-line uppercase">
            <EditableText
              order={order}
              fieldKey="inv.shippingMarks"
              fallback={order.shipping.shippingMarksMain}
              onCommit={onCommitOverride}
              multiline
            />
          </div>
        )}
        <div>
          HARDLOCK No.{' '}
          <EditableText
            order={order}
            fieldKey="inv.invoiceNo"
            fallback={order.invoiceNo}
            onCommit={onCommitOverride}
          />
        </div>
        <div>{ctnLine}</div>
        <div>MADE IN {originCountry}</div>
      </div>

      <div className="relative min-w-[230px] max-w-[270px]">
        {special.showCompanyStamp && (
          <div className="absolute -top-6 right-0 opacity-90 pointer-events-none">
            {settings.companyStampImage ? (
              <img
                src={settings.companyStampImage}
                alt="Company Stamp"
                data-testid="uploaded-stamp-img"
                className="w-24 h-24 object-contain"
              />
            ) : (
              <CompanyStampSvg label={stampLabel} />
            )}
          </div>
        )}
        <div className="text-[11px]">
          {supplier?.name || 'HARDLOCK Industry Co., Ltd.'}
        </div>
        <div className="pt-1 pb-0.5 border-b border-black min-h-[28px] flex items-end">
          {showSig &&
            (settings.signatureImage ? (
              <img
                src={settings.signatureImage}
                alt="Authorized Signature"
                data-testid="uploaded-signature-img"
                className="max-h-10 max-w-[160px] object-contain"
              />
            ) : (
              <div
                className="text-[19px] leading-none text-slate-600/80 select-none italic tracking-wide"
                style={{
                  fontFamily: '"Brush Script MT", "Segoe Script", Georgia, serif',
                }}
              >
                {supplier?.signatoryName?.replace(/^(Mr\.|Ms\.)\s*/i, '') ||
                  'Song Shanghua'}
              </div>
            ))}
        </div>
        <div className="mt-0.5 text-[11px]">
          {supplier?.signatoryName || 'Mr. Song Shanghua'}
        </div>
        <div className="text-[11px]">
          {supplier?.signatoryTitle || 'Overseas Sales'}
        </div>
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
  settings,
  onCommitOverride,
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
      <HardlockLetterhead
        order={order}
        supplier={supplier}
        onCommitOverride={onCommitOverride}
      />

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
          No.{' '}
          <EditableText
            order={order}
            fieldKey="inv.invoiceNo"
            fallback={order.invoiceNo}
            onCommit={onCommitOverride}
          />
        </div>
        <div className="text-right text-[11px] font-bold -mt-1">
          Date :{' '}
          <EditableText
            order={order}
            fieldKey="inv.orderDate"
            fallback={displayDate}
            onCommit={onCommitOverride}
          />
        </div>
      </div>

      {/* BILL TO & SHIP TO */}
      <div className="space-y-3 pt-1">
        <PartyAddressBlock
          order={order}
          heading="BILL TO :"
          party={billToCustomer}
          nameKey="inv.billToName"
          addressKey="inv.billToAddress"
          onCommitOverride={onCommitOverride}
        />
        <PartyAddressBlock
          order={order}
          heading="SHIP TO :"
          party={customer}
          nameKey="inv.shipToName"
          addressKey="inv.shipToAddress"
          onCommitOverride={onCommitOverride}
        />
      </div>

      {/* Shipment Details + Right Notes */}
      <div className="pt-2 space-y-0.5 text-[11px]">
        <div>Shipment : on {shipmentDate}</div>
        <div>
          Loading port :{' '}
          <EditableText
            order={order}
            fieldKey="inv.portOfLoading"
            fallback={order.shipping.portOfLoading || '—'}
            onCommit={onCommitOverride}
          />
          {order.shipping.vesselOrFlightOrCourier
            ? ` by "${order.shipping.vesselOrFlightOrCourier}"`
            : ''}
          {etdDisplay ? ` ETD ${etdDisplay}` : ''}
        </div>
        <div>
          Destination :{' '}
          <EditableText
            order={order}
            fieldKey="inv.portOfDischarge"
            fallback={order.shipping.portOfDischarge || '—'}
            onCommit={onCommitOverride}
          />
          {etaDisplay ? ` ETA ${etaDisplay}` : ''}
        </div>
      </div>

      <div className="flex justify-between items-end pt-1">
        <div className="font-bold text-[11.5px]">
          ITEM :{' '}
          <EditableText
            order={order}
            fieldKey="inv.itemHeader"
            fallback={order.itemHeader?.trim() || 'HARDLOCK NUT (HLN)'}
            onCommit={onCommitOverride}
          />
        </div>
        <div className="text-right text-[10.5px] font-bold leading-tight">
          <div className="italic">*Seller → Buyer transaction value only</div>
          <div>*Currency : {formatCurrencyLabel(order.currency)}</div>
          {order.currency !== 'JPY' && (
            <div>
              *Exchange Rate : 1 {order.currency} ={' '}
              {resolveEffectiveExchangeRate(order.currency, order.exchangeRate)}{' '}
              JPY
            </div>
          )}
        </div>
      </div>

      {/* 11-Column Invoice Table */}
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
              const partDisplay = formatDocumentPartDisplay(
                item,
                customer,
                products,
              );
              return (
                <tr key={item.id}>
                  <td className="border border-black px-1 py-0.5 text-center">
                    {idx + 1}
                  </td>
                  <td className="border border-black px-1.5 py-0.5 font-semibold">
                    <div className="leading-tight">{partDisplay.partName}</div>
                    {partDisplay.sku &&
                      partDisplay.partName !== partDisplay.sku && (
                        <div className="text-[9px] font-normal text-slate-600 leading-tight whitespace-nowrap">
                          {partDisplay.sku}
                        </div>
                      )}
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
                    {formatNumberNoRound(item.unitNetWeightKg || 0, 0)}
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

            {costRows.map((row, rIdx) => (
              <tr key={row.label}>
                <td colSpan={6} className="px-0.5 text-[10px] font-bold">
                  {rIdx === 0
                    ? (footnotes[1] ?? '')
                    : rIdx === 1
                      ? (footnotes[2] ?? '')
                      : ''}
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

      {/* Lower Packing Summary + Origin */}
      <div className="flex justify-between items-end gap-6 pt-2 text-[11px] leading-[1.45]">
        <div>
          <div>
            <EditableText
              order={order}
              fieldKey="inv.packingSummary"
              fallback={`Packing : ${pallets > 0 ? `${pallets} pallets (` : ''}${
                summary.totalCartons
              } cartons total${
                emptyCartons > 0 ? ` + ${emptyCartons} empty carton` : ''
              }${pallets > 0 ? ')' : ''}`}
              onCommit={onCommitOverride}
            />
          </div>
          <div>
            <EditableText
              order={order}
              fieldKey="inv.cartonSize"
              fallback={`Carton size : ${cartonDims}`}
              onCommit={onCommitOverride}
            />
          </div>
          <div>
            <EditableText
              order={order}
              fieldKey="inv.netWeightSummary"
              fallback={`N/W : approx. ${formatWeight1(summary.totalNetWeightKg)} kg`}
              onCommit={onCommitOverride}
            />
          </div>
          <div>
            <EditableText
              order={order}
              fieldKey="inv.grossWeightSummary"
              fallback={`G/W : approx. ${formatWeight1(summary.totalGrossWeightKg)} kg`}
              onCommit={onCommitOverride}
            />
          </div>
          <div>
            <EditableText
              order={order}
              fieldKey="inv.volumeSummary"
              fallback={`Vol. : approx. ${formatNumberNoRound(summary.totalCbm, 3)}M3`}
              onCommit={onCommitOverride}
            />
          </div>
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
          :{' '}
          <EditableText
            order={order}
            fieldKey="inv.paymentTerms"
            fallback={order.paymentTerms || '—'}
            onCommit={onCommitOverride}
          />
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

        {(order.remarks || order.docOverrides?.['inv.remarks']) && (
          <div className="text-[10.5px] text-slate-800 pt-0.5">
            Remarks :{' '}
            <EditableText
              order={order}
              fieldKey="inv.remarks"
              fallback={order.remarks || ''}
              onCommit={onCommitOverride}
            />
          </div>
        )}
      </div>

      <HardlockFooterSplit
        order={order}
        supplier={supplier}
        totalCartons={summary.totalCartons}
        originCountry={originCountry}
        settings={settings}
        onCommitOverride={onCommitOverride}
      />

      <SpecialFieldsFooterBlock
        order={order}
        supplier={supplier}
        settings={settings}
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
  settings,
  onCommitOverride,
}) => {
  const displayRows = useMemo(
    () =>
      buildPackingListDisplayRows(order.items, products, order.packingRows, {
        customer,
      }),
    [order.items, products, order.packingRows, customer],
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
      <HardlockLetterhead
        order={order}
        supplier={supplier}
        onCommitOverride={onCommitOverride}
      />

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
          INVOICE No.{' '}
          <EditableText
            order={order}
            fieldKey="inv.invoiceNo"
            fallback={order.invoiceNo}
            onCommit={onCommitOverride}
          />
        </div>
        <div className="text-right text-[11px] font-bold -mt-1">
          Date :{' '}
          <EditableText
            order={order}
            fieldKey="inv.orderDate"
            fallback={displayDate}
            onCommit={onCommitOverride}
          />
        </div>
      </div>

      {/* BILL TO & DELIVER TO */}
      <div className="space-y-3 pt-1">
        <PartyAddressBlock
          order={order}
          heading="BILL TO :"
          party={billToCustomer}
          nameKey="inv.billToName"
          addressKey="inv.billToAddress"
          onCommitOverride={onCommitOverride}
        />
        <PartyAddressBlock
          order={order}
          heading="DELIVER TO :"
          party={customer}
          nameKey="inv.shipToName"
          addressKey="inv.shipToAddress"
          onCommitOverride={onCommitOverride}
        />
      </div>

      {/* Shipment Details */}
      <div className="pt-2 space-y-0.5 text-[11px]">
        <div>Shipment : on {shipmentDate}</div>
        <div>
          Loading port :{' '}
          <EditableText
            order={order}
            fieldKey="inv.portOfLoading"
            fallback={order.shipping.portOfLoading || '—'}
            onCommit={onCommitOverride}
          />
          {order.shipping.vesselOrFlightOrCourier
            ? ` by "${order.shipping.vesselOrFlightOrCourier}"`
            : ''}
          {etdDisplay ? ` ETD ${etdDisplay}` : ''}
        </div>
        <div>
          Destination :{' '}
          <EditableText
            order={order}
            fieldKey="inv.portOfDischarge"
            fallback={order.shipping.portOfDischarge || '—'}
            onCommit={onCommitOverride}
          />
          {etaDisplay ? ` ETA ${etaDisplay}` : ''}
        </div>
      </div>

      <div className="font-bold text-[11.5px] pt-1">
        ITEM :{' '}
        <EditableText
          order={order}
          fieldKey="inv.itemHeader"
          fallback={order.itemHeader?.trim() || 'HARDLOCK NUT'}
          onCommit={onCommitOverride}
        />{' '}
        (HS CODE : {compactHsDigits})
      </div>

      {/* 11-Column Pallet-Merged Packing List Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[10.5px] tabular-nums">
          <thead>
            <tr className="font-bold text-center bg-white">
              <th className="border border-black px-1 py-1 w-16 whitespace-nowrap leading-tight">
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
                  <td className={`${cellBorder} px-1.5 py-0.5 font-semibold`}>
                    <div className="leading-tight">
                      {row.partName || row.type || '—'}
                    </div>
                    {row.type && row.partName && row.partName !== row.type && (
                      <div className="text-[9px] font-normal text-slate-600 leading-tight whitespace-nowrap">
                        {row.type}
                      </div>
                    )}
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
                    {formatNumberNoRound(row.unitWeightKg || 0, 0)}
                  </td>
                  <td
                    className={`${cellBorder} px-1.5 py-0.5 text-right whitespace-nowrap`}
                  >
                    {formatWeight1(row.totalWeightKg || 0)}
                  </td>
                </tr>
              );
            })}

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

      {/* Lower Packing Summary */}
      <div className="flex justify-between items-start gap-6 pt-3 text-[11px] leading-[1.45]">
        <div>
          <div>
            <EditableText
              order={order}
              fieldKey="pl.packingSummary"
              fallback={`Packing : ${pallets > 0 ? `${pallets} pallets (` : ''}${plTotalCartons} cartons total${
                emptyCartons > 0 ? ` + ${emptyCartons} empty carton` : ''
              }${pallets > 0 ? ')' : ''}`}
              onCommit={onCommitOverride}
            />
          </div>
          <div>
            <EditableText
              order={order}
              fieldKey="pl.cartonSize"
              fallback={`Carton size : ${cartonDims}`}
              onCommit={onCommitOverride}
            />
          </div>
          <div>
            <EditableText
              order={order}
              fieldKey="pl.netWeightSummary"
              fallback={`N/W : approx. ${formatWeight1(plTotalTw)} kg`}
              onCommit={onCommitOverride}
            />
          </div>
          <div>
            <EditableText
              order={order}
              fieldKey="pl.grossWeightSummary"
              fallback={`G/W : approx. ${formatWeight1(summary.totalGrossWeightKg)} kg`}
              onCommit={onCommitOverride}
            />
          </div>
          <div>
            <EditableText
              order={order}
              fieldKey="pl.volumeSummary"
              fallback={`Vol. : approx. ${formatNumberNoRound(summary.totalCbm, 3)}M3`}
              onCommit={onCommitOverride}
            />
          </div>
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
        settings={settings}
        onCommitOverride={onCommitOverride}
      />

      <SpecialFieldsFooterBlock
        order={order}
        supplier={supplier}
        settings={settings}
      />
    </div>
  );
};

const ContractSheet: React.FC<SheetCommonProps> = ({
  order,
  customer,
  billToCustomer,
  supplier,
  products,
  summary,
  docLang,
  settings,
  onCommitOverride,
}) => {
  const buyer = billToCustomer ?? customer;
  const placeShort = getShortPlace(
    order.shipping.incotermPlace || order.shipping.portOfDischarge,
  );
  const displayDate = formatDocumentDate(order.orderDate, docLang);
  const freightTotal =
    (summary.flags.includesInland ? summary.inlandFreightCost : 0) +
    (summary.flags.includesMainFreight ? summary.mainFreightCost : 0);
  const totalWords = numberToContractWords(summary.incotermTotal, order.currency);
  const special = order.docSpecialFields ?? {};
  const showSig = special.showSignature !== false;
  const stampLabel =
    settings.companyStampLabel || supplier?.name || 'HARDLOCK Industry Co., Ltd.';

  return (
    <div className="space-y-3 text-[11px] leading-[1.42] text-black">
      {/* Running Header matching Reference Contract */}
      <div className="flex justify-end pb-1 border-b border-black text-[10.5px] font-semibold">
        <span>
          CONTRACT No.{' '}
          <EditableText
            order={order}
            fieldKey="contract.no"
            fallback={order.invoiceNo}
            onCommit={onCommitOverride}
          />
        </span>
      </div>

      {/* Bilingual Title */}
      <div className="pt-2 text-center space-y-0.5">
        <div className="text-[20px] font-bold tracking-[0.35em]">合 同</div>
        <div className="text-[19px] font-bold tracking-[0.22em]">CONTRACT</div>
      </div>

      <div className="flex justify-end text-[11px]">
        <div className="space-y-0.5 min-w-[200px]">
          <div>
            编 号 NO. :{' '}
            <EditableText
              order={order}
              fieldKey="contract.no"
              fallback={order.invoiceNo}
              onCommit={onCommitOverride}
            />
          </div>
          <div>
            日 期 DATE :{' '}
            <EditableText
              order={order}
              fieldKey="inv.orderDate"
              fallback={displayDate}
              onCommit={onCommitOverride}
            />
          </div>
        </div>
      </div>

      {/* Buyers & Sellers Blocks */}
      <div className="space-y-2.5 pt-1 text-[10.5px]">
        <div className="space-y-0.5">
          <div>
            买 方 THE BUYERS :{' '}
            <span className="font-bold">
              <EditableText
                order={order}
                fieldKey="contract.buyerName"
                fallback={buyer?.name || '—'}
                onCommit={onCommitOverride}
              />
            </span>
          </div>
          <div>
            地 址 ADDRESS :{' '}
            <EditableText
              order={order}
              fieldKey="contract.buyerAddress"
              fallback={[buyer?.address, buyer?.country]
                .filter(Boolean)
                .join(', ')}
              onCommit={onCommitOverride}
              multiline
            />
          </div>
          <div className="flex flex-wrap gap-8">
            <span>
              电 话 TELEPHONE :{' '}
              <EditableText
                order={order}
                fieldKey="contract.buyerPhone"
                fallback={buyer?.phone || '—'}
                onCommit={onCommitOverride}
              />
            </span>
            <span>
              传 真 FAX :{' '}
              <EditableText
                order={order}
                fieldKey="contract.buyerFax"
                fallback={buyer?.fax || '-'}
                onCommit={onCommitOverride}
              />
            </span>
          </div>
        </div>

        <div className="space-y-0.5 pt-1">
          <div>
            卖 方 THE SELLERS :{' '}
            <span className="font-bold">
              <EditableText
                order={order}
                fieldKey="contract.sellerName"
                fallback={supplier?.name || 'HARDLOCK INDUSTRY CO., LTD.'}
                onCommit={onCommitOverride}
              />
            </span>
          </div>
          <div>
            地 址 ADDRESS :{' '}
            <EditableText
              order={order}
              fieldKey="contract.sellerAddress"
              fallback={
                supplier?.address ||
                '1-6-24, KAWAMATA, HIGASHI-OSAKA, OSAKA, JAPAN 577-0063'
              }
              onCommit={onCommitOverride}
              multiline
            />
          </div>
          <div className="flex flex-wrap gap-8">
            <span>
              电 话 TELEPHONE :{' '}
              <EditableText
                order={order}
                fieldKey="contract.sellerPhone"
                fallback={supplier?.phone || '+81 6-6784-1131'}
                onCommit={onCommitOverride}
              />
            </span>
            <span>
              传 真 FAX :{' '}
              <EditableText
                order={order}
                fieldKey="contract.sellerFax"
                fallback={supplier?.fax || '+81 6-6784-1161'}
                onCommit={onCommitOverride}
              />
            </span>
          </div>
        </div>
      </div>

      {/* Preamble */}
      <div className="pt-1 text-[10.5px] leading-snug">
        <div>
          <EditableText
            order={order}
            fieldKey="contract.preambleZh"
            fallback="兹经买卖双方同意按照以下条款由买方购进卖方售出以下商品。"
            onCommit={onCommitOverride}
          />
        </div>
        <div className="uppercase">
          <EditableText
            order={order}
            fieldKey="contract.preambleEn"
            fallback="THIS CONTRACT IS MADE BY AND BETWEEN THE BUYERS AND THE SELLERS, WHEREBY THE BUYERS AGREE TO BUY AND THE SELLERS AGREE TO SELL THE UNDER-MENTIONED GOODS SUBJECT TO THE TERMS AND CONDITIONS, AS STIPULATED HEREAFTER:"
            onCommit={onCommitOverride}
            multiline
          />
        </div>
      </div>

      {/* Bilingual Commodity Table */}
      <div className="overflow-x-auto pt-1">
        <table className="w-full border-collapse text-[10.5px] tabular-nums">
          <thead>
            <tr className="text-center font-semibold bg-white">
              <th className="border border-black px-1.5 py-1 w-12 leading-tight">
                项目
                <br />
                ITEM
                <br />
                NO.
              </th>
              <th
                colSpan={3}
                className="border border-black px-2 py-1 leading-tight"
              >
                商品名称及规格
                <br />
                NAME OF COMMODITY &amp; SPECIFICATION
              </th>
              <th className="border border-black px-1.5 py-1 w-16 leading-tight">
                数量
                <br />
                QUANTITY
              </th>
              <th className="border border-black px-1.5 py-1 w-20 leading-tight">
                单价
                <br />
                UNIT PRICE
              </th>
              <th className="border border-black px-1.5 py-1 w-24 leading-tight">
                总价
                <br />
                TOTAL PRICE
              </th>
            </tr>
            <tr className="text-center font-semibold bg-white">
              <th className="border border-black px-1 py-0.5" />
              <th className="border border-black px-1.5 py-0.5">ITEM</th>
              <th className="border border-black px-1.5 py-0.5">SIZE/PITCH</th>
              <th className="border border-black px-1.5 py-0.5">
                MATERIAL / FINISH
              </th>
              <th className="border border-black px-1 py-0.5">
                {order.items[0]?.unit || 'SET'}
              </th>
              <th className="border border-black px-1 py-0.5">
                {order.currency}
              </th>
              <th className="border border-black px-1 py-0.5">
                {order.currency}
              </th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item, idx) => {
              const prod = products.find((p) => p.id === item.productId);
              const specs = resolveItemSpecs(item, prod);
              const partDisplay = formatDocumentPartDisplay(
                item,
                customer,
                products,
              );
              const calc = summary.lineItems[idx];
              const matFinish = [specs.material, specs.surfaceFinish]
                .filter(Boolean)
                .join(' / ');
              return (
                <tr key={item.id}>
                  <td className="border border-black px-1 py-1 text-center">
                    {idx + 1}.
                  </td>
                  <td className="border border-black px-1.5 py-1 font-semibold">
                    <div className="leading-tight">{partDisplay.partName}</div>
                    {partDisplay.sku &&
                      partDisplay.partName !== partDisplay.sku && (
                        <div className="text-[9px] font-normal text-slate-600 leading-tight whitespace-nowrap">
                          {partDisplay.sku}
                        </div>
                      )}
                  </td>
                  <td className="border border-black px-1.5 py-1 text-center whitespace-nowrap">
                    {specs.size || '—'}
                  </td>
                  <td className="border border-black px-1.5 py-1 text-center whitespace-nowrap">
                    {matFinish || '—'}
                  </td>
                  <td className="border border-black px-1.5 py-1 text-right whitespace-nowrap">
                    {item.quantity.toLocaleString()}
                  </td>
                  <td className="border border-black px-1.5 py-1 text-right whitespace-nowrap">
                    {formatDocMoney(item.unitPrice, order.currency)}
                  </td>
                  <td className="border border-black px-1.5 py-1 text-right whitespace-nowrap">
                    {formatDocMoney(calc?.amount ?? 0, order.currency)}
                  </td>
                </tr>
              );
            })}
            <tr className="font-bold">
              <td
                colSpan={6}
                className="border border-black px-2 py-1 text-right"
              >
                Ex-works Total
              </td>
              <td className="border border-black px-1.5 py-1 text-right whitespace-nowrap">
                {formatDocMoney(summary.exwTotal, order.currency)}
              </td>
            </tr>
            {freightTotal > 0 && (
              <tr className="font-bold">
                <td
                  colSpan={6}
                  className="border border-black px-2 py-1 text-right"
                >
                  {getModeFreightLabel(order.shipping.mode)}
                </td>
                <td className="border border-black px-1.5 py-1 text-right whitespace-nowrap">
                  {formatDocMoney(freightTotal, order.currency)}
                </td>
              </tr>
            )}
            <tr className="font-bold">
              <td
                colSpan={6}
                className="border border-black px-2 py-1 text-right"
              >
                {order.shipping.incoterm} {placeShort}
              </td>
              <td className="border border-black px-1.5 py-1 text-right whitespace-nowrap">
                {formatDocMoney(summary.incotermTotal, order.currency)}
              </td>
            </tr>
            <tr>
              <td colSpan={7} className="border border-black px-2 py-1">
                总 价 TOTAL VALUE :{' '}
                <span className="font-bold">
                  <EditableText
                    order={order}
                    fieldKey="contract.totalWords"
                    fallback={totalWords}
                    onCommit={onCommitOverride}
                  />
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Numbered Bilingual Terms & Conditions */}
      <div className="pt-2 space-y-2.5 text-[10.5px] leading-[1.42]">
        {settings.clauses.map((clause) => {
          const zhFallback = interpolateContractText(
            clause.bodyZh,
            order,
            supplier,
          );
          const enFallback = interpolateContractText(
            clause.bodyEn,
            order,
            supplier,
          );
          return (
            <div key={clause.id} className="flex gap-3 print-avoid-break">
              <div className="w-6 shrink-0 font-semibold tabular-nums">
                {clause.number}.
              </div>
              <div className="flex-1 space-y-0.5">
                <div className="font-semibold">
                  <EditableText
                    order={order}
                    fieldKey={`contract.clause.${clause.number}.title`}
                    fallback={`${clause.titleZh}  ${clause.titleEn} :`}
                    onCommit={onCommitOverride}
                  />
                </div>
                {zhFallback && (
                  <div>
                    <EditableText
                      order={order}
                      fieldKey={`contract.clause.${clause.number}.zh`}
                      fallback={zhFallback}
                      onCommit={onCommitOverride}
                      multiline
                    />
                  </div>
                )}
                {enFallback && (
                  <div className="uppercase">
                    <EditableText
                      order={order}
                      fieldKey={`contract.clause.${clause.number}.en`}
                      fallback={enFallback}
                      onCommit={onCommitOverride}
                      multiline
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Dual Buyer / Seller Signature Block */}
      <div className="pt-6 grid grid-cols-2 gap-10 print-avoid-break text-[10.5px]">
        <div className="space-y-1.5">
          <div>买方 : THE BUYER:</div>
          <div className="font-bold uppercase">
            <EditableText
              order={order}
              fieldKey="contract.buyerName"
              fallback={buyer?.name || '—'}
              onCommit={onCommitOverride}
            />
          </div>
          <div>DATE :</div>
          <div className="h-10 border-b border-black" />
          <div>
            <EditableText
              order={order}
              fieldKey="contract.buyerSignatory"
              fallback={buyer?.contactName || 'AUTHORIZED REPRESENTATIVE'}
              onCommit={onCommitOverride}
            />
          </div>
          <div>
            <EditableText
              order={order}
              fieldKey="contract.buyerSignatoryTitle"
              fallback="MANAGING DIRECTOR"
              onCommit={onCommitOverride}
            />
          </div>
        </div>

        <div className="relative space-y-1.5">
          {special.showCompanyStamp && (
            <div className="absolute top-6 right-2 opacity-90 pointer-events-none">
              {settings.companyStampImage ? (
                <img
                  src={settings.companyStampImage}
                  alt="Company Stamp"
                  data-testid="uploaded-stamp-img"
                  className="w-24 h-24 object-contain"
                />
              ) : (
                <CompanyStampSvg label={stampLabel} />
              )}
            </div>
          )}
          <div>卖方 : THE SELLER:</div>
          <div className="font-bold uppercase">
            <EditableText
              order={order}
              fieldKey="contract.sellerName"
              fallback={supplier?.name || 'HARDLOCK INDUSTRY CO., LTD.'}
              onCommit={onCommitOverride}
            />
          </div>
          <div>
            DATE :{' '}
            <EditableText
              order={order}
              fieldKey="inv.orderDate"
              fallback={displayDate}
              onCommit={onCommitOverride}
            />
          </div>
          <div className="h-12 border-b border-black flex items-end pb-1">
            {showSig &&
              (settings.signatureImage ? (
                <img
                  src={settings.signatureImage}
                  alt="Authorized Signature"
                  data-testid="uploaded-signature-img"
                  className="max-h-10 max-w-[160px] object-contain"
                />
              ) : (
                <span
                  className="text-[20px] leading-none text-slate-600/80 select-none italic tracking-wide"
                  style={{
                    fontFamily:
                      '"Brush Script MT", "Segoe Script", Georgia, serif',
                  }}
                >
                  {supplier?.signatoryName?.replace(/^(Mr\.|Ms\.)\s*/i, '') ||
                    'Song Shanghua'}
                </span>
              ))}
          </div>
          <div>
            <EditableText
              order={order}
              fieldKey="contract.sellerSignatory"
              fallback={supplier?.signatoryName || 'MR. SONG SHANGHUA'}
              onCommit={onCommitOverride}
            />
          </div>
          <div>
            <EditableText
              order={order}
              fieldKey="contract.sellerSignatoryTitle"
              fallback={supplier?.signatoryTitle || 'OVERSEAS SALES'}
              onCommit={onCommitOverride}
            />
          </div>
        </div>
      </div>

      <SpecialFieldsFooterBlock
        order={order}
        supplier={supplier}
        settings={settings}
      />
    </div>
  );
};

const CaseMarkSheet: React.FC<
  Omit<SheetCommonProps, 'logistics' | 'billToCustomer' | 'products' | 'docLang'>
> = ({ order, customer, supplier, summary, caseRanges, d, onCommitOverride }) => (
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
          TEL: {supplier?.phone}{' '}
          {supplier?.fax ? `· FAX: ${supplier.fax}` : ''} · ID:{' '}
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
            <EditableText
              order={order}
              fieldKey="inv.shippingMarks"
              fallback={order.shipping.shippingMarksMain || customer?.name || ''}
              onCommit={onCommitOverride}
              multiline
            />
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
            {formatWeight1(summary.totalNetWeightKg)} kg
          </div>
        </div>
        <div>
          <div className="text-[11px] font-bold text-slate-500 uppercase">
            {d.grossWeight}
          </div>
          <div className="font-mono-tabular font-bold text-slate-900 mt-0.5">
            {formatWeight1(summary.totalGrossWeightKg)} kg
          </div>
        </div>
        <div>
          <div className="text-[11px] font-bold text-slate-500 uppercase">
            {d.measurement}
          </div>
          <div className="font-mono-tabular font-bold text-slate-900 mt-0.5">
            {formatNumberNoRound(summary.totalCbm, 3)} m³
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
          {d.madeIn}{' '}
          {order.items[0]?.originCountry || supplier?.country || 'JAPAN'}
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
