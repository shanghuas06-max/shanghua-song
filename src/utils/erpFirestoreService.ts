import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { createInitialErpState } from '../data/seedData';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import type {
  AuditLogEntry,
  BankAccount,
  Customer,
  DocLanguage,
  ErpDataPayload,
  ExportOrder,
  LogisticsProvider,
  Product,
  Supplier,
  UiLanguage,
} from '../types/erp';
import {
  BLUEPRINT_LIMITS,
  clampDocLang,
  clampStr,
  clampUiLang,
  sanitizeAuditLogPayload,
  sanitizeBankPayload,
  sanitizeCustomerPayload,
  sanitizeLogisticsPayload,
  sanitizeOrderPayload,
  sanitizeProductPayload,
  sanitizeSupplierPayload,
} from './firestoreSanitizers';

export interface UserWorkspaceProfile {
  uid: string;
  email: string;
  displayName: string;
  companyName: string;
  uiLang: UiLanguage;
  docLang: DocLanguage;
  activeOrderId: string;
}

export interface CloudErpCollections {
  profile: UserWorkspaceProfile | null;
  customers: Customer[];
  suppliers: Supplier[];
  logisticsProviders: LogisticsProvider[];
  bankAccounts: BankAccount[];
  products: Product[];
  orders: ExportOrder[];
  auditLogs: AuditLogEntry[];
}

function userDocRef(uid: string) {
  return doc(db, 'users', uid);
}

function userSubDocRef(uid: string, sub: string, id: string) {
  return doc(db, 'users', uid, sub, id);
}

function userSubColQuery(uid: string, sub: string) {
  return query(collection(db, 'users', uid, sub), where('ownerId', '==', uid));
}

const initInFlightByUid = new Map<string, Promise<boolean>>();

async function seedCollectionsForUser(
  uid: string,
  payload: ErpDataPayload,
  profileDocData?: Record<string, unknown>,
): Promise<void> {
  const ops: { ref: ReturnType<typeof userSubDocRef>; data: Record<string, unknown> }[] = [];

  if (profileDocData) {
    ops.push({
      ref: userDocRef(uid),
      data: profileDocData,
    });
  }

  for (const c of payload.customers) {
    const clean = sanitizeCustomerPayload(c, uid);
    ops.push({
      ref: userSubDocRef(uid, 'customers', clean.id),
      data: { ...clean, createdAt: serverTimestamp(), updatedAt: serverTimestamp() },
    });
  }
  for (const s of payload.suppliers) {
    const clean = sanitizeSupplierPayload(s, uid);
    ops.push({
      ref: userSubDocRef(uid, 'suppliers', clean.id),
      data: { ...clean, createdAt: serverTimestamp(), updatedAt: serverTimestamp() },
    });
  }
  for (const l of payload.logisticsProviders) {
    const clean = sanitizeLogisticsPayload(l, uid);
    ops.push({
      ref: userSubDocRef(uid, 'logisticsProviders', clean.id),
      data: { ...clean, createdAt: serverTimestamp(), updatedAt: serverTimestamp() },
    });
  }
  for (const b of payload.bankAccounts) {
    const clean = sanitizeBankPayload(b, uid);
    ops.push({
      ref: userSubDocRef(uid, 'bankAccounts', clean.id),
      data: { ...clean, createdAt: serverTimestamp(), updatedAt: serverTimestamp() },
    });
  }
  for (const p of payload.products) {
    const clean = sanitizeProductPayload(p, uid);
    ops.push({
      ref: userSubDocRef(uid, 'products', clean.id),
      data: { ...clean, createdAt: serverTimestamp(), updatedAt: serverTimestamp() },
    });
  }
  for (const o of payload.orders) {
    const clean = sanitizeOrderPayload(o, uid);
    ops.push({
      ref: userSubDocRef(uid, 'orders', clean.id),
      data: { ...clean, createdAt: serverTimestamp(), updatedAt: serverTimestamp() },
    });
  }
  for (const log of payload.auditLogs.slice(0, 40)) {
    const clean = sanitizeAuditLogPayload(log, uid);
    ops.push({
      ref: userSubDocRef(uid, 'auditLogs', clean.id),
      data: { ...clean, createdAt: serverTimestamp(), updatedAt: serverTimestamp() },
    });
  }

  // Commit in chunks under Firestore 500-op batch ceiling
  for (let i = 0; i < ops.length; i += 400) {
    const batch = writeBatch(db);
    for (const item of ops.slice(i, i + 400)) {
      batch.set(item.ref, item.data);
    }
    await batch.commit();
  }
}

