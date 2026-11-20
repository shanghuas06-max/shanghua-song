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
  Type,
  Plus,
  Minus,
  Trash2,
  X,
} from 'lucide-react';
import type {
  BankAccount,
  ContractSettings,
  Customer,
  DocCellDensity,
  DocFontFamilyId,
  DocLanguage,
  DocSpecialFields,
  DocStyleSettings,
  DocumentTab,
  ExportOrder,
  LogisticsProvider,
  OrderItem,
  PackingListRow,
  Product,
  Supplier,
  TransportMode,
} from '../types/erp';
import type { UiDictionary } from '../i18n/uiTranslations';
import { DOC_TEXT, type DocDictionary } from '../i18n/docTranslations';
import {
  calculateItemCartons,
  calculateOrderSummary,
  calculatePalletPacking,
  cleanFloat,
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
import {
  convertPriceToJpy,
  exportDocumentToExcel,
  resolveCustomerProductPricing,
} from '../utils/importExportUtils';
import { exportContractToDocx } from '../utils/contractDocxExport';
import {
  exportWithCustomerTemplate,
  findMatchingCustomerTemplate,
} from '../utils/templateExportUtils';
import {
  DEFAULT_DOC_STYLE,
  DOC_FONT_CSS_MAP,
  buildDocSheetCssVars,
  resolveDocStyle,
} from '../utils/docStyleUtils';

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
  directValue?: string;
  onCommit?: (fieldKey: string, nextValue: string) => void;
  onDirectCommit?: (nextValue: string) => void;
  className?: string;
  multiline?: boolean;
}> = ({
  order,
  fieldKey,
  fallback,
  directValue,
  onCommit,
  onDirectCommit,
  className = '',
  multiline,
}) => {
  const current =
    directValue !== undefined
      ? directValue
      : getOverride(order, fieldKey, fallback);
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

  if (!onDirectCommit && !onCommit) {
    return <span className={className}>{current}</span>;
  }
  return (
    <span
      ref={spanRef}
      contentEditable
      suppressContentEditableWarning
      data-editable-key={fieldKey}
      onKeyDown={(e) => {
        if (!multiline && e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      onBlur={(e) => {
        const raw = e.currentTarget.innerText ?? e.currentTarget.textContent ?? '';
        const cleaned = multiline ? raw.replace(/\r/g, '').trimEnd() : raw.trim();
        if (cleaned !== current) {
          if (onDirectCommit) {
            onDirectCommit(cleaned);
          } else if (onCommit) {
            onCommit(fieldKey, cleaned);
          }
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
  const [typographyMenuOpen, setTypographyMenuOpen] = useState(false);
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
  const special = order.docSpecialFields ?? {};
  const docStyle = resolveDocStyle(special.docStyle);
  const docSheetCssStyle = buildDocSheetCssVars(docStyle) as React.CSSProperties;
  const hiddenSections = special.hiddenSections ?? [];
  const effectiveExchangeRate = resolveEffectiveExchangeRate(
    order.currency,
    order.exchangeRate,
  );

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

  const handleUpdateDocStyle = (patch: Partial<DocStyleSettings>) => {
    const nextStyle = resolveDocStyle({
      ...docStyle,
      ...patch,
    });
    handleUpdateSpecialFields({ docStyle: nextStyle });
  };

  const handleResetDocStyle = () => {
    handleUpdateSpecialFields({ docStyle: { ...DEFAULT_DOC_STYLE } });
  };

  const handleHideSection = onChangeOrder
    ? (sectionKey: string) => {
        if (hiddenSections.includes(sectionKey)) return;
        handleUpdateSpecialFields({
          hiddenSections: [...hiddenSections, sectionKey],
        });
      }
    : undefined;

  const handleRestoreHiddenSections = () => {
    handleUpdateSpecialFields({ hiddenSections: [] });
  };

  const syncOrderItemsAndPallets = (nextItems: OrderItem[], syncPallets: boolean) => {
    if (!onChangeOrder) return;
    if (!syncPallets) {
      onChangeOrder({
        ...order,
        items: nextItems,
        updatedAt: new Date().toISOString(),
      });
      return;
    }
    const nextSummary = calculateOrderSummary(
      nextItems,
      order.costs ?? DEFAULT_EMPTY_COSTS,
      order.shipping.incoterm,
      order.currency,
      order.palletCount ?? 0,
    );
    const layerSize = Math.max(1, Number(order.cartonsPerLayer ?? 12) || 12);
    const pack = calculatePalletPacking(nextSummary.totalCartons, {
      cartonsPerLayer: layerSize,
    });
    onChangeOrder({
      ...order,
      items: nextItems,
      palletCount: pack.palletCount,
      emptyCartons: pack.emptyCartons,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleUpdateOrderItem = onChangeOrder
    ? (
        itemId: string,
        patch: Partial<OrderItem>,
        customPartOverride?: string,
      ) => {
        const nextItems = order.items.map((item) => {
          if (item.id !== itemId) return item;
          const prod = products.find((p) => p.id === item.productId);
          const merged: OrderItem = { ...item, ...patch };
          if (typeof patch.quantity === 'number') {
            const spc =
              merged.setsPerCarton || prod?.defaultUnitsPerCarton || 100;
            merged.cartons = calculateItemCartons(merged.quantity, spc);
          }
          if (typeof patch.unitPrice === 'number') {
            merged.baseUnitPriceJpy = convertPriceToJpy(
              patch.unitPrice,
              order.currency,
              effectiveExchangeRate,
            );
          }
          return merged;
        });
        if (customPartOverride !== undefined) {
          onChangeOrder({
            ...order,
            items: nextItems,
            docOverrides: {
              ...(order.docOverrides ?? {}),
              [`inv.part.${itemId}`]: customPartOverride,
            },
            updatedAt: new Date().toISOString(),
          });
          return;
        }
        syncOrderItemsAndPallets(nextItems, typeof patch.quantity === 'number');
      }
    : undefined;

  const handleDeleteOrderItem = onChangeOrder
    ? (itemId: string) => {
        const nextItems = order.items.filter((i) => i.id !== itemId);
        syncOrderItemsAndPallets(nextItems, true);
      }
    : undefined;

  const handleAddOrderItemFromProduct = onChangeOrder
    ? (productId: string) => {
        const prod = products.find((p) => p.id === productId);
        if (!prod) return;
        const defaultQty = prod.defaultUnitsPerCarton || 100;
        const resolved = resolveCustomerProductPricing(
          customer,
          prod,
          defaultQty,
          order.currency,
          effectiveExchangeRate,
        );
        const itemCartons = Math.max(
          1,
          calculateItemCartons(defaultQty, prod.defaultUnitsPerCarton || 100),
        );
        const newItem: OrderItem = {
          id: `oi-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          productId: prod.id,
          sku: prod.sku,
          description: resolved.customDescription || prod.nameEn,
          size: prod.size ?? '',
          material: prod.material ?? '',
          surfaceFinish: prod.surfaceFinish ?? '',
          hsCode: prod.hsCode,
          quantity: defaultQty,
          unit: prod.unit,
          unitPrice: resolved.unitPrice,
          baseUnitPriceJpy: resolved.basePriceJpy,
          cartons: itemCartons,
          unitNetWeightKg: prod.unitNetWeightKg,
          unitGrossWeightKg: prod.unitGrossWeightKg,
          cartonLengthCm: prod.cartonLengthCm,
          cartonWidthCm: prod.cartonWidthCm,
          cartonHeightCm: prod.cartonHeightCm,
          originCountry: prod.originCountry,
          palletNo: '',
          cartonRange: '',
          setsPerCarton: defaultQty,
        };
        syncOrderItemsAndPallets([...order.items, newItem], true);
      }
    : undefined;

  const handleAddBlankOrderItem = onChangeOrder
    ? () => {
        const defaultUnitPrice = order.currency === 'JPY' ? 150 : 1;
        const newItem: OrderItem = {
          id: `oi-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          productId: '',
          sku: 'NEW-ITEM',
          description: 'HARDLOCK NUT',
          size: '',
          material: '',
          surfaceFinish: '',
          hsCode: '7318.16.00',
          quantity: 100,
          unit: 'SETS',
          unitPrice: defaultUnitPrice,
          baseUnitPriceJpy: convertPriceToJpy(
            defaultUnitPrice,
            order.currency,
            effectiveExchangeRate,
          ),
          cartons: 1,
          unitNetWeightKg: 0.05,
          unitGrossWeightKg: 0.055,
          cartonLengthCm: 33,
          cartonWidthCm: 25,
          cartonHeightCm: 12,
          originCountry: 'JAPAN',
          palletNo: '',
          cartonRange: '',
          setsPerCarton: 100,
        };
        syncOrderItemsAndPallets([...order.items, newItem], true);
      }
    : undefined;

  const materializePackingRows = (): PackingListRow[] => {
    if (order.packingRows && order.packingRows.length > 0) {
      return order.packingRows.map((r) => ({ ...r }));
    }
    return buildPackingListDisplayRows(order.items, products, undefined, {
      customer,
    }).map(
      (r): PackingListRow => ({
        id: r.id,
        palletNo: r.palletNo,
        ctnNo: r.ctnNo,
        itemNo: r.itemNo,
        type: r.type,
        partName: r.partName,
        size: r.size,
        material: r.material,
        surfaceFinish: r.surfaceFinish,
        setsPerCarton: r.setsPerCarton,
        cartonCount: r.cartonCount,
        sharedCarton: r.sharedCarton ?? false,
        qty: r.qty,
        unitWeightKg: r.unitWeightKg,
        totalWeightKg: r.totalWeightKg,
      }),
    );
  };

  const handleUpdatePackingRow = onChangeOrder
    ? (rowId: string, patch: Partial<PackingListRow>) => {
        const base = materializePackingRows();
        const nextRows = base.map((r) => {
          if (r.id !== rowId) return r;
          const merged: PackingListRow = { ...r, ...patch };
          if (
            (typeof patch.setsPerCarton === 'number' ||
              typeof patch.cartonCount === 'number') &&
            typeof patch.qty !== 'number'
          ) {
            merged.qty = cleanFloat(
              (merged.setsPerCarton || 0) * (merged.cartonCount || 0),
            );
          }
          if (
            (typeof patch.qty === 'number' ||
              typeof patch.unitWeightKg === 'number' ||
              typeof patch.setsPerCarton === 'number' ||
              typeof patch.cartonCount === 'number') &&
            typeof patch.totalWeightKg !== 'number'
          ) {
            merged.totalWeightKg = cleanFloat(
              (merged.qty || 0) * (merged.unitWeightKg || 0),
            );
          }
          return merged;
        });
        onChangeOrder({
          ...order,
          packingRows: nextRows,
          updatedAt: new Date().toISOString(),
        });
      }
    : undefined;

  const handleAddPackingRow = onChangeOrder
    ? () => {
        const base = materializePackingRows();
        const last = base[base.length - 1];
        const firstItem = order.items[0];
        const newRow: PackingListRow = {
          id: `pk-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          palletNo: last?.palletNo || '1',
          ctnNo: last?.ctnNo || '1',
          itemNo: base.length + 1,
          type: firstItem?.sku || 'NEW-ITEM',
          partName: firstItem?.description || 'HARDLOCK NUT',
          size: firstItem?.size || '',
          material: firstItem?.material || '',
          surfaceFinish: firstItem?.surfaceFinish || '',
          setsPerCarton: firstItem?.setsPerCarton || 100,
          cartonCount: 1,
          sharedCarton: false,
          qty: firstItem?.setsPerCarton || 100,
          unitWeightKg: firstItem?.unitNetWeightKg || 0.05,
          totalWeightKg: cleanFloat(
            (firstItem?.setsPerCarton || 100) *
              (firstItem?.unitNetWeightKg || 0.05),
          ),
        };
        onChangeOrder({
          ...order,
          packingRows: [...base, newRow],
          updatedAt: new Date().toISOString(),
        });
      }
    : undefined;

  const handleDeletePackingRow = onChangeOrder
    ? (rowId: string) => {
        const base = materializePackingRows();
        const nextRows = base.filter((r) => r.id !== rowId);
        onChangeOrder({
          ...order,
          packingRows: nextRows,
          updatedAt: new Date().toISOString(),
        });
      }
    : undefined;

  const handleResetPackingAuto = onChangeOrder
    ? () => {
        onChangeOrder({
          ...order,
          packingRows: [],
          updatedAt: new Date().toISOString(),
        });
      }
    : undefined;

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
    const clone = el.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('.no-print').forEach((n) => n.remove());
    const companyPx = Number(
      (22 * (docStyle.titleFontSizePx / DEFAULT_DOC_STYLE.titleFontSizePx)).toFixed(2),
    );
    const smallPx = Number(Math.max(7.5, docStyle.tableFontSizePx - 1.5).toFixed(2));
    const padX =
      docStyle.cellDensity === 'compact'
        ? '3px'
        : docStyle.cellDensity === 'relaxed'
          ? '10px'
          : '6px';
    const padY =
      docStyle.cellDensity === 'compact'
        ? '1px'
        : docStyle.cellDensity === 'relaxed'
          ? '6px'
          : '3px';
    const fontFamilyCss = DOC_FONT_CSS_MAP[docStyle.fontFamily];
    const html = `<!doctype html>
<html lang="${docLang}">
<head>
<meta charset="utf-8" />
<title>${order.invoiceNo} - HARDLOCK Export Documents</title>
<style>
  @page { size: A4 portrait; margin: 10mm 12mm; }
  body { font-family: ${fontFamilyCss}; font-size: ${docStyle.baseFontSizePx}px; line-height: ${docStyle.lineHeight}; font-weight: ${docStyle.boldBody ? 600 : 400}; color: #000000; margin: 16px; background: #ffffff; }
  .hardlock-doc-sheet { font-family: ${fontFamilyCss}; font-size: ${docStyle.baseFontSizePx}px; line-height: ${docStyle.lineHeight}; font-weight: ${docStyle.boldBody ? 600 : 400}; color: #000000; }
  .hardlock-doc-sheet .doc-company-title { font-size: ${companyPx}px; }
  .hardlock-doc-sheet .doc-title { font-size: ${docStyle.titleFontSizePx}px; }
  .hardlock-doc-sheet .doc-table { font-size: ${docStyle.tableFontSizePx}px; }
  .hardlock-doc-sheet .doc-table th, .hardlock-doc-sheet .doc-table td { padding: ${padY} ${padX}; }
  .hardlock-doc-sheet .doc-small-sub { font-size: ${smallPx}px; }
  .no-print { display: none !important; }
  .editable-doc-field { border: none !important; background: transparent !important; }
  table { width: 100%; border-collapse: collapse; }
  .print-page-break { page-break-after: always; margin-top: 32px; border-top: 2px dashed #cbd5e1; padding-top: 24px; }
</style>
</head>
<body>${clone.innerHTML}</body>
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

  const fontOptions: { id: DocFontFamilyId; label: string }[] = [
    { id: 'serif', label: t.fontOptionSerif },
    { id: 'sans', label: t.fontOptionSans },
    { id: 'songti', label: t.fontOptionSongti },
    { id: 'arial', label: t.fontOptionArial },
    { id: 'mono', label: t.fontOptionMono },
  ];

  const densityOptions: { id: DocCellDensity; label: string }[] = [
    { id: 'compact', label: t.densityCompact },
    { id: 'normal', label: t.densityNormal },
    { id: 'relaxed', label: t.densityRelaxed },
  ];

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

            {onChangeOrder && (
              <div className="flex items-center gap-1.5 border border-slate-200 rounded-md px-2 py-1 bg-slate-50">
                <select
                  aria-label={t.fontFamilyLabel}
                  data-testid="quick-font-family-select"
                  value={docStyle.fontFamily}
                  onChange={(e) =>
                    handleUpdateDocStyle({
                      fontFamily: e.target.value as DocFontFamilyId,
                    })
                  }
                  className="text-xs bg-transparent font-medium text-slate-800 focus:outline-none max-w-[195px]"
                >
                  {fontOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  data-testid="quick-font-size-dec"
                  aria-label={`${t.baseFontSizeLabel} -`}
                  onClick={() =>
                    handleUpdateDocStyle({
                      baseFontSizePx: cleanFloat(
                        Math.max(7, docStyle.baseFontSizePx - 0.5),
                      ),
                      tableFontSizePx: cleanFloat(
                        Math.max(7, docStyle.tableFontSizePx - 0.5),
                      ),
                    })
                  }
                  className="p-0.5 rounded hover:bg-slate-200 text-slate-700"
                >
                  <Minus className="w-3 h-3" />
                </button>
                <span
                  data-testid="quick-font-size-value"
                  className="text-[11px] font-mono-tabular text-slate-700 min-w-[34px] text-center"
                >
                  {docStyle.baseFontSizePx}px
                </span>
                <button
                  type="button"
                  data-testid="quick-font-size-inc"
                  aria-label={`${t.baseFontSizeLabel} +`}
                  onClick={() =>
                    handleUpdateDocStyle({
                      baseFontSizePx: cleanFloat(
                        Math.min(24, docStyle.baseFontSizePx + 0.5),
                      ),
                      tableFontSizePx: cleanFloat(
                        Math.min(22, docStyle.tableFontSizePx + 0.5),
                      ),
                    })
                  }
                  className="p-0.5 rounded hover:bg-slate-200 text-slate-700"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
            )}

            <button
              type="button"
              data-testid="toggle-typography-panel-btn"
              onClick={() => setTypographyMenuOpen((v) => !v)}
              aria-expanded={typographyMenuOpen}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-md border transition-colors whitespace-nowrap ${
                typographyMenuOpen
                  ? 'text-blue-800 bg-blue-50 border-blue-300 hover:bg-blue-100'
                  : 'text-slate-700 bg-white border-slate-300 hover:bg-slate-50'
              }`}
            >
              <Type className="w-3.5 h-3.5" />
              <span>{t.btnTypographyPanel}</span>
              <ChevronDown className="w-3.5 h-3.5" />
            </button>

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

            {hiddenSections.length > 0 && onChangeOrder && (
              <button
                type="button"
                data-testid="restore-hidden-sections-btn"
                onClick={handleRestoreHiddenSections}
                className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-300 rounded-md hover:bg-amber-100 transition-colors whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>
                  {t.docRestoreSectionsLabel} ({hiddenSections.length})
                </span>
              </button>
            )}

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

        {/* Typography & Font Settings Drawer */}
        {typographyMenuOpen && (
          <div
            data-testid="typography-panel"
            className="p-3.5 bg-blue-50/60 border border-blue-200 rounded-md space-y-3 text-xs"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-700 mb-1">
                  {t.fontFamilyLabel}
                </label>
                <select
                  data-testid="doc-font-family-select"
                  value={docStyle.fontFamily}
                  onChange={(e) =>
                    handleUpdateDocStyle({
                      fontFamily: e.target.value as DocFontFamilyId,
                    })
                  }
                  className="w-full h-8 px-2 text-xs bg-white border border-slate-300 rounded"
                >
                  {fontOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-700 mb-1">
                  {t.baseFontSizeLabel} (px)
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    step="any"
                    min={7}
                    max={24}
                    data-testid="doc-base-size-input"
                    value={docStyle.baseFontSizePx}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      if (Number.isFinite(val) && val > 0) {
                        handleUpdateDocStyle({ baseFontSizePx: val });
                      }
                    }}
                    className="w-full h-8 px-2 text-xs bg-white border border-slate-300 rounded font-mono-tabular"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-700 mb-1">
                  {t.tableFontSizeLabel} (px)
                </label>
                <input
                  type="number"
                  step="any"
                  min={7}
                  max={22}
                  data-testid="doc-table-size-input"
                  value={docStyle.tableFontSizePx}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (Number.isFinite(val) && val > 0) {
                      handleUpdateDocStyle({ tableFontSizePx: val });
                    }
                  }}
                  className="w-full h-8 px-2 text-xs bg-white border border-slate-300 rounded font-mono-tabular"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-700 mb-1">
                  {t.titleFontSizeLabel} (px)
                </label>
                <input
                  type="number"
                  step="any"
                  min={12}
                  max={36}
                  data-testid="doc-title-size-input"
                  value={docStyle.titleFontSizePx}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (Number.isFinite(val) && val > 0) {
                      handleUpdateDocStyle({ titleFontSizePx: val });
                    }
                  }}
                  className="w-full h-8 px-2 text-xs bg-white border border-slate-300 rounded font-mono-tabular"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-700 mb-1">
                  {t.lineHeightLabel}
                </label>
                <input
                  type="number"
                  step="any"
                  min={1}
                  max={2.2}
                  data-testid="doc-line-height-input"
                  value={docStyle.lineHeight}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (Number.isFinite(val) && val > 0) {
                      handleUpdateDocStyle({ lineHeight: val });
                    }
                  }}
                  className="w-full h-8 px-2 text-xs bg-white border border-slate-300 rounded font-mono-tabular"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-blue-200/70">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-medium text-slate-700">
                    {t.cellDensityLabel}:
                  </span>
                  <div className="inline-flex rounded border border-slate-300 bg-white overflow-hidden">
                    {densityOptions.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        data-testid={`doc-density-${opt.id}`}
                        onClick={() =>
                          handleUpdateDocStyle({ cellDensity: opt.id })
                        }
                        className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                          docStyle.cellDensity === opt.id
                            ? 'bg-blue-700 text-white'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    data-testid="doc-bold-body-checkbox"
                    checked={Boolean(docStyle.boldBody)}
                    onChange={(e) =>
                      handleUpdateDocStyle({ boldBody: e.target.checked })
                    }
                  />
                  <span>{t.boldBodyLabel}</span>
                </label>
              </div>

              <button
                type="button"
                data-testid="reset-typography-btn"
                onClick={handleResetDocStyle}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50"
              >
                <RotateCcw className="w-3 h-3" />
                <span>{t.btnResetTypography}</span>
              </button>
            </div>
          </div>
        )}

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
            style={docSheetCssStyle}
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
              t={t}
              settings={settings}
              hiddenSections={hiddenSections}
              onCommitOverride={handleCommitOverride}
              onUpdateItem={handleUpdateOrderItem}
              onDeleteItem={handleDeleteOrderItem}
              onAddBlankItem={handleAddBlankOrderItem}
              onAddItemFromProduct={handleAddOrderItemFromProduct}
              onHideSection={handleHideSection}
            />
          </div>
        )}

        {(activeDoc === 'packing' || activeDoc === 'all') && (
          <div
            data-testid="sheet-packing-list"
            style={docSheetCssStyle}
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
              t={t}
              settings={settings}
              hiddenSections={hiddenSections}
              onCommitOverride={handleCommitOverride}
              onUpdatePackingRow={handleUpdatePackingRow}
              onAddPackingRow={handleAddPackingRow}
              onDeletePackingRow={handleDeletePackingRow}
              onResetPackingAuto={handleResetPackingAuto}
              onHideSection={handleHideSection}
            />
          </div>
        )}

        {(activeDoc === 'contract' || activeDoc === 'all') && (
          <div
            data-testid="sheet-contract"
            style={docSheetCssStyle}
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
              t={t}
              settings={settings}
              hiddenSections={hiddenSections}
              onCommitOverride={handleCommitOverride}
              onUpdateItem={handleUpdateOrderItem}
              onDeleteItem={handleDeleteOrderItem}
              onAddBlankItem={handleAddBlankOrderItem}
              onAddItemFromProduct={handleAddOrderItemFromProduct}
              onHideSection={handleHideSection}
            />
          </div>
        )}

        {(activeDoc === 'casemark' || activeDoc === 'all') && (
          <div
            data-testid="sheet-case-mark"
            style={docSheetCssStyle}
            className="hardlock-doc-sheet bg-white border border-slate-300 shadow-xs mx-auto max-w-[920px] p-8 md:p-10 text-slate-900 print:border-0 print:shadow-none print:p-0"
          >
            <CaseMarkSheet
              order={order}
              customer={customer}
              supplier={supplier}
              summary={summary}
              caseRanges={caseRanges}
              d={d}
              t={t}
              settings={settings}
              hiddenSections={hiddenSections}
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
  t: UiDictionary;
  settings: ContractSettings;
  hiddenSections: string[];
  onCommitOverride?: (fieldKey: string, nextValue: string) => void;
  onUpdateItem?: (
    itemId: string,
    patch: Partial<OrderItem>,
    customPartOverride?: string,
  ) => void;
  onDeleteItem?: (itemId: string) => void;
  onAddBlankItem?: () => void;
  onAddItemFromProduct?: (productId: string) => void;
  onUpdatePackingRow?: (rowId: string, patch: Partial<PackingListRow>) => void;
  onAddPackingRow?: () => void;
  onDeletePackingRow?: (rowId: string) => void;
  onResetPackingAuto?: () => void;
  onHideSection?: (sectionKey: string) => void;
}

function parseDocNumber(raw: string): number | null {
  const cleaned = raw.replace(/[,$\s¥€]|USD|JPY|EUR|CNY|RMB/gi, '').trim();
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) && num >= 0 ? num : null;
}

const HardlockLetterhead: React.FC<{
  order: ExportOrder;
  supplier: Supplier | undefined;
  onCommitOverride?: (fieldKey: string, nextValue: string) => void;
}> = ({ order, supplier, onCommitOverride }) => (
  <div>
    <div className="text-center doc-company-title font-bold tracking-tight text-black pb-1 border-b-2 border-black leading-tight">
      <EditableText
        order={order}
        fieldKey="inv.supplierName"
        fallback={supplier?.name || 'HARDLOCK Industry Co., Ltd.'}
        onCommit={onCommitOverride}
      />
    </div>
    <div className="flex justify-between items-start gap-4 pt-1 text-black">
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
        {(supplier?.taxOrExporterId || order.docOverrides?.['inv.supplierTaxId']) && (
          <div>
            Tax ID :{' '}
            <EditableText
              order={order}
              fieldKey="inv.supplierTaxId"
              fallback={supplier?.taxOrExporterId || ''}
              onCommit={onCommitOverride}
            />
          </div>
        )}
      </div>
      <div className="text-right shrink-0 tabular-nums">
        <div>
          Tel :{' '}
          <EditableText
            order={order}
            fieldKey="inv.supplierTel"
            fallback={supplier?.phone || '81-6-6784-1131'}
            onCommit={onCommitOverride}
          />
        </div>
        {(supplier?.fax || order.docOverrides?.['inv.supplierFax']) && (
          <div>
            Fax :{' '}
            <EditableText
              order={order}
              fieldKey="inv.supplierFax"
              fallback={supplier?.fax || ''}
              onCommit={onCommitOverride}
            />
          </div>
        )}
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
  prefixKey: string;
  onCommitOverride?: (fieldKey: string, nextValue: string) => void;
}> = ({
  order,
  heading,
  party,
  nameKey,
  addressKey,
  prefixKey,
  onCommitOverride,
}) => (
  <div className="text-black">
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
    {(party?.country || order.docOverrides?.[`${prefixKey}Country`]) && (
      <div>
        <EditableText
          order={order}
          fieldKey={`${prefixKey}Country`}
          fallback={party?.country || ''}
          onCommit={onCommitOverride}
        />
      </div>
    )}
    {(party?.contactName || order.docOverrides?.[`${prefixKey}Contact`]) && (
      <div>
        Attn :{' '}
        <EditableText
          order={order}
          fieldKey={`${prefixKey}Contact`}
          fallback={party?.contactName || ''}
          onCommit={onCommitOverride}
        />
      </div>
    )}
    {(party?.phone || order.docOverrides?.[`${prefixKey}Phone`]) && (
      <div>
        Mobile :{' '}
        <EditableText
          order={order}
          fieldKey={`${prefixKey}Phone`}
          fallback={party?.phone || ''}
          onCommit={onCommitOverride}
        />
      </div>
    )}
    {(party?.fax || order.docOverrides?.[`${prefixKey}Fax`]) && (
      <div>
        Fax :{' '}
        <EditableText
          order={order}
          fieldKey={`${prefixKey}Fax`}
          fallback={party?.fax || ''}
          onCommit={onCommitOverride}
        />
      </div>
    )}
    {(party?.taxOrImporterId || order.docOverrides?.[`${prefixKey}TaxId`]) && (
      <div>
        Tax ID :{' '}
        <EditableText
          order={order}
          fieldKey={`${prefixKey}TaxId`}
          fallback={party?.taxOrImporterId || ''}
          onCommit={onCommitOverride}
        />
      </div>
    )}
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
    <div className="mt-5 flex justify-between items-end gap-6 print-avoid-break text-black">
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
        <div>
          <EditableText
            order={order}
            fieldKey="inv.ctnLine"
            fallback={ctnLine}
            onCommit={onCommitOverride}
          />
        </div>
        <div>
          <EditableText
            order={order}
            fieldKey="inv.madeInLine"
            fallback={`MADE IN ${originCountry}`}
            onCommit={onCommitOverride}
          />
        </div>
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
        <div>
          <EditableText
            order={order}
            fieldKey="inv.signatoryCompany"
            fallback={supplier?.name || 'HARDLOCK Industry Co., Ltd.'}
            onCommit={onCommitOverride}
          />
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
        <div className="mt-0.5">
          <EditableText
            order={order}
            fieldKey="inv.signatoryName"
            fallback={supplier?.signatoryName || 'Mr. Song Shanghua'}
            onCommit={onCommitOverride}
          />
        </div>
        <div>
          <EditableText
            order={order}
            fieldKey="inv.signatoryTitle"
            fallback={supplier?.signatoryTitle || 'Overseas Sales'}
            onCommit={onCommitOverride}
          />
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
  t,
  settings,
  hiddenSections,
  onCommitOverride,
  onUpdateItem,
  onDeleteItem,
  onAddBlankItem,
  onAddItemFromProduct,
  onHideSection,
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

  const canMutateRows = Boolean(onUpdateItem || onDeleteItem);
  const defaultTitleText =
    docLang === 'en'
      ? 'INVOICE'
      : docLang === 'ja'
        ? 'INVOICE（商業送り状）'
        : 'INVOICE（商业发票）';

  const bankDefaultLines = bank
    ? [
        `${bank.bankName}${bank.swiftCode ? `(BIC : ${bank.swiftCode})` : ''}`,
        bank.branchName || '',
        `Account No. : ${bank.accountNumber}`,
      ]
        .filter(Boolean)
        .join('\n')
    : '—';

  return (
    <div className="space-y-2 text-black">
      <HardlockLetterhead
        order={order}
        supplier={supplier}
        onCommitOverride={onCommitOverride}
      />

      {/* Title & Reference */}
      <div className="pt-2">
        <div className="text-center doc-title font-bold underline underline-offset-4 tracking-wide">
          <EditableText
            order={order}
            fieldKey="inv.title"
            fallback={defaultTitleText}
            onCommit={onCommitOverride}
          />
        </div>
        <div className="text-center font-bold mt-0.5">
          No.{' '}
          <EditableText
            order={order}
            fieldKey="inv.invoiceNo"
            fallback={order.invoiceNo}
            onCommit={onCommitOverride}
          />
        </div>
        <div className="text-right font-bold -mt-1">
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
          prefixKey="inv.billTo"
          onCommitOverride={onCommitOverride}
        />
        <PartyAddressBlock
          order={order}
          heading="SHIP TO :"
          party={customer}
          nameKey="inv.shipToName"
          addressKey="inv.shipToAddress"
          prefixKey="inv.shipTo"
          onCommitOverride={onCommitOverride}
        />
      </div>

      {/* Shipment Details + Right Notes */}
      <div className="pt-2 space-y-0.5">
        <div>
          Shipment :{' '}
          <EditableText
            order={order}
            fieldKey="inv.shipmentText"
            fallback={`on ${shipmentDate}`}
            onCommit={onCommitOverride}
          />
        </div>
        <div>
          Loading port :{' '}
          <EditableText
            order={order}
            fieldKey="inv.portOfLoading"
            fallback={order.shipping.portOfLoading || '—'}
            onCommit={onCommitOverride}
          />
          {(order.shipping.vesselOrFlightOrCourier ||
            order.docOverrides?.['inv.vessel']) && (
            <>
              {' '}
              by &quot;
              <EditableText
                order={order}
                fieldKey="inv.vessel"
                fallback={order.shipping.vesselOrFlightOrCourier || ''}
                onCommit={onCommitOverride}
              />
              &quot;
            </>
          )}
          {(etdDisplay || order.docOverrides?.['inv.etd']) && (
            <>
              {' '}
              ETD{' '}
              <EditableText
                order={order}
                fieldKey="inv.etd"
                fallback={etdDisplay}
                onCommit={onCommitOverride}
              />
            </>
          )}
        </div>
        <div>
          Destination :{' '}
          <EditableText
            order={order}
            fieldKey="inv.portOfDischarge"
            fallback={order.shipping.portOfDischarge || '—'}
            onCommit={onCommitOverride}
          />
          {(etaDisplay || order.docOverrides?.['inv.eta']) && (
            <>
              {' '}
              ETA{' '}
              <EditableText
                order={order}
                fieldKey="inv.eta"
                fallback={etaDisplay}
                onCommit={onCommitOverride}
              />
            </>
          )}
        </div>
      </div>

      <div className="flex justify-between items-end pt-1">
        <div className="font-bold">
          ITEM :{' '}
          <EditableText
            order={order}
            fieldKey="inv.itemHeader"
            fallback={order.itemHeader?.trim() || 'HARDLOCK NUT (HLN)'}
            onCommit={onCommitOverride}
          />
        </div>
        <div className="text-right font-bold leading-tight">
          <div className="italic">
            <EditableText
              order={order}
              fieldKey="inv.txNote"
              fallback="*Seller → Buyer transaction value only"
              onCommit={onCommitOverride}
            />
          </div>
          <div>
            *Currency :{' '}
            <EditableText
              order={order}
              fieldKey="inv.currencyLabel"
              fallback={formatCurrencyLabel(order.currency)}
              onCommit={onCommitOverride}
            />
          </div>
          {order.currency !== 'JPY' && (
            <div>
              <EditableText
                order={order}
                fieldKey="inv.exchangeRateLine"
                fallback={`*Exchange Rate : 1 ${order.currency} = ${resolveEffectiveExchangeRate(
                  order.currency,
                  order.exchangeRate,
                )} JPY`}
                onCommit={onCommitOverride}
              />
            </div>
          )}
        </div>
      </div>

      {/* 11-Column Invoice Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse doc-table tabular-nums">
          <thead>
            <tr className="font-bold text-center bg-white">
              <th
                rowSpan={2}
                className="border border-black w-9 leading-tight"
              >
                Item
                <br />
                No.
              </th>
              <th rowSpan={2} className="border border-black">
                Item code
              </th>
              <th rowSpan={2} className="border border-black">
                Size
              </th>
              <th rowSpan={2} className="border border-black">
                Material
              </th>
              <th
                rowSpan={2}
                className="border border-black w-16 leading-tight"
              >
                Surface
                <br />
                Finish
              </th>
              <th
                rowSpan={2}
                className="border border-black w-14 leading-tight"
              >
                HS
                <br />
                code
              </th>
              <th
                rowSpan={2}
                className="border border-black w-14 leading-tight"
              >
                Q&apos;ty
                <br />({primaryUnit})
              </th>
              <th
                rowSpan={2}
                className="border border-black w-14 leading-tight"
              >
                U.W
                <br />
                (kg)
              </th>
              <th
                rowSpan={2}
                className="border border-black w-16 leading-tight"
              >
                N.W
                <br />
                (kg)
              </th>
              <th
                colSpan={2}
                className="border border-black text-center leading-tight"
              >
                <EditableText
                  order={order}
                  fieldKey="inv.termColHeader"
                  fallback={`${order.shipping.incoterm} ${placeShort} in ${order.currency}`}
                  onCommit={onCommitOverride}
                />
              </th>
              {canMutateRows && (
                <th
                  rowSpan={2}
                  className="no-print border border-black w-8 text-center text-[10px] text-slate-500"
                >
                  {t.docDeleteRowLabel}
                </th>
              )}
            </tr>
            <tr className="font-bold text-center bg-white">
              <th className="border border-black w-20">U. Price</th>
              <th className="border border-black w-24">Amount</th>
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
              const customPartOverride = order.docOverrides?.[`inv.part.${item.id}`];
              const shownPartName =
                customPartOverride !== undefined
                  ? customPartOverride
                  : partDisplay.partName;
              return (
                <tr key={item.id} data-testid={`inv-row-${idx}`}>
                  <td className="border border-black text-center">
                    {idx + 1}
                  </td>
                  <td className="border border-black font-semibold">
                    <div className="leading-tight">
                      <EditableText
                        order={order}
                        fieldKey={`inv.item.${idx}.partName`}
                        fallback={shownPartName}
                        directValue={shownPartName}
                        onDirectCommit={
                          onUpdateItem
                            ? (val) =>
                                onUpdateItem(
                                  item.id,
                                  { description: val },
                                  partDisplay.hasCustomPartName ? val : undefined,
                                )
                            : undefined
                        }
                      />
                    </div>
                    {(partDisplay.sku || onUpdateItem) &&
                      shownPartName !== partDisplay.sku && (
                        <div className="doc-small-sub font-normal text-slate-600 leading-tight whitespace-nowrap">
                          <EditableText
                            order={order}
                            fieldKey={`inv.item.${idx}.sku`}
                            fallback={item.sku}
                            directValue={item.sku}
                            onDirectCommit={
                              onUpdateItem
                                ? (val) => onUpdateItem(item.id, { sku: val })
                                : undefined
                            }
                          />
                        </div>
                      )}
                  </td>
                  <td className="border border-black whitespace-nowrap">
                    <EditableText
                      order={order}
                      fieldKey={`inv.item.${idx}.size`}
                      fallback={specs.size}
                      directValue={specs.size}
                      onDirectCommit={
                        onUpdateItem
                          ? (val) => onUpdateItem(item.id, { size: val })
                          : undefined
                      }
                    />
                  </td>
                  <td className="border border-black whitespace-nowrap">
                    <EditableText
                      order={order}
                      fieldKey={`inv.item.${idx}.material`}
                      fallback={specs.material}
                      directValue={specs.material}
                      onDirectCommit={
                        onUpdateItem
                          ? (val) => onUpdateItem(item.id, { material: val })
                          : undefined
                      }
                    />
                  </td>
                  <td className="border border-black text-center whitespace-nowrap">
                    <EditableText
                      order={order}
                      fieldKey={`inv.item.${idx}.finish`}
                      fallback={specs.surfaceFinish}
                      directValue={specs.surfaceFinish}
                      onDirectCommit={
                        onUpdateItem
                          ? (val) =>
                              onUpdateItem(item.id, { surfaceFinish: val })
                          : undefined
                      }
                    />
                  </td>
                  <td className="border border-black text-center whitespace-nowrap">
                    <EditableText
                      order={order}
                      fieldKey={`inv.item.${idx}.hsCode`}
                      fallback={formatCompactHsCode(item.hsCode)}
                      directValue={formatCompactHsCode(item.hsCode)}
                      onDirectCommit={
                        onUpdateItem
                          ? (val) => onUpdateItem(item.id, { hsCode: val })
                          : undefined
                      }
                    />
                  </td>
                  <td className="border border-black text-right whitespace-nowrap">
                    <EditableText
                      order={order}
                      fieldKey={`inv.item.${idx}.qty`}
                      fallback={item.quantity.toLocaleString()}
                      directValue={item.quantity.toLocaleString()}
                      onDirectCommit={
                        onUpdateItem
                          ? (val) => {
                              const parsed = parseDocNumber(val);
                              if (parsed !== null) {
                                onUpdateItem(item.id, { quantity: parsed });
                              }
                            }
                          : undefined
                      }
                    />
                  </td>
                  <td className="border border-black text-right whitespace-nowrap">
                    <EditableText
                      order={order}
                      fieldKey={`inv.item.${idx}.uw`}
                      fallback={formatNumberNoRound(item.unitNetWeightKg || 0, 0)}
                      directValue={formatNumberNoRound(
                        item.unitNetWeightKg || 0,
                        0,
                      )}
                      onDirectCommit={
                        onUpdateItem
                          ? (val) => {
                              const parsed = parseDocNumber(val);
                              if (parsed !== null) {
                                onUpdateItem(item.id, {
                                  unitNetWeightKg: parsed,
                                });
                              }
                            }
                          : undefined
                      }
                    />
                  </td>
                  <td className="border border-black text-right whitespace-nowrap">
                    {formatWeight1(calc?.netWeightKg ?? 0)}
                  </td>
                  <td className="border border-black text-right whitespace-nowrap">
                    <EditableText
                      order={order}
                      fieldKey={`inv.item.${idx}.unitPrice`}
                      fallback={formatDocMoney(item.unitPrice, order.currency)}
                      directValue={formatDocMoney(item.unitPrice, order.currency)}
                      onDirectCommit={
                        onUpdateItem
                          ? (val) => {
                              const parsed = parseDocNumber(val);
                              if (parsed !== null) {
                                onUpdateItem(item.id, { unitPrice: parsed });
                              }
                            }
                          : undefined
                      }
                    />
                  </td>
                  <td className="border border-black text-right whitespace-nowrap">
                    {formatDocMoney(calc?.amount ?? 0, order.currency)}
                  </td>
                  {canMutateRows && (
                    <td className="no-print border border-black text-center">
                      {onDeleteItem && (
                        <button
                          type="button"
                          data-testid={`inv-delete-row-${idx}`}
                          title={t.docDeleteRowLabel}
                          aria-label={t.docDeleteRowLabel}
                          onClick={() => onDeleteItem(item.id)}
                          className="p-1 text-red-600 hover:text-red-800 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}

            <tr className="font-bold">
              <td colSpan={6} className="pt-1 align-top">
                {!hiddenSections.includes('inv.footnotes') &&
                  (footnotes.length > 0 || order.docOverrides?.['inv.footnote0']) && (
                    <div className="inline-flex items-center gap-1">
                      <EditableText
                        order={order}
                        fieldKey="inv.footnote0"
                        fallback={footnotes[0] ?? ''}
                        onCommit={onCommitOverride}
                      />
                      {onHideSection && footnotes[0] && (
                        <button
                          type="button"
                          onClick={() => onHideSection('inv.footnotes')}
                          title={t.docDeleteSectionLabel}
                          className="no-print text-slate-400 hover:text-red-600"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  )}
              </td>
              <td className="pt-1 text-right">
                {summary.totalQuantity.toLocaleString()}
              </td>
              <td />
              <td className="pt-1 text-right">
                {formatWeight1(summary.totalNetWeightKg)}
              </td>
              <td colSpan={canMutateRows ? 3 : 2} />
            </tr>

            {costRows.map((row, rIdx) => (
              <tr key={row.label}>
                <td colSpan={6} className="font-bold">
                  {!hiddenSections.includes('inv.footnotes') &&
                    (rIdx === 0 && (footnotes[1] || order.docOverrides?.['inv.footnote1']) ? (
                      <EditableText
                        order={order}
                        fieldKey="inv.footnote1"
                        fallback={footnotes[1] ?? ''}
                        onCommit={onCommitOverride}
                      />
                    ) : rIdx === 1 && (footnotes[2] || order.docOverrides?.['inv.footnote2']) ? (
                      <EditableText
                        order={order}
                        fieldKey="inv.footnote2"
                        fallback={footnotes[2] ?? ''}
                        onCommit={onCommitOverride}
                      />
                    ) : (
                      ''
                    ))}
                </td>
                <td
                  colSpan={4}
                  className="text-right font-bold whitespace-nowrap"
                >
                  {row.label}
                </td>
                <td className="text-right font-bold border-b border-dotted border-black whitespace-nowrap">
                  {formatDocMoney(row.amount, order.currency)}
                </td>
                {canMutateRows && <td className="no-print" />}
              </tr>
            ))}

            <tr>
              <td colSpan={6} />
              <td
                colSpan={4}
                className="text-right font-bold whitespace-nowrap"
              >
                {order.shipping.incoterm} {placeShort}
              </td>
              <td className="text-right font-bold border-t border-black border-b-4 border-double whitespace-nowrap">
                {formatDocMoney(summary.incotermTotal, order.currency)}
              </td>
              {canMutateRows && <td className="no-print" />}
            </tr>
          </tbody>
        </table>

        {(onAddBlankItem || onAddItemFromProduct) && (
          <div className="no-print mt-2 flex flex-wrap items-center gap-2 text-xs">
            {onAddBlankItem && (
              <button
                type="button"
                data-testid="inv-add-blank-row-btn"
                onClick={onAddBlankItem}
                className="inline-flex items-center gap-1 px-2.5 py-1 font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t.docAddBlankRow}</span>
              </button>
            )}
            {onAddItemFromProduct && products.length > 0 && (
              <select
                data-testid="inv-add-product-select"
                defaultValue=""
                onChange={(e) => {
                  const val = e.target.value;
                  if (val) {
                    onAddItemFromProduct(val);
                    e.target.value = '';
                  }
                }}
                className="h-7 px-2 text-xs bg-white border border-slate-300 rounded text-slate-700"
              >
                <option value="">{t.docAddProductFromCatalog}</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sku} · {p.nameEn}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
      </div>

      {/* Lower Packing Summary + Origin */}
      <div className="flex justify-between items-end gap-6 pt-2">
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
          <div className="underline underline-offset-2">
            <EditableText
              order={order}
              fieldKey="inv.freightLabel"
              fallback={freightLabel}
              onCommit={onCommitOverride}
            />
          </div>
          <div className="underline underline-offset-2">
            <EditableText
              order={order}
              fieldKey="inv.originText"
              fallback={`COUNTRY OF ORIGIN : ${originCountry}`}
              onCommit={onCommitOverride}
            />
          </div>
        </div>
      </div>

      {/* Payment Terms & Bank Information */}
      <div className="pt-2 space-y-2">
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

        {!hiddenSections.includes('inv.bankInfo') && (
          <div className="group relative">
            <div className="font-bold underline underline-offset-2 inline-flex items-center gap-1.5">
              <span>Bank Information</span>
              {onHideSection && (
                <button
                  type="button"
                  data-testid="inv-hide-bank-btn"
                  title={t.docDeleteSectionLabel}
                  onClick={() => onHideSection('inv.bankInfo')}
                  className="no-print text-slate-400 hover:text-red-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="whitespace-pre-line">
              <EditableText
                order={order}
                fieldKey="inv.bankInfo"
                fallback={bankDefaultLines}
                onCommit={onCommitOverride}
                multiline
              />
            </div>
          </div>
        )}

        {!hiddenSections.includes('inv.remarks') &&
          (order.remarks || order.docOverrides?.['inv.remarks'] !== undefined) && (
            <div className="text-slate-800 pt-0.5 flex items-center gap-1.5">
              <span>
                Remarks :{' '}
                <EditableText
                  order={order}
                  fieldKey="inv.remarks"
                  fallback={order.remarks || ''}
                  onCommit={onCommitOverride}
                />
              </span>
              {onHideSection && (
                <button
                  type="button"
                  data-testid="inv-hide-remarks-btn"
                  title={t.docDeleteSectionLabel}
                  onClick={() => onHideSection('inv.remarks')}
                  className="no-print text-slate-400 hover:text-red-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
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
  t,
  settings,
  hiddenSections,
  onCommitOverride,
  onUpdatePackingRow,
  onAddPackingRow,
  onDeletePackingRow,
  onResetPackingAuto,
  onHideSection,
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

  const canMutatePacking = Boolean(onUpdatePackingRow || onDeletePackingRow);
  const hasCustomPackingRows = Boolean(
    order.packingRows && order.packingRows.length > 0,
  );
  const defaultPlTitle =
    docLang === 'en'
      ? 'PACKING LIST'
      : docLang === 'ja'
        ? 'PACKING LIST（梱包明細書）'
        : 'PACKING LIST（装箱单）';

  return (
    <div className="space-y-2 text-black">
      <HardlockLetterhead
        order={order}
        supplier={supplier}
        onCommitOverride={onCommitOverride}
      />

      {/* Title & Reference */}
      <div className="pt-2">
        <div className="text-center doc-title font-bold underline underline-offset-4 tracking-wide">
          <EditableText
            order={order}
            fieldKey="pl.title"
            fallback={defaultPlTitle}
            onCommit={onCommitOverride}
          />
        </div>
        <div className="text-center font-bold mt-0.5">
          INVOICE No.{' '}
          <EditableText
            order={order}
            fieldKey="inv.invoiceNo"
            fallback={order.invoiceNo}
            onCommit={onCommitOverride}
          />
        </div>
        <div className="text-right font-bold -mt-1">
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
          prefixKey="inv.billTo"
          onCommitOverride={onCommitOverride}
        />
        <PartyAddressBlock
          order={order}
          heading="DELIVER TO :"
          party={customer}
          nameKey="inv.shipToName"
          addressKey="inv.shipToAddress"
          prefixKey="inv.shipTo"
          onCommitOverride={onCommitOverride}
        />
      </div>

      {/* Shipment Details */}
      <div className="pt-2 space-y-0.5">
        <div>
          Shipment :{' '}
          <EditableText
            order={order}
            fieldKey="inv.shipmentText"
            fallback={`on ${shipmentDate}`}
            onCommit={onCommitOverride}
          />
        </div>
        <div>
          Loading port :{' '}
          <EditableText
            order={order}
            fieldKey="inv.portOfLoading"
            fallback={order.shipping.portOfLoading || '—'}
            onCommit={onCommitOverride}
          />
          {(order.shipping.vesselOrFlightOrCourier ||
            order.docOverrides?.['inv.vessel']) && (
            <>
              {' '}
              by &quot;
              <EditableText
                order={order}
                fieldKey="inv.vessel"
                fallback={order.shipping.vesselOrFlightOrCourier || ''}
                onCommit={onCommitOverride}
              />
              &quot;
            </>
          )}
          {(etdDisplay || order.docOverrides?.['inv.etd']) && (
            <>
              {' '}
              ETD{' '}
              <EditableText
                order={order}
                fieldKey="inv.etd"
                fallback={etdDisplay}
                onCommit={onCommitOverride}
              />
            </>
          )}
        </div>
        <div>
          Destination :{' '}
          <EditableText
            order={order}
            fieldKey="inv.portOfDischarge"
            fallback={order.shipping.portOfDischarge || '—'}
            onCommit={onCommitOverride}
          />
          {(etaDisplay || order.docOverrides?.['inv.eta']) && (
            <>
              {' '}
              ETA{' '}
              <EditableText
                order={order}
                fieldKey="inv.eta"
                fallback={etaDisplay}
                onCommit={onCommitOverride}
              />
            </>
          )}
        </div>
      </div>

      <div className="font-bold pt-1">
        ITEM :{' '}
        <EditableText
          order={order}
          fieldKey="inv.itemHeader"
          fallback={order.itemHeader?.trim() || 'HARDLOCK NUT'}
          onCommit={onCommitOverride}
        />{' '}
        (HS CODE :{' '}
        <EditableText
          order={order}
          fieldKey="pl.hsCodeHeader"
          fallback={compactHsDigits}
          onCommit={onCommitOverride}
        />
        )
      </div>

      {/* 11-Column Pallet-Merged Packing List Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse doc-table tabular-nums">
          <thead>
            <tr className="font-bold text-center bg-white">
              <th className="border border-black w-16 whitespace-nowrap leading-tight">
                Pallet
                <br />
                No.
              </th>
              <th className="border border-black w-14 leading-tight">
                Ctn.
                <br />
                No.
              </th>
              <th className="border border-black w-10 leading-tight">
                Item
                <br />
                No.
              </th>
              <th className="border border-black">Type</th>
              <th className="border border-black">Size</th>
              <th className="border border-black">Material</th>
              <th className="border border-black w-14 leading-tight">
                Surface
                <br />
                Finish
              </th>
              <th className="border border-black min-w-[140px]">
                Description
              </th>
              <th className="border border-black w-14 leading-tight">
                Q&apos;ty
                <br />({primaryUnit})
              </th>
              <th className="border border-black w-14 leading-tight">
                U.W
                <br />
                (kg)
              </th>
              <th className="border border-black w-14 leading-tight">
                T.W
                <br />
                (kg)
              </th>
              {canMutatePacking && (
                <th className="no-print border border-black w-8 text-center text-[10px] text-slate-500">
                  {t.docDeleteRowLabel}
                </th>
              )}
            </tr>
          </thead>

          <tbody>
            {displayRows.map((row, idx) => {
              const cellBorder = row.isSubRowInSameCtn
                ? 'border border-solid border-black [border-top-style:dotted]'
                : 'border border-solid border-black';
              return (
                <tr key={row.id} data-testid={`pl-row-${idx}`}>
                  {row.showPalletCell && (
                    <td
                      rowSpan={row.palletRowSpan}
                      className="border border-black text-center align-middle font-semibold"
                    >
                      <EditableText
                        order={order}
                        fieldKey={`pl.row.${idx}.palletNo`}
                        fallback={row.palletNo}
                        directValue={row.palletNo}
                        onDirectCommit={
                          onUpdatePackingRow
                            ? (val) =>
                                onUpdatePackingRow(row.id, { palletNo: val })
                            : undefined
                        }
                      />
                    </td>
                  )}
                  {row.showCtnCell && (
                    <td
                      rowSpan={row.ctnRowSpan}
                      className="border border-black text-center align-middle whitespace-nowrap"
                    >
                      <EditableText
                        order={order}
                        fieldKey={`pl.row.${idx}.ctnNo`}
                        fallback={row.ctnNo}
                        directValue={row.ctnNo}
                        onDirectCommit={
                          onUpdatePackingRow
                            ? (val) =>
                                onUpdatePackingRow(row.id, { ctnNo: val })
                            : undefined
                        }
                      />
                    </td>
                  )}
                  <td className={`${cellBorder} text-center`}>
                    <EditableText
                      order={order}
                      fieldKey={`pl.row.${idx}.itemNo`}
                      fallback={String(row.itemNo)}
                      directValue={String(row.itemNo)}
                      onDirectCommit={
                        onUpdatePackingRow
                          ? (val) => {
                              const parsed = parseDocNumber(val);
                              if (parsed !== null && parsed >= 1) {
                                onUpdatePackingRow(row.id, { itemNo: parsed });
                              }
                            }
                          : undefined
                      }
                    />
                  </td>
                  <td className={`${cellBorder} font-semibold`}>
                    <div className="leading-tight">
                      <EditableText
                        order={order}
                        fieldKey={`pl.row.${idx}.partName`}
                        fallback={row.partName || row.type || '—'}
                        directValue={row.partName || row.type || '—'}
                        onDirectCommit={
                          onUpdatePackingRow
                            ? (val) =>
                                onUpdatePackingRow(row.id, {
                                  partName: val,
                                  ...(row.partName ? {} : { type: val }),
                                })
                            : undefined
                        }
                      />
                    </div>
                    {(row.type || onUpdatePackingRow) &&
                      row.partName &&
                      row.partName !== row.type && (
                        <div className="doc-small-sub font-normal text-slate-600 leading-tight whitespace-nowrap">
                          <EditableText
                            order={order}
                            fieldKey={`pl.row.${idx}.type`}
                            fallback={row.type}
                            directValue={row.type}
                            onDirectCommit={
                              onUpdatePackingRow
                                ? (val) =>
                                    onUpdatePackingRow(row.id, { type: val })
                                : undefined
                            }
                          />
                        </div>
                      )}
                  </td>
                  <td className={`${cellBorder} whitespace-nowrap`}>
                    <EditableText
                      order={order}
                      fieldKey={`pl.row.${idx}.size`}
                      fallback={row.size}
                      directValue={row.size}
                      onDirectCommit={
                        onUpdatePackingRow
                          ? (val) => onUpdatePackingRow(row.id, { size: val })
                          : undefined
                      }
                    />
                  </td>
                  <td className={`${cellBorder} whitespace-nowrap`}>
                    <EditableText
                      order={order}
                      fieldKey={`pl.row.${idx}.material`}
                      fallback={row.material}
                      directValue={row.material}
                      onDirectCommit={
                        onUpdatePackingRow
                          ? (val) =>
                              onUpdatePackingRow(row.id, { material: val })
                          : undefined
                      }
                    />
                  </td>
                  <td className={`${cellBorder} text-center`}>
                    <EditableText
                      order={order}
                      fieldKey={`pl.row.${idx}.finish`}
                      fallback={row.surfaceFinish}
                      directValue={row.surfaceFinish}
                      onDirectCommit={
                        onUpdatePackingRow
                          ? (val) =>
                              onUpdatePackingRow(row.id, { surfaceFinish: val })
                          : undefined
                      }
                    />
                  </td>
                  <td className={`${cellBorder} whitespace-nowrap`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-right min-w-[62px]">
                        <EditableText
                          order={order}
                          fieldKey={`pl.row.${idx}.setsPerCarton`}
                          fallback={row.setsPerCarton.toLocaleString()}
                          directValue={row.setsPerCarton.toLocaleString()}
                          onDirectCommit={
                            onUpdatePackingRow
                              ? (val) => {
                                  const parsed = parseDocNumber(val);
                                  if (parsed !== null) {
                                    onUpdatePackingRow(row.id, {
                                      setsPerCarton: parsed,
                                    });
                                  }
                                }
                              : undefined
                          }
                        />{' '}
                        {row.unitLabel}
                      </span>
                      <span>x</span>
                      <span className="text-right min-w-[52px]">
                        <EditableText
                          order={order}
                          fieldKey={`pl.row.${idx}.cartonCount`}
                          fallback={String(row.cartonCount)}
                          directValue={String(row.cartonCount)}
                          onDirectCommit={
                            onUpdatePackingRow
                              ? (val) => {
                                  const parsed = parseDocNumber(val);
                                  if (parsed !== null) {
                                    onUpdatePackingRow(row.id, {
                                      cartonCount: parsed,
                                    });
                                  }
                                }
                              : undefined
                          }
                        />{' '}
                        carton
                      </span>
                    </div>
                  </td>
                  <td
                    className={`${cellBorder} text-right whitespace-nowrap`}
                  >
                    <EditableText
                      order={order}
                      fieldKey={`pl.row.${idx}.qty`}
                      fallback={row.qty.toLocaleString()}
                      directValue={row.qty.toLocaleString()}
                      onDirectCommit={
                        onUpdatePackingRow
                          ? (val) => {
                              const parsed = parseDocNumber(val);
                              if (parsed !== null) {
                                onUpdatePackingRow(row.id, { qty: parsed });
                              }
                            }
                          : undefined
                      }
                    />
                  </td>
                  <td
                    className={`${cellBorder} text-right whitespace-nowrap`}
                  >
                    <EditableText
                      order={order}
                      fieldKey={`pl.row.${idx}.uw`}
                      fallback={formatNumberNoRound(row.unitWeightKg || 0, 0)}
                      directValue={formatNumberNoRound(
                        row.unitWeightKg || 0,
                        0,
                      )}
                      onDirectCommit={
                        onUpdatePackingRow
                          ? (val) => {
                              const parsed = parseDocNumber(val);
                              if (parsed !== null) {
                                onUpdatePackingRow(row.id, {
                                  unitWeightKg: parsed,
                                });
                              }
                            }
                          : undefined
                      }
                    />
                  </td>
                  <td
                    className={`${cellBorder} text-right whitespace-nowrap`}
                  >
                    <EditableText
                      order={order}
                      fieldKey={`pl.row.${idx}.tw`}
                      fallback={formatWeight1(row.totalWeightKg || 0)}
                      directValue={formatWeight1(row.totalWeightKg || 0)}
                      onDirectCommit={
                        onUpdatePackingRow
                          ? (val) => {
                              const parsed = parseDocNumber(val);
                              if (parsed !== null) {
                                onUpdatePackingRow(row.id, {
                                  totalWeightKg: parsed,
                                });
                              }
                            }
                          : undefined
                      }
                    />
                  </td>
                  {canMutatePacking && (
                    <td className="no-print border border-black text-center">
                      {onDeletePackingRow && (
                        <button
                          type="button"
                          data-testid={`pl-delete-row-${idx}`}
                          title={t.docDeleteRowLabel}
                          aria-label={t.docDeleteRowLabel}
                          onClick={() => onDeletePackingRow(row.id)}
                          className="p-1 text-red-600 hover:text-red-800 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}

            <tr className="font-bold">
              <td colSpan={7} className="pt-1 align-top">
                {!hiddenSections.includes('pl.footnotes') &&
                  (footnotes.length > 0 || order.docOverrides?.['pl.footnotes']) && (
                    <div className="inline-flex items-start gap-1">
                      <EditableText
                        order={order}
                        fieldKey="pl.footnotes"
                        fallback={footnotes.join('\n')}
                        onCommit={onCommitOverride}
                        multiline
                      />
                      {onHideSection && footnotes.length > 0 && (
                        <button
                          type="button"
                          onClick={() => onHideSection('pl.footnotes')}
                          title={t.docDeleteSectionLabel}
                          className="no-print text-slate-400 hover:text-red-600"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  )}
              </td>
              <td className="pt-1 text-right align-top whitespace-nowrap">
                {plTotalCartons} cartons
              </td>
              <td className="pt-1 text-right align-top whitespace-nowrap">
                {plTotalQty.toLocaleString()}
              </td>
              <td />
              <td className="pt-1 text-right align-top whitespace-nowrap">
                {formatWeight1(plTotalTw)}
              </td>
              {canMutatePacking && <td className="no-print" />}
            </tr>
          </tbody>
        </table>

        {(onAddPackingRow || onResetPackingAuto) && (
          <div className="no-print mt-2 flex flex-wrap items-center gap-2 text-xs">
            {onAddPackingRow && (
              <button
                type="button"
                data-testid="pl-add-row-btn"
                onClick={onAddPackingRow}
                className="inline-flex items-center gap-1 px-2.5 py-1 font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t.docAddPackingRow}</span>
              </button>
            )}
            {hasCustomPackingRows && onResetPackingAuto && (
              <button
                type="button"
                data-testid="pl-reset-auto-btn"
                onClick={onResetPackingAuto}
                className="inline-flex items-center gap-1 px-2.5 py-1 font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{t.docResetPackingAuto}</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Lower Packing Summary */}
      <div className="flex justify-between items-start gap-6 pt-3">
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
          {!hiddenSections.includes('pl.palletVolumeDetails') &&
            (order.palletVolumeDetails ||
              order.docOverrides?.['pl.palletVolumeDetails']) && (
              <div className="font-bold whitespace-pre-line mt-1 inline-flex items-start gap-1.5">
                <EditableText
                  order={order}
                  fieldKey="pl.palletVolumeDetails"
                  fallback={order.palletVolumeDetails || ''}
                  onCommit={onCommitOverride}
                  multiline
                />
                {onHideSection && (
                  <button
                    type="button"
                    onClick={() => onHideSection('pl.palletVolumeDetails')}
                    title={t.docDeleteSectionLabel}
                    className="no-print text-slate-400 hover:text-red-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}
        </div>

        <div className="text-right font-bold pt-4">
          <div className="underline underline-offset-2">
            <EditableText
              order={order}
              fieldKey="pl.originSentence"
              fallback={`Country of Origin : ${originSentence}`}
              onCommit={onCommitOverride}
            />
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
  t,
  settings,
  onCommitOverride,
  onUpdateItem,
  onDeleteItem,
  onAddBlankItem,
  onAddItemFromProduct,
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
  const canMutateRows = Boolean(onUpdateItem || onDeleteItem);

  return (
    <div className="space-y-3 text-black">
      {/* Running Header matching Reference Contract */}
      <div className="flex justify-end pb-1 border-b border-black font-semibold">
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
        <div className="doc-title font-bold tracking-[0.35em]">合 同</div>
        <div className="doc-title font-bold tracking-[0.22em]">CONTRACT</div>
      </div>

      <div className="flex justify-end">
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
      <div className="space-y-2.5 pt-1">
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
      <div className="pt-1 leading-snug">
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
        <table className="w-full border-collapse doc-table tabular-nums">
          <thead>
            <tr className="text-center font-semibold bg-white">
              <th className="border border-black w-12 leading-tight">
                项目
                <br />
                ITEM
                <br />
                NO.
              </th>
              <th colSpan={3} className="border border-black leading-tight">
                商品名称及规格
                <br />
                NAME OF COMMODITY &amp; SPECIFICATION
              </th>
              <th className="border border-black w-16 leading-tight">
                数量
                <br />
                QUANTITY
              </th>
              <th className="border border-black w-20 leading-tight">
                单价
                <br />
                UNIT PRICE
              </th>
              <th className="border border-black w-24 leading-tight">
                总价
                <br />
                TOTAL PRICE
              </th>
              {canMutateRows && (
                <th
                  rowSpan={2}
                  className="no-print border border-black w-8 text-center text-[10px] text-slate-500"
                >
                  {t.docDeleteRowLabel}
                </th>
              )}
            </tr>
            <tr className="text-center font-semibold bg-white">
              <th className="border border-black" />
              <th className="border border-black">ITEM</th>
              <th className="border border-black">SIZE/PITCH</th>
              <th className="border border-black">MATERIAL / FINISH</th>
              <th className="border border-black">
                {order.items[0]?.unit || 'SET'}
              </th>
              <th className="border border-black">{order.currency}</th>
              <th className="border border-black">{order.currency}</th>
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
              const customPartOverride = order.docOverrides?.[`inv.part.${item.id}`];
              const shownPartName =
                customPartOverride !== undefined
                  ? customPartOverride
                  : partDisplay.partName;
              return (
                <tr key={item.id} data-testid={`ct-row-${idx}`}>
                  <td className="border border-black text-center">
                    {idx + 1}.
                  </td>
                  <td className="border border-black font-semibold">
                    <div className="leading-tight">
                      <EditableText
                        order={order}
                        fieldKey={`ct.item.${idx}.partName`}
                        fallback={shownPartName}
                        directValue={shownPartName}
                        onDirectCommit={
                          onUpdateItem
                            ? (val) =>
                                onUpdateItem(
                                  item.id,
                                  { description: val },
                                  partDisplay.hasCustomPartName ? val : undefined,
                                )
                            : undefined
                        }
                      />
                    </div>
                    {(partDisplay.sku || onUpdateItem) &&
                      shownPartName !== partDisplay.sku && (
                        <div className="doc-small-sub font-normal text-slate-600 leading-tight whitespace-nowrap">
                          <EditableText
                            order={order}
                            fieldKey={`ct.item.${idx}.sku`}
                            fallback={item.sku}
                            directValue={item.sku}
                            onDirectCommit={
                              onUpdateItem
                                ? (val) => onUpdateItem(item.id, { sku: val })
                                : undefined
                            }
                          />
                        </div>
                      )}
                  </td>
                  <td className="border border-black text-center whitespace-nowrap">
                    <EditableText
                      order={order}
                      fieldKey={`ct.item.${idx}.size`}
                      fallback={specs.size || '—'}
                      directValue={specs.size || '—'}
                      onDirectCommit={
                        onUpdateItem
                          ? (val) => onUpdateItem(item.id, { size: val })
                          : undefined
                      }
                    />
                  </td>
                  <td className="border border-black text-center whitespace-nowrap">
                    <EditableText
                      order={order}
                      fieldKey={`ct.item.${idx}.matFinish`}
                      fallback={matFinish || '—'}
                      directValue={matFinish || '—'}
                      onDirectCommit={
                        onUpdateItem
                          ? (val) => {
                              const [m, f] = val.split('/').map((s) => s.trim());
                              onUpdateItem(item.id, {
                                material: m ?? val,
                                ...(f !== undefined ? { surfaceFinish: f } : {}),
                              });
                            }
                          : undefined
                      }
                    />
                  </td>
                  <td className="border border-black text-right whitespace-nowrap">
                    <EditableText
                      order={order}
                      fieldKey={`ct.item.${idx}.qty`}
                      fallback={item.quantity.toLocaleString()}
                      directValue={item.quantity.toLocaleString()}
                      onDirectCommit={
                        onUpdateItem
                          ? (val) => {
                              const parsed = parseDocNumber(val);
                              if (parsed !== null) {
                                onUpdateItem(item.id, { quantity: parsed });
                              }
                            }
                          : undefined
                      }
                    />
                  </td>
                  <td className="border border-black text-right whitespace-nowrap">
                    <EditableText
                      order={order}
                      fieldKey={`ct.item.${idx}.unitPrice`}
                      fallback={formatDocMoney(item.unitPrice, order.currency)}
                      directValue={formatDocMoney(item.unitPrice, order.currency)}
                      onDirectCommit={
                        onUpdateItem
                          ? (val) => {
                              const parsed = parseDocNumber(val);
                              if (parsed !== null) {
                                onUpdateItem(item.id, { unitPrice: parsed });
                              }
                            }
                          : undefined
                      }
                    />
                  </td>
                  <td className="border border-black text-right whitespace-nowrap">
                    {formatDocMoney(calc?.amount ?? 0, order.currency)}
                  </td>
                  {canMutateRows && (
                    <td className="no-print border border-black text-center">
                      {onDeleteItem && (
                        <button
                          type="button"
                          data-testid={`ct-delete-row-${idx}`}
                          title={t.docDeleteRowLabel}
                          aria-label={t.docDeleteRowLabel}
                          onClick={() => onDeleteItem(item.id)}
                          className="p-1 text-red-600 hover:text-red-800 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
            <tr className="font-bold">
              <td colSpan={6} className="border border-black text-right">
                Ex-works Total
              </td>
              <td className="border border-black text-right whitespace-nowrap">
                {formatDocMoney(summary.exwTotal, order.currency)}
              </td>
              {canMutateRows && <td className="no-print border border-black" />}
            </tr>
            {freightTotal > 0 && (
              <tr className="font-bold">
                <td colSpan={6} className="border border-black text-right">
                  {getModeFreightLabel(order.shipping.mode)}
                </td>
                <td className="border border-black text-right whitespace-nowrap">
                  {formatDocMoney(freightTotal, order.currency)}
                </td>
                {canMutateRows && (
                  <td className="no-print border border-black" />
                )}
              </tr>
            )}
            <tr className="font-bold">
              <td colSpan={6} className="border border-black text-right">
                {order.shipping.incoterm} {placeShort}
              </td>
              <td className="border border-black text-right whitespace-nowrap">
                {formatDocMoney(summary.incotermTotal, order.currency)}
              </td>
              {canMutateRows && <td className="no-print border border-black" />}
            </tr>
            <tr>
              <td colSpan={canMutateRows ? 8 : 7} className="border border-black">
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

        {(onAddBlankItem || onAddItemFromProduct) && (
          <div className="no-print mt-2 flex flex-wrap items-center gap-2 text-xs">
            {onAddBlankItem && (
              <button
                type="button"
                data-testid="ct-add-blank-row-btn"
                onClick={onAddBlankItem}
                className="inline-flex items-center gap-1 px-2.5 py-1 font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t.docAddBlankRow}</span>
              </button>
            )}
            {onAddItemFromProduct && products.length > 0 && (
              <select
                data-testid="ct-add-product-select"
                defaultValue=""
                onChange={(e) => {
                  const val = e.target.value;
                  if (val) {
                    onAddItemFromProduct(val);
                    e.target.value = '';
                  }
                }}
                className="h-7 px-2 text-xs bg-white border border-slate-300 rounded text-slate-700"
              >
                <option value="">{t.docAddProductFromCatalog}</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sku} · {p.nameEn}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
      </div>

      {/* Numbered Bilingual Terms & Conditions */}
      <div className="pt-2 space-y-2.5">
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
      <div className="pt-6 grid grid-cols-2 gap-10 print-avoid-break">
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
        <div className="doc-company-title font-bold tracking-tight text-slate-900">
          <EditableText
            order={order}
            fieldKey="inv.supplierName"
            fallback={supplier?.name ?? 'HARDLOCK Industry Co., Ltd.'}
            onCommit={onCommitOverride}
          />
        </div>
        <div className="text-slate-600 mt-1 max-w-md whitespace-pre-line">
          <EditableText
            order={order}
            fieldKey="inv.supplierAddress"
            fallback={supplier?.address || ''}
            onCommit={onCommitOverride}
            multiline
          />
        </div>
        <div className="text-slate-600 mt-0.5 font-mono-tabular">
          TEL:{' '}
          <EditableText
            order={order}
            fieldKey="inv.supplierTel"
            fallback={supplier?.phone || ''}
            onCommit={onCommitOverride}
          />{' '}
          {supplier?.fax ? `· FAX: ${supplier.fax}` : ''} · ID:{' '}
          {supplier?.taxOrExporterId}
        </div>
      </div>
      <div className="sm:text-right shrink-0">
        <div className="doc-title font-bold tracking-wide text-slate-900 whitespace-nowrap">
          {d.caseMarkSheet}
        </div>
        <div className="font-mono-tabular text-slate-500 mt-1 whitespace-nowrap">
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
            <EditableText
              order={order}
              fieldKey="inv.shipToName"
              fallback={customer?.name || ''}
              onCommit={onCommitOverride}
            />
          </div>
        </div>
        <div className="text-right font-mono-tabular">
          <div className="text-xs text-slate-500">{d.caseNo}</div>
          <div className="text-2xl font-bold text-slate-900">
            <EditableText
              order={order}
              fieldKey="cm.caseRangeHeader"
              fallback={
                order.shipping.caseNumberPrefix
                  ? `${order.shipping.caseNumberPrefix}-1 ~ ${summary.totalCartons}`
                  : `1 ~ ${summary.totalCartons}`
              }
              onCommit={onCommitOverride}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
        <div>
          <div className="text-[11px] font-bold text-slate-500 uppercase">
            {d.destination}
          </div>
          <div className="font-bold text-slate-900 mt-0.5">
            <EditableText
              order={order}
              fieldKey="inv.portOfDischarge"
              fallback={order.shipping.portOfDischarge}
              onCommit={onCommitOverride}
            />
          </div>
        </div>
        <div>
          <div className="text-[11px] font-bold text-slate-500 uppercase">
            {d.poNo}
          </div>
          <div className="font-mono-tabular font-bold text-slate-900 mt-0.5">
            <EditableText
              order={order}
              fieldKey="cm.poNo"
              fallback={order.poNo}
              onCommit={onCommitOverride}
            />
          </div>
        </div>
        <div>
          <div className="text-[11px] font-bold text-slate-500 uppercase">
            {d.invoiceNo}
          </div>
          <div className="font-mono-tabular font-bold text-slate-900 mt-0.5">
            <EditableText
              order={order}
              fieldKey="inv.invoiceNo"
              fallback={order.invoiceNo}
              onCommit={onCommitOverride}
            />
          </div>
        </div>
        <div>
          <div className="text-[11px] font-bold text-slate-500 uppercase">
            {d.netWeight}
          </div>
          <div className="font-mono-tabular font-bold text-slate-900 mt-0.5">
            <EditableText
              order={order}
              fieldKey="cm.nw"
              fallback={`${formatWeight1(summary.totalNetWeightKg)} kg`}
              onCommit={onCommitOverride}
            />
          </div>
        </div>
        <div>
          <div className="text-[11px] font-bold text-slate-500 uppercase">
            {d.grossWeight}
          </div>
          <div className="font-mono-tabular font-bold text-slate-900 mt-0.5">
            <EditableText
              order={order}
              fieldKey="cm.gw"
              fallback={`${formatWeight1(summary.totalGrossWeightKg)} kg`}
              onCommit={onCommitOverride}
            />
          </div>
        </div>
        <div>
          <div className="text-[11px] font-bold text-slate-500 uppercase">
            {d.measurement}
          </div>
          <div className="font-mono-tabular font-bold text-slate-900 mt-0.5">
            <EditableText
              order={order}
              fieldKey="cm.cbm"
              fallback={`${formatNumberNoRound(summary.totalCbm, 3)} m³`}
              onCommit={onCommitOverride}
            />
          </div>
        </div>
      </div>

      <div className="border-t border-slate-300 pt-3">
        <table className="w-full doc-table border-collapse">
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
          <EditableText
            order={order}
            fieldKey="cm.madeIn"
            fallback={`${d.madeIn} ${
              order.items[0]?.originCountry || supplier?.country || 'JAPAN'
            }`}
            onCommit={onCommitOverride}
          />
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
