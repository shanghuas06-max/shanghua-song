import React from 'react';
import { FilePlus2, Menu, Printer, Save } from 'lucide-react';
import type { NavSection } from '../types/erp';
import type { UiDictionary } from '../i18n/uiTranslations';

interface TopHeaderProps {
  activeSection: NavSection;
  activeInvoiceNo: string;
  hasActiveOrder: boolean;
  onOpenMobileNav: () => void;
  onCreateNewOrder: () => void;
  onSaveOrder: () => void;
  onGoToPrint: () => void;
  t: UiDictionary;
  saveFeedback: string | null;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
  activeSection,
  activeInvoiceNo,
  hasActiveOrder,
  onOpenMobileNav,
  onCreateNewOrder,
  onSaveOrder,
  onGoToPrint,
  t,
  saveFeedback,
}) => {
  const sectionLabelMap: Record<NavSection, string> = {
    order: t.navOrder,
    documents: t.navDocuments,
    master: t.navMaster,
    history: t.navHistory,
  };

  return (
    <header className="no-print sticky top-0 z-30 bg-white border-b border-slate-200 px-3 sm:px-4 lg:px-8 h-14 flex items-center justify-between gap-2 sm:gap-4">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
        <button
          type="button"
          onClick={onOpenMobileNav}
          aria-label="Open navigation menu"
          className="lg:hidden p-2 -ml-1 text-slate-600 hover:text-slate-900 rounded-md shrink-0"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Contextual Breadcrumb */}
        <div className="flex items-center gap-1.5 sm:gap-2 text-sm min-w-0">
          <span className="font-semibold text-slate-900 whitespace-nowrap shrink-0">
            HARDLOCK
          </span>
          <span className="hidden sm:inline text-slate-300" aria-hidden="true">
            /
          </span>
          <span className="hidden sm:inline text-slate-600 truncate">
            {sectionLabelMap[activeSection]}
          </span>
          {activeInvoiceNo && (
            <>
              <span className="hidden md:inline text-slate-300" aria-hidden="true">
                /
              </span>
              <span className="hidden md:inline font-mono-tabular text-xs text-slate-500 truncate">
                {activeInvoiceNo}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Persistent Top-Right Actions (New Order always visible even with 0 orders) */}
      <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
        {saveFeedback && (
          <span
            role="status"
            className="hidden xl:inline text-xs font-medium text-emerald-700 whitespace-nowrap"
          >
            {saveFeedback}
          </span>
        )}
        <button
          type="button"
          onClick={onCreateNewOrder}
          className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 sm:py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
            hasActiveOrder
              ? 'text-slate-700 bg-white border border-slate-300 hover:bg-slate-50'
              : 'text-white bg-blue-700 hover:bg-blue-800'
          }`}
        >
          <FilePlus2 className="w-3.5 h-3.5 shrink-0" />
          <span>{t.btnNewOrder}</span>
        </button>
        <button
          type="button"
          disabled={!hasActiveOrder}
          onClick={onSaveOrder}
          className="inline-flex items-center gap-1.5 px-2 sm:px-3.5 py-1.5 sm:py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-45 disabled:pointer-events-none transition-colors whitespace-nowrap shrink-0"
        >
          <Save className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden sm:inline">{t.btnSaveOrder}</span>
        </button>
        <button
          type="button"
          disabled={!hasActiveOrder}
          onClick={onGoToPrint}
          className={`inline-flex items-center gap-1.5 px-2 sm:px-4 py-1.5 sm:py-2 text-xs font-semibold rounded-md disabled:opacity-45 disabled:pointer-events-none transition-colors whitespace-nowrap shrink-0 ${
            hasActiveOrder
              ? 'text-white bg-blue-700 hover:bg-blue-800'
              : 'text-slate-600 bg-slate-100 border border-slate-200'
          }`}
        >
          <Printer className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden sm:inline">{t.btnPrintDoc}</span>
        </button>
      </div>
    </header>
  );
};
