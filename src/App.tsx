import { useEffect, useMemo, useRef, useState } from 'react';
import { onIdTokenChanged, signOut, type User } from 'firebase/auth';
import { Loader2 } from 'lucide-react';
import { auth } from './firebase';
import { createInitialErpState } from './data/seedData';
import { UI_TEXT } from './i18n/uiTranslations';
import type {
  BankAccount,
  ContractSettings,
  Customer,
  DocLanguage,
  ErpDataPayload,
  ErpStoreState,
  ExportOrder,
  LogisticsProvider,
  NavSection,
  Product,
  Supplier,
  UiLanguage,
} from './types/erp';
import { createDefaultContractSettings } from './utils/contractDefaults';
import {
  cloudErpOps,
  ensureUserWorkspaceInitialized,
  subscribeUserWorkspace,
  updateWorkspacePrefs,
} from './utils/erpFirestoreService';
import {
  createSnapshotRecord,
  loadSnapshotsForUser,
  saveSnapshotsForUser,
  triggerJsonBackupDownload,
} from './utils/storage';
import {
  calculateItemCartons,
  calculateOrderSummary,
  calculatePalletPacking,
  formatMoney,
  getDefaultExchangeRate,
  resolveActiveOrder,
} from './utils/exportCalculations';
import { resolveCustomerProductPricing } from './utils/importExportUtils';
import { AuthScreen } from './components/AuthScreen';
import { SidebarNav } from './components/SidebarNav';
import { TopHeader } from './components/TopHeader';
import { OrderWorkspace } from './components/OrderWorkspace';
import { DocumentGenerator } from './components/DocumentGenerator';
import { MasterDataManager } from './components/MasterDataManager';
import { HistoryBackupManager } from './components/HistoryBackupManager';
import { SystemSettingsPanel } from './components/SystemSettingsPanel';

function upsertById<T extends { id: string }>(list: T[], item: T): T[] {
  const exists = list.some((entry) => entry.id === item.id);
  return exists
    ? list.map((entry) => (entry.id === item.id ? item : entry))
    : [item, ...list];
}

const PRE_AUTH_LANG_KEY = 'hardlock_erp_v3_preauth_lang';

function loadPreAuthLang(): UiLanguage {
  try {
    const val = localStorage.getItem(PRE_AUTH_LANG_KEY);
    if (val === 'zh' || val === 'ja' || val === 'en') return val;
  } catch {
    // ignore
  }
  return 'zh';
}

