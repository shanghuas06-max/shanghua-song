import type { BackupSnapshot, ErpDataPayload, ErpStoreState } from '../types/erp';

const SNAPSHOT_KEY_PREFIX = 'hardlock_erp_v3_snapshots_';
const MAX_SNAPSHOTS = 10;

export function loadSnapshotsForUser(uid: string): BackupSnapshot[] {
  try {
    const raw = localStorage.getItem(`${SNAPSHOT_KEY_PREFIX}${uid}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as BackupSnapshot[]) : [];
  } catch {
    return [];
  }
}

export function saveSnapshotsForUser(uid: string, snapshots: BackupSnapshot[]): void {
  try {
    localStorage.setItem(
      `${SNAPSHOT_KEY_PREFIX}${uid}`,
      JSON.stringify(snapshots.slice(0, MAX_SNAPSHOTS)),
    );
  } catch {
    // Ignore storage quota errors gracefully
  }
}

export function createSnapshotRecord(
  state: ErpStoreState,
  reason: string,
): BackupSnapshot {
  return {
    id: `snap-${Date.now()}`,
    createdAt: new Date().toISOString(),
    reason,
    orderCount: state.orders.length,
    payload: extractPayload(state),
  };
}

export function extractPayload(state: ErpStoreState): ErpDataPayload {
  return {
    version: 3,
    exportedAt: new Date().toISOString(),
    customers: state.customers,
    suppliers: state.suppliers,
    logisticsProviders: state.logisticsProviders,
    bankAccounts: state.bankAccounts,
    products: state.products,
    orders: state.orders,
    auditLogs: state.auditLogs,
  };
}

export function triggerJsonBackupDownload(state: ErpStoreState): void {
  const payload = extractPayload(state);
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const dateStamp = new Date().toISOString().slice(0, 10);
  const link = document.createElement('a');
  link.href = url;
  link.download = `hardlock-erp-v3-backup-${dateStamp}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
