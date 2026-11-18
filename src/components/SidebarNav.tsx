import React from 'react';
import {
  FileSpreadsheet,
  Printer,
  Database,
  History,
  X,
  LogOut,
  Cloud,
} from 'lucide-react';
import type { DocLanguage, NavSection, UiLanguage } from '../types/erp';
import type { UiDictionary } from '../i18n/uiTranslations';

interface SidebarNavProps {
  activeSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  uiLang: UiLanguage;
  onChangeUiLang: (lang: UiLanguage) => void;
  docLang: DocLanguage;
  onChangeDocLang: (lang: DocLanguage) => void;
  t: UiDictionary;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  ordersCount: number;
  masterCount: number;
  userEmail: string;
  userDisplayName: string;
  onSignOut: () => void;
}

export const SidebarNav: React.FC<SidebarNavProps> = ({
  activeSection,
  onSelectSection,
  uiLang,
  onChangeUiLang,
  docLang,
  onChangeDocLang,
  t,
  mobileOpen,
  onCloseMobile,
  ordersCount,
  masterCount,
  userEmail,
  userDisplayName,
  onSignOut,
}) => {
  const navItems: {
    id: NavSection;
    label: string;
    icon: React.ReactNode;
    count?: number;
  }[] = [
    {
      id: 'order',
      label: t.navOrder,
      icon: <FileSpreadsheet className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'documents',
      label: t.navDocuments,
      icon: <Printer className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'master',
      label: t.navMaster,
      icon: <Database className="w-4 h-4 shrink-0" />,
      count: masterCount,
    },
    {
      id: 'history',
      label: t.navHistory,
      icon: <History className="w-4 h-4 shrink-0" />,
      count: ordersCount,
    },
  ];

  const uiOptions: { code: UiLanguage; label: string }[] = [
    { code: 'ja', label: '日本語' },
    { code: 'zh', label: '中文' },
    { code: 'en', label: 'English' },
  ];

  const docOptions: { code: DocLanguage; label: string }[] = [
    { code: 'en', label: 'English' },
    { code: 'ja', label: '日本語' },
    { code: 'zh', label: '中文' },
  ];

  const content = (
    <div className="flex flex-col h-full bg-slate-900 text-slate-100 select-none">
      {/* Brand Block */}
      <div className="px-5 py-5 border-b border-slate-800 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-base font-bold tracking-tight text-white truncate">
            {t.brandTitle}
          </div>
          <div className="text-xs text-slate-400 truncate mt-0.5">{t.brandSub}</div>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation"
          className="lg:hidden p-1.5 text-slate-400 hover:text-white rounded-md"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Primary ERP Navigation */}
      <nav aria-label="Main navigation" className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelectSection(item.id);
                onCloseMobile();
              }}
              aria-current={isActive ? 'page' : undefined}
              className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 text-sm font-medium rounded-md transition-colors text-left ${
                isActive
                  ? 'bg-blue-700 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                {item.icon}
                <span className="truncate whitespace-nowrap">{item.label}</span>
              </span>
              {typeof item.count === 'number' && (
                <span
                  className={`text-xs font-mono-tabular shrink-0 ${
                    isActive ? 'text-blue-100' : 'text-slate-500'
                  }`}
                >
                  {item.count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Separated Language Controls: UI Language vs Export Document Language */}
      <div className="px-4 py-4 border-t border-slate-800 space-y-4">
        <div>
          <label
            htmlFor="ui-lang-select"
            className="block text-xs font-medium text-slate-400 mb-1.5"
          >
            {t.uiLangLabel}
          </label>
          <div
            id="ui-lang-select"
            role="group"
            aria-label={t.uiLangLabel}
            className="grid grid-cols-3 gap-1 p-1 bg-slate-950 rounded-md"
          >
            {uiOptions.map((opt) => (
              <button
                key={opt.code}
                type="button"
                onClick={() => onChangeUiLang(opt.code)}
                className={`py-1.5 px-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                  uiLang === opt.code
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label
            htmlFor="doc-lang-select"
            className="block text-xs font-medium text-slate-400 mb-1.5"
          >
            {t.docLangLabel}
          </label>
          <div
            id="doc-lang-select"
            role="group"
            aria-label={t.docLangLabel}
            className="grid grid-cols-3 gap-1 p-1 bg-slate-950 rounded-md"
          >
            {docOptions.map((opt) => (
              <button
                key={opt.code}
                type="button"
                onClick={() => onChangeDocLang(opt.code)}
                className={`py-1.5 px-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                  docLang === opt.code
                    ? 'bg-blue-700 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Account Isolation & Sign Out */}
        <div className="pt-3 border-t border-slate-800 space-y-2.5">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-white truncate">
              {userDisplayName || userEmail}
            </div>
            <div className="text-[11px] text-slate-400 truncate">
              {userEmail}
            </div>
            <div className="inline-flex items-center gap-1 text-[11px] text-emerald-400 mt-1">
              <Cloud className="w-3 h-3 shrink-0" />
              <span className="truncate">{t.authCloudSyncedBadge}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 hover:text-white rounded-md transition-colors"
          >
            <LogOut className="w-3.5 h-3.5 shrink-0" />
            <span>{t.authBtnSignOut}</span>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Fixed Sidebar */}
      <aside className="hidden lg:block lg:w-[248px] shrink-0 no-print border-r border-slate-800">
        <div className="sticky top-0 h-screen">{content}</div>
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden no-print flex">
          <div
            className="fixed inset-0 bg-slate-950/50"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative w-64 max-w-[80vw] h-full z-10">{content}</div>
        </div>
      )}
    </>
  );
};
