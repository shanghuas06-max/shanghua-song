import React, { useMemo, useState } from 'react';
import {
  Plus,
  Trash2,
  Ship,
  Plane,
  PackageCheck,
  Truck,
  Copy,
  FilePlus2,
  Printer,
  Check,
  Minus,
  ChevronDown,
  ChevronUp,
  Layers,
  GripVertical,
} from 'lucide-react';
import type {
  BankAccount,
  CurrencyCode,
  Customer,
  ExportOrder,
  IncotermCode,
  LogisticsProvider,
  OrderItem,
  PackingListRow,
  Product,
  Supplier,
  TransportMode,
} from '../types/erp';
import type { UiDictionary } from '../i18n/uiTranslations';
import {
  autoConsolidateHalfCartons,
  calculateItemCartons,
  calculateOrderSummary,
  calculatePalletPacking,
  cleanFloat,
  formatMoney,
  formatNumberNoRound,
  getDefaultExchangeRate,
  getItemFillRatio,
  reorderOrderItems,
  resolveEffectiveExchangeRate,
} from '../utils/exportCalculations';
import { buildPackingListDisplayRows, resolveItemSpecs } from '../utils/documentHelpers';
import {
  applyCustomerPricingToItems,
  convertPriceToJpy,
  resolveCustomerProductPricing,
} from '../utils/importExportUtils';

