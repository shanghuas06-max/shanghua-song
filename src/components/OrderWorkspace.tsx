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
} from 'lucide-react';
import type {
  BankAccount,
  CurrencyCode,
  Customer,
  ExportOrder,
  IncotermCode,
  LogisticsProvider,
  OrderItem,
  Product,
  Supplier,
  TransportMode,
} from '../types/erp';
import type { UiDictionary } from '../i18n/uiTranslations';
import {
  calculateOrderSummary,
  formatMoney,
} from '../utils/exportCalculations';

interface OrderWorkspaceProps {
  order: ExportOrder;
  customers: Customer[];
  suppliers: Supplier[];
  logisticsProviders: LogisticsProvider[];
  bankAccounts: BankAccount[];
  products: Product[];
  onChangeOrder: (updated: ExportOrder) => void;
  onCreateNewOrder: () => void;
  onDuplicateOrder: () => void;
  onOpenDocuments: () => void;
  t: UiDictionary;
}

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
  t,
}) => {
  const [selectedProductId, setSelectedProductId] = useState<string>(
    products[0]?.id ?? '',
  );

  const summary = useMemo(
    () =>
      calculateOrderSummary(
        order.items,
        order.costs,
        order.shipping.incoterm,
        order.currency,
      ),
    [order.items, order.costs, order.shipping.incoterm, order.currency],
  );

  const matchingProviders = useMemo(() => {
    const preferred = logisticsProviders.filter((lp) =>
      lp.supportedModes.includes(order.shipping.mode),
    );
    const others = logisticsProviders.filter(
      (lp) => !lp.supportedModes.includes(order.shipping.mode),
    );
    return [...preferred, ...others];
  }, [logisticsProviders, order.shipping.mode]);

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

  const handleCustomerSelect = (customerId: string) => {
    const cust = customers.find((c) => c.id === customerId);
    if (!cust) {
      updateOrder({ customerId });
      return;
    }
    const shortMark = cust.name.split(' ')[0].toUpperCase();
    onChangeOrder({
      ...order,
      customerId,
      currency: cust.defaultCurrency,
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
    const prod = products.find((p) => p.id === selectedProductId) ?? products[0];
    if (!prod) return;
    const defaultQty = prod.defaultUnitsPerCarton || 100;
    const newItem: OrderItem = {
      id: `oi-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      productId: prod.id,
      sku: prod.sku,
      description: prod.nameEn,
      hsCode: prod.hsCode,
      quantity: defaultQty,
      unit: prod.unit,
      unitPrice: prod.unitPrice,
      cartons: 1,
      unitNetWeightKg: prod.unitNetWeightKg,
      unitGrossWeightKg: prod.unitGrossWeightKg,
      cartonLengthCm: prod.cartonLengthCm,
      cartonWidthCm: prod.cartonWidthCm,
      cartonHeightCm: prod.cartonHeightCm,
      originCountry: prod.originCountry,
    };
    updateOrder({ items: [...order.items, newItem] });
  };

  const handleAddBlankItem = () => {
    const newItem: OrderItem = {
      id: `oi-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      productId: '',
      sku: '',
      description: '',
      hsCode: '7318.16.00',
      quantity: 100,
      unit: 'PCS',
      unitPrice: 1,
      cartons: 1,
      unitNetWeightKg: 0.05,
      unitGrossWeightKg: 0.055,
      cartonLengthCm: 40,
      cartonWidthCm: 30,
      cartonHeightCm: 20,
      originCountry: 'JAPAN',
    };
    updateOrder({ items: [...order.items, newItem] });
  };

  const handleItemChange = (itemId: string, patch: Partial<OrderItem>) => {
    const nextItems = order.items.map((item) => {
      if (item.id !== itemId) return item;
      const updated = { ...item, ...patch };
      // If quantity changed and item comes from a catalog product, auto-recalculate cartons when appropriate
      if (typeof patch.quantity === 'number' && item.productId) {
        const prod = products.find((p) => p.id === item.productId);
        if (prod && prod.defaultUnitsPerCarton > 0) {
          updated.cartons = Math.max(
            1,
            Math.ceil(patch.quantity / prod.defaultUnitsPerCarton),
          );
        }
      }
      return updated;
    });
    updateOrder({ items: nextItems });
  };

  const handleDeleteItem = (itemId: string) => {
    updateOrder({ items: order.items.filter((i) => i.id !== itemId) });
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 pt-4 border-t border-slate-100">
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
                updateOrder({ currency: e.target.value as CurrencyCode })
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

          <div>
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
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className="h-9 px-3 text-xs bg-white border border-slate-300 rounded-md max-w-[260px]"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sku} · {p.nameEn}
                </option>
              ))}
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
          </div>
        </div>

        <div className="overflow-x-auto">
          {order.items.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-slate-500">
              {t.emptyItems}
            </div>
          ) : (
            <table className="w-full text-left border-collapse min-w-[1040px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
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
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/70">
                      <td className="py-2 px-3 align-top">
                        <input
                          type="text"
                          aria-label={`${t.colSku} row ${idx + 1}`}
                          value={item.sku}
                          onChange={(e) =>
                            handleItemChange(item.id, { sku: e.target.value })
                          }
                          className="w-full h-8 px-2 text-xs font-mono-tabular border border-slate-200 rounded bg-white"
                        />
                      </td>
                      <td className="py-2 px-3 align-top">
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
                          step="0.01"
                          aria-label={`${t.colUnitPrice} row ${idx + 1}`}
                          value={item.unitPrice}
                          onChange={(e) =>
                            handleItemChange(item.id, {
                              unitPrice: Number(e.target.value) || 0,
                            })
                          }
                          className="w-full h-8 px-2 text-xs text-right font-mono-tabular border border-slate-200 rounded bg-white"
                        />
                      </td>
                      <td className="py-2 px-3 align-top">
                        <input
                          type="number"
                          min={0}
                          aria-label={`${t.colCartons} row ${idx + 1}`}
                          value={item.cartons}
                          onChange={(e) =>
                            handleItemChange(item.id, {
                              cartons: Number(e.target.value) || 0,
                            })
                          }
                          className="w-full h-8 px-2 text-xs text-right font-mono-tabular border border-slate-200 rounded bg-white"
                        />
                      </td>
                      <td className="py-2 px-3 align-top text-right font-mono-tabular text-xs text-slate-600 leading-8 whitespace-nowrap">
                        {calc?.netWeightKg.toFixed(2)} / {calc?.grossWeightKg.toFixed(2)}
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
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 grid grid-cols-2 sm:grid-cols-5 gap-4 text-xs">
          <div>
            <span className="text-slate-500">{t.totalQty}: </span>
            <span className="font-mono-tabular font-semibold text-slate-900">
              {summary.totalQuantity.toLocaleString()}
            </span>
          </div>
          <div>
            <span className="text-slate-500">{t.totalCartons}: </span>
            <span className="font-mono-tabular font-semibold text-slate-900">
              {summary.totalCartons}
            </span>
          </div>
          <div>
            <span className="text-slate-500">{t.totalNw}: </span>
            <span className="font-mono-tabular font-semibold text-slate-900">
              {summary.totalNetWeightKg.toFixed(2)} kg
            </span>
          </div>
          <div>
            <span className="text-slate-500">{t.totalGw}: </span>
            <span className="font-mono-tabular font-semibold text-slate-900">
              {summary.totalGrossWeightKg.toFixed(2)} kg
            </span>
          </div>
          <div>
            <span className="text-slate-500">{t.totalCbm}: </span>
            <span className="font-mono-tabular font-semibold text-slate-900">
              {summary.totalCbm.toFixed(3)} m³
            </span>
          </div>
        </div>
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
                step="0.01"
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
                      step="0.05"
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
      step="0.01"
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