export default function App() {
  const [preAuthLang, setPreAuthLang] = useState<UiLanguage>(() => loadPreAuthLang());
  const [authReady, setAuthReady] = useState(false);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [, setAuthVersion] = useState(0);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [fatalError, setFatalError] = useState<Error | null>(null);

  const [state, setState] = useState<ErpStoreState>(() => ({
    ...createInitialErpState(),
    orders: [],
    customers: [],
    suppliers: [],
    logisticsProviders: [],
    bankAccounts: [],
    products: [],
    auditLogs: [],
    snapshots: [],
    contractSettings: createDefaultContractSettings(),
    activeOrderId: '',
  }));

  const [activeSection, setActiveSection] = useState<NavSection>('order');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);

  const orderFlushTimersRef = useRef<Map<string, number>>(new Map());
  const dirtyOrderIdsRef = useRef<Set<string>>(new Set());

  if (fatalError) {
    throw fatalError;
  }

  const effectiveUiLang = authUser?.emailVerified ? state.uiLang : preAuthLang;
  const t = UI_TEXT[effectiveUiLang];

  // 1. Track Firebase Auth & ID token state (captures emailVerified reloads too)
  useEffect(() => {
    const unsub = onIdTokenChanged(auth, (user) => {
      setAuthUser(user);
      setAuthVersion((v) => v + 1);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // 2. When authenticated & emailVerified, initialize workspace if first login & subscribe
  useEffect(() => {
    if (!authReady || !authUser || !authUser.emailVerified) {
      return;
    }

    let cancelled = false;
    let unsubFirestore: (() => void) | undefined;

    const uid = authUser.uid;
    setWorkspaceLoading(true);

    const localSnaps = loadSnapshotsForUser(uid);

    void ensureUserWorkspaceInitialized(authUser, preAuthLang)
      .then(() => {
        if (cancelled) return;
        unsubFirestore = subscribeUserWorkspace(
          uid,
          (cloud) => {
            if (cancelled) return;
            setState((prev) => {
              const mergedOrders = cloud.orders.map((remoteOrder) => {
                if (dirtyOrderIdsRef.current.has(remoteOrder.id)) {
                  const localMatch = prev.orders.find((o) => o.id === remoteOrder.id);
                  if (localMatch) return localMatch;
                }
                return remoteOrder;
              });

              const preferredActiveId =
                cloud.profile?.activeOrderId || prev.activeOrderId;
              const resolvedActiveId = mergedOrders.some(
                (o) => o.id === preferredActiveId,
              )
                ? preferredActiveId
                : mergedOrders[0]?.id ?? '';

              return {
                version: 3,
                exportedAt: new Date().toISOString(),
                customers: cloud.customers,
                suppliers: cloud.suppliers,
                logisticsProviders: cloud.logisticsProviders,
                bankAccounts: cloud.bankAccounts,
                products: cloud.products,
                orders: mergedOrders,
                auditLogs: cloud.auditLogs,
                activeOrderId: resolvedActiveId,
                uiLang: cloud.profile?.uiLang ?? prev.uiLang,
                docLang: cloud.profile?.docLang ?? prev.docLang,
                contractSettings:
                  cloud.profile?.contractSettings ??
                  prev.contractSettings ??
                  createDefaultContractSettings(),
                snapshots: localSnaps.length > 0 ? localSnaps : prev.snapshots,
              };
            });
            setWorkspaceLoading(false);
          },
          (err) => {
            if (!cancelled) setFatalError(err);
          },
        );
      })
      .catch((err) => {
        if (!cancelled) {
          setFatalError(err instanceof Error ? err : new Error(String(err)));
        }
      });

    return () => {
      cancelled = true;
      orderFlushTimersRef.current.forEach((timerId) =>
        window.clearTimeout(timerId),
      );
      orderFlushTimersRef.current.clear();
      dirtyOrderIdsRef.current.clear();
      unsubFirestore?.();
    };
  }, [authReady, authUser?.uid, authUser?.emailVerified]);

  useEffect(() => {
    if (!saveFeedback) return;
    const timer = window.setTimeout(() => setSaveFeedback(null), 3200);
    return () => window.clearTimeout(timer);
  }, [saveFeedback]);

  const handleChangePreAuthLang = (lang: UiLanguage) => {
    setPreAuthLang(lang);
    try {
      localStorage.setItem(PRE_AUTH_LANG_KEY, lang);
    } catch {
      // ignore
    }
  };

  const handleRefreshVerified = async () => {
    if (!auth.currentUser) return;
    await auth.currentUser.reload();
    await auth.currentUser.getIdToken(true);
    setAuthUser(auth.currentUser);
    setAuthVersion((v) => v + 1);
  };

  const activeOrder = useMemo(
    () => resolveActiveOrder(state.orders, state.activeOrderId),
    [state.orders, state.activeOrderId],
  );

  const activeCustomer = useMemo(
    () => state.customers.find((c) => c.id === activeOrder?.customerId),
    [state.customers, activeOrder],
  );

  const billToCustomer = useMemo(
    () =>
      state.customers.find((c) => c.id === activeOrder?.billToCustomerId) ??
      activeCustomer,
    [state.customers, activeOrder?.billToCustomerId, activeCustomer],
  );

  const activeSupplier = useMemo(
    () => state.suppliers.find((s) => s.id === activeOrder?.supplierId),
    [state.suppliers, activeOrder],
  );

  const activeBank = useMemo(
    () => state.bankAccounts.find((b) => b.id === activeOrder?.bankAccountId),
    [state.bankAccounts, activeOrder],
  );

  const activeLogistics = useMemo(
    () =>
      state.logisticsProviders.find(
        (l) => l.id === activeOrder?.shipping.logisticsProviderId,
      ),
    [state.logisticsProviders, activeOrder],
  );

  const masterTotalCount =
    state.customers.length +
    state.suppliers.length +
    state.logisticsProviders.length +
    state.bankAccounts.length +
    state.products.length;

  const uid = authUser?.uid ?? '';

  const persistLocalSnapshot = (nextState: ErpStoreState, reason: string) => {
    if (!uid) return;
    const snap = createSnapshotRecord(nextState, reason);
    const updatedSnaps = [snap, ...nextState.snapshots].slice(0, 10);
    saveSnapshotsForUser(uid, updatedSnaps);
    setState((prev) => ({ ...prev, snapshots: updatedSnaps }));
  };

  const handleOrderChange = (updated: ExportOrder) => {
    setState((prev) => ({
      ...prev,
      orders: prev.orders.map((o) => (o.id === updated.id ? updated : o)),
    }));
    if (!uid) return;
    dirtyOrderIdsRef.current.add(updated.id);
    const existingTimer = orderFlushTimersRef.current.get(updated.id);
    if (existingTimer) {
      window.clearTimeout(existingTimer);
    }
    const nextTimer = window.setTimeout(() => {
      orderFlushTimersRef.current.delete(updated.id);
      dirtyOrderIdsRef.current.delete(updated.id);
      void cloudErpOps.saveOrder(uid, updated, true).catch(setFatalError);
    }, 650);
    orderFlushTimersRef.current.set(updated.id, nextTimer);
  };

  const handleExplicitSaveOrder = async () => {
    if (!activeOrder || !uid) return;
    const existingTimer = orderFlushTimersRef.current.get(activeOrder.id);
    if (existingTimer) {
      window.clearTimeout(existingTimer);
      orderFlushTimersRef.current.delete(activeOrder.id);
    }
    dirtyOrderIdsRef.current.delete(activeOrder.id);

    const summary = calculateOrderSummary(
      activeOrder.items,
      activeOrder.costs,
      activeOrder.shipping.incoterm,
      activeOrder.currency,
      activeOrder.palletCount ?? 0,
    );
    const totalLabel = formatMoney(summary.incotermTotal, activeOrder.currency);

    try {
      await cloudErpOps.saveOrder(uid, activeOrder, true);
      await cloudErpOps.appendAuditLog(uid, {
        action: 'UPDATE_ORDER',
        targetLabel: activeOrder.invoiceNo,
        summary: `${activeOrder.shipping.mode} · ${activeOrder.shipping.incoterm} · ${totalLabel}`,
      });
      persistLocalSnapshot(
        state,
        `Saved ${activeOrder.invoiceNo} (${activeOrder.shipping.incoterm})`,
      );
      setSaveFeedback(t.savedToast);
    } catch (err) {
      setFatalError(err instanceof Error ? err : new Error(String(err)));
    }
  };

  const handleCreateNewOrder = async () => {
    if (!uid) return;
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const seq = 1110 + state.orders.length;
    const cust = state.customers[0];
    const sup = state.suppliers[0];
    const log = state.logisticsProviders[0];
    const bank = state.bankAccounts[0];
    const prod = state.products[0];

    const orderCurrency = cust?.defaultCurrency ?? 'JPY';
    const orderExchangeRate = getDefaultExchangeRate(orderCurrency);
    const initialQty = prod ? prod.defaultUnitsPerCarton || 100 : 0;
    const initialCartons = prod
      ? calculateItemCartons(initialQty, prod.defaultUnitsPerCarton || 100)
      : 0;
    const initialPacking = calculatePalletPacking(initialCartons, {
      cartonsPerLayer: 12,
    });
    const resolvedPrice = prod
      ? resolveCustomerProductPricing(
          cust,
          prod,
          initialQty,
          orderCurrency,
          orderExchangeRate,
        )
      : { unitPrice: 0, basePriceJpy: 0 };

    const newOrder: ExportOrder = {
      id: `ord-${Date.now()}`,
      invoiceNo: `HL-INV-${now.getFullYear()}-${seq}`,
      poNo: `PO-${seq}`,
      orderDate: dateStr,
      paymentTerms: 'T/T IN ADVANCE',
      currency: orderCurrency,
      exchangeRate: orderExchangeRate,
      supplierId: sup?.id ?? '',
      customerId: cust?.id ?? '',
      billToCustomerId: '',
      bankAccountId: bank?.id ?? '',
      itemHeader: 'HARDLOCK NUT (HLN)',
      palletCount: initialPacking.palletCount,
      emptyCartons: initialPacking.emptyCartons,
      cartonsPerLayer: 12,
      palletVolumeDetails: '',
      surfaceFootnotes: '',
      packingRows: [],
      items: prod
        ? [
            {
              id: `oi-${Date.now()}`,
              productId: prod.id,
              sku: prod.sku,
              description: prod.nameEn,
              size: prod.size ?? '',
              material: prod.material ?? '',
              surfaceFinish: prod.surfaceFinish ?? '',
              hsCode: prod.hsCode,
              quantity: initialQty,
              unit: prod.unit,
              unitPrice: resolvedPrice.unitPrice,
              baseUnitPriceJpy: resolvedPrice.basePriceJpy,
              cartons: initialCartons,
              unitNetWeightKg: prod.unitNetWeightKg,
              unitGrossWeightKg: prod.unitGrossWeightKg,
              cartonLengthCm: prod.cartonLengthCm,
              cartonWidthCm: prod.cartonWidthCm,
              cartonHeightCm: prod.cartonHeightCm,
              originCountry: prod.originCountry,
              palletNo: '1',
              cartonRange: initialCartons > 1 ? `1 - ${initialCartons}` : '1',
              setsPerCarton: prod.defaultUnitsPerCarton,
            },
          ]
        : [],
      shipping: {
        mode: log?.supportedModes[0] ?? 'SEA',
        logisticsProviderId: log?.id ?? '',
        incoterm: cust?.defaultIncoterm ?? 'FOB',
        incotermPlace: cust?.country ?? 'OSAKA',
        portOfLoading: log?.defaultPortOrHub ?? 'OSAKA PORT, JAPAN',
        portOfDischarge: cust?.country ?? '',
        vesselOrFlightOrCourier: '',
        trackingOrBlNo: '',
        etd: dateStr,
        eta: dateStr,
        shippingMarksMain: cust
          ? `${cust.name.split(' ')[0].toUpperCase()} / ${cust.country}`
          : 'HARDLOCK',
        caseNumberPrefix: 'HL',
      },
      costs: {
        packingHandlingCost: 0,
        inlandFreightCost: 0,
        mainFreightCost: 0,
        insuranceMode: 'MANUAL',
        insuranceManualCost: 0,
        insuranceRatePercent: 0.5,
        destinationHandlingCost: 0,
        importDutyTaxCost: 0,
      },
      remarks: '',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    setState((prev) => ({
      ...prev,
      orders: [newOrder, ...prev.orders],
      activeOrderId: newOrder.id,
    }));
    setActiveSection('order');

    try {
      await cloudErpOps.saveOrder(uid, newOrder, false);
      await updateWorkspacePrefs(uid, { activeOrderId: newOrder.id });
      await cloudErpOps.appendAuditLog(uid, {
        action: 'CREATE_ORDER',
        targetLabel: newOrder.invoiceNo,
        summary: `Created new ${newOrder.shipping.incoterm} order`,
      });
    } catch (err) {
      setFatalError(err instanceof Error ? err : new Error(String(err)));
    }
  };

  const handleDuplicateOrder = async () => {
    if (!activeOrder || !uid) return;
    const now = new Date();
    const copyOrder: ExportOrder = {
      ...activeOrder,
      id: `ord-${Date.now()}`,
      invoiceNo: `${activeOrder.invoiceNo}-COPY`,
      orderDate: now.toISOString().slice(0, 10),
      items: activeOrder.items.map((item, idx) => ({
        ...item,
        id: `oi-${Date.now()}-${idx}`,
      })),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    setState((prev) => ({
      ...prev,
      orders: [copyOrder, ...prev.orders],
      activeOrderId: copyOrder.id,
    }));

    try {
      await cloudErpOps.saveOrder(uid, copyOrder, false);
      await updateWorkspacePrefs(uid, { activeOrderId: copyOrder.id });
      await cloudErpOps.appendAuditLog(uid, {
        action: 'DUPLICATE_ORDER',
        targetLabel: copyOrder.invoiceNo,
        summary: `Duplicated from ${activeOrder.invoiceNo}`,
      });
      setSaveFeedback(t.savedToast);
    } catch (err) {
      setFatalError(err instanceof Error ? err : new Error(String(err)));
    }
  };

  const handleHeaderPrintAction = () => {
    if (activeSection === 'documents') {
      window.print();
    } else {
      setActiveSection('documents');
    }
  };

  // Master Data handlers
  const handleSaveCustomer = (customer: Customer) => {
    if (!uid) return;
    const isExisting = state.customers.some((c) => c.id === customer.id);
    setState((prev) => ({
      ...prev,
      customers: upsertById(prev.customers, customer),
    }));
    void cloudErpOps
      .saveCustomer(uid, customer, isExisting)
      .then(() =>
        cloudErpOps.appendAuditLog(uid, {
          action: 'MASTER_UPDATE',
          targetLabel: customer.code,
          summary: `Saved customer ${customer.name}`,
        }),
      )
      .catch(setFatalError);
  };

  const handleDeleteCustomer = (id: string) => {
    if (!uid) return;
    setState((prev) => ({
      ...prev,
      customers: prev.customers.filter((c) => c.id !== id),
    }));
    void cloudErpOps.deleteCustomer(uid, id).catch(setFatalError);
  };

  const handleSaveSupplier = (supplier: Supplier) => {
    if (!uid) return;
    const isExisting = state.suppliers.some((s) => s.id === supplier.id);
    setState((prev) => ({
      ...prev,
      suppliers: upsertById(prev.suppliers, supplier),
    }));
    void cloudErpOps
      .saveSupplier(uid, supplier, isExisting)
      .then(() =>
        cloudErpOps.appendAuditLog(uid, {
          action: 'MASTER_UPDATE',
          targetLabel: supplier.code,
          summary: `Saved shipper ${supplier.name}`,
        }),
      )
      .catch(setFatalError);
  };

  const handleDeleteSupplier = (id: string) => {
    if (!uid) return;
    setState((prev) => ({
      ...prev,
      suppliers: prev.suppliers.filter((s) => s.id !== id),
    }));
    void cloudErpOps.deleteSupplier(uid, id).catch(setFatalError);
  };

  const handleSaveLogistics = (provider: LogisticsProvider) => {
    if (!uid) return;
    const isExisting = state.logisticsProviders.some((l) => l.id === provider.id);
    setState((prev) => ({
      ...prev,
      logisticsProviders: upsertById(prev.logisticsProviders, provider),
    }));
    void cloudErpOps
      .saveLogistics(uid, provider, isExisting)
      .then(() =>
        cloudErpOps.appendAuditLog(uid, {
          action: 'MASTER_UPDATE',
          targetLabel: provider.code,
          summary: `Saved logistics provider ${provider.name}`,
        }),
      )
      .catch(setFatalError);
  };

  const handleDeleteLogistics = (id: string) => {
    if (!uid) return;
    setState((prev) => ({
      ...prev,
      logisticsProviders: prev.logisticsProviders.filter((l) => l.id !== id),
    }));
    void cloudErpOps.deleteLogistics(uid, id).catch(setFatalError);
  };

  const handleSaveBank = (bank: BankAccount) => {
    if (!uid) return;
    const isExisting = state.bankAccounts.some((b) => b.id === bank.id);
    setState((prev) => ({
      ...prev,
      bankAccounts: upsertById(prev.bankAccounts, bank),
    }));
    void cloudErpOps
      .saveBank(uid, bank, isExisting)
      .then(() =>
        cloudErpOps.appendAuditLog(uid, {
          action: 'MASTER_UPDATE',
          targetLabel: bank.swiftCode || bank.label,
          summary: `Saved bank account ${bank.label}`,
        }),
      )
      .catch(setFatalError);
  };

  const handleDeleteBank = (id: string) => {
    if (!uid) return;
    setState((prev) => ({
      ...prev,
      bankAccounts: prev.bankAccounts.filter((b) => b.id !== id),
    }));
    void cloudErpOps.deleteBank(uid, id).catch(setFatalError);
  };

  const handleSaveProduct = (product: Product) => {
    if (!uid) return;
    const isExisting = state.products.some((p) => p.id === product.id);
    setState((prev) => ({
      ...prev,
      products: upsertById(prev.products, product),
    }));
    void cloudErpOps
      .saveProduct(uid, product, isExisting)
      .then(() =>
        cloudErpOps.appendAuditLog(uid, {
          action: 'MASTER_UPDATE',
          targetLabel: product.sku,
          summary: `Saved product ${product.nameEn}`,
        }),
      )
      .catch(setFatalError);
  };

  const handleBatchImportProducts = async (imported: Product[]) => {
    if (!uid || imported.length === 0) return;
    const existingIds = new Set(state.products.map((p) => p.id));
    setState((prev) => {
      let nextProducts = [...prev.products];
      for (const item of imported) {
        nextProducts = upsertById(nextProducts, item);
      }
      return {
        ...prev,
        products: nextProducts,
      };
    });
    try {
      await cloudErpOps.batchSaveProducts(uid, imported, existingIds);
      await cloudErpOps.appendAuditLog(uid, {
        action: 'MASTER_UPDATE',
        targetLabel: 'BATCH_IMPORT_PRODUCTS',
        summary: `Batch imported ${imported.length} products`,
      });
    } catch (err) {
      setFatalError(err instanceof Error ? err : new Error(String(err)));
    }
  };

  const handleDeleteProduct = (id: string) => {
    if (!uid) return;
    setState((prev) => ({
      ...prev,
      products: prev.products.filter((p) => p.id !== id),
    }));
    void cloudErpOps.deleteProduct(uid, id).catch(setFatalError);
  };

  // History & Backup handlers
  const handleDeleteOrder = (orderId: string) => {
    if (!uid) return;
    const target = state.orders.find((o) => o.id === orderId);
    const remaining = state.orders.filter((o) => o.id !== orderId);
    const nextActive =
      state.activeOrderId === orderId
        ? remaining[0]?.id ?? ''
        : state.activeOrderId;

    setState((prev) => ({
      ...prev,
      orders: remaining,
      activeOrderId: nextActive,
    }));

    void cloudErpOps
      .deleteOrder(uid, orderId)
      .then(() => updateWorkspacePrefs(uid, { activeOrderId: nextActive }))
      .then(() =>
        cloudErpOps.appendAuditLog(uid, {
          action: 'DELETE_ORDER',
          targetLabel: target?.invoiceNo ?? orderId,
          summary: 'Deleted order from history',
        }),
      )
      .catch(setFatalError);
  };

  const handleImportBackup = async (payload: ErpDataPayload) => {
    if (!uid) return;
    const nextActive = payload.orders[0]?.id ?? state.activeOrderId;
    try {
      await cloudErpOps.replaceWorkspaceWithPayload(uid, payload, nextActive);
      await cloudErpOps.appendAuditLog(uid, {
        action: 'RESTORE_BACKUP',
        targetLabel: 'JSON_BACKUP',
        summary: `Restored ${payload.orders.length} orders and ${payload.customers.length} customers`,
      });
      persistLocalSnapshot(
        { ...state, ...payload, activeOrderId: nextActive },
        'Restored from JSON Backup',
      );
    } catch (err) {
      setFatalError(err instanceof Error ? err : new Error(String(err)));
    }
  };

  const handleRestoreSnapshot = async (snapshotId: string) => {
    if (!uid) return;
    const snap = state.snapshots.find((s) => s.id === snapshotId);
    if (!snap) return;
    const nextActive = snap.payload.orders[0]?.id ?? state.activeOrderId;
    try {
      await cloudErpOps.replaceWorkspaceWithPayload(uid, snap.payload, nextActive);
      await cloudErpOps.appendAuditLog(uid, {
        action: 'RESTORE_BACKUP',
        targetLabel: 'SNAPSHOT',
        summary: `Restored snapshot: ${snap.reason}`,
      });
    } catch (err) {
      setFatalError(err instanceof Error ? err : new Error(String(err)));
    }
  };

  const handleCreateSnapshotNow = () => {
    if (!uid) return;
    persistLocalSnapshot(state, 'Manual Backup Snapshot');
    void cloudErpOps
      .appendAuditLog(uid, {
        action: 'RESTORE_BACKUP',
        targetLabel: 'MANUAL_SNAPSHOT',
        summary: `Manual snapshot (${state.orders.length} orders)`,
      })
      .catch(setFatalError);
  };

  const handleResetDemo = async () => {
    if (!uid) return;
    const fresh = createInitialErpState();
    try {
      await cloudErpOps.replaceWorkspaceWithPayload(uid, fresh, fresh.activeOrderId);
      setActiveSection('order');
    } catch (err) {
      setFatalError(err instanceof Error ? err : new Error(String(err)));
    }
  };

  const handleChangeUiLang = (uiLang: UiLanguage) => {
    setState((prev) => ({ ...prev, uiLang }));
    handleChangePreAuthLang(uiLang);
    if (uid) {
      void updateWorkspacePrefs(uid, { uiLang }).catch(setFatalError);
    }
  };

  const handleChangeDocLang = (docLang: DocLanguage) => {
    setState((prev) => ({ ...prev, docLang }));
    if (uid) {
      void updateWorkspacePrefs(uid, { docLang }).catch(setFatalError);
    }
  };

  const handleSaveContractSettings = async (
    contractSettings: ContractSettings,
  ) => {
    setState((prev) => ({ ...prev, contractSettings }));
    if (uid) {
      try {
        await updateWorkspacePrefs(uid, { contractSettings });
        await cloudErpOps.appendAuditLog(uid, {
          action: 'MASTER_UPDATE',
          targetLabel: 'CONTRACT_SETTINGS',
          summary: 'Updated default contract clauses & document settings',
        });
      } catch (err) {
        setFatalError(err instanceof Error ? err : new Error(String(err)));
      }
    }
  };

  const handleSignOut = async () => {
    orderFlushTimersRef.current.forEach((timerId) =>
      window.clearTimeout(timerId),
    );
    orderFlushTimersRef.current.clear();
    dirtyOrderIdsRef.current.clear();
    await signOut(auth);
  };

  // Auth loading state
  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
        <div className="flex items-center gap-2.5 text-sm font-medium text-slate-600">
          <Loader2 className="w-4 h-4 animate-spin text-blue-700" />
          <span>{t.authWorkspaceLoading}</span>
        </div>
      </div>
    );
  }

  // Unauthenticated or unverified user -> AuthScreen gate
  if (!authUser || !authUser.emailVerified) {
    return (
      <AuthScreen
        uiLang={preAuthLang}
        onChangeUiLang={handleChangePreAuthLang}
        pendingVerifyUser={authUser && !authUser.emailVerified ? authUser : null}
        onVerifiedRefresh={handleRefreshVerified}
      />
    );
  }

  // Cloud workspace syncing spinner
  if (workspaceLoading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-lg px-6 py-5 flex items-center gap-3 shadow-xs">
          <Loader2 className="w-5 h-5 animate-spin text-blue-700" />
          <div className="text-sm font-medium text-slate-700">
            {t.authWorkspaceLoading}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      <SidebarNav
        activeSection={activeSection}
        onSelectSection={setActiveSection}
        uiLang={state.uiLang}
        onChangeUiLang={handleChangeUiLang}
        docLang={state.docLang}
        onChangeDocLang={handleChangeDocLang}
        t={t}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
        ordersCount={state.orders.length}
        masterCount={masterTotalCount}
        userEmail={authUser.email ?? ''}
        userDisplayName={authUser.displayName ?? ''}
        onSignOut={handleSignOut}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <TopHeader
          activeSection={activeSection}
          activeInvoiceNo={activeOrder?.invoiceNo ?? ''}
          hasActiveOrder={Boolean(activeOrder)}
          onOpenMobileNav={() => setMobileNavOpen(true)}
          onCreateNewOrder={handleCreateNewOrder}
          onSaveOrder={handleExplicitSaveOrder}
          onGoToPrint={handleHeaderPrintAction}
          t={t}
          saveFeedback={saveFeedback}
        />

        <main className="flex-1 p-4 md:p-6 lg:p-8 max-w-[1400px] w-full mx-auto">
          {activeSection === 'order' && (
            <OrderWorkspace
              order={activeOrder}
              customers={state.customers}
              suppliers={state.suppliers}
              logisticsProviders={state.logisticsProviders}
              bankAccounts={state.bankAccounts}
              products={state.products}
              onChangeOrder={handleOrderChange}
              onCreateNewOrder={handleCreateNewOrder}
              onDuplicateOrder={handleDuplicateOrder}
              onOpenDocuments={() => setActiveSection('documents')}
              onOpenHistory={() => setActiveSection('history')}
              t={t}
            />
          )}

          {activeSection === 'documents' && (
            <DocumentGenerator
              order={activeOrder}
              customer={activeCustomer}
              billToCustomer={billToCustomer}
              supplier={activeSupplier}
              bank={activeBank}
              logistics={activeLogistics}
              products={state.products}
              docLang={state.docLang}
              contractSettings={state.contractSettings}
              onChangeOrder={handleOrderChange}
              onChangeDocLang={handleChangeDocLang}
              onCreateNewOrder={handleCreateNewOrder}
              t={t}
            />
          )}

          {activeSection === 'master' && (
            <MasterDataManager
              customers={state.customers}
              suppliers={state.suppliers}
              logisticsProviders={state.logisticsProviders}
              bankAccounts={state.bankAccounts}
              products={state.products}
              onSaveCustomer={handleSaveCustomer}
              onDeleteCustomer={handleDeleteCustomer}
              onSaveSupplier={handleSaveSupplier}
              onDeleteSupplier={handleDeleteSupplier}
              onSaveLogistics={handleSaveLogistics}
              onDeleteLogistics={handleDeleteLogistics}
              onSaveBank={handleSaveBank}
              onDeleteBank={handleDeleteBank}
              onSaveProduct={handleSaveProduct}
              onBatchImportProducts={handleBatchImportProducts}
              onDeleteProduct={handleDeleteProduct}
              t={t}
            />
          )}

          {activeSection === 'history' && (
            <HistoryBackupManager
              orders={state.orders}
              activeOrderId={state.activeOrderId}
              customers={state.customers}
              suppliers={state.suppliers}
              bankAccounts={state.bankAccounts}
              products={state.products}
              docLang={state.docLang}
              contractSettings={state.contractSettings}
              auditLogs={state.auditLogs}
              snapshots={state.snapshots}
              onLoadOrder={(id) => {
                setState((prev) => ({ ...prev, activeOrderId: id }));
                setActiveSection('order');
                if (uid) {
                  void updateWorkspacePrefs(uid, { activeOrderId: id }).catch(
                    setFatalError,
                  );
                }
              }}
              onDeleteOrder={handleDeleteOrder}
              onExportBackup={() => triggerJsonBackupDownload(state)}
              onImportBackup={handleImportBackup}
              onCreateSnapshot={handleCreateSnapshotNow}
              onRestoreSnapshot={handleRestoreSnapshot}
              onResetDemo={handleResetDemo}
              t={t}
            />
          )}

          {activeSection === 'settings' && (
            <SystemSettingsPanel
              settings={
                state.contractSettings ?? createDefaultContractSettings()
              }
              onSaveSettings={handleSaveContractSettings}
              t={t}
            />
          )}
        </main>
      </div>
    </div>
  );
}
