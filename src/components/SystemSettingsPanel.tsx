import React, { useEffect, useState } from 'react';
import { Image as ImageIcon, Plus, RotateCcw, Save, Settings, Trash2, Upload } from 'lucide-react';
import type { ContractClauseItem, ContractSettings } from '../types/erp';
import type { UiDictionary } from '../i18n/uiTranslations';
import { createDefaultContractSettings } from '../utils/contractDefaults';
import { compressImageFileToDataUrl } from '../utils/imageUploadUtils';

interface SystemSettingsPanelProps {
  settings: ContractSettings;
  onSaveSettings: (next: ContractSettings) => void | Promise<void>;
  t: UiDictionary;
}

export const SystemSettingsPanel: React.FC<SystemSettingsPanelProps> = ({
  settings,
  onSaveSettings,
  t,
}) => {
  const [draft, setDraft] = useState<ContractSettings>(settings);
  const [savedToast, setSavedToast] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  useEffect(() => {
    if (!savedToast) return;
    const timer = window.setTimeout(() => setSavedToast(null), 3000);
    return () => window.clearTimeout(timer);
  }, [savedToast]);

  const syncQuickFieldToClause = (
    clauses: ContractClauseItem[],
    clauseNumber: number,
    patch: Partial<Pick<ContractClauseItem, 'bodyZh' | 'bodyEn'>>,
  ): ContractClauseItem[] =>
    clauses.map((c) => (c.number === clauseNumber ? { ...c, ...patch } : c));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSaveSettings(draft);
    setSavedToast(t.settingsSavedToast);
  };

  const handleImageUpload = async (
    target: 'companyStampImage' | 'signatureImage',
    file: File | undefined,
  ) => {
    if (!file) return;
    setImageError(null);
    try {
      const dataUrl = await compressImageFileToDataUrl(file);
      const next = { ...draft, [target]: dataUrl };
      setDraft(next);
      await onSaveSettings(next);
      setSavedToast(t.settingsSavedToast);
    } catch (err) {
      setImageError(
        err instanceof Error ? err.message : 'Image upload failed.',
      );
    }
  };

  const handleClearImage = async (
    target: 'companyStampImage' | 'signatureImage',
  ) => {
    setImageError(null);
    const next = { ...draft, [target]: '' };
    setDraft(next);
    await onSaveSettings(next);
    setSavedToast(t.settingsSavedToast);
  };

  const handleResetDefaults = () => {
    setDraft(createDefaultContractSettings());
  };

  const handleAddClause = () => {
    const nextNum =
      draft.clauses.reduce((m, c) => Math.max(m, c.number), 0) + 1;
    setDraft({
      ...draft,
      clauses: [
        ...draft.clauses,
        {
          id: `clause-${Date.now()}`,
          number: nextNum,
          titleZh: '补充条款',
          titleEn: 'ADDITIONAL TERMS',
          bodyZh: '',
          bodyEn: '',
        },
      ],
    });
  };

  return (
    <form
      onSubmit={handleSave}
      data-testid="system-settings-panel"
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-blue-700" />
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              {t.settingsTitle}
            </h1>
          </div>
          <p className="text-xs text-slate-600 mt-1 leading-relaxed">
            {t.settingsDesc}
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {savedToast && (
            <span
              role="status"
              className="text-xs font-medium text-emerald-700 whitespace-nowrap"
            >
              {savedToast}
            </span>
          )}
          <button
            type="button"
            onClick={handleResetDefaults}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{t.settingsResetDefaults}</span>
          </button>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-md hover:bg-blue-800 transition-colors whitespace-nowrap"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{t.btnSaveSettings}</span>
          </button>
        </div>
      </div>

      {/* Core Quick-Config Clauses */}
      <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="set-payment-zh"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              {t.settingsPaymentLabel}
            </label>
            <textarea
              id="set-payment-zh"
              rows={2}
              value={draft.defaultPaymentClause}
              onChange={(e) => {
                const val = e.target.value;
                setDraft({
                  ...draft,
                  defaultPaymentClause: val,
                  clauses: syncQuickFieldToClause(draft.clauses, 6, {
                    bodyZh: val,
                  }),
                });
              }}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
            />
          </div>
          <div>
            <label
              htmlFor="set-payment-en"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              {t.settingsPaymentEnLabel}
            </label>
            <textarea
              id="set-payment-en"
              rows={2}
              value={draft.defaultPaymentClauseEn}
              onChange={(e) => {
                const val = e.target.value;
                setDraft({
                  ...draft,
                  defaultPaymentClauseEn: val,
                  clauses: syncQuickFieldToClause(draft.clauses, 6, {
                    bodyEn: val,
                  }),
                });
              }}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
            />
          </div>

          <div>
            <label
              htmlFor="set-delivery-zh"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              {t.settingsDeliveryLabel}
            </label>
            <textarea
              id="set-delivery-zh"
              rows={2}
              value={draft.defaultDeliveryTime}
              onChange={(e) => {
                const val = e.target.value;
                setDraft({
                  ...draft,
                  defaultDeliveryTime: val,
                  clauses: syncQuickFieldToClause(draft.clauses, 5, {
                    bodyZh: val,
                  }),
                });
              }}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
            />
          </div>
          <div>
            <label
              htmlFor="set-delivery-en"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              {t.settingsDeliveryEnLabel}
            </label>
            <textarea
              id="set-delivery-en"
              rows={2}
              value={draft.defaultDeliveryTimeEn}
              onChange={(e) => {
                const val = e.target.value;
                setDraft({
                  ...draft,
                  defaultDeliveryTimeEn: val,
                  clauses: syncQuickFieldToClause(draft.clauses, 5, {
                    bodyEn: val,
                  }),
                });
              }}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
            />
          </div>

          <div>
            <label
              htmlFor="set-packing-zh"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              {t.settingsPackingLabel}
            </label>
            <textarea
              id="set-packing-zh"
              rows={3}
              value={draft.defaultPackingClause}
              onChange={(e) => {
                const val = e.target.value;
                setDraft({
                  ...draft,
                  defaultPackingClause: val,
                  clauses: syncQuickFieldToClause(draft.clauses, 2, {
                    bodyZh: val,
                  }),
                });
              }}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
            />
          </div>
          <div>
            <label
              htmlFor="set-packing-en"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              {t.settingsPackingEnLabel}
            </label>
            <textarea
              id="set-packing-en"
              rows={3}
              value={draft.defaultPackingClauseEn}
              onChange={(e) => {
                const val = e.target.value;
                setDraft({
                  ...draft,
                  defaultPackingClauseEn: val,
                  clauses: syncQuickFieldToClause(draft.clauses, 2, {
                    bodyEn: val,
                  }),
                });
              }}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
            />
          </div>

          <div>
            <label
              htmlFor="set-arb-zh"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              {t.settingsArbitrationLabel}
            </label>
            <textarea
              id="set-arb-zh"
              rows={3}
              value={draft.defaultArbitrationClause}
              onChange={(e) => {
                const val = e.target.value;
                setDraft({
                  ...draft,
                  defaultArbitrationClause: val,
                  clauses: syncQuickFieldToClause(draft.clauses, 10, {
                    bodyZh: val,
                  }),
                });
              }}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
            />
          </div>
          <div>
            <label
              htmlFor="set-arb-en"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              {t.settingsArbitrationEnLabel}
            </label>
            <textarea
              id="set-arb-en"
              rows={3}
              value={draft.defaultArbitrationClauseEn}
              onChange={(e) => {
                const val = e.target.value;
                setDraft({
                  ...draft,
                  defaultArbitrationClauseEn: val,
                  clauses: syncQuickFieldToClause(draft.clauses, 10, {
                    bodyEn: val,
                  }),
                });
              }}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-slate-100">
          <div>
            <label
              htmlFor="set-stamp-label"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              {t.settingsStampLabel}
            </label>
            <input
              id="set-stamp-label"
              type="text"
              value={draft.companyStampLabel}
              onChange={(e) =>
                setDraft({ ...draft, companyStampLabel: e.target.value })
              }
              className="w-full h-9 px-3 text-xs border border-slate-300 rounded-md"
            />
          </div>
          <div>
            <label
              htmlFor="set-disclaimer"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              {t.settingsDisclaimerLabel}
            </label>
            <input
              id="set-disclaimer"
              type="text"
              value={draft.defaultDisclaimerText}
              onChange={(e) =>
                setDraft({ ...draft, defaultDisclaimerText: e.target.value })
              }
              className="w-full h-9 px-3 text-xs border border-slate-300 rounded-md"
            />
          </div>
        </div>
      </section>

      {/* Stamp & Signature Image Upload Section */}
      <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <div>
          <div className="flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-blue-700" />
            <h2 className="text-sm font-bold text-slate-900">
              {t.stampSigSectionTitle}
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">{t.stampSigUploadHint}</p>
        </div>

        {imageError && (
          <div className="p-2.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded">
            {imageError}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-3.5 border border-slate-200 rounded-md bg-slate-50/70 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-800">
                {t.uploadStampImageBtn}
              </span>
              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-blue-700 bg-white border border-blue-200 rounded hover:bg-blue-50 cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{t.uploadStampImageBtn}</span>
                  <input
                    type="file"
                    accept="image/*"
                    data-testid="settings-upload-stamp-input"
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      void handleImageUpload('companyStampImage', file);
                      e.target.value = '';
                    }}
                  />
                </label>
                {draft.companyStampImage && (
                  <button
                    type="button"
                    onClick={() => void handleClearImage('companyStampImage')}
                    className="px-2 py-1 text-xs text-red-600 bg-white border border-red-200 rounded hover:bg-red-50"
                  >
                    {t.clearImageBtn}
                  </button>
                )}
              </div>
            </div>
            <div className="h-24 bg-white border border-dashed border-slate-300 rounded flex items-center justify-center p-2">
              {draft.companyStampImage ? (
                <img
                  src={draft.companyStampImage}
                  alt="Company Stamp Preview"
                  data-testid="settings-stamp-preview"
                  className="max-h-20 max-w-full object-contain"
                />
              ) : (
                <span className="text-[11px] text-slate-400">
                  {t.settingsStampLabel}: {draft.companyStampLabel}
                </span>
              )}
            </div>
          </div>

          <div className="p-3.5 border border-slate-200 rounded-md bg-slate-50/70 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-800">
                {t.uploadSignatureImageBtn}
              </span>
              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-blue-700 bg-white border border-blue-200 rounded hover:bg-blue-50 cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{t.uploadSignatureImageBtn}</span>
                  <input
                    type="file"
                    accept="image/*"
                    data-testid="settings-upload-signature-input"
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      void handleImageUpload('signatureImage', file);
                      e.target.value = '';
                    }}
                  />
                </label>
                {draft.signatureImage && (
                  <button
                    type="button"
                    onClick={() => void handleClearImage('signatureImage')}
                    className="px-2 py-1 text-xs text-red-600 bg-white border border-red-200 rounded hover:bg-red-50"
                  >
                    {t.clearImageBtn}
                  </button>
                )}
              </div>
            </div>
            <div className="h-24 bg-white border border-dashed border-slate-300 rounded flex items-center justify-center p-2">
              {draft.signatureImage ? (
                <img
                  src={draft.signatureImage}
                  alt="Signature Preview"
                  data-testid="settings-signature-preview"
                  className="max-h-16 max-w-full object-contain"
                />
              ) : (
                <span className="text-[11px] text-slate-400">
                  {t.specialSignatureLabel}
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Full Numbered Bilingual Clauses List */}
      <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-slate-900">
            {t.settingsClausesTitle} ({draft.clauses.length})
          </h2>
          <button
            type="button"
            onClick={handleAddClause}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t.settingsAddClause}</span>
          </button>
        </div>

        <div className="space-y-3">
          {draft.clauses.map((clause, idx) => (
            <div
              key={clause.id}
              className="p-3.5 border border-slate-200 rounded-md bg-slate-50/60 space-y-2.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 flex-1">
                  <span className="text-xs font-mono-tabular font-bold text-slate-700 w-7">
                    #{clause.number}
                  </span>
                  <input
                    type="text"
                    aria-label={`Clause ${clause.number} title ZH`}
                    value={clause.titleZh}
                    onChange={(e) => {
                      const next = draft.clauses.map((c, i) =>
                        i === idx ? { ...c, titleZh: e.target.value } : c,
                      );
                      setDraft({ ...draft, clauses: next });
                    }}
                    className="h-8 px-2.5 text-xs font-semibold bg-white border border-slate-300 rounded w-44"
                  />
                  <input
                    type="text"
                    aria-label={`Clause ${clause.number} title EN`}
                    value={clause.titleEn}
                    onChange={(e) => {
                      const next = draft.clauses.map((c, i) =>
                        i === idx ? { ...c, titleEn: e.target.value } : c,
                      );
                      setDraft({ ...draft, clauses: next });
                    }}
                    className="h-8 px-2.5 text-xs font-semibold bg-white border border-slate-300 rounded flex-1 min-w-[180px]"
                  />
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      clauses: draft.clauses.filter((_, i) => i !== idx),
                    })
                  }
                  aria-label={`${t.btnDelete} #${clause.number}`}
                  className="p-1.5 text-slate-400 hover:text-red-600 rounded"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                <textarea
                  rows={2}
                  aria-label={`Clause ${clause.number} body ZH`}
                  value={clause.bodyZh}
                  onChange={(e) => {
                    const next = draft.clauses.map((c, i) =>
                      i === idx ? { ...c, bodyZh: e.target.value } : c,
                    );
                    setDraft({ ...draft, clauses: next });
                  }}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
                />
                <textarea
                  rows={2}
                  aria-label={`Clause ${clause.number} body EN`}
                  value={clause.bodyEn}
                  onChange={(e) => {
                    const next = draft.clauses.map((c, i) =>
                      i === idx ? { ...c, bodyEn: e.target.value } : c,
                    );
                    setDraft({ ...draft, clauses: next });
                  }}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
                />
              </div>
            </div>
          ))}
        </div>
      </section>
    </form>
  );
};