export async function ensureUserWorkspaceInitialized(
  user: User,
  preferredUiLang: UiLanguage = 'zh',
): Promise<boolean> {
  const existingPromise = initInFlightByUid.get(user.uid);
  if (existingPromise) {
    return existingPromise;
  }

  const path = `users/${user.uid}`;
  const run = (async () => {
    try {
      const snap = await getDoc(userDocRef(user.uid));
      if (snap.exists()) {
        return false;
      }

      const seed = createInitialErpState();
      const profileDoc = {
        uid: user.uid,
        email: clampStr(user.email ?? `${user.uid}@local`, BLUEPRINT_LIMITS.MEDIUM_MAX),
        displayName: clampStr(
          user.displayName ?? user.email?.split('@')[0] ?? 'Operator',
          BLUEPRINT_LIMITS.MEDIUM_MAX,
        ),
        companyName: 'HARDLOCK Export Workspace',
        uiLang: clampUiLang(preferredUiLang, 'zh'),
        docLang: clampDocLang(seed.docLang, 'en'),
        activeOrderId: clampStr(seed.activeOrderId, BLUEPRINT_LIMITS.ID_MAX),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      // Atomically seed user workspace profile and initial collections
      await seedCollectionsForUser(user.uid, seed, profileDoc);
      return true;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    } finally {
      initInFlightByUid.delete(user.uid);
    }
  })();

  initInFlightByUid.set(user.uid, run);
  return run;
}

export function subscribeUserWorkspace(
  uid: string,
  onChange: (collections: CloudErpCollections) => void,
  onFatalError: (err: Error) => void,
): () => void {
  const state: CloudErpCollections = {
    profile: null,
    customers: [],
    suppliers: [],
    logisticsProviders: [],
    bankAccounts: [],
    products: [],
    orders: [],
    auditLogs: [],
  };

  let readyCount = 0;
  const seen = new Set<string>();
  const markReady = (key: string) => {
    if (!seen.has(key)) {
      seen.add(key);
      readyCount += 1;
    }
    if (readyCount >= 8) {
      onChange({ ...state });
    }
  };

  const reportError = (err: unknown, op: OperationType, path: string) => {
    try {
      handleFirestoreError(err, op, path);
    } catch (wrapped) {
      onFatalError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
    }
  };

  const unsubs: (() => void)[] = [];

  unsubs.push(
    onSnapshot(
      userDocRef(uid),
      (snap) => {
        if (snap.exists()) {
          const d = snap.data();
          state.profile = {
            uid: String(d.uid ?? uid),
            email: String(d.email ?? ''),
            displayName: String(d.displayName ?? ''),
            companyName: String(d.companyName ?? ''),
            uiLang: clampUiLang(d.uiLang),
            docLang: clampDocLang(d.docLang),
            activeOrderId: String(d.activeOrderId ?? ''),
          };
        }
        markReady('profile');
      },
      (err) => reportError(err, OperationType.GET, `users/${uid}`),
    ),
  );

  unsubs.push(
    onSnapshot(
      userSubColQuery(uid, 'customers'),
      (snap) => {
        state.customers = snap.docs.map((d) => d.data() as Customer);
        markReady('customers');
      },
      (err) => reportError(err, OperationType.LIST, `users/${uid}/customers`),
    ),
  );

  unsubs.push(
    onSnapshot(
      userSubColQuery(uid, 'suppliers'),
      (snap) => {
        state.suppliers = snap.docs.map((d) => d.data() as Supplier);
        markReady('suppliers');
      },
      (err) => reportError(err, OperationType.LIST, `users/${uid}/suppliers`),
    ),
  );

  unsubs.push(
    onSnapshot(
      userSubColQuery(uid, 'logisticsProviders'),
      (snap) => {
        state.logisticsProviders = snap.docs.map((d) => d.data() as LogisticsProvider);
        markReady('logisticsProviders');
      },
      (err) => reportError(err, OperationType.LIST, `users/${uid}/logisticsProviders`),
    ),
  );

  unsubs.push(
    onSnapshot(
      userSubColQuery(uid, 'bankAccounts'),
      (snap) => {
        state.bankAccounts = snap.docs.map((d) => d.data() as BankAccount);
        markReady('bankAccounts');
      },
      (err) => reportError(err, OperationType.LIST, `users/${uid}/bankAccounts`),
    ),
  );

  unsubs.push(
    onSnapshot(
      userSubColQuery(uid, 'products'),
      (snap) => {
        state.products = snap.docs.map((d) => d.data() as Product);
        markReady('products');
      },
      (err) => reportError(err, OperationType.LIST, `users/${uid}/products`),
    ),
  );

  unsubs.push(
    onSnapshot(
      userSubColQuery(uid, 'orders'),
      (snap) => {
        state.orders = snap.docs
          .map((d) => {
            const raw = d.data() as Record<string, unknown>;
            return {
              ...(raw as unknown as ExportOrder),
              createdAt: String(raw.orderCreatedAt ?? raw.createdAt ?? ''),
              updatedAt: String(raw.orderUpdatedAt ?? raw.updatedAt ?? ''),
            };
          })
          .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
        markReady('orders');
      },
      (err) => reportError(err, OperationType.LIST, `users/${uid}/orders`),
    ),
  );

  unsubs.push(
    onSnapshot(
      userSubColQuery(uid, 'auditLogs'),
      (snap) => {
        state.auditLogs = snap.docs
          .map((d) => d.data() as AuditLogEntry)
          .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
        markReady('auditLogs');
      },
      (err) => reportError(err, OperationType.LIST, `users/${uid}/auditLogs`),
    ),
  );

  return () => {
    for (const unsub of unsubs) unsub();
  };
}

function isFirestoreNotFound(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 'not-found'
  );
}

