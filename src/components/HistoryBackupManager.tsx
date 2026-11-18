import React, { useRef, useState } from 'react';
import {
  Download,
  Upload,
  RotateCcw,
  FolderOpen,
  Trash2,
  Camera,
} from 'lucide-react';
import type {
  AuditLogEntry,
  BackupSnapshot,
  Customer,
  ErpDataPayload,
  ExportOrder,
} from '../types/erp';
import type { UiDictionary } from '../i18n/uiTranslations';
import {
  calculateOrderSummary,
  formatMoney,
  validateErpBackupPayload,
} from '../utils/exportCalculations';

interface HistoryBackupManagerProps {
  orders: ExportOrder[];
  activeOrderId: string;
  customers: Customer[];
  auditLogs: AuditLogEntry[];
  snapshots: BackupSnapshot[];
  onLoadOrder: (orderId: string) => void;
  onDeleteOrder: (orderId: string) => void;
  onExportBackup: () => void;
  onImportBackup: (payload: ErpDataPayload) => void;
  onCreateSnapshot: () => void;
  onRestoreSnapshot: (snapshotId: string) => void;
  onResetDemo: () => void;
  t: UiDictionary;
}

export const HistoryBackupManager: React.FC<HistoryBackupManagerProps> = ({
  orders,
  activeOrderId,
  customers,
  auditLogs,
  snapshots,
  onLoadOrder,
  onDeleteOrder,
  onExportBackup,
  onImportBackup,
  onCreateSnapshot,
  onRestoreSnapshot,
  onResetDemo,
  t,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [backupMessage, setBackupMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      if (!validateErpBackupPayload(parsed)) {
        setBackupMessage({ type: 'error', text: t.restoreError });
        return;
      }
      onImportBackup(parsed);
      setBackupMessage({ type: 'success', text: t.restoreSuccess });
    } catch {
      setBackupMessage({ type: 'error', text: t.restoreError });
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-6">
      {/* Backup & Restore Panel */}
      <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <h1 className="text-lg font-bold text-slate-900">
              {t.historyBackupTitle}
            </h1>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              {t.backupDesc}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onExportBackup}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-700 rounded-md hover:bg-blue-800 transition-colors whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{t.btnExportBackup}</span>
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={handleFileChange}
              className="sr-only"
              aria-label={t.btnImportBackup}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{t.btnImportBackup}</span>
            </button>

            <button
              type="button"
              onClick={onCreateSnapshot}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>{t.btnCreateSnapshot}</span>
            </button>

            <button
              type="button"
              onClick={() => setConfirmResetOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-700 bg-white border border-red-200 rounded-md hover:bg-red-50 transition-colors whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{t.btnResetDemo}</span>
            </button>
          </div>
        </div>

        {backupMessage && (
          <div
            role="status"
            className={`px-3 py-2 text-xs font-medium rounded-md border ${
              backupMessage.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}
          >
            {backupMessage.text}
          </div>
        )}

        {/* Auto-Backup Snapshots List */}
        {snapshots.length > 0 && (
          <div className="pt-3 border-t border-slate-100">
            <div className="text-xs font-semibold text-slate-700 mb-2">
              {t.localSnapshotsTitle} ({snapshots.length})
            </div>
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-md max-h-48 overflow-y-auto">
              {snapshots.map((snap) => (
                <div
                  key={snap.id}
                  className="px-3 py-2 flex items-center justify-between gap-4 text-xs"
                >
                  <div className="min-w-0">
                    <span className="font-mono-tabular text-slate-500">
                      {new Date(snap.createdAt).toLocaleString()}
                    </span>
                    <span className="mx-2 text-slate-300">·</span>
                    <span className="font-medium text-slate-800">
                      {snap.reason}
                    </span>
                    <span className="mx-2 text-slate-300">·</span>
                    <span className="font-mono-tabular text-slate-500">
                      {snap.orderCount} {t.ordersUnit}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onRestoreSnapshot(snap.id);
                      setBackupMessage({
                        type: 'success',
                        text: t.restoreSuccess,
                      });
                    }}
                    className="px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50 rounded whitespace-nowrap shrink-0"
                  >
                    {t.btnRestoreSnapshot}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Saved Orders Table + Audit Log Split */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <section className="xl:col-span-7 bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">
              {t.historyOrdersTitle}
            </h2>
            <span className="text-xs font-mono-tabular text-slate-500">
              {orders.length}
            </span>
          </div>

          {orders.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              {t.emptyOrders}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                    <th className="py-2.5 px-4">{t.colInvoiceDate}</th>
                    <th className="py-2.5 px-4">{t.colCustomer}</th>
                    <th className="py-2.5 px-4">{t.colModeTerm}</th>
                    <th className="py-2.5 px-4 text-right">{t.colTotal}</th>
                    <th className="py-2.5 px-4 text-right">{t.colActions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {orders.map((ord) => {
                    const cust = customers.find((c) => c.id === ord.customerId);
                    const calc = calculateOrderSummary(
                      ord.items,
                      ord.costs,
                      ord.shipping.incoterm,
                      ord.currency,
                    );
                    const isActive = ord.id === activeOrderId;
                    return (
                      <tr
                        key={ord.id}
                        className={isActive ? 'bg-blue-50/40' : 'hover:bg-slate-50'}
                      >
                        <td className="py-3 px-4">
                          <div className="font-mono-tabular font-semibold text-slate-900">
                            {ord.invoiceNo}
                          </div>
                          <div className="font-mono-tabular text-slate-500">
                            {ord.orderDate}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-slate-700">
                          {cust?.name ?? '—'}
                        </td>
                        <td className="py-3 px-4 font-mono-tabular text-slate-700">
                          {ord.shipping.mode} · {ord.shipping.incoterm}
                        </td>
                        <td className="py-3 px-4 text-right font-mono-tabular font-semibold text-slate-900">
                          {formatMoney(calc.incotermTotal, ord.currency)}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => onLoadOrder(ord.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50 rounded mr-1"
                          >
                            <FolderOpen className="w-3.5 h-3.5" />
                            <span>{t.btnLoadOrder}</span>
                          </button>
                          <button
                            type="button"
                            disabled={orders.length <= 1}
                            onClick={() => onDeleteOrder(ord.id)}
                            aria-label={`Delete order ${ord.invoiceNo}`}
                            className="p-1.5 text-slate-400 hover:text-red-600 disabled:opacity-30 rounded"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Revision Audit Log */}
        <section className="xl:col-span-5 bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">
              {t.historyLogsTitle}
            </h2>
            <span className="text-xs font-mono-tabular text-slate-500">
              {auditLogs.length}
            </span>
          </div>
          <div className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto">
            {auditLogs.map((log) => (
              <div key={log.id} className="px-4 py-3 text-xs space-y-0.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono-tabular font-semibold text-slate-800">
                    {log.targetLabel}
                  </span>
                  <span className="font-mono-tabular text-[11px] text-slate-400">
                    {new Date(log.timestamp).toLocaleString()}
                  </span>
                </div>
                <div className="text-slate-600">{log.summary}</div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Confirmation Modal for Demo Reset */}
      {confirmResetOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t.confirmResetTitle}
            className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-5 space-y-4 shadow-lg"
          >
            <h3 className="text-sm font-bold text-slate-900">
              {t.confirmResetTitle}
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              {t.confirmResetBody}
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmResetOpen(false)}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
              >
                {t.btnCancel}
              </button>
              <button
                type="button"
                onClick={() => {
                  onResetDemo();
                  setConfirmResetOpen(false);
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-red-600 rounded-md hover:bg-red-700"
              >
                {t.confirmAction}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