interface OrderWorkspaceProps {
  order: ExportOrder | undefined;
  customers: Customer[];
  suppliers: Supplier[];
  logisticsProviders: LogisticsProvider[];
  bankAccounts: BankAccount[];
  products: Product[];
  onChangeOrder: (updated: ExportOrder) => void;
  onCreateNewOrder: () => void;
  onDuplicateOrder: () => void;
  onOpenDocuments: () => void;
  onOpenHistory?: () => void;
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

const INCOTERMS: IncotermCode[] = [
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
];

const CURRENCIES: CurrencyCode[] = ['USD', 'JPY', 'EUR', 'CNY'];

export const OrderWorkspace: React.FC<OrderWorkspaceProps> = ({
  order,
  customers,
  suppliers,
  logisticsProviders,
  bankAccounts,
  products,
  onChangeOrder,
  onCreateNewOrder,
  onDuplicateOrder,
  onOpenDocuments,
  onOpenHistory,
  t,
}) => {
  const [selectedProductId, setSelectedProductId] = useState<string>(
    products[0]?.id ?? '',
  );
  const [showDocLayoutEditor, setShowDocLayoutEditor] = useState<boolean>(false);
  const [draggedItemIdx, setDraggedItemIdx] = useState<number | null>(null);
  const [dragOverItemIdx, setDragOverItemIdx] = useState<number | null>(null);

  const effectiveSelectedProductId = products.some(
    (p) => p.id === selectedProductId,
  )
    ? selectedProductId
    : (products[0]?.id ?? '');

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

  const activeMode = order?.shipping.mode ?? 'SEA';

  const currentCustomer = useMemo(
    () => customers.find((c) => c.id === order?.customerId),
    [customers, order?.customerId],
  );

  const matchingProviders = useMemo(() => {
    const preferred = logisticsProviders.filter((lp) =>
      lp.supportedModes.includes(activeMode),
    );
    const others = logisticsProviders.filter(
      (lp) => !lp.supportedModes.includes(activeMode),
    );
    return [...preferred, ...others];
  }, [logisticsProviders, activeMode]);

  if (!order) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              {t.orderSectionTitle}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">{t.orderPartiesTitle}</p>
          </div>
          <button
            type="button"
            onClick={onCreateNewOrder}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-700 rounded-md hover:bg-blue-800 transition-colors whitespace-nowrap"
          >
            <FilePlus2 className="w-3.5 h-3.5" />
            <span>{t.btnNewOrder}</span>
          </button>
        </div>

        <section
          data-testid="empty-order-state"
          className="bg-white border border-dashed border-slate-300 rounded-lg px-6 py-14 text-center max-w-2xl mx-auto space-y-4"
        >
          <div className="w-11 h-11 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
            <FilePlus2 className="w-5 h-5" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-base font-bold text-slate-900">
              {t.emptyOrdersWorkspaceTitle}
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              {t.emptyOrdersWorkspaceDesc}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
            <button
              type="button"
              onClick={onCreateNewOrder}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-md hover:bg-blue-800 transition-colors"
            >
              <FilePlus2 className="w-3.5 h-3.5" />
              <span>{t.btnNewOrder}</span>
            </button>
            {onOpenHistory && (
              <button
                type="button"
                onClick={onOpenHistory}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors"
              >
                <span>{t.navHistory}</span>
              </button>
            )}
          </div>
        </section>
      </div>
    );
  }

  const effectiveExchangeRate = resolveEffectiveExchangeRate(
    order.currency,
    order.exchangeRate,
  );
  const effectiveCartonsPerLayer = Math.max(
    1,
    Number(order.cartonsPerLayer ?? 12),
  );

  const buildOrderWithPalletSync = (
    nextItems: OrderItem[],
    patch?: Partial<ExportOrder>,
    options?: { autoPack?: boolean; forceConsolidate?: boolean },
  ): ExportOrder => {
    const effectiveItems =
      options?.autoPack === false
        ? nextItems
        : autoConsolidateHalfCartons(nextItems, products, {
            force: options?.forceConsolidate,
          });
    const consolidatedSummary = calculateOrderSummary(
      effectiveItems,
      patch?.costs ?? order.costs,
      patch?.shipping?.incoterm ?? order.shipping.incoterm,
      patch?.currency ?? order.currency,
      patch?.palletCount ?? order.palletCount ?? 0,
    );
    const totalCtns = consolidatedSummary.totalCartons;
    const layerSize = Math.max(
      1,
      Number(patch?.cartonsPerLayer ?? order.cartonsPerLayer ?? 12),
    );
    const pack = calculatePalletPacking(totalCtns, {
      cartonsPerLayer: layerSize,
    });
    return {
      ...order,
      ...patch,
      items: effectiveItems,
      palletCount: patch?.palletCount ?? pack.palletCount,
      emptyCartons: patch?.emptyCartons ?? pack.emptyCartons,
      cartonsPerLayer: layerSize,
      updatedAt: new Date().toISOString(),
    };
  };

  const handleConsolidateHalfCartonsNow = () => {
    onChangeOrder(
      buildOrderWithPalletSync(order.items, undefined, {
        autoPack: true,
        forceConsolidate: true,
      }),
    );
  };

  const updateOrder = (patch: Partial<ExportOrder>) => {
    onChangeOrder({
      ...order,
      ...patch,
      updatedAt: new Date().toISOString(),
    });
  };

  const updateShipping = (patch: Partial<ExportOrder['shipping']>) => {
    onChangeOrder({
      ...order,
      shipping: {
        ...order.shipping,
        ...patch,
      },
      updatedAt: new Date().toISOString(),
    });
  };

  const updateCosts = (patch: Partial<ExportOrder['costs']>) => {
    onChangeOrder({
      ...order,
      costs: {
        ...order.costs,
        ...patch,
      },
      updatedAt: new Date().toISOString(),
    });
  };

  const seedBasePricesJpy = (items: OrderItem[], sourceCur: CurrencyCode, sourceRate: number) =>
    items.map((item) => {
      if (
        typeof item.baseUnitPriceJpy === 'number' &&
        Number.isFinite(item.baseUnitPriceJpy) &&
        item.baseUnitPriceJpy >= 0
      ) {
        return item;
      }
      return {
        ...item,
        baseUnitPriceJpy: convertPriceToJpy(item.unitPrice, sourceCur, sourceRate),
      };
    });

  const handleCurrencyChange = (nextCurrency: CurrencyCode) => {
    const nextRate = getDefaultExchangeRate(nextCurrency);
    const itemsWithBase = seedBasePricesJpy(
      order.items,
      order.currency,
      effectiveExchangeRate,
    );
    const repricedItems = applyCustomerPricingToItems(
      itemsWithBase,
      currentCustomer,
      products,
      nextCurrency,
      nextRate,
      { preserveDescription: true },
    );
    updateOrder({
      currency: nextCurrency,
      exchangeRate: nextRate,
      items: repricedItems,
    });
  };

  const handleExchangeRateChange = (rawRate: number) => {
    const nextRate = Math.max(0.0001, Number(rawRate) || getDefaultExchangeRate(order.currency));
    const itemsWithBase = seedBasePricesJpy(
      order.items,
      order.currency,
      effectiveExchangeRate,
    );
    const repricedItems = applyCustomerPricingToItems(
      itemsWithBase,
      currentCustomer,
      products,
      order.currency,
      nextRate,
      { preserveDescription: true },
    );
    updateOrder({
      exchangeRate: nextRate,
      items: repricedItems,
    });
  };

  const handleCustomerSelect = (customerId: string) => {
    const cust = customers.find((c) => c.id === customerId);
    if (!cust) {
      updateOrder({ customerId });
      return;
    }
    const shortMark = cust.name.split(' ')[0].toUpperCase();
    const nextCurrency = cust.defaultCurrency;
    const nextRate =
      nextCurrency === order.currency
        ? effectiveExchangeRate
        : getDefaultExchangeRate(nextCurrency);
    const itemsWithBase = seedBasePricesJpy(
      order.items,
      order.currency,
      effectiveExchangeRate,
    );
    const repricedItems = applyCustomerPricingToItems(
      itemsWithBase,
      cust,
      products,
      nextCurrency,
      nextRate,
    );
    onChangeOrder({
      ...order,
      customerId,
      currency: nextCurrency,
      exchangeRate: nextRate,
      items: repricedItems,
      shipping: {
        ...order.shipping,
        incoterm: cust.defaultIncoterm,
        shippingMarksMain: `${shortMark} / ${cust.country}`,
      },
      updatedAt: new Date().toISOString(),
    });
  };

  const handleModeChange = (mode: TransportMode) => {
    const firstMatch = logisticsProviders.find((lp) =>
      lp.supportedModes.includes(mode),
    );
    const currentStillSupports = logisticsProviders
      .find((lp) => lp.id === order.shipping.logisticsProviderId)
      ?.supportedModes.includes(mode);

    const nextProvider = currentStillSupports
      ? logisticsProviders.find((lp) => lp.id === order.shipping.logisticsProviderId)
      : firstMatch;

    updateShipping({
      mode,
      logisticsProviderId: nextProvider?.id ?? order.shipping.logisticsProviderId,
      portOfLoading:
        nextProvider?.defaultPortOrHub && !currentStillSupports
          ? nextProvider.defaultPortOrHub
          : order.shipping.portOfLoading,
    });
  };

  const handleAddProduct = () => {
    const prod =
      products.find((p) => p.id === effectiveSelectedProductId) ?? products[0];
    if (!prod) return;
    const defaultQty = prod.defaultUnitsPerCarton || 100;
    const resolved = resolveCustomerProductPricing(
      currentCustomer,
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
    onChangeOrder(buildOrderWithPalletSync([...order.items, newItem]));
  };

  const handleAddBlankItem = () => {
    const defaultUnitPrice = order.currency === 'JPY' ? 150 : 1;
    const newItem: OrderItem = {
      id: `oi-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      productId: '',
      sku: '',
      description: '',
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
    onChangeOrder(buildOrderWithPalletSync([...order.items, newItem]));
  };

  const handleAutoBuildPackingRows = () => {
    const generated = buildPackingListDisplayRows(
      order.items,
      products,
      undefined,
      { customer: currentCustomer },
    ).map(
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
    updateOrder({ packingRows: generated });
  };

  const handleAddPackingRow = () => {
    const existing = order.packingRows ?? [];
    const firstItem = order.items[0];
    const specs = firstItem
      ? resolveItemSpecs(firstItem, products.find((p) => p.id === firstItem.productId))
      : { size: '', material: '', surfaceFinish: '' };
    const newRow: PackingListRow = {
      id: `pk-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      palletNo: existing[existing.length - 1]?.palletNo || '1',
      ctnNo: existing[existing.length - 1]?.ctnNo || '1',
      itemNo: 1,
      type: firstItem?.sku || '',
      size: specs.size,
      material: specs.material,
      surfaceFinish: specs.surfaceFinish,
      setsPerCarton: 100,
      cartonCount: 1,
      sharedCarton: true,
      qty: 100,
      unitWeightKg: firstItem?.unitNetWeightKg || 0.05,
      totalWeightKg: cleanFloat(100 * (firstItem?.unitNetWeightKg || 0.05)),
    };
    updateOrder({ packingRows: [...existing, newRow] });
  };

  const handleUpdatePackingRow = (rowId: string, patch: Partial<PackingListRow>) => {
    const nextRows = (order.packingRows ?? []).map((r) => {
      if (r.id !== rowId) return r;
      const merged = { ...r, ...patch };
      if (
        typeof patch.qty === 'number' ||
        typeof patch.unitWeightKg === 'number'
      ) {
        merged.totalWeightKg = cleanFloat(
          (merged.qty || 0) * (merged.unitWeightKg || 0),
        );
      }
      return merged;
    });
    updateOrder({ packingRows: nextRows });
  };

  const handleDeletePackingRow = (rowId: string) => {
    updateOrder({
      packingRows: (order.packingRows ?? []).filter((r) => r.id !== rowId),
    });
  };

  const handleItemChange = (itemId: string, patch: Partial<OrderItem>) => {
    const nextItems = order.items.map((item) => {
      if (item.id !== itemId) return item;
      const updated = { ...item, ...patch };
      if (typeof patch.unitPrice === 'number') {
        updated.baseUnitPriceJpy = convertPriceToJpy(
          patch.unitPrice,
          order.currency,
          effectiveExchangeRate,
        );
      }
      // When quantity changes on a catalog product: auto-recalculate cartons AND tiered/customer unitPrice
      if (typeof patch.quantity === 'number' && item.productId) {
        const prod = products.find((p) => p.id === item.productId);
        if (prod) {
          if (prod.defaultUnitsPerCarton > 0) {
            updated.setsPerCarton = prod.defaultUnitsPerCarton;
            updated.cartons = calculateItemCartons(
              patch.quantity,
              prod.defaultUnitsPerCarton,
            );
          }
          if (patch.unitPrice === undefined) {
            const resolved = resolveCustomerProductPricing(
              currentCustomer,
              prod,
              patch.quantity,
              order.currency,
              effectiveExchangeRate,
            );
            updated.unitPrice = resolved.unitPrice;
            updated.baseUnitPriceJpy = resolved.basePriceJpy;
          }
        }
      }
      return updated;
    });

    if (patch.sharedCartonGroupId !== undefined) {
      onChangeOrder(
        buildOrderWithPalletSync(nextItems, undefined, { autoPack: false }),
      );
    } else if (
      typeof patch.quantity === 'number' ||
      typeof patch.cartons === 'number' ||
      typeof patch.setsPerCarton === 'number'
    ) {
      onChangeOrder(buildOrderWithPalletSync(nextItems));
    } else {
      updateOrder({ items: nextItems });
    }
  };

  const handleDeleteItem = (itemId: string) => {
    const remaining = order.items.filter((i) => i.id !== itemId);
    onChangeOrder(buildOrderWithPalletSync(remaining));
  };

  const handleReorderItems = (fromIdx: number, toIdx: number) => {
    const reordered = reorderOrderItems(order.items, fromIdx, toIdx);
    if (reordered !== order.items) {
      updateOrder({ items: reordered });
    }
  };

  const modeFieldLabels = (() => {
    switch (order.shipping.mode) {
      case 'SEA':
        return {
          origin: t.portLoading,
          dest: t.portDischarge,
          carrier: t.vesselLabel,
          docNo: t.blNoLabel,
        };
      case 'AIR':
        return {
          origin: t.hubOrigin,
          dest: t.hubDestination,
          carrier: t.flightLabel,
          docNo: t.awbNoLabel,
        };
      case 'EXPRESS':
        return {
          origin: t.hubOrigin,
          dest: t.hubDestination,
          carrier: t.courierLabel,
          docNo: t.trackingNoLabel,
        };
      case 'LAND':
        return {
          origin: t.hubOrigin,
          dest: t.hubDestination,
          carrier: t.truckLabel,
          docNo: t.waybillNoLabel,
        };
    }
  })();

  const modeIcons: Record<TransportMode, React.ReactNode> = {
    SEA: <Ship className="w-3.5 h-3.5" />,
    AIR: <Plane className="w-3.5 h-3.5" />,
    EXPRESS: <PackageCheck className="w-3.5 h-3.5" />,
    LAND: <Truck className="w-3.5 h-3.5" />,
  };

  return (
    <div className="space-y-6">
      {/* Workspace Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            {t.orderSectionTitle}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">{t.orderPartiesTitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onCreateNewOrder}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            <FilePlus2 className="w-3.5 h-3.5" />
            <span>{t.btnNewOrder}</span>
          </button>
          <button
            type="button"
            onClick={onDuplicateOrder}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>{t.btnDuplicateOrder}</span>
          </button>
          <button
            type="button"
            onClick={onOpenDocuments}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 transition-colors whitespace-nowrap"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>{t.navDocuments}</span>
          </button>
        </div>
      </div>

      {/* Section 1: Order Header & Registered Master Data Parties */}
      <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div>
            <label
              htmlFor="order-bill-to"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              {t.selectBillTo}
            </label>
            <select
              id="order-bill-to"
              value={order.billToCustomerId ?? ''}
              onChange={(e) =>
                updateOrder({ billToCustomerId: e.target.value })
              }
              className="w-full h-9 px-3 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
            >
              <option value="">{t.billToSameAsCustomer}</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} · {c.name} ({c.country})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="order-customer"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              {t.selectCustomer}
            </label>
            <select
              id="order-customer"
              value={order.customerId}
              onChange={(e) => handleCustomerSelect(e.target.value)}
              className="w-full h-9 px-3 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} · {c.name} ({c.country})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="order-supplier"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              {t.selectSupplier}
            </label>
            <select
              id="order-supplier"
              value={order.supplierId}
              onChange={(e) => updateOrder({ supplierId: e.target.value })}
              className="w-full h-9 px-3 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
            >
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} · {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="order-bank"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              {t.selectBank}
            </label>
            <select
              id="order-bank"
              value={order.bankAccountId}
              onChange={(e) => updateOrder({ bankAccountId: e.target.value })}
              className="w-full h-9 px-3 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
            >
              {bankAccounts.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label} ({b.currency})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 pt-4 border-t border-slate-100">
          <div>
            <label
              htmlFor="order-invoice-no"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              {t.invoiceNo}
            </label>
            <input
              id="order-invoice-no"
              type="text"
              value={order.invoiceNo}
              onChange={(e) => updateOrder({ invoiceNo: e.target.value })}
              className="w-full h-9 px-3 text-sm font-mono-tabular bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div>
            <label
              htmlFor="order-po-no"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              {t.poNo}
            </label>
            <input
              id="order-po-no"
              type="text"
              value={order.poNo}
              onChange={(e) => updateOrder({ poNo: e.target.value })}
              className="w-full h-9 px-3 text-sm font-mono-tabular bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div>
            <label
              htmlFor="order-date"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              {t.orderDate}
            </label>
            <input
              id="order-date"
              type="date"
              value={order.orderDate}
              onChange={(e) => updateOrder({ orderDate: e.target.value })}
              className="w-full h-9 px-3 text-sm font-mono-tabular bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div>
            <label
              htmlFor="order-currency"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              {t.currency}
            </label>
            <select
              id="order-currency"
              value={order.currency}
              onChange={(e) =>
                handleCurrencyChange(e.target.value as CurrencyCode)
              }
              className="w-full h-9 px-3 text-sm font-mono-tabular bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              {CURRENCIES.map((cur) => (
                <option key={cur} value={cur}>
                  {cur}
                </option>
              ))}
            </select>
          </div>

          {order.currency !== 'JPY' && (
            <div data-testid="exchange-rate-field">
              <label
                htmlFor="order-exchange-rate"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                {t.exchangeRateLabel}
              </label>
              <input
                id="order-exchange-rate"
                type="number"
                min={0.0001}
                step="any"
                value={effectiveExchangeRate}
                onChange={(e) =>
                  handleExchangeRateChange(Number(e.target.value))
                }
                className="w-full h-9 px-3 text-sm font-mono-tabular bg-white border border-blue-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <div className="text-[11px] text-slate-500 mt-1">
                {t.exchangeRateHint
                  .replace('{cur}', order.currency)
                  .replace('{rate}', String(effectiveExchangeRate))}
              </div>
            </div>
          )}

          <div className={order.currency === 'JPY' ? 'lg:col-span-2' : ''}>
            <label
              htmlFor="order-payment-terms"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              {t.paymentTerms}
            </label>
            <input
              id="order-payment-terms"
              type="text"
              value={order.paymentTerms}
              onChange={(e) => updateOrder({ paymentTerms: e.target.value })}
              className="w-full h-9 px-3 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
        </div>
      </section>

      {/* Section 2: Product Line Items */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-sm font-semibold text-slate-900">
            {t.itemsSectionTitle}
          </h2>

          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="catalog-product-pick" className="sr-only">
              {t.addProductLabel}
            </label>
            <select
              id="catalog-product-pick"
              value={effectiveSelectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className="h-9 px-3 text-xs bg-white border border-slate-300 rounded-md max-w-[280px]"
            >
              {products.map((p) => {
                const resolved = resolveCustomerProductPricing(
                  currentCustomer,
                  p,
                  p.defaultUnitsPerCarton || 100,
                  order.currency,
                  effectiveExchangeRate,
                );
                const displayName = resolved.customDescription || p.nameEn;
                return (
                  <option key={p.id} value={p.id}>
                    {p.sku} · {displayName} ({formatMoney(resolved.unitPrice, order.currency)}
                    {resolved.customDescription ? ` · ${t.customPartNameBadge}` : ''}
                    {resolved.isCustom ? ` · ${t.customPricingBadge}` : ''}
                    {resolved.isTiered && resolved.matchedTierLabel
                      ? ` · ${t.tierMatchedBadge} ${resolved.matchedTierLabel}`
                      : ''}
                    )
                  </option>
                );
              })}
            </select>
            <button
              type="button"
              onClick={handleAddProduct}
              className="inline-flex items-center gap-1.5 h-9 px-3 text-xs font-semibold text-white bg-blue-700 rounded-md hover:bg-blue-800 transition-colors whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t.addProductLabel}</span>
            </button>
            <button
              type="button"
              onClick={handleAddBlankItem}
              className="inline-flex items-center gap-1.5 h-9 px-3 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              <span>{t.btnAddCustomItem}</span>
            </button>
            <button
              type="button"
              data-testid="auto-consolidate-btn"
              onClick={handleConsolidateHalfCartonsNow}
              className="inline-flex items-center gap-1.5 h-9 px-3 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-md hover:bg-amber-100 transition-colors whitespace-nowrap"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>{t.autoConsolidateHalfBtn}</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          {order.items.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-slate-500">
              {t.emptyItems}
            </div>
          ) : (
            <table className="w-full text-left border-collapse min-w-[1100px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-2.5 px-2 w-16 text-center whitespace-nowrap">
                    {t.colSeqNo}
                  </th>
                  <th className="py-2.5 px-3 min-w-[144px]">{t.colSku}</th>
                  <th className="py-2.5 px-3 min-w-[240px]">{t.colDescription}</th>
                  <th className="py-2.5 px-3 min-w-[104px]">{t.colHsCode}</th>
                  <th className="py-2.5 px-3 min-w-[84px] text-right">{t.colQty}</th>
                  <th className="py-2.5 px-3 min-w-[68px]">{t.colUnit}</th>
                  <th className="py-2.5 px-3 min-w-[88px] text-right">{t.colUnitPrice}</th>
                  <th className="py-2.5 px-3 min-w-[68px] text-right">{t.colCartons}</th>
                  <th className="py-2.5 px-3 min-w-[136px] text-right whitespace-nowrap">{t.colWeightKg}</th>
                  <th className="py-2.5 px-3 min-w-[108px] text-right whitespace-nowrap">{t.colAmount}</th>
                  <th className="py-2.5 px-3 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {order.items.map((item, idx) => {
                  const calc = summary.lineItems[idx];
                  const isDragging = draggedItemIdx === idx;
                  const isDragOver =
                    dragOverItemIdx === idx &&
                    draggedItemIdx !== null &&
                    draggedItemIdx !== idx;
                  return (
                    <tr
                      key={item.id}
                      data-testid={`item-row-${idx}`}
                      onDragOver={(e) => {
                        if (draggedItemIdx === null) return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        if (dragOverItemIdx !== idx) {
                          setDragOverItemIdx(idx);
                        }
                      }}
                      onDragEnter={(e) => {
                        if (draggedItemIdx === null) return;
                        e.preventDefault();
                        if (dragOverItemIdx !== idx) {
                          setDragOverItemIdx(idx);
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const fromText = e.dataTransfer.getData('text/plain');
                        const parsedFrom =
                          fromText !== '' ? Number(fromText) : draggedItemIdx;
                        if (
                          parsedFrom !== null &&
                          Number.isInteger(parsedFrom)
                        ) {
                          handleReorderItems(parsedFrom, idx);
                        }
                        setDraggedItemIdx(null);
                        setDragOverItemIdx(null);
                      }}
                      className={`transition-colors ${
                        isDragging
                          ? 'opacity-45 bg-blue-50/40'
                          : isDragOver
                            ? 'bg-blue-50/70 ring-2 ring-inset ring-blue-500'
                            : 'hover:bg-slate-50/70'
                      }`}
                    >
                      <td className="py-2 px-2 align-top text-center select-none">
                        <div className="flex flex-col items-center gap-1">
                          <div
                            draggable
                            data-testid={`item-drag-handle-${idx}`}
                            title={t.dragToReorderHint}
                            aria-label={`${t.colSeqNo} ${idx + 1} - ${t.dragToReorderHint}`}
                            onDragStart={(e) => {
                              setDraggedItemIdx(idx);
                              setDragOverItemIdx(idx);
                              e.dataTransfer.effectAllowed = 'move';
                              e.dataTransfer.setData('text/plain', String(idx));
                              const rowEl = e.currentTarget.closest('tr');
                              if (rowEl && e.dataTransfer.setDragImage) {
                                e.dataTransfer.setDragImage(rowEl, 24, 20);
                              }
                            }}
                            onDragEnd={() => {
                              setDraggedItemIdx(null);
                              setDragOverItemIdx(null);
                            }}
                            className="inline-flex items-center justify-center gap-0.5 h-8 px-1.5 min-w-[46px] rounded border border-slate-200 bg-slate-50 hover:bg-blue-50 hover:border-blue-300 text-slate-700 cursor-grab active:cursor-grabbing transition-colors"
                          >
                            <GripVertical className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span
                              data-testid={`item-seq-${idx}`}
                              className="text-xs font-mono-tabular font-bold"
                            >
                              {idx + 1}
                            </span>
                          </div>
                          {order.items.length > 1 && (
                            <div className="inline-flex items-center gap-0.5">
                              <button
                                type="button"
                                data-testid={`item-move-up-${idx}`}
                                disabled={idx === 0}
                                onClick={() => handleReorderItems(idx, idx - 1)}
                                aria-label={`${t.moveItemUpLabel} ${idx + 1}`}
                                title={t.moveItemUpLabel}
                                className="p-0.5 rounded text-slate-400 hover:text-blue-700 hover:bg-blue-50 disabled:opacity-25 disabled:pointer-events-none"
                              >
                                <ChevronUp className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                data-testid={`item-move-down-${idx}`}
                                disabled={idx === order.items.length - 1}
                                onClick={() => handleReorderItems(idx, idx + 1)}
                                aria-label={`${t.moveItemDownLabel} ${idx + 1}`}
                                title={t.moveItemDownLabel}
                                className="p-0.5 rounded text-slate-400 hover:text-blue-700 hover:bg-blue-50 disabled:opacity-25 disabled:pointer-events-none"
                              >
                                <ChevronDown className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-3 align-top space-y-1">
                        <input
                          type="text"
                          aria-label={`${t.colSku} row ${idx + 1}`}
                          value={item.sku}
                          onChange={(e) =>
                            handleItemChange(item.id, { sku: e.target.value })
                          }
                          className="w-full h-8 px-2 text-xs font-mono-tabular border border-slate-200 rounded bg-white"
                        />
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            placeholder={t.lblPalletNo}
                            aria-label={`${t.lblPalletNo} row ${idx + 1}`}
                            value={item.palletNo ?? ''}
                            onChange={(e) =>
                              handleItemChange(item.id, {
                                palletNo: e.target.value,
                              })
                            }
                            className="w-20 h-7 px-1.5 text-[11px] font-mono-tabular border border-slate-200 rounded bg-slate-50"
                          />
                          <input
                            type="text"
                            placeholder={t.lblCtnNo}
                            aria-label={`${t.lblCtnNo} row ${idx + 1}`}
                            value={item.cartonRange ?? ''}
                            onChange={(e) =>
                              handleItemChange(item.id, {
                                cartonRange: e.target.value,
                              })
                            }
                            className="flex-1 min-w-0 h-7 px-1.5 text-[11px] font-mono-tabular border border-slate-200 rounded bg-slate-50"
                          />
                        </div>
                      </td>
                      <td className="py-2 px-3 align-top space-y-1">
                        <input
                          type="text"
                          aria-label={`${t.colDescription} row ${idx + 1}`}
                          value={item.description}
                          onChange={(e) =>
                            handleItemChange(item.id, {
                              description: e.target.value,
                            })
                          }
                          className="w-full h-8 px-2 text-xs border border-slate-200 rounded bg-white"
                        />
                        {(() => {
                          const custMap = currentCustomer?.customPrices?.find(
                            (cp) => cp.productId === item.productId,
                          );
                          const prod = products.find((p) => p.id === item.productId);
                          if (!custMap?.customDescription?.trim()) return null;
                          return (
                            <div
                              data-testid={`custom-part-name-badge-${idx}`}
                              className="text-[10px] font-medium text-blue-700 truncate"
                            >
                              {t.customPartNameBadge} · {t.customStandardNameLabel}:{' '}
                              {prod?.nameEn ?? item.sku}
                            </div>
                          );
                        })()}
                        <div className="grid grid-cols-3 gap-1">
                          <input
                            type="text"
                            placeholder={t.lblSize}
                            aria-label={`${t.lblSize} row ${idx + 1}`}
                            value={item.size ?? ''}
                            onChange={(e) =>
                              handleItemChange(item.id, { size: e.target.value })
                            }
                            className="h-7 px-1.5 text-[11px] font-mono-tabular border border-slate-200 rounded bg-slate-50"
                          />
                          <input
                            type="text"
                            placeholder={t.lblMaterial}
                            aria-label={`${t.lblMaterial} row ${idx + 1}`}
                            value={item.material ?? ''}
                            onChange={(e) =>
                              handleItemChange(item.id, {
                                material: e.target.value,
                              })
                            }
                            className="h-7 px-1.5 text-[11px] font-mono-tabular border border-slate-200 rounded bg-slate-50"
                          />
                          <input
                            type="text"
                            placeholder={t.lblSurfaceFinish}
                            aria-label={`${t.lblSurfaceFinish} row ${idx + 1}`}
                            value={item.surfaceFinish ?? ''}
                            onChange={(e) =>
                              handleItemChange(item.id, {
                                surfaceFinish: e.target.value,
                              })
                            }
                            className="h-7 px-1.5 text-[11px] font-mono-tabular border border-slate-200 rounded bg-slate-50"
                          />
                        </div>
                      </td>
                      <td className="py-2 px-3 align-top">
                        <input
                          type="text"
                          aria-label={`${t.colHsCode} row ${idx + 1}`}
                          value={item.hsCode}
                          onChange={(e) =>
                            handleItemChange(item.id, { hsCode: e.target.value })
                          }
                          className="w-full h-8 px-2 text-xs font-mono-tabular border border-slate-200 rounded bg-white"
                        />
                      </td>
                      <td className="py-2 px-3 align-top">
                        <input
                          type="number"
                          min={0}
                          step="any"
                          aria-label={`${t.colQty} row ${idx + 1}`}
                          value={item.quantity}
                          onChange={(e) =>
                            handleItemChange(item.id, {
                              quantity: Number(e.target.value) || 0,
                            })
                          }
                          className="w-full h-8 px-2 text-xs text-right font-mono-tabular border border-slate-200 rounded bg-white"
                        />
                      </td>
                      <td className="py-2 px-3 align-top">
                        <input
                          type="text"
                          aria-label={`${t.colUnit} row ${idx + 1}`}
                          value={item.unit}
                          onChange={(e) =>
                            handleItemChange(item.id, { unit: e.target.value })
                          }
                          className="w-full h-8 px-2 text-xs border border-slate-200 rounded bg-white"
                        />
                      </td>
                      <td className="py-2 px-3 align-top">
                        <input
                          type="number"
                          min={0}
                          step="any"
                          aria-label={`${t.colUnitPrice} row ${idx + 1}`}
                          value={item.unitPrice}
                          onChange={(e) =>
                            handleItemChange(item.id, {
                              unitPrice: Number(e.target.value) || 0,
                            })
                          }
                          className="w-full h-8 px-2 text-xs text-right font-mono-tabular border border-slate-200 rounded bg-white"
                        />
                        {(() => {
                          const linkedProd = products.find(
                            (p) => p.id === item.productId,
                          );
                          const resolved = linkedProd
                            ? resolveCustomerProductPricing(
                                currentCustomer,
                                linkedProd,
                                item.quantity,
                                order.currency,
                                effectiveExchangeRate,
                              )
                            : null;
                          const jpyHint =
                            order.currency !== 'JPY'
                              ? item.baseUnitPriceJpy ?? resolved?.basePriceJpy
                              : undefined;
                          if (
                            !resolved?.isCustom &&
                            !resolved?.isTiered &&
                            jpyHint === undefined
                          ) {
                            return null;
                          }
                          return (
                            <div className="mt-1 flex flex-wrap items-center justify-end gap-1">
                              {jpyHint !== undefined && (
                                <span className="text-[10px] font-mono-tabular text-slate-400">
                                  ¥{formatNumberNoRound(jpyHint, 0)}
                                </span>
                              )}
                              {resolved?.isCustom && (
                                <span className="inline-block px-1.5 py-0.5 text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 rounded">
                                  {t.customPricingBadge}
                                </span>
                              )}
                              {resolved?.isTiered && resolved.matchedTierLabel && (
                                <span className="inline-block px-1.5 py-0.5 text-[10px] font-semibold bg-blue-50 text-blue-800 border border-blue-200 rounded">
                                  {t.tierMatchedBadge} {resolved.matchedTierLabel}
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="py-2 px-3 align-top space-y-1">
                        <input
                          type="number"
                          min={0}
                          step="any"
                          aria-label={`${t.colCartons} row ${idx + 1}`}
                          value={item.cartons}
                          onChange={(e) =>
                            handleItemChange(item.id, {
                              cartons: Number(e.target.value) || 0,
                            })
                          }
                          className="w-full h-8 px-2 text-xs text-right font-mono-tabular border border-slate-200 rounded bg-white"
                        />
                        {(() => {
                          const linkedProd = products.find(
                            (p) => p.id === item.productId,
                          );
                          const fillRatio = getItemFillRatio(item, linkedProd);
                          const isPartial = fillRatio > 0 && fillRatio < 0.9999;
                          const curGroup = item.sharedCartonGroupId ?? '';
                          return (
                            <div className="space-y-1">
                              {isPartial && (
                                <div className="text-right">
                                  <span
                                    data-testid={`half-carton-badge-${idx}`}
                                    className="inline-block px-1.5 py-0.5 text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 rounded"
                                  >
                                    {formatNumberNoRound(fillRatio, 0)} ({t.halfCartonBadge})
                                  </span>
                                </div>
                              )}
                              <select
                                aria-label={`${t.sharedCartonGroupLabel} row ${idx + 1}`}
                                data-testid={`item-shared-group-${idx}`}
                                value={curGroup}
                                onChange={(e) =>
                                  handleItemChange(item.id, {
                                    sharedCartonGroupId: e.target.value,
                                  })
                                }
                                className="w-full h-6 px-1 text-[10px] bg-slate-50 border border-slate-200 rounded text-slate-700"
                              >
                                <option value="">{t.sharedCartonAuto}</option>
                                <option value="NONE">{t.sharedCartonNone}</option>
                                <option value="mix-1">{t.sharedCartonGroupPrefix} 1</option>
                                <option value="mix-2">{t.sharedCartonGroupPrefix} 2</option>
                                <option value="mix-3">{t.sharedCartonGroupPrefix} 3</option>
                              </select>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="py-2 px-3 align-top text-right font-mono-tabular text-xs text-slate-600 leading-8 whitespace-nowrap">
                        {formatNumberNoRound(calc?.netWeightKg ?? 0, 2)} /{' '}
                        {formatNumberNoRound(calc?.grossWeightKg ?? 0, 2)}
                      </td>
                      <td className="py-2 px-3 align-top text-right font-mono-tabular text-xs font-semibold text-slate-900 leading-8 whitespace-nowrap">
                        {formatMoney(calc?.amount ?? 0, order.currency)}
                      </td>
                      <td className="py-2 px-3 align-top text-right">
                        <button
                          type="button"
                          onClick={() => handleDeleteItem(item.id)}
                          aria-label={`Delete item ${item.sku || idx + 1}`}
                          className="p-1.5 text-slate-400 hover:text-red-600 rounded transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Summary Packing & Goods Bar */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 items-center text-xs">
          <div>
            <span className="text-slate-500">{t.totalQty}: </span>
            <span className="font-mono-tabular font-semibold text-slate-900">
              {summary.totalQuantity.toLocaleString()}
            </span>
          </div>
          <div>
            <span className="text-slate-500">{t.totalCartons}: </span>
            <span
              data-testid="summary-total-cartons"
              className="font-mono-tabular font-semibold text-slate-900"
            >
              {summary.totalCartons}
            </span>
            {summary.unmergedCartons > summary.totalCartons && (
              <span
                data-testid="consolidated-savings-hint"
                className="block text-[10px] font-medium text-amber-700 mt-0.5"
              >
                {t.consolidatedSavingsHint
                  .replace('{raw}', String(summary.unmergedCartons))
                  .replace('{merged}', String(summary.totalCartons))}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <label
              htmlFor="order-pallet-count"
              className="text-slate-600 font-medium whitespace-nowrap"
            >
              {t.usedPalletsLabel}:
            </label>
            <input
              id="order-pallet-count"
              data-testid="order-pallet-count-input"
              type="number"
              min={0}
              step="any"
              value={order.palletCount ?? 0}
              onChange={(e) =>
                updateOrder({
                  palletCount: Math.max(0, Number(e.target.value) || 0),
                })
              }
              className="w-20 h-7 px-2 text-right font-mono-tabular font-semibold text-blue-800 bg-white border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
          <div>
            <span className="text-slate-500">{t.totalNw}: </span>
            <span className="font-mono-tabular font-semibold text-slate-900">
              {formatNumberNoRound(summary.totalNetWeightKg, 2)} kg
            </span>
          </div>
          <div>
            <span className="text-slate-500">{t.totalGw}: </span>
            <span
              data-testid="summary-total-gw"
              className="font-mono-tabular font-semibold text-slate-900"
            >
              {formatNumberNoRound(summary.totalGrossWeightKg, 2)} kg
            </span>
          </div>
          <div>
            <span className="text-slate-500">{t.totalCbm}: </span>
            <span
              data-testid="summary-total-cbm"
              className="font-mono-tabular font-semibold text-slate-900"
            >
              {formatNumberNoRound(summary.totalCbm, 3)} m³
            </span>
          </div>
        </div>
        <div className="px-5 py-1.5 bg-slate-50/70 border-t border-slate-100 text-[11px] text-slate-500 flex flex-wrap items-center justify-between gap-2">
          <span>{t.palletSpecHint}</span>
          <span className="font-mono-tabular">
            G.W. = {formatNumberNoRound(summary.cartonsGrossWeightKg, 2)} kg (货+箱) +{' '}
            {formatNumberNoRound(summary.palletsGrossWeightKg, 2)} kg (托盘) · CBM ={' '}
            {formatNumberNoRound(summary.cartonsCbm, 3)} +{' '}
            {formatNumberNoRound(summary.palletsCbm, 3)} m³
          </span>
        </div>

        {/* Carton -> Pallet -> Empty Carton Auto-Conversion Rule Strip */}
        {(() => {
          const autoPack = calculatePalletPacking(summary.totalCartons, {
            cartonsPerLayer: effectiveCartonsPerLayer,
          });
          const curPallets = order.palletCount ?? autoPack.palletCount;
          const curEmpty = order.emptyCartons ?? autoPack.emptyCartons;
          return (
            <div
              data-testid="pallet-packing-rule-bar"
              className="px-5 py-3 bg-blue-50/50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs"
            >
              <div className="space-y-0.5">
                <div className="font-semibold text-slate-800">
                  {t.packingAutoCardTitle} ·{' '}
                  <span className="font-mono-tabular text-blue-800">
                    {curPallets} Pallets / {summary.totalCartons} Cartons / {curEmpty} Empty
                  </span>
                </div>
                <div className="text-[11px] text-slate-600">
                  {autoPack.usesPallet
                    ? t.packingRulePallet
                        .replace('{cartons}', String(summary.totalCartons))
                        .replace('{pallets}', String(autoPack.palletCount))
                        .replace('{empty}', String(autoPack.emptyCartons))
                    : t.packingRuleDirect}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <label
                  htmlFor="order-cartons-per-layer"
                  className="text-[11px] font-medium text-slate-600"
                >
                  {t.cartonsPerLayerLabel}
                </label>
                <input
                  id="order-cartons-per-layer"
                  type="number"
                  min={1}
                  max={60}
                  step="any"
                  value={effectiveCartonsPerLayer}
                  onChange={(e) => {
                    const nextLayer = Math.max(
                      1,
                      Number(e.target.value) || 12,
                    );
                    const nextPack = calculatePalletPacking(summary.totalCartons, {
                      cartonsPerLayer: nextLayer,
                    });
                    updateOrder({
                      cartonsPerLayer: nextLayer,
                      palletCount: nextPack.palletCount,
                      emptyCartons: nextPack.emptyCartons,
                    });
                  }}
                  className="w-16 h-7 px-2 text-right font-mono-tabular text-xs bg-white border border-slate-300 rounded"
                />
                <button
                  type="button"
                  onClick={() =>
                    updateOrder({
                      palletCount: autoPack.palletCount,
                      emptyCartons: autoPack.emptyCartons,
                    })
                  }
                  className="px-2.5 py-1 text-[11px] font-semibold text-blue-700 bg-white border border-blue-200 rounded hover:bg-blue-50 whitespace-nowrap"
                >
                  {t.btnAutoCalcPacking}
                </button>
              </div>
            </div>
          );
        })()}
      </section>

      {/* Section 3: Shipping Management + Linked Auto-Calculation Split */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left: Shipping Mode, Logistics Provider, Incoterms */}
        <section className="xl:col-span-7 bg-white border border-slate-200 rounded-lg p-5 space-y-5">
          <h2 className="text-sm font-semibold text-slate-900">
            {t.shippingSectionTitle}
          </h2>

          {/* Transport Mode Selector */}
          <div>
            <span className="block text-xs font-medium text-slate-700 mb-2">
              {t.transportMode}
            </span>
            <div
              role="group"
              aria-label={t.transportMode}
              className="grid grid-cols-2 sm:grid-cols-4 gap-2"
            >
              {(['SEA', 'AIR', 'EXPRESS', 'LAND'] as TransportMode[]).map(
                (mode) => {
                  const active = order.shipping.mode === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => handleModeChange(mode)}
                      className={`flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold rounded-md border transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {modeIcons[mode]}
                      <span className="truncate">{t.modeLabels[mode]}</span>
                    </button>
                  );
                },
              )}
            </div>
          </div>

          {/* Logistics Provider + Incoterms 2020 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="shipping-provider"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                {t.logisticsProvider}
              </label>
              <select
                id="shipping-provider"
                value={order.shipping.logisticsProviderId}
                onChange={(e) =>
                  updateShipping({ logisticsProviderId: e.target.value })
                }
                className="w-full h-9 px-3 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                {matchingProviders.map((lp) => {
                  const supports = lp.supportedModes.includes(order.shipping.mode);
                  return (
                    <option key={lp.id} value={lp.id}>
                      {lp.name} ({lp.supportedModes.join('/')}
                      {supports ? '' : ' · Other'})
                    </option>
                  );
                })}
              </select>
            </div>

            <div>
              <label
                htmlFor="shipping-incoterm-place"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                {t.incotermPlace}
              </label>
              <input
                id="shipping-incoterm-place"
                type="text"
                value={order.shipping.incotermPlace}
                onChange={(e) =>
                  updateShipping({ incotermPlace: e.target.value })
                }
                className="w-full h-9 px-3 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          {/* Incoterms 2020 Selector Grid */}
          <div>
            <span className="block text-xs font-medium text-slate-700 mb-2">
              {t.incotermLabel}
            </span>
            <div
              role="group"
              aria-label={t.incotermLabel}
              className="grid grid-cols-5 sm:grid-cols-10 gap-1.5"
            >
              {INCOTERMS.map((term) => {
                const active = order.shipping.incoterm === term;
                return (
                  <button
                    key={term}
                    type="button"
                    onClick={() => updateShipping({ incoterm: term })}
                    className={`py-2 px-1 text-xs font-mono-tabular font-semibold rounded border transition-colors ${
                      active
                        ? 'bg-blue-700 text-white border-blue-700'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {term}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Mode-Specific Routing & Document Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-slate-100">
            <div>
              <label
                htmlFor="shipping-origin"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                {modeFieldLabels.origin}
              </label>
              <input
                id="shipping-origin"
                type="text"
                value={order.shipping.portOfLoading}
                onChange={(e) =>
                  updateShipping({ portOfLoading: e.target.value })
                }
                className="w-full h-9 px-3 text-sm bg-white border border-slate-300 rounded-md"
              />
            </div>

            <div>
              <label
                htmlFor="shipping-dest"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                {modeFieldLabels.dest}
              </label>
              <input
                id="shipping-dest"
                type="text"
                value={order.shipping.portOfDischarge}
                onChange={(e) =>
                  updateShipping({ portOfDischarge: e.target.value })
                }
                className="w-full h-9 px-3 text-sm bg-white border border-slate-300 rounded-md"
              />
            </div>

            <div>
              <label
                htmlFor="shipping-carrier-ref"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                {modeFieldLabels.carrier}
              </label>
              <input
                id="shipping-carrier-ref"
                type="text"
                value={order.shipping.vesselOrFlightOrCourier}
                onChange={(e) =>
                  updateShipping({ vesselOrFlightOrCourier: e.target.value })
                }
                className="w-full h-9 px-3 text-sm bg-white border border-slate-300 rounded-md"
              />
            </div>

            <div>
              <label
                htmlFor="shipping-doc-no"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                {modeFieldLabels.docNo}
              </label>
              <input
                id="shipping-doc-no"
                type="text"
                value={order.shipping.trackingOrBlNo}
                onChange={(e) =>
                  updateShipping({ trackingOrBlNo: e.target.value })
                }
                className="w-full h-9 px-3 text-sm font-mono-tabular bg-white border border-slate-300 rounded-md"
              />
            </div>

            <div>
              <label
                htmlFor="shipping-etd"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                {t.etdLabel}
              </label>
              <input
                id="shipping-etd"
                type="date"
                value={order.shipping.etd}
                onChange={(e) => updateShipping({ etd: e.target.value })}
                className="w-full h-9 px-3 text-sm font-mono-tabular bg-white border border-slate-300 rounded-md"
              />
            </div>

            <div>
              <label
                htmlFor="shipping-eta"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                {t.etaLabel}
              </label>
              <input
                id="shipping-eta"
                type="date"
                value={order.shipping.eta}
                onChange={(e) => updateShipping({ eta: e.target.value })}
                className="w-full h-9 px-3 text-sm font-mono-tabular bg-white border border-slate-300 rounded-md"
              />
            </div>

            <div>
              <label
                htmlFor="shipping-marks"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                {t.shippingMarksMain}
              </label>
              <input
                id="shipping-marks"
                type="text"
                value={order.shipping.shippingMarksMain}
                onChange={(e) =>
                  updateShipping({ shippingMarksMain: e.target.value })
                }
                className="w-full h-9 px-3 text-sm bg-white border border-slate-300 rounded-md"
              />
            </div>

            <div>
              <label
                htmlFor="shipping-case-prefix"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                {t.caseNumberPrefix}
              </label>
              <input
                id="shipping-case-prefix"
                type="text"
                value={order.shipping.caseNumberPrefix}
                onChange={(e) =>
                  updateShipping({ caseNumberPrefix: e.target.value })
                }
                className="w-full h-9 px-3 text-sm font-mono-tabular bg-white border border-slate-300 rounded-md"
              />
            </div>
          </div>

          <div className="pt-2">
            <label
              htmlFor="order-remarks"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              {t.remarks}
            </label>
            <textarea
              id="order-remarks"
              rows={2}
              value={order.remarks}
              onChange={(e) => updateOrder({ remarks: e.target.value })}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md"
            />
          </div>
        </section>

        {/* Right: Linked Auto-Calculation Engine */}
        <section className="xl:col-span-5 bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200">
            <h2 className="text-sm font-semibold text-slate-900">
              {t.calcSectionTitle}
            </h2>
            <span className="font-mono-tabular text-xs font-semibold text-blue-700">
              {order.shipping.incoterm} · {order.currency}
            </span>
          </div>

          {/* 1. Goods Subtotal & EXW Auto-Link */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">{t.goodsSubtotal}</span>
              <span
                data-testid="calc-goods-subtotal"
                className="font-mono-tabular font-semibold text-slate-900"
              >
                {formatMoney(summary.goodsSubtotal, order.currency)}
              </span>
            </div>

            <div className="flex items-center justify-between gap-3 text-sm">
              <label htmlFor="cost-packing" className="text-slate-600 shrink-0">
                {t.packingCost}
              </label>
              <input
                id="cost-packing"
                type="number"
                min={0}
                step="any"
                value={order.costs.packingHandlingCost}
                onChange={(e) =>
                  updateCosts({
                    packingHandlingCost: Number(e.target.value) || 0,
                  })
                }
                className="w-32 h-8 px-2.5 text-right text-sm font-mono-tabular border border-slate-300 rounded-md"
              />
            </div>

            {/* Highlighted Auto-Linked EXW Total */}
            <div className="flex items-center justify-between px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-md">
              <span className="text-xs font-semibold text-slate-900">
                {t.exwSubtotal}
              </span>
              <span
                data-testid="calc-exw-total"
                className="text-sm font-mono-tabular font-bold text-slate-900"
              >
                {formatMoney(summary.exwTotal, order.currency)}
              </span>
            </div>
          </div>

          {/* 2. Freight, Insurance & Duties with Incoterm Inclusion Indicator */}
          <div className="space-y-3 pt-3 border-t border-slate-100">
            {/* Inland Freight */}
            <CostRowInput
              id="cost-inland"
              label={t.inlandFreight}
              value={order.costs.inlandFreightCost}
              included={summary.flags.includesInland}
              includedLabel={t.includedTag}
              excludedLabel={t.excludedTag}
              onChange={(val) => updateCosts({ inlandFreightCost: val })}
            />

            {/* Main Freight */}
            <CostRowInput
              id="cost-main-freight"
              label={t.mainFreight}
              value={order.costs.mainFreightCost}
              included={summary.flags.includesMainFreight}
              includedLabel={t.includedTag}
              excludedLabel={t.excludedTag}
              onChange={(val) => updateCosts({ mainFreightCost: val })}
            />

            {/* Insurance Mode & Value */}
            <div className="pt-2 pb-1 space-y-2">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-slate-600 font-medium">
                  {t.insuranceMode}
                </span>
                <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded">
                  <button
                    type="button"
                    onClick={() => updateCosts({ insuranceMode: 'MANUAL' })}
                    className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                      order.costs.insuranceMode === 'MANUAL'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600'
                    }`}
                  >
                    {t.insuranceManual}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      updateCosts({ insuranceMode: 'AUTO_PERCENT' })
                    }
                    className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                      order.costs.insuranceMode === 'AUTO_PERCENT'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600'
                    }`}
                  >
                    {t.insuranceAuto}
                  </button>
                </div>
              </div>

              {order.costs.insuranceMode === 'AUTO_PERCENT' ? (
                <div className="flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <label
                      htmlFor="cost-ins-rate"
                      className="text-slate-700 text-sm block truncate"
                    >
                      {t.insuranceRate}
                    </label>
                    <InclusionStatus
                      included={summary.flags.includesInsurance}
                      includedLabel={t.includedTag}
                      excludedLabel={t.excludedTag}
                    />
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <input
                      id="cost-ins-rate"
                      type="number"
                      min={0}
                      step="any"
                      value={order.costs.insuranceRatePercent}
                      onChange={(e) =>
                        updateCosts({
                          insuranceRatePercent: Number(e.target.value) || 0,
                        })
                      }
                      className="w-20 h-8 px-2 text-right text-sm font-mono-tabular border border-slate-300 rounded-md"
                    />
                    <span className="text-xs font-mono-tabular text-slate-700 w-24 text-right">
                      = {formatMoney(summary.insuranceCost, order.currency)}
                    </span>
                  </div>
                </div>
              ) : (
                <CostRowInput
                  id="cost-ins-manual"
                  label={t.insuranceCost}
                  value={order.costs.insuranceManualCost}
                  included={summary.flags.includesInsurance}
                  includedLabel={t.includedTag}
                  excludedLabel={t.excludedTag}
                  onChange={(val) => updateCosts({ insuranceManualCost: val })}
                />
              )}
            </div>

            {/* Destination Handling */}
            <CostRowInput
              id="cost-dest-handling"
              label={t.destHandling}
              value={order.costs.destinationHandlingCost}
              included={summary.flags.includesDestinationHandling}
              includedLabel={t.includedTag}
              excludedLabel={t.excludedTag}
              onChange={(val) => updateCosts({ destinationHandlingCost: val })}
            />

            {/* Import Duty */}
            <CostRowInput
              id="cost-import-duty"
              label={t.importDuty}
              value={order.costs.importDutyTaxCost}
              included={summary.flags.includesImportDuty}
              includedLabel={t.includedTag}
              excludedLabel={t.excludedTag}
              onChange={(val) => updateCosts({ importDutyTaxCost: val })}
            />
          </div>

          {/* 3. Final Quoted Total */}
          <div className="pt-4 border-t border-slate-200 flex items-baseline justify-between gap-4">
            <div>
              <div className="text-xs font-medium text-slate-500">
                {t.finalTotal}
              </div>
              <div className="text-xs font-mono-tabular text-slate-600 mt-0.5">
                {order.shipping.incoterm} {order.shipping.incotermPlace}
              </div>
            </div>
            <div
              data-testid="calc-incoterm-total"
              className="text-2xl font-bold font-mono-tabular text-blue-700"
            >
              {formatMoney(summary.incotermTotal, order.currency)}
            </div>
          </div>
        </section>
      </div>

      {/* Section 4: Document Header & Pallet Packing Layout (Collapsible) */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => setShowDocLayoutEditor((v) => !v)}
          aria-expanded={showDocLayoutEditor}
          className="w-full px-5 py-3.5 flex items-center justify-between text-left hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-blue-700" />
            <span className="text-sm font-semibold text-slate-900">
              {t.docLayoutSectionTitle}
            </span>
          </div>
          {showDocLayoutEditor ? (
            <ChevronUp className="w-4 h-4 text-slate-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-500" />
          )}
        </button>

        {showDocLayoutEditor && (
          <div className="px-5 pb-5 pt-3 border-t border-slate-200 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label
                  htmlFor="doc-item-header"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  {t.lblItemHeader}
                </label>
                <input
                  id="doc-item-header"
                  type="text"
                  value={order.itemHeader ?? ''}
                  placeholder="HARDLOCK NUT (HLN)"
                  onChange={(e) => updateOrder({ itemHeader: e.target.value })}
                  className="w-full h-9 px-3 text-sm bg-white border border-slate-300 rounded-md"
                />
              </div>

              <div>
                <label
                  htmlFor="doc-pallet-count"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  {t.lblPalletCount}
                </label>
                <input
                  id="doc-pallet-count"
                  type="number"
                  min={0}
                  step="any"
                  value={order.palletCount ?? 0}
                  onChange={(e) =>
                    updateOrder({ palletCount: Number(e.target.value) || 0 })
                  }
                  className="w-full h-9 px-3 text-sm font-mono-tabular bg-white border border-slate-300 rounded-md"
                />
              </div>

              <div>
                <label
                  htmlFor="doc-empty-cartons"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  {t.lblEmptyCartons}
                </label>
                <input
                  id="doc-empty-cartons"
                  type="number"
                  min={0}
                  step="any"
                  value={order.emptyCartons ?? 0}
                  onChange={(e) =>
                    updateOrder({ emptyCartons: Number(e.target.value) || 0 })
                  }
                  className="w-full h-9 px-3 text-sm font-mono-tabular bg-white border border-slate-300 rounded-md"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="doc-pallet-volumes"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  {t.lblPalletVolumeDetails}
                </label>
                <textarea
                  id="doc-pallet-volumes"
                  rows={3}
                  placeholder="Pallet 1-9: 8.058M3 (1.1x1.1x0.74m)"
                  value={order.palletVolumeDetails ?? ''}
                  onChange={(e) =>
                    updateOrder({ palletVolumeDetails: e.target.value })
                  }
                  className="w-full px-3 py-2 text-xs font-mono-tabular bg-white border border-slate-300 rounded-md"
                />
              </div>

              <div>
                <label
                  htmlFor="doc-surface-footnotes"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  {t.lblSurfaceFootnotes}
                </label>
                <textarea
                  id="doc-surface-footnotes"
                  rows={3}
                  placeholder="*CR3:ZINC TRIVALENT CHROMATE&#10;*MP:MANGANESE PHOSPHATE"
                  value={order.surfaceFootnotes ?? ''}
                  onChange={(e) =>
                    updateOrder({ surfaceFootnotes: e.target.value })
                  }
                  className="w-full px-3 py-2 text-xs font-mono-tabular bg-white border border-slate-300 rounded-md"
                />
              </div>
            </div>

            {/* Custom Packing List Rows Editor (supports mixed cartons & pallet merges) */}
            <div className="pt-3 border-t border-slate-100 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-slate-900">
                    {t.packingRowsEditorTitle}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {t.packingRowsHint}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleAutoBuildPackingRows}
                    className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100"
                  >
                    {t.btnAutoBuildPackingRows}
                  </button>
                  <button
                    type="button"
                    onClick={handleAddPackingRow}
                    className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50"
                  >
                    {t.btnAddPackingRow}
                  </button>
                  {(order.packingRows?.length ?? 0) > 0 && (
                    <button
                      type="button"
                      onClick={() => updateOrder({ packingRows: [] })}
                      className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 rounded hover:bg-slate-200"
                    >
                      {t.btnClearPackingRows}
                    </button>
                  )}
                </div>
              </div>

              {(order.packingRows?.length ?? 0) > 0 && (
                <div className="overflow-x-auto border border-slate-200 rounded-md">
                  <table className="w-full text-left border-collapse min-w-[820px] text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                        <th className="py-2 px-2 w-16">{t.lblPalletNo}</th>
                        <th className="py-2 px-2 w-24">{t.lblCtnNo}</th>
                        <th className="py-2 px-2 w-14 text-right">#</th>
                        <th className="py-2 px-2">Type / SKU</th>
                        <th className="py-2 px-2 w-20">{t.lblSize}</th>
                        <th className="py-2 px-2 w-24">{t.lblMaterial}</th>
                        <th className="py-2 px-2 w-16">{t.lblSurfaceFinish}</th>
                        <th className="py-2 px-2 w-20 text-right">{t.lblSetsPerCtn}</th>
                        <th className="py-2 px-2 w-16 text-right">{t.colCartons}</th>
                        <th className="py-2 px-2 w-20 text-right">{t.colQty}</th>
                        <th className="py-2 px-2 w-20 text-right">U.W</th>
                        <th className="py-2 px-2 w-10" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(order.packingRows ?? []).map((row) => (
                        <tr key={row.id}>
                          <td className="p-1.5">
                            <input
                              type="text"
                              value={row.palletNo}
                              onChange={(e) =>
                                handleUpdatePackingRow(row.id, {
                                  palletNo: e.target.value,
                                })
                              }
                              className="w-full h-7 px-1.5 font-mono-tabular border border-slate-200 rounded"
                            />
                          </td>
                          <td className="p-1.5">
                            <input
                              type="text"
                              value={row.ctnNo}
                              onChange={(e) =>
                                handleUpdatePackingRow(row.id, {
                                  ctnNo: e.target.value,
                                })
                              }
                              className="w-full h-7 px-1.5 font-mono-tabular border border-slate-200 rounded"
                            />
                          </td>
                          <td className="p-1.5">
                            <input
                              type="number"
                              min={1}
                              value={row.itemNo}
                              onChange={(e) =>
                                handleUpdatePackingRow(row.id, {
                                  itemNo: Number(e.target.value) || 1,
                                })
                              }
                              className="w-full h-7 px-1.5 text-right font-mono-tabular border border-slate-200 rounded"
                            />
                          </td>
                          <td className="p-1.5">
                            <input
                              type="text"
                              value={row.type}
                              onChange={(e) =>
                                handleUpdatePackingRow(row.id, {
                                  type: e.target.value,
                                })
                              }
                              className="w-full h-7 px-1.5 font-mono-tabular border border-slate-200 rounded"
                            />
                          </td>
                          <td className="p-1.5">
                            <input
                              type="text"
                              value={row.size}
                              onChange={(e) =>
                                handleUpdatePackingRow(row.id, {
                                  size: e.target.value,
                                })
                              }
                              className="w-full h-7 px-1.5 font-mono-tabular border border-slate-200 rounded"
                            />
                          </td>
                          <td className="p-1.5">
                            <input
                              type="text"
                              value={row.material}
                              onChange={(e) =>
                                handleUpdatePackingRow(row.id, {
                                  material: e.target.value,
                                })
                              }
                              className="w-full h-7 px-1.5 font-mono-tabular border border-slate-200 rounded"
                            />
                          </td>
                          <td className="p-1.5">
                            <input
                              type="text"
                              value={row.surfaceFinish}
                              onChange={(e) =>
                                handleUpdatePackingRow(row.id, {
                                  surfaceFinish: e.target.value,
                                })
                              }
                              className="w-full h-7 px-1.5 font-mono-tabular border border-slate-200 rounded"
                            />
                          </td>
                          <td className="p-1.5">
                            <input
                              type="number"
                              min={0}
                              step="any"
                              value={row.setsPerCarton}
                              onChange={(e) =>
                                handleUpdatePackingRow(row.id, {
                                  setsPerCarton: Number(e.target.value) || 0,
                                })
                              }
                              className="w-full h-7 px-1.5 text-right font-mono-tabular border border-slate-200 rounded"
                            />
                          </td>
                          <td className="p-1.5">
                            <input
                              type="number"
                              min={0}
                              step="any"
                              value={row.cartonCount}
                              onChange={(e) =>
                                handleUpdatePackingRow(row.id, {
                                  cartonCount: Number(e.target.value) || 0,
                                })
                              }
                              className="w-full h-7 px-1.5 text-right font-mono-tabular border border-slate-200 rounded"
                            />
                          </td>
                          <td className="p-1.5">
                            <input
                              type="number"
                              min={0}
                              step="any"
                              value={row.qty}
                              onChange={(e) =>
                                handleUpdatePackingRow(row.id, {
                                  qty: Number(e.target.value) || 0,
                                })
                              }
                              className="w-full h-7 px-1.5 text-right font-mono-tabular border border-slate-200 rounded"
                            />
                          </td>
                          <td className="p-1.5">
                            <input
                              type="number"
                              min={0}
                              step="any"
                              value={row.unitWeightKg}
                              onChange={(e) =>
                                handleUpdatePackingRow(row.id, {
                                  unitWeightKg: Number(e.target.value) || 0,
                                })
                              }
                              className="w-full h-7 px-1.5 text-right font-mono-tabular border border-slate-200 rounded"
                            />
                          </td>
                          <td className="p-1.5 text-right">
                            <button
                              type="button"
                              onClick={() => handleDeletePackingRow(row.id)}
                              aria-label={`Delete packing row ${row.id}`}
                              className="p-1 text-slate-400 hover:text-red-600"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

interface CostRowInputProps {
  id: string;
  label: string;
  value: number;
  included: boolean;
  includedLabel: string;
  excludedLabel: string;
  onChange: (value: number) => void;
}

const CostRowInput: React.FC<CostRowInputProps> = ({
  id,
  label,
  value,
  included,
  includedLabel,
  excludedLabel,
  onChange,
}) => (
  <div className="flex items-center justify-between gap-3 text-sm">
    <div className="min-w-0">
      <label htmlFor={id} className="text-slate-700 block truncate">
        {label}
      </label>
      <InclusionStatus
        included={included}
        includedLabel={includedLabel}
        excludedLabel={excludedLabel}
      />
    </div>
    <input
      id={id}
      type="number"
      min={0}
      step="any"
      value={value}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
      className={`w-32 h-8 px-2.5 text-right text-sm font-mono-tabular border rounded-md shrink-0 ${
        included
          ? 'border-slate-300 bg-white text-slate-900'
          : 'border-slate-200 bg-slate-50 text-slate-400'
      }`}
    />
  </div>
);

const InclusionStatus: React.FC<{
  included: boolean;
  includedLabel: string;
  excludedLabel: string;
}> = ({ included, includedLabel, excludedLabel }) => (
  <span
    className={`inline-flex items-center gap-1 text-[11px] font-medium ${
      included ? 'text-emerald-700' : 'text-slate-400'
    }`}
  >
    {included ? (
      <Check className="w-3 h-3" />
    ) : (
      <Minus className="w-3 h-3" />
    )}
    <span>{included ? includedLabel : excludedLabel}</span>
  </span>
);