export async function updateWorkspacePrefs(
  uid: string,
  prefs: { uiLang?: UiLanguage; docLang?: DocLanguage; activeOrderId?: string },
): Promise<void> {
  const path = `users/${uid}`;
  try {
    const updatePayload: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (prefs.uiLang) updatePayload.uiLang = clampUiLang(prefs.uiLang);
    if (prefs.docLang) updatePayload.docLang = clampDocLang(prefs.docLang);
    if (prefs.activeOrderId !== undefined) {
      updatePayload.activeOrderId = clampStr(prefs.activeOrderId, BLUEPRINT_LIMITS.ID_MAX);
    }
    try {
      await updateDoc(userDocRef(uid), updatePayload);
    } catch (updateErr) {
      if (!isFirestoreNotFound(updateErr)) throw updateErr;
      const currentUser = auth.currentUser;
      await setDoc(userDocRef(uid), {
        uid,
        email: clampStr(
          currentUser?.email ?? `${uid}@local`,
          BLUEPRINT_LIMITS.MEDIUM_MAX,
        ),
        displayName: clampStr(
          currentUser?.displayName ?? currentUser?.email?.split('@')[0] ?? 'Operator',
          BLUEPRINT_LIMITS.MEDIUM_MAX,
        ),
        companyName: 'HARDLOCK Export Workspace',
        uiLang: clampUiLang(prefs.uiLang, 'zh'),
        docLang: clampDocLang(prefs.docLang, 'en'),
        activeOrderId: clampStr(prefs.activeOrderId ?? '', BLUEPRINT_LIMITS.ID_MAX),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

async function upsertSubDoc(
  uid: string,
  sub: string,
  id: string,
  cleanPayload: Record<string, unknown>,
  existsInMemory: boolean,
): Promise<void> {
  const path = `users/${uid}/${sub}/${id}`;
  try {
    const ref = userSubDocRef(uid, sub, id);
    if (existsInMemory) {
      const { id: _i, ownerId: _o, ...mutableFields } = cleanPayload;
      try {
        await updateDoc(ref, { ...mutableFields, updatedAt: serverTimestamp() });
        return;
      } catch (updateErr) {
        if (!isFirestoreNotFound(updateErr)) throw updateErr;
      }
    }
    await setDoc(ref, {
      ...cleanPayload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

async function deleteSubDoc(uid: string, sub: string, id: string): Promise<void> {
  const path = `users/${uid}/${sub}/${id}`;
  try {
    await deleteDoc(userSubDocRef(uid, sub, id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export const cloudErpOps = {
  saveCustomer: (uid: string, c: Customer, isExisting: boolean) => {
    const clean = sanitizeCustomerPayload(c, uid);
    return upsertSubDoc(uid, 'customers', clean.id, clean, isExisting);
  },
  deleteCustomer: (uid: string, id: string) => deleteSubDoc(uid, 'customers', id),

  saveSupplier: (uid: string, s: Supplier, isExisting: boolean) => {
    const clean = sanitizeSupplierPayload(s, uid);
    return upsertSubDoc(uid, 'suppliers', clean.id, clean, isExisting);
  },
  deleteSupplier: (uid: string, id: string) => deleteSubDoc(uid, 'suppliers', id),

  saveLogistics: (uid: string, l: LogisticsProvider, isExisting: boolean) => {
    const clean = sanitizeLogisticsPayload(l, uid);
    return upsertSubDoc(uid, 'logisticsProviders', clean.id, clean, isExisting);
  },
  deleteLogistics: (uid: string, id: string) => deleteSubDoc(uid, 'logisticsProviders', id),

  saveBank: (uid: string, b: BankAccount, isExisting: boolean) => {
    const clean = sanitizeBankPayload(b, uid);
    return upsertSubDoc(uid, 'bankAccounts', clean.id, clean, isExisting);
  },
  deleteBank: (uid: string, id: string) => deleteSubDoc(uid, 'bankAccounts', id),

  saveProduct: (uid: string, p: Product, isExisting: boolean) => {
    const clean = sanitizeProductPayload(p, uid);
    return upsertSubDoc(uid, 'products', clean.id, clean, isExisting);
  },
  deleteProduct: (uid: string, id: string) => deleteSubDoc(uid, 'products', id),

  saveOrder: (uid: string, o: ExportOrder, isExisting: boolean) => {
    const clean = sanitizeOrderPayload(
      { ...o, updatedAt: new Date().toISOString() },
      uid,
    );
    return upsertSubDoc(uid, 'orders', clean.id, clean, isExisting);
  },
  deleteOrder: (uid: string, id: string) => deleteSubDoc(uid, 'orders', id),

  appendAuditLog: async (
    uid: string,
    entry: Omit<AuditLogEntry, 'id' | 'timestamp'>,
  ): Promise<void> => {
    const clean = sanitizeAuditLogPayload(
      {
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date().toISOString(),
        ...entry,
      },
      uid,
    );
    const path = `users/${uid}/auditLogs/${clean.id}`;
    try {
      await setDoc(userSubDocRef(uid, 'auditLogs', clean.id), {
        ...clean,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  },

  replaceWorkspaceWithPayload: async (
    uid: string,
    payload: ErpDataPayload,
    activeOrderId: string,
  ): Promise<void> => {
    const subCollections = [
      'customers',
      'suppliers',
      'logisticsProviders',
      'bankAccounts',
      'products',
      'orders',
      'auditLogs',
    ];
    try {
      // Remove existing docs across all 7 subcollections in chunks
      const deleteRefs: ReturnType<typeof userSubDocRef>[] = [];
      for (const sub of subCollections) {
        const snap = await getDocs(userSubColQuery(uid, sub));
        snap.docs.forEach((d) => deleteRefs.push(userSubDocRef(uid, sub, d.id)));
      }
      for (let i = 0; i < deleteRefs.length; i += 400) {
        const batch = writeBatch(db);
        deleteRefs.slice(i, i + 400).forEach((ref) => batch.delete(ref));
        await batch.commit();
      }

      // Write restored/reset payload
      await seedCollectionsForUser(uid, payload);

      await updateWorkspacePrefs(uid, { activeOrderId });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${uid}`);
    }
  },
};
