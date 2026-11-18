import React, { useMemo, useRef, useState } from 'react';
import {
  Download,
  FileSpreadsheet,
  Pencil,
  Plus,
  Search,
  Tag,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type {
  BankAccount,
  CurrencyCode,
  Customer,
  CustomerProductPrice,
  IncotermCode,
  LogisticsProvider,
  MasterTab,
  Product,
  Supplier,
  TransportMode,
} from '../types/erp';
import type { UiDictionary } from '../i18n/uiTranslations';
import { formatMoney } from '../utils/exportCalculations';
import {
  parseProductImportFile,
  triggerProductTemplateDownload,
  type ProductImportResult,
} from '../utils/importExportUtils';

interface MasterDataManagerProps {
  customers: Customer[];
  suppliers: Supplier[];
  logisticsProviders: LogisticsProvider[];
  bankAccounts: BankAccount[];
  products: Product[];
  onSaveCustomer: (customer: Customer) => void;
  onDeleteCustomer: (id: string) => void;
  onSaveSupplier: (supplier: Supplier) => void;
  onDeleteSupplier: (id: string) => void;
  onSaveLogistics: (provider: LogisticsProvider) => void;
  onDeleteLogistics: (id: string) => void;
  onSaveBank: (bank: BankAccount) => void;
  onDeleteBank: (id: string) => void;
  onSaveProduct: (product: Product) => void;
  onBatchImportProducts?: (products: Product[]) => Promise<void> | void;
  onDeleteProduct: (id: string) => void;
  initialTab?: MasterTab;
  t: UiDictionary;
}

export const MasterDataManager: React.FC<MasterDataManagerProps> = ({
  customers,
  suppliers,
  logisticsProviders,
  bankAccounts,
  products,
  onSaveCustomer,
  onDeleteCustomer,
  onSaveSupplier,
  onDeleteSupplier,
  onSaveLogistics,
  onDeleteLogistics,
  onSaveBank,
  onDeleteBank,
  onSaveProduct,
  onBatchImportProducts,
  onDeleteProduct,
  initialTab = 'customers',
  t,
}) => {
  const [activeTab, setActiveTab] = useState<MasterTab>(initialTab);
  const [search, setSearch] = useState('');

  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [customPriceProductId, setCustomPriceProductId] = useState<string>('');
  const [customPriceValue, setCustomPriceValue] = useState<number>(0);

  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [editingLogistics, setEditingLogistics] =
    useState<LogisticsProvider | null>(null);
  const [editingBank, setEditingBank] = useState<BankAccount | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const importFileRef = useRef<HTMLInputElement | null>(null);
  const [importPreview, setImportPreview] = useState<ProductImportResult | null>(
    null,
  );
  const [importSubmitting, setImportSubmitting] = useState(false);
  const [importToast, setImportToast] = useState<string | null>(null);

  const tabs: { id: MasterTab; label: string; count: number }[] = [
    { id: 'customers', label: t.masterCustomers, count: customers.length },
    { id: 'suppliers', label: t.masterSuppliers, count: suppliers.length },
    {
      id: 'logistics',
      label: t.masterLogistics,
      count: logisticsProviders.length,
    },
    { id: 'banks', label: t.masterBanks, count: bankAccounts.length },
    { id: 'products', label: t.masterProducts, count: products.length },
  ];

  const q = search.trim().toLowerCase();

  const filteredCustomers = useMemo(
    () =>
      customers.filter(
        (c) =>
          !q ||
          c.name.toLowerCase().includes(q) ||
          c.code.toLowerCase().includes(q) ||
          c.country.toLowerCase().includes(q),
      ),
    [customers, q],
  );

  const filteredSuppliers = useMemo(
    () =>
      suppliers.filter(
        (s) =>
          !q ||
          s.name.toLowerCase().includes(q) ||
          s.code.toLowerCase().includes(q) ||
          s.country.toLowerCase().includes(q),
      ),
    [suppliers, q],
  );

  const filteredLogistics = useMemo(
    () =>
      logisticsProviders.filter(
        (l) =>
          !q ||
          l.name.toLowerCase().includes(q) ||
          l.code.toLowerCase().includes(q) ||
          l.supportedModes.join(' ').toLowerCase().includes(q),
      ),
    [logisticsProviders, q],
  );

  const filteredBanks = useMemo(
    () =>
      bankAccounts.filter(
        (b) =>
          !q ||
          b.label.toLowerCase().includes(q) ||
          b.bankName.toLowerCase().includes(q) ||
          b.swiftCode.toLowerCase().includes(q),
      ),
    [bankAccounts, q],
  );

  const filteredProducts = useMemo(
    () =>
      products.filter(
        (p) =>
          !q ||
          p.sku.toLowerCase().includes(q) ||
          p.nameEn.toLowerCase().includes(q) ||
          p.hsCode.toLowerCase().includes(q),
      ),
    [products, q],
  );

  const openCustomerModal = (cust: Customer) => {
    const firstProd = products[0];
    const existingForFirst = (cust.customPrices ?? []).find(
      (cp) => cp.productId === firstProd?.id,
    );
    setCustomPriceProductId(firstProd?.id ?? '');
    setCustomPriceValue(
      existingForFirst?.unitPrice ?? firstProd?.unitPrice ?? 0,
    );
    setEditingCustomer({
      ...cust,
      customPrices: Array.isArray(cust.customPrices) ? cust.customPrices : [],
    });
  };

  const handleOpenCreate = () => {
    const uid = `${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    if (activeTab === 'customers') {
      openCustomerModal({
        id: `cust-${uid}`,
        code: `CUST-${customers.length + 1}`,
        name: '',
        country: '',
        address: '',
        contactName: '',
        email: '',
        phone: '',
        defaultCurrency: 'USD',
        defaultIncoterm: 'FOB',
        notifyParty: '',
        customPrices: [],
      });
    } else if (activeTab === 'suppliers') {
      setEditingSupplier({
        id: `sup-${uid}`,
        code: `SUP-${suppliers.length + 1}`,
        name: '',
        country: 'JAPAN',
        address: '',
        contactName: '',
        email: '',
        phone: '',
        fax: '',
        taxOrExporterId: '',
        signatoryName: '',
        signatoryTitle: 'Export Manager',
      });
    } else if (activeTab === 'logistics') {
      setEditingLogistics({
        id: `log-${uid}`,
        code: `LOG-${logisticsProviders.length + 1}`,
        name: '',
        supportedModes: ['EXPRESS'],
        contactName: '',
        phone: '',
        email: '',
        accountNo: '',
        defaultPortOrHub: '',
      });
    } else if (activeTab === 'banks') {
      setEditingBank({
        id: `bank-${uid}`,
        label: '',
        bankName: '',
        branchName: '',
        swiftCode: '',
        accountName: '',
        accountNumber: '',
        currency: 'USD',
        bankAddress: '',
      });
    } else if (activeTab === 'products') {
      setEditingProduct({
        id: `prod-${uid}`,
        sku: '',
        nameEn: '',
        nameLocal: '',
        size: '',
        material: '',
        surfaceFinish: '',
        hsCode: '7318.16.00',
        unit: 'SETS',
        unitPrice: 1,
        currency: 'USD',
        unitNetWeightKg: 0.05,
        unitGrossWeightKg: 0.055,
        defaultUnitsPerCarton: 100,
        cartonLengthCm: 33,
        cartonWidthCm: 25,
        cartonHeightCm: 12,
        originCountry: 'JAPAN',
      });
    }
  };

  const handleImportFileSelected = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const result = await parseProductImportFile(file, products);
      setImportPreview(result);
      setImportToast(null);
    } finally {
      e.target.value = '';
    }
  };

  const handleConfirmImport = async () => {
    if (!importPreview || importPreview.products.length === 0) return;
    setImportSubmitting(true);
    try {
      if (onBatchImportProducts) {
        await onBatchImportProducts(importPreview.products);
      } else {
        importPreview.products.forEach((p) => onSaveProduct(p));
      }
      setImportToast(
        t.importSuccessToast.replace(
          '{count}',
          String(importPreview.products.length),
        ),
      );
      setImportPreview(null);
    } finally {
      setImportSubmitting(false);
    }
  };

  const handleUpsertCustomerCustomPrice = () => {
    if (!editingCustomer || !customPriceProductId) return;
    const price = Math.max(0, Number(customPriceValue) || 0);
    const current = editingCustomer.customPrices ?? [];
    const exists = current.some((cp) => cp.productId === customPriceProductId);
    const next: CustomerProductPrice[] = exists
      ? current.map((cp) =>
          cp.productId === customPriceProductId
            ? { ...cp, unitPrice: price }
            : cp,
        )
      : [...current, { productId: customPriceProductId, unitPrice: price }];
    setEditingCustomer({ ...editingCustomer, customPrices: next });
  };

  const handleRemoveCustomerCustomPrice = (productId: string) => {
    if (!editingCustomer) return;
    setEditingCustomer({
      ...editingCustomer,
      customPrices: (editingCustomer.customPrices ?? []).filter(
        (cp) => cp.productId !== productId,
      ),
    });
  };

  return (
    <div className="space-y-5">
      {/* Header + Search + Add */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            {t.navMaster}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">{t.orderPartiesTitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              aria-label={t.searchPlaceholder}
              placeholder={t.searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-8 pr-3 w-56 sm:w-64 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          {activeTab === 'products' && (
            <>
              <button
                type="button"
                onClick={triggerProductTemplateDownload}
                className="inline-flex items-center gap-1.5 h-9 px-3 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{t.btnDownloadTemplate}</span>
              </button>

              <input
                ref={importFileRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleImportFileSelected}
                className="sr-only"
                aria-label={t.btnImportProducts}
              />
              <button
                type="button"
                onClick={() => importFileRef.current?.click()}
                className="inline-flex items-center gap-1.5 h-9 px-3 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md hover:bg-emerald-100 transition-colors whitespace-nowrap"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{t.btnImportProducts}</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 text-xs font-semibold text-white bg-blue-700 rounded-md hover:bg-blue-800 transition-colors whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t.btnAddRecord}</span>
          </button>
        </div>
      </div>

      {importToast && activeTab === 'products' && (
        <div
          role="status"
          className="px-3.5 py-2.5 text-xs font-medium bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-md flex items-center justify-between gap-2"
        >
          <span>{importToast}</span>
          <button
            type="button"
            onClick={() => setImportToast(null)}
            aria-label="Dismiss import notice"
            className="text-emerald-700 hover:text-emerald-900"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Category Tabs */}
      <div
        role="tablist"
        aria-label={t.navMaster}
        className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-md w-fit"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {tab.label}{' '}
            <span className="font-mono-tabular text-slate-400 ml-1">
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Data Tables */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          {activeTab === 'customers' && (
            <table className="w-full text-left border-collapse min-w-[780px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-2.5 px-4">{t.colCode}</th>
                  <th className="py-2.5 px-4">{t.colCustomerName}</th>
                  <th className="py-2.5 px-4">{t.colCountry}</th>
                  <th className="py-2.5 px-4">{t.colContact}</th>
                  <th className="py-2.5 px-4">{t.colDefaults}</th>
                  <th className="py-2.5 px-4 text-right">{t.colActions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredCustomers.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-mono-tabular font-semibold text-slate-700">
                      {c.code}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{c.name}</div>
                      <div className="text-slate-500 truncate max-w-xs">
                        {c.address}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-700">{c.country}</td>
                    <td className="py-3 px-4 text-slate-600">
                      <div>{c.contactName}</div>
                      <div className="text-slate-400">{c.email}</div>
                    </td>
                    <td className="py-3 px-4 font-mono-tabular text-slate-700">
                      <div>
                        {c.defaultIncoterm} · {c.defaultCurrency}
                      </div>
                      {(c.customPrices?.length ?? 0) > 0 && (
                        <div className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200 rounded">
                          <Tag className="w-3 h-3" />
                          <span>
                            {c.customPrices!.length} {t.customPricingBadge}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <ActionButtons
                        label={c.name}
                        onEdit={() => openCustomerModal(c)}
                        onDelete={() => onDeleteCustomer(c.id)}
                        disableDelete={customers.length <= 1}
                        editText={t.btnEdit}
                        deleteText={t.btnDelete}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeTab === 'suppliers' && (
            <table className="w-full text-left border-collapse min-w-[780px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-2.5 px-4">{t.colCode}</th>
                  <th className="py-2.5 px-4">{t.colShipperName}</th>
                  <th className="py-2.5 px-4">{t.colCountry}</th>
                  <th className="py-2.5 px-4">{t.colExporterId}</th>
                  <th className="py-2.5 px-4">{t.colSignatory}</th>
                  <th className="py-2.5 px-4 text-right">{t.colActions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredSuppliers.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-mono-tabular font-semibold">
                      {s.code}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{s.name}</div>
                      <div className="text-slate-500 truncate max-w-xs">
                        {s.address}
                      </div>
                    </td>
                    <td className="py-3 px-4">{s.country}</td>
                    <td className="py-3 px-4 font-mono-tabular">
                      {s.taxOrExporterId}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {s.signatoryName} · {s.signatoryTitle}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <ActionButtons
                        label={s.name}
                        onEdit={() => setEditingSupplier(s)}
                        onDelete={() => onDeleteSupplier(s.id)}
                        disableDelete={suppliers.length <= 1}
                        editText={t.btnEdit}
                        deleteText={t.btnDelete}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeTab === 'logistics' && (
            <table className="w-full text-left border-collapse min-w-[780px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-2.5 px-4">{t.colCode}</th>
                  <th className="py-2.5 px-4">{t.colLogisticsName}</th>
                  <th className="py-2.5 px-4">{t.colSupportedModes}</th>
                  <th className="py-2.5 px-4">{t.colDefaultHub}</th>
                  <th className="py-2.5 px-4">{t.colAccountContact}</th>
                  <th className="py-2.5 px-4 text-right">{t.colActions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredLogistics.map((lp) => (
                  <tr key={lp.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-mono-tabular font-semibold">
                      {lp.code}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      {lp.name}
                    </td>
                    <td className="py-3 px-4 font-mono-tabular text-slate-700">
                      {lp.supportedModes.join(' · ')}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {lp.defaultPortOrHub || '—'}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      <div>{lp.accountNo || '—'}</div>
                      <div className="text-slate-400">{lp.phone}</div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <ActionButtons
                        label={lp.name}
                        onEdit={() => setEditingLogistics(lp)}
                        onDelete={() => onDeleteLogistics(lp.id)}
                        disableDelete={logisticsProviders.length <= 1}
                        editText={t.btnEdit}
                        deleteText={t.btnDelete}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeTab === 'banks' && (
            <table className="w-full text-left border-collapse min-w-[780px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-2.5 px-4">{t.colBankLabel}</th>
                  <th className="py-2.5 px-4">{t.colBankBranch}</th>
                  <th className="py-2.5 px-4">{t.colSwift}</th>
                  <th className="py-2.5 px-4">{t.colAccountNo}</th>
                  <th className="py-2.5 px-4">{t.currency}</th>
                  <th className="py-2.5 px-4 text-right">{t.colActions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredBanks.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      {b.label}
                    </td>
                    <td className="py-3 px-4 text-slate-700">
                      <div>{b.bankName}</div>
                      <div className="text-slate-400">{b.branchName}</div>
                    </td>
                    <td className="py-3 px-4 font-mono-tabular">{b.swiftCode}</td>
                    <td className="py-3 px-4 font-mono-tabular">
                      {b.accountNumber}
                    </td>
                    <td className="py-3 px-4 font-mono-tabular font-semibold">
                      {b.currency}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <ActionButtons
                        label={b.label}
                        onEdit={() => setEditingBank(b)}
                        onDelete={() => onDeleteBank(b.id)}
                        disableDelete={bankAccounts.length <= 1}
                        editText={t.btnEdit}
                        deleteText={t.btnDelete}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeTab === 'products' && (
            <table className="w-full text-left border-collapse min-w-[820px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-2.5 px-4">{t.colSku}</th>
                  <th className="py-2.5 px-4">{t.colProductName}</th>
                  <th className="py-2.5 px-4">{t.colHsCode}</th>
                  <th className="py-2.5 px-4 text-right">{t.colUnitPrice}</th>
                  <th className="py-2.5 px-4 text-right">{t.colNwGw}</th>
                  <th className="py-2.5 px-4 text-right">{t.colPcsPerCtn}</th>
                  <th className="py-2.5 px-4 text-right">{t.colActions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredProducts.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-mono-tabular font-semibold text-slate-800">
                      {p.sku}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">
                        {p.nameEn}
                      </div>
                      <div className="text-slate-500">{p.nameLocal}</div>
                    </td>
                    <td className="py-3 px-4 font-mono-tabular">{p.hsCode}</td>
                    <td className="py-3 px-4 text-right font-mono-tabular font-semibold">
                      {formatMoney(p.unitPrice, p.currency)} / {p.unit}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-tabular text-slate-600">
                      {p.unitNetWeightKg} / {p.unitGrossWeightKg} kg
                    </td>
                    <td className="py-3 px-4 text-right font-mono-tabular">
                      {p.defaultUnitsPerCarton}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <ActionButtons
                        label={p.sku}
                        onEdit={() => setEditingProduct(p)}
                        onDelete={() => onDeleteProduct(p.id)}
                        disableDelete={products.length <= 1}
                        editText={t.btnEdit}
                        deleteText={t.btnDelete}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Customer Modal */}
      {editingCustomer && (
        <ModalDialog
          title={editingCustomer.name || t.masterCustomers}
          onClose={() => setEditingCustomer(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!editingCustomer.name.trim()) return;
              onSaveCustomer(editingCustomer);
              setEditingCustomer(null);
            }}
            className="space-y-3"
          >
            <div className="grid grid-cols-2 gap-3">
              <FieldInput
                id="cust-code"
                label={t.colCode}
                value={editingCustomer.code}
                onChange={(v) =>
                  setEditingCustomer({ ...editingCustomer, code: v })
                }
                required
              />
              <FieldInput
                id="cust-country"
                label={t.colCountry}
                value={editingCustomer.country}
                onChange={(v) =>
                  setEditingCustomer({ ...editingCustomer, country: v })
                }
                required
              />
            </div>
            <FieldInput
              id="cust-name"
              label={t.lblCompanyName}
              value={editingCustomer.name}
              onChange={(v) =>
                setEditingCustomer({ ...editingCustomer, name: v })
              }
              required
            />
            <FieldInput
              id="cust-address"
              label={t.lblAddress}
              value={editingCustomer.address}
              onChange={(v) =>
                setEditingCustomer({ ...editingCustomer, address: v })
              }
              required
            />
            <div className="grid grid-cols-3 gap-3">
              <FieldInput
                id="cust-contact"
                label={t.colContact}
                value={editingCustomer.contactName}
                onChange={(v) =>
                  setEditingCustomer({ ...editingCustomer, contactName: v })
                }
              />
              <FieldInput
                id="cust-email"
                label={t.lblEmail}
                value={editingCustomer.email}
                onChange={(v) =>
                  setEditingCustomer({ ...editingCustomer, email: v })
                }
              />
              <FieldInput
                id="cust-phone"
                label={t.lblPhone}
                value={editingCustomer.phone}
                onChange={(v) =>
                  setEditingCustomer({ ...editingCustomer, phone: v })
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="cust-def-cur"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  {t.lblDefaultCurrency}
                </label>
                <select
                  id="cust-def-cur"
                  value={editingCustomer.defaultCurrency}
                  onChange={(e) =>
                    setEditingCustomer({
                      ...editingCustomer,
                      defaultCurrency: e.target.value as CurrencyCode,
                    })
                  }
                  className="w-full h-9 px-2.5 text-sm border border-slate-300 rounded-md"
                >
                  {(['USD', 'JPY', 'EUR', 'CNY'] as CurrencyCode[]).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="cust-def-term"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  {t.lblDefaultIncoterm}
                </label>
                <select
                  id="cust-def-term"
                  value={editingCustomer.defaultIncoterm}
                  onChange={(e) =>
                    setEditingCustomer({
                      ...editingCustomer,
                      defaultIncoterm: e.target.value as IncotermCode,
                    })
                  }
                  className="w-full h-9 px-2.5 text-sm border border-slate-300 rounded-md"
                >
                  {(
                    [
                      'EXW',
                      'FCA',
                      'FOB',
                      'CFR',
                      'CIF',
                      'CPT',
                      'CIP',
                      'DAP',
                      'DPU',
                      'DDP',
                    ] as IncotermCode[]
                  ).map((term) => (
                    <option key={term} value={term}>
                      {term}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {/* Customer-Specific Pricing Section (一客一价) */}
            <div className="pt-3 border-t border-slate-200 space-y-2.5">
              <div>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
                  <Tag className="w-3.5 h-3.5 text-amber-600" />
                  <span>{t.customPricingTitle}</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                  {t.customPricingHint}
                </p>
              </div>

              {products.length > 0 && (
                <div className="flex flex-wrap items-end gap-2 bg-slate-50 p-2.5 rounded-md border border-slate-200">
                  <div className="flex-1 min-w-[180px]">
                    <label
                      htmlFor="cust-price-product"
                      className="block text-[11px] font-medium text-slate-600 mb-1"
                    >
                      {t.customPricingSelectProduct}
                    </label>
                    <select
                      id="cust-price-product"
                      value={customPriceProductId}
                      onChange={(e) => {
                        const pid = e.target.value;
                        setCustomPriceProductId(pid);
                        const existingCp = (
                          editingCustomer.customPrices ?? []
                        ).find((cp) => cp.productId === pid);
                        const prod = products.find((p) => p.id === pid);
                        setCustomPriceValue(
                          existingCp?.unitPrice ?? prod?.unitPrice ?? 0,
                        );
                      }}
                      className="w-full h-8 px-2 text-xs bg-white border border-slate-300 rounded"
                    >
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.sku} · {p.nameEn} ({t.customPricingBaseLabel}:{' '}
                          {formatMoney(p.unitPrice, p.currency)})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="w-28">
                    <label
                      htmlFor="cust-price-value"
                      className="block text-[11px] font-medium text-slate-600 mb-1"
                    >
                      {t.customPricingPriceLabel}
                    </label>
                    <input
                      id="cust-price-value"
                      type="number"
                      min={0}
                      step="0.01"
                      value={customPriceValue}
                      onChange={(e) =>
                        setCustomPriceValue(Number(e.target.value) || 0)
                      }
                      className="w-full h-8 px-2 text-xs text-right font-mono-tabular bg-white border border-slate-300 rounded"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleUpsertCustomerCustomPrice}
                    className="h-8 px-3 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100 whitespace-nowrap"
                  >
                    {t.customPricingAddBtn}
                  </button>
                </div>
              )}

              {(editingCustomer.customPrices ?? []).length === 0 ? (
                <div className="text-[11px] text-slate-400 italic py-1">
                  {t.customPricingEmpty}
                </div>
              ) : (
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-md max-h-40 overflow-y-auto">
                  {(editingCustomer.customPrices ?? []).map((cp) => {
                    const prod = products.find((p) => p.id === cp.productId);
                    return (
                      <div
                        key={cp.productId}
                        className="px-3 py-2 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="font-mono-tabular font-semibold text-slate-800 truncate">
                            {prod?.sku ?? cp.productId}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate">
                            {prod?.nameEn ?? ''} · {t.customPricingBaseLabel}:{' '}
                            {prod
                              ? formatMoney(prod.unitPrice, prod.currency)
                              : '—'}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            aria-label={`${t.customPricingPriceLabel} ${prod?.sku ?? cp.productId}`}
                            value={cp.unitPrice}
                            onChange={(e) => {
                              const nextVal = Math.max(
                                0,
                                Number(e.target.value) || 0,
                              );
                              setEditingCustomer({
                                ...editingCustomer,
                                customPrices: (
                                  editingCustomer.customPrices ?? []
                                ).map((entry) =>
                                  entry.productId === cp.productId
                                    ? { ...entry, unitPrice: nextVal }
                                    : entry,
                                ),
                              });
                            }}
                            className="w-24 h-7 px-2 text-right font-mono-tabular text-xs border border-slate-300 rounded bg-white"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              handleRemoveCustomerCustomPrice(cp.productId)
                            }
                            aria-label={`${t.btnDelete} ${prod?.sku ?? cp.productId}`}
                            className="p-1 text-slate-400 hover:text-red-600 rounded"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <ModalFooter
              onCancel={() => setEditingCustomer(null)}
              saveText={t.btnSave}
              cancelText={t.btnCancel}
            />
          </form>
        </ModalDialog>
      )}

      {/* Supplier Modal */}
      {editingSupplier && (
        <ModalDialog
          title={editingSupplier.name || t.masterSuppliers}
          onClose={() => setEditingSupplier(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!editingSupplier.name.trim()) return;
              onSaveSupplier(editingSupplier);
              setEditingSupplier(null);
            }}
            className="space-y-3"
          >
            <div className="grid grid-cols-2 gap-3">
              <FieldInput
                id="sup-code"
                label={t.colCode}
                value={editingSupplier.code}
                onChange={(v) =>
                  setEditingSupplier({ ...editingSupplier, code: v })
                }
                required
              />
              <FieldInput
                id="sup-country"
                label={t.colCountry}
                value={editingSupplier.country}
                onChange={(v) =>
                  setEditingSupplier({ ...editingSupplier, country: v })
                }
                required
              />
            </div>
            <FieldInput
              id="sup-name"
              label={t.lblShipperName}
              value={editingSupplier.name}
              onChange={(v) =>
                setEditingSupplier({ ...editingSupplier, name: v })
              }
              required
            />
            <FieldInput
              id="sup-address"
              label={t.lblAddress}
              value={editingSupplier.address}
              onChange={(v) =>
                setEditingSupplier({ ...editingSupplier, address: v })
              }
              required
            />
            <div className="grid grid-cols-3 gap-3">
              <FieldInput
                id="sup-exp-id"
                label={t.colExporterId}
                value={editingSupplier.taxOrExporterId}
                onChange={(v) =>
                  setEditingSupplier({
                    ...editingSupplier,
                    taxOrExporterId: v,
                  })
                }
              />
              <FieldInput
                id="sup-phone"
                label={t.lblPhone}
                value={editingSupplier.phone}
                onChange={(v) =>
                  setEditingSupplier({ ...editingSupplier, phone: v })
                }
              />
              <FieldInput
                id="sup-fax"
                label={t.lblFax}
                value={editingSupplier.fax ?? ''}
                onChange={(v) =>
                  setEditingSupplier({ ...editingSupplier, fax: v })
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FieldInput
                id="sup-sig-name"
                label={t.lblSignatoryName}
                value={editingSupplier.signatoryName}
                onChange={(v) =>
                  setEditingSupplier({ ...editingSupplier, signatoryName: v })
                }
              />
              <FieldInput
                id="sup-sig-title"
                label={t.lblSignatoryTitle}
                value={editingSupplier.signatoryTitle}
                onChange={(v) =>
                  setEditingSupplier({ ...editingSupplier, signatoryTitle: v })
                }
              />
            </div>
            <ModalFooter
              onCancel={() => setEditingSupplier(null)}
              saveText={t.btnSave}
              cancelText={t.btnCancel}
            />
          </form>
        </ModalDialog>
      )}

      {/* Logistics Provider Modal */}
      {editingLogistics && (
        <ModalDialog
          title={editingLogistics.name || t.masterLogistics}
          onClose={() => setEditingLogistics(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!editingLogistics.name.trim()) return;
              onSaveLogistics({
                ...editingLogistics,
                supportedModes:
                  editingLogistics.supportedModes.length > 0
                    ? editingLogistics.supportedModes
                    : ['SEA'],
              });
              setEditingLogistics(null);
            }}
            className="space-y-3"
          >
            <div className="grid grid-cols-2 gap-3">
              <FieldInput
                id="log-code"
                label={t.colCode}
                value={editingLogistics.code}
                onChange={(v) =>
                  setEditingLogistics({ ...editingLogistics, code: v })
                }
                required
              />
              <FieldInput
                id="log-acc"
                label={t.colAccountNo}
                value={editingLogistics.accountNo ?? ''}
                onChange={(v) =>
                  setEditingLogistics({ ...editingLogistics, accountNo: v })
                }
              />
            </div>
            <FieldInput
              id="log-name"
              label={t.lblProviderName}
              value={editingLogistics.name}
              onChange={(v) =>
                setEditingLogistics({ ...editingLogistics, name: v })
              }
              required
            />
            <div>
              <span className="block text-xs font-medium text-slate-700 mb-1.5">
                {t.colSupportedModes}
              </span>
              <div className="flex flex-wrap gap-3">
                {(['SEA', 'AIR', 'EXPRESS', 'LAND'] as TransportMode[]).map(
                  (mode) => {
                    const checked =
                      editingLogistics.supportedModes.includes(mode);
                    return (
                      <label
                        key={mode}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...editingLogistics.supportedModes, mode]
                              : editingLogistics.supportedModes.filter(
                                  (m) => m !== mode,
                                );
                            setEditingLogistics({
                              ...editingLogistics,
                              supportedModes: next,
                            });
                          }}
                        />
                        <span>{t.modeLabels[mode]}</span>
                      </label>
                    );
                  },
                )}
              </div>
            </div>
            <FieldInput
              id="log-hub"
              label={t.colDefaultHub}
              value={editingLogistics.defaultPortOrHub ?? ''}
              onChange={(v) =>
                setEditingLogistics({
                  ...editingLogistics,
                  defaultPortOrHub: v,
                })
              }
            />
            <div className="grid grid-cols-2 gap-3">
              <FieldInput
                id="log-contact"
                label={t.colContact}
                value={editingLogistics.contactName}
                onChange={(v) =>
                  setEditingLogistics({ ...editingLogistics, contactName: v })
                }
              />
              <FieldInput
                id="log-phone"
                label={t.lblPhone}
                value={editingLogistics.phone}
                onChange={(v) =>
                  setEditingLogistics({ ...editingLogistics, phone: v })
                }
              />
            </div>
            <ModalFooter
              onCancel={() => setEditingLogistics(null)}
              saveText={t.btnSave}
              cancelText={t.btnCancel}
            />
          </form>
        </ModalDialog>
      )}

      {/* Bank Modal */}
      {editingBank && (
        <ModalDialog
          title={editingBank.label || t.masterBanks}
          onClose={() => setEditingBank(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!editingBank.bankName.trim()) return;
              onSaveBank(editingBank);
              setEditingBank(null);
            }}
            className="space-y-3"
          >
            <FieldInput
              id="bank-label"
              label={t.colBankLabel}
              value={editingBank.label}
              onChange={(v) => setEditingBank({ ...editingBank, label: v })}
              required
            />
            <div className="grid grid-cols-2 gap-3">
              <FieldInput
                id="bank-name"
                label={t.lblBankName}
                value={editingBank.bankName}
                onChange={(v) =>
                  setEditingBank({ ...editingBank, bankName: v })
                }
                required
              />
              <FieldInput
                id="bank-branch"
                label={t.lblBranchName}
                value={editingBank.branchName}
                onChange={(v) =>
                  setEditingBank({ ...editingBank, branchName: v })
                }
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <FieldInput
                id="bank-swift"
                label={t.colSwift}
                value={editingBank.swiftCode}
                onChange={(v) =>
                  setEditingBank({ ...editingBank, swiftCode: v })
                }
                required
              />
              <FieldInput
                id="bank-acct-no"
                label={t.colAccountNo}
                value={editingBank.accountNumber}
                onChange={(v) =>
                  setEditingBank({ ...editingBank, accountNumber: v })
                }
                required
              />
              <div>
                <label
                  htmlFor="bank-cur"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  {t.currency}
                </label>
                <select
                  id="bank-cur"
                  value={editingBank.currency}
                  onChange={(e) =>
                    setEditingBank({
                      ...editingBank,
                      currency: e.target.value as CurrencyCode,
                    })
                  }
                  className="w-full h-9 px-2.5 text-sm border border-slate-300 rounded-md"
                >
                  {(['USD', 'JPY', 'EUR', 'CNY'] as CurrencyCode[]).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <FieldInput
              id="bank-acct-name"
              label={t.lblBeneficiary}
              value={editingBank.accountName}
              onChange={(v) =>
                setEditingBank({ ...editingBank, accountName: v })
              }
              required
            />
            <ModalFooter
              onCancel={() => setEditingBank(null)}
              saveText={t.btnSave}
              cancelText={t.btnCancel}
            />
          </form>
        </ModalDialog>
      )}

      {/* Product Modal */}
      {editingProduct && (
        <ModalDialog
          title={editingProduct.sku || t.masterProducts}
          onClose={() => setEditingProduct(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!editingProduct.sku.trim()) return;
              onSaveProduct(editingProduct);
              setEditingProduct(null);
            }}
            className="space-y-3"
          >
            <div className="grid grid-cols-2 gap-3">
              <FieldInput
                id="prod-sku"
                label={t.colSku}
                value={editingProduct.sku}
                onChange={(v) =>
                  setEditingProduct({ ...editingProduct, sku: v })
                }
                required
              />
              <FieldInput
                id="prod-hs"
                label={t.colHsCode}
                value={editingProduct.hsCode}
                onChange={(v) =>
                  setEditingProduct({ ...editingProduct, hsCode: v })
                }
              />
            </div>
            <FieldInput
              id="prod-name-en"
              label={t.lblDescEn}
              value={editingProduct.nameEn}
              onChange={(v) =>
                setEditingProduct({ ...editingProduct, nameEn: v })
              }
              required
            />
            <FieldInput
              id="prod-name-local"
              label={t.lblDescLocal}
              value={editingProduct.nameLocal}
              onChange={(v) =>
                setEditingProduct({ ...editingProduct, nameLocal: v })
              }
            />
            <div className="grid grid-cols-3 gap-3">
              <FieldInput
                id="prod-size"
                label={t.lblSize}
                value={editingProduct.size ?? ''}
                onChange={(v) =>
                  setEditingProduct({ ...editingProduct, size: v })
                }
              />
              <FieldInput
                id="prod-material"
                label={t.lblMaterial}
                value={editingProduct.material ?? ''}
                onChange={(v) =>
                  setEditingProduct({ ...editingProduct, material: v })
                }
              />
              <FieldInput
                id="prod-finish"
                label={t.lblSurfaceFinish}
                value={editingProduct.surfaceFinish ?? ''}
                onChange={(v) =>
                  setEditingProduct({ ...editingProduct, surfaceFinish: v })
                }
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <FieldNumber
                id="prod-price"
                label={t.colUnitPrice}
                value={editingProduct.unitPrice}
                step="0.01"
                onChange={(v) =>
                  setEditingProduct({ ...editingProduct, unitPrice: v })
                }
              />
              <FieldInput
                id="prod-unit"
                label={t.colUnit}
                value={editingProduct.unit}
                onChange={(v) =>
                  setEditingProduct({ ...editingProduct, unit: v })
                }
              />
              <FieldNumber
                id="prod-per-ctn"
                label={t.lblUnitsPerCarton}
                value={editingProduct.defaultUnitsPerCarton}
                step="1"
                onChange={(v) =>
                  setEditingProduct({
                    ...editingProduct,
                    defaultUnitsPerCarton: v,
                  })
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FieldNumber
                id="prod-nw"
                label={t.lblUnitNw}
                value={editingProduct.unitNetWeightKg}
                step="0.001"
                onChange={(v) =>
                  setEditingProduct({
                    ...editingProduct,
                    unitNetWeightKg: v,
                  })
                }
              />
              <FieldNumber
                id="prod-gw"
                label={t.lblUnitGw}
                value={editingProduct.unitGrossWeightKg}
                step="0.001"
                onChange={(v) =>
                  setEditingProduct({
                    ...editingProduct,
                    unitGrossWeightKg: v,
                  })
                }
              />
            </div>
            <ModalFooter
              onCancel={() => setEditingProduct(null)}
              saveText={t.btnSave}
              cancelText={t.btnCancel}
            />
          </form>
        </ModalDialog>
      )}
      {/* Bulk Product Import Preview Modal */}
      {importPreview && (
        <ModalDialog
          title={t.importPreviewTitle}
          onClose={() => setImportPreview(null)}
        >
          <div className="space-y-3 text-xs">
            <div className="flex items-start gap-2.5 p-3 bg-slate-50 border border-slate-200 rounded-md">
              <FileSpreadsheet className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
              <div className="text-slate-700 leading-relaxed">
                {importPreview.products.length > 0
                  ? t.importPreviewSummary
                      .replace('{total}', String(importPreview.products.length))
                      .replace('{created}', String(importPreview.createdCount))
                      .replace('{updated}', String(importPreview.updatedCount))
                  : t.importNoValidRows}
              </div>
            </div>

            {importPreview.errors.length > 0 && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-md space-y-1">
                <div className="font-semibold text-amber-900">
                  {t.importSkippedErrors}
                </div>
                <ul className="list-disc pl-4 text-amber-800 space-y-0.5 max-h-28 overflow-y-auto">
                  {importPreview.errors.map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            {importPreview.products.length > 0 && (
              <div className="border border-slate-200 rounded-md max-h-56 overflow-y-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                      <th className="py-2 px-2.5">{t.colSku}</th>
                      <th className="py-2 px-2.5">{t.colProductName}</th>
                      <th className="py-2 px-2.5 text-right">{t.colUnitPrice}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {importPreview.products.slice(0, 50).map((p) => (
                      <tr key={p.id}>
                        <td className="py-1.5 px-2.5 font-mono-tabular font-semibold text-slate-800">
                          {p.sku}
                        </td>
                        <td className="py-1.5 px-2.5 text-slate-700">
                          {p.nameEn}
                          {p.size ? ` (${p.size})` : ''}
                        </td>
                        <td className="py-1.5 px-2.5 text-right font-mono-tabular">
                          {formatMoney(p.unitPrice, p.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setImportPreview(null)}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
              >
                {t.btnCancel}
              </button>
              <button
                type="button"
                disabled={importPreview.products.length === 0 || importSubmitting}
                onClick={handleConfirmImport}
                className="px-4 py-2 text-xs font-semibold text-white bg-emerald-700 rounded-md hover:bg-emerald-800 disabled:opacity-40"
              >
                {t.importConfirmBtn}
              </button>
            </div>
          </div>
        </ModalDialog>
      )}
    </div>
  );
};

const ActionButtons: React.FC<{
  label: string;
  onEdit: () => void;
  onDelete: () => void;
  disableDelete: boolean;
  editText: string;
  deleteText: string;
}> = ({ label, onEdit, onDelete, disableDelete, editText, deleteText }) => (
  <div className="inline-flex items-center gap-1">
    <button
      type="button"
      onClick={onEdit}
      aria-label={`${editText} ${label}`}
      className="p-1.5 text-slate-500 hover:text-blue-700 rounded transition-colors"
    >
      <Pencil className="w-3.5 h-3.5" />
    </button>
    <button
      type="button"
      onClick={onDelete}
      disabled={disableDelete}
      aria-label={`${deleteText} ${label}`}
      className="p-1.5 text-slate-400 hover:text-red-600 disabled:opacity-30 rounded transition-colors"
    >
      <Trash2 className="w-3.5 h-3.5" />
    </button>
  </div>
);

const ModalDialog: React.FC<{
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="bg-white border border-slate-200 rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 space-y-4 shadow-lg"
    >
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close modal"
          className="p-1 text-slate-400 hover:text-slate-700 rounded"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      {children}
    </div>
  </div>
);

const ModalFooter: React.FC<{
  onCancel: () => void;
  saveText: string;
  cancelText: string;
}> = ({ onCancel, saveText, cancelText }) => (
  <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
    <button
      type="button"
      onClick={onCancel}
      className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
    >
      {cancelText}
    </button>
    <button
      type="submit"
      className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-md hover:bg-blue-800"
    >
      {saveText}
    </button>
  </div>
);

const FieldInput: React.FC<{
  id: string;
  label: string;
  value: string;
  onChange: (val: string) => void;
  required?: boolean;
}> = ({ id, label, value, onChange, required }) => (
  <div>
    <label
      htmlFor={id}
      className="block text-xs font-medium text-slate-700 mb-1"
    >
      {label}
    </label>
    <input
      id={id}
      type="text"
      required={required}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full h-9 px-2.5 text-sm border border-slate-300 rounded-md"
    />
  </div>
);

const FieldNumber: React.FC<{
  id: string;
  label: string;
  value: number;
  step?: string;
  onChange: (val: number) => void;
}> = ({ id, label, value, step = '1', onChange }) => (
  <div>
    <label
      htmlFor={id}
      className="block text-xs font-medium text-slate-700 mb-1"
    >
      {label}
    </label>
    <input
      id={id}
      type="number"
      min={0}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
      className="w-full h-9 px-2.5 text-sm font-mono-tabular border border-slate-300 rounded-md"
    />
  </div>
);
