import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { UI_TEXT } from '../i18n/uiTranslations';
import { createInitialErpState } from '../data/seedData';
import { resolveActiveOrder } from '../utils/exportCalculations';
import { TopHeader } from './TopHeader';
import { OrderWorkspace } from './OrderWorkspace';
import { DocumentGenerator } from './DocumentGenerator';
import { MasterDataManager } from './MasterDataManager';
import { HistoryBackupManager } from './HistoryBackupManager';
import { SystemSettingsPanel } from './SystemSettingsPanel';
import { SidebarNav } from './SidebarNav';
import { createDefaultContractSettings } from '../utils/contractDefaults';

test('resolveActiveOrder handles empty, stale, and matching order IDs', () => {
  const seed = createInitialErpState();
  assert.equal(resolveActiveOrder([], 'any-id'), undefined);
  assert.equal(resolveActiveOrder(seed.orders, 'non-existent')?.id, seed.orders[0].id);
  assert.equal(resolveActiveOrder(seed.orders, seed.orders[1].id)?.id, seed.orders[1].id);
});

test('TopHeader permanently renders New Order button even when no orders exist', () => {
  const t = UI_TEXT.zh;
  const html = renderToStaticMarkup(
    <TopHeader
      activeSection="order"
      activeInvoiceNo=""
      hasActiveOrder={false}
      onOpenMobileNav={() => {}}
      onCreateNewOrder={() => {}}
      onSaveOrder={() => {}}
      onGoToPrint={() => {}}
      t={t}
      saveFeedback={null}
    />,
  );
  assert.match(html, /新建订单/);
  assert.match(html, /保存订单/);
  assert.match(html, /打印出口单据/);
});

test('OrderWorkspace mounts and shows explicit empty state when order is undefined', () => {
  const t = UI_TEXT.zh;
  const html = renderToStaticMarkup(
    <OrderWorkspace
      order={undefined}
      customers={[]}
      suppliers={[]}
      logisticsProviders={[]}
      bankAccounts={[]}
      products={[]}
      onChangeOrder={() => {}}
      onCreateNewOrder={() => {}}
      onDuplicateOrder={() => {}}
      onOpenDocuments={() => {}}
      onOpenHistory={() => {}}
      t={t}
    />,
  );
  assert.match(html, /data-testid="empty-order-state"/);
  assert.match(html, /暂无订单，请点击右上角「新建订单」/);
  assert.match(html, /新建订单/);
});

test('DocumentGenerator mounts and shows explicit empty state when order is undefined', () => {
  const t = UI_TEXT.zh;
  const html = renderToStaticMarkup(
    <DocumentGenerator
      order={undefined}
      customer={undefined}
      billToCustomer={undefined}
      supplier={undefined}
      bank={undefined}
      logistics={undefined}
      products={[]}
      docLang="en"
      onChangeDocLang={() => {}}
      onCreateNewOrder={() => {}}
      t={t}
    />,
  );
  assert.match(html, /data-testid="empty-doc-state"/);
  assert.match(html, /暂无订单，请先点击右上角「新建订单」/);
});

test('DocumentGenerator renders formal HARDLOCK Invoice and Packing List layout fields', () => {
  const seed = createInitialErpState();
  const order = seed.orders[0];
  const customer = seed.customers.find((c) => c.id === order.customerId);
  const supplier = seed.suppliers.find((s) => s.id === order.supplierId);
  const bank = seed.bankAccounts.find((b) => b.id === order.bankAccountId);
  const logistics = seed.logisticsProviders.find(
    (l) => l.id === order.shipping.logisticsProviderId,
  );

  const invoiceHtml = renderToStaticMarkup(
    <DocumentGenerator
      order={order}
      customer={customer}
      billToCustomer={customer}
      supplier={supplier}
      bank={bank}
      logistics={logistics}
      products={seed.products}
      docLang="en"
      onChangeDocLang={() => {}}
      onCreateNewOrder={() => {}}
      t={UI_TEXT.zh}
    />,
  );

  assert.match(invoiceHtml, /HARDLOCK Industry Co\., Ltd\./);
  assert.match(invoiceHtml, /BILL TO :/);
  assert.match(invoiceHtml, /SHIP TO :/);
  assert.match(invoiceHtml, /Surface.*Finish/);
  assert.match(invoiceHtml, /Ex-works Total/);
  assert.match(invoiceHtml, /FREIGHT PREPAID/);
  assert.match(invoiceHtml, /COUNTRY OF ORIGIN : JAPAN/);
  assert.match(invoiceHtml, /Bank Information/);
  assert.match(invoiceHtml, /BIC : BOTKJPJT/);

  const packingHtml = renderToStaticMarkup(
    <DocumentGenerator
      order={{
        ...order,
        packingRows: [
          {
            id: 'r1',
            palletNo: '7',
            ctnNo: '391',
            itemNo: 1,
            type: 'HLN-R10C-8CR',
            size: 'M10x1.5',
            material: 'S45C',
            surfaceFinish: 'CR3',
            setsPerCarton: 400,
            cartonCount: 1,
            sharedCarton: true,
            qty: 400,
            unitWeightKg: 0.018,
            totalWeightKg: 7.2,
          },
          {
            id: 'r2',
            palletNo: '7',
            ctnNo: '391',
            itemNo: 2,
            type: 'HLN-R12C-8/4CR',
            size: 'M12x1.75',
            material: 'S45C/SS400',
            surfaceFinish: 'CR3',
            setsPerCarton: 200,
            cartonCount: 1,
            sharedCarton: true,
            qty: 200,
            unitWeightKg: 0.026,
            totalWeightKg: 5.2,
          },
        ],
      }}
      customer={customer}
      billToCustomer={customer}
      supplier={supplier}
      bank={bank}
      logistics={logistics}
      products={seed.products}
      docLang="en"
      initialDocTab="packing"
      onChangeDocLang={() => {}}
      onCreateNewOrder={() => {}}
      t={UI_TEXT.zh}
    />,
  );

  assert.match(packingHtml, /PACKING LIST/);
  assert.match(packingHtml, /DELIVER TO :/);
  assert.match(packingHtml, /Pallet.*No\./);
  assert.match(packingHtml, /Ctn\..*No\./);
  assert.match(packingHtml, /rowSpan="2"/);
  assert.match(packingHtml, /border-top-style:dotted/);
  assert.match(packingHtml, /1 cartons/);
  assert.match(packingHtml, /Country of Origin : Japan/);
  assert.match(invoiceHtml, /导出为 Excel/);
});

test('MasterDataManager renders CSV/Excel import + template buttons on products tab and custom-price badge on customers tab', () => {
  const seed = createInitialErpState();
  const productsHtml = renderToStaticMarkup(
    <MasterDataManager
      customers={seed.customers}
      suppliers={seed.suppliers}
      logisticsProviders={seed.logisticsProviders}
      bankAccounts={seed.bankAccounts}
      products={seed.products}
      initialTab="products"
      onSaveCustomer={() => {}}
      onDeleteCustomer={() => {}}
      onSaveSupplier={() => {}}
      onDeleteSupplier={() => {}}
      onSaveLogistics={() => {}}
      onDeleteLogistics={() => {}}
      onSaveBank={() => {}}
      onDeleteBank={() => {}}
      onSaveProduct={() => {}}
      onBatchImportProducts={() => {}}
      onDeleteProduct={() => {}}
      t={UI_TEXT.zh}
    />,
  );
  assert.match(productsHtml, /下载导入模板/);
  assert.match(productsHtml, /导入数据/);

  const custWithCustom = {
    ...seed.customers[0],
    customPrices: [{ productId: seed.products[0].id, unitPrice: 8.88 }],
  };
  const customersHtml = renderToStaticMarkup(
    <MasterDataManager
      customers={[custWithCustom]}
      suppliers={seed.suppliers}
      logisticsProviders={seed.logisticsProviders}
      bankAccounts={seed.bankAccounts}
      products={seed.products}
      initialTab="customers"
      onSaveCustomer={() => {}}
      onDeleteCustomer={() => {}}
      onSaveSupplier={() => {}}
      onDeleteSupplier={() => {}}
      onSaveLogistics={() => {}}
      onDeleteLogistics={() => {}}
      onSaveBank={() => {}}
      onDeleteBank={() => {}}
      onSaveProduct={() => {}}
      onDeleteProduct={() => {}}
      t={UI_TEXT.zh}
    />,
  );
  assert.match(customersHtml, /1 专属价/);
});

test('OrderWorkspace shows custom-price badge and HistoryBackupManager renders Export to Excel button', () => {
  const seed = createInitialErpState();
  const order = seed.orders[0];
  const custWithCustom = {
    ...seed.customers.find((c) => c.id === order.customerId)!,
    customPrices: [{ productId: order.items[0].productId, unitPrice: 7.77 }],
  };
  const wsHtml = renderToStaticMarkup(
    <OrderWorkspace
      order={order}
      customers={[custWithCustom]}
      suppliers={seed.suppliers}
      logisticsProviders={seed.logisticsProviders}
      bankAccounts={seed.bankAccounts}
      products={seed.products}
      onChangeOrder={() => {}}
      onCreateNewOrder={() => {}}
      onDuplicateOrder={() => {}}
      onOpenDocuments={() => {}}
      onOpenHistory={() => {}}
      t={UI_TEXT.zh}
    />,
  );
  assert.match(wsHtml, /专属价/);

  const historyHtml = renderToStaticMarkup(
    <HistoryBackupManager
      orders={seed.orders}
      activeOrderId={order.id}
      customers={seed.customers}
      auditLogs={seed.auditLogs}
      snapshots={[]}
      onLoadOrder={() => {}}
      onDeleteOrder={() => {}}
      onExportBackup={() => {}}
      onImportBackup={() => {}}
      onCreateSnapshot={() => {}}
      onRestoreSnapshot={() => {}}
      onResetDemo={() => {}}
      t={UI_TEXT.zh}
    />,
  );
  assert.match(historyHtml, /导出为 Excel/);
});

test('OrderWorkspace renders exchange rate input for non-JPY orders and pallet auto-conversion strip', () => {
  const seed = createInitialErpState();
  const usdOrder = {
    ...seed.orders[0],
    currency: 'USD' as const,
    exchangeRate: 150,
    cartonsPerLayer: 12,
  };
  const wsUsdHtml = renderToStaticMarkup(
    <OrderWorkspace
      order={usdOrder}
      customers={seed.customers}
      suppliers={seed.suppliers}
      logisticsProviders={seed.logisticsProviders}
      bankAccounts={seed.bankAccounts}
      products={seed.products}
      onChangeOrder={() => {}}
      onCreateNewOrder={() => {}}
      onDuplicateOrder={() => {}}
      onOpenDocuments={() => {}}
      onOpenHistory={() => {}}
      t={UI_TEXT.zh}
    />,
  );
  assert.match(wsUsdHtml, /data-testid="exchange-rate-field"/);
  assert.match(wsUsdHtml, /1 USD = 150 JPY/);
  assert.match(wsUsdHtml, /data-testid="pallet-packing-rule-bar"/);
  assert.match(wsUsdHtml, /箱单与托盘自动换算规则/);

  const jpyOrder = {
    ...usdOrder,
    currency: 'JPY' as const,
    exchangeRate: 1,
  };
  const wsJpyHtml = renderToStaticMarkup(
    <OrderWorkspace
      order={jpyOrder}
      customers={seed.customers}
      suppliers={seed.suppliers}
      logisticsProviders={seed.logisticsProviders}
      bankAccounts={seed.bankAccounts}
      products={seed.products}
      onChangeOrder={() => {}}
      onCreateNewOrder={() => {}}
      onDuplicateOrder={() => {}}
      onOpenDocuments={() => {}}
      onOpenHistory={() => {}}
      t={UI_TEXT.zh}
    />,
  );
  assert.doesNotMatch(wsJpyHtml, /data-testid="exchange-rate-field"/);
});

test('DocumentGenerator renders optional Fax, Tax ID, and non-JPY Exchange Rate line', () => {
  const seed = createInitialErpState();
  const order = {
    ...seed.orders[0],
    currency: 'USD' as const,
    exchangeRate: 155,
  };
  const customer = {
    ...seed.customers.find((c) => c.id === order.customerId)!,
    fax: '03-5555-6666',
    taxOrImporterId: 'TAX-999-001',
  };
  const supplier = seed.suppliers.find((s) => s.id === order.supplierId)!;
  const bank = seed.bankAccounts.find((b) => b.id === order.bankAccountId)!;

  const html = renderToStaticMarkup(
    <DocumentGenerator
      order={order}
      customer={customer}
      billToCustomer={customer}
      supplier={supplier}
      bank={bank}
      logistics={seed.logisticsProviders[0]}
      products={seed.products}
      docLang="en"
      onChangeDocLang={() => {}}
      onCreateNewOrder={() => {}}
      t={UI_TEXT.zh}
    />,
  );
  assert.match(html, /Fax : 03-5555-6666/);
  assert.match(html, /Tax ID : TAX-999-001/);
  assert.match(html, /\*Exchange Rate : 1 USD = 155 JPY/);
});

test('DocumentGenerator renders Contract/PI sheet, WYSIWYG editable fields, special field controls, and customer template export button', () => {
  const seed = createInitialErpState();
  const order = {
    ...seed.orders[0],
    docOverrides: {
      'contract.buyerName': 'CUSTOM EDITED BUYER CORP',
    },
    docSpecialFields: {
      showCompanyStamp: true,
      showSignature: true,
      showDisclaimer: true,
      disclaimerText: 'Only valid for {invoiceNo}',
      customNote: 'Customs note XYZ',
    },
  };
  const customer = {
    ...seed.customers.find((c) => c.id === order.customerId)!,
    documentTemplates: [
      {
        id: 'tpl-1',
        name: 'VIP Contract Template',
        fileName: 'vip-contract.docx',
        fileType: 'docx' as const,
        docScope: 'contract' as const,
        fileBase64: 'UEs=',
        mappings: [],
        uploadedAt: '2026-11-18T00:00:00.000Z',
      },
    ],
  };
  const supplier = seed.suppliers.find((s) => s.id === order.supplierId)!;
  const bank = seed.bankAccounts.find((b) => b.id === order.bankAccountId)!;

  const contractHtml = renderToStaticMarkup(
    <DocumentGenerator
      order={order}
      customer={customer}
      billToCustomer={customer}
      supplier={supplier}
      bank={bank}
      logistics={seed.logisticsProviders[0]}
      products={seed.products}
      docLang="en"
      initialDocTab="contract"
      contractSettings={createDefaultContractSettings()}
      onChangeOrder={() => {}}
      onChangeDocLang={() => {}}
      onCreateNewOrder={() => {}}
      t={UI_TEXT.zh}
    />,
  );

  assert.match(contractHtml, /data-testid="sheet-contract"/);
  assert.match(contractHtml, /合 同/);
  assert.match(contractHtml, /CONTRACT/);
  assert.match(contractHtml, /CUSTOM EDITED BUYER CORP/);
  assert.match(contractHtml, /NAME OF COMMODITY/);
  assert.match(contractHtml, /TOTAL VALUE/);
  assert.match(contractHtml, /contenteditable="true"/i);
  assert.match(contractHtml, /插入特殊字段/);
  assert.match(contractHtml, /Company Stamp/);
  assert.match(contractHtml, /Only valid for /);
  assert.match(contractHtml, /Customs note XYZ/);
  assert.match(contractHtml, /按客户模板导出/);
});

test('SystemSettingsPanel and SidebarNav render system settings navigation and contract clauses editor', () => {
  const settingsHtml = renderToStaticMarkup(
    <SystemSettingsPanel
      settings={createDefaultContractSettings()}
      onSaveSettings={() => {}}
      t={UI_TEXT.zh}
    />,
  );
  assert.match(settingsHtml, /data-testid="system-settings-panel"/);
  assert.match(settingsHtml, /保存系统设置/);
  assert.match(settingsHtml, /仲裁与仲裁地点/);
  assert.match(settingsHtml, /ARBITRATION/);

  const sidebarHtml = renderToStaticMarkup(
    <SidebarNav
      activeSection="settings"
      onSelectSection={() => {}}
      uiLang="zh"
      onChangeUiLang={() => {}}
      docLang="en"
      onChangeDocLang={() => {}}
      t={UI_TEXT.zh}
      mobileOpen={false}
      onCloseMobile={() => {}}
      ordersCount={2}
      masterCount={10}
      userEmail="test@example.com"
      userDisplayName="Tester"
      onSignOut={() => {}}
    />,
  );
  assert.match(sidebarHtml, /系统设置与合同条款/);
});

test('OrderWorkspace renders pallet count input with weight/CBM breakdown and DocumentGenerator renders Contract .docx export button and editable packing summary', () => {
  const seed = createInitialErpState();
  const order = {
    ...seed.orders[0],
    palletCount: 2,
  };
  const customer = seed.customers.find((c) => c.id === order.customerId)!;
  const supplier = seed.suppliers.find((s) => s.id === order.supplierId)!;
  const bank = seed.bankAccounts.find((b) => b.id === order.bankAccountId)!;

  const wsHtml = renderToStaticMarkup(
    <OrderWorkspace
      order={order}
      customers={seed.customers}
      suppliers={seed.suppliers}
      logisticsProviders={seed.logisticsProviders}
      bankAccounts={seed.bankAccounts}
      products={seed.products}
      onChangeOrder={() => {}}
      onCreateNewOrder={() => {}}
      onDuplicateOrder={() => {}}
      onOpenDocuments={() => {}}
      onOpenHistory={() => {}}
      t={UI_TEXT.zh}
    />,
  );
  assert.match(wsHtml, /data-testid="order-pallet-count-input"/);
  assert.match(wsHtml, /data-testid="summary-total-gw"/);
  assert.match(wsHtml, /data-testid="summary-total-cbm"/);
  assert.match(wsHtml, /单托盘17kg/);
  assert.match(wsHtml, /34\.00 kg \(托盘\)/);

  const docContractHtml = renderToStaticMarkup(
    <DocumentGenerator
      order={order}
      customer={customer}
      billToCustomer={customer}
      supplier={supplier}
      bank={bank}
      logistics={seed.logisticsProviders[0]}
      products={seed.products}
      docLang="en"
      initialDocTab="contract"
      contractSettings={createDefaultContractSettings()}
      onChangeOrder={() => {}}
      onChangeDocLang={() => {}}
      onCreateNewOrder={() => {}}
      t={UI_TEXT.zh}
    />,
  );
  assert.match(docContractHtml, /data-testid="export-contract-docx-btn"/);
  assert.match(docContractHtml, /导出合同 Word \(\.docx\)/);
  assert.match(docContractHtml, /data-editable-key="contract\.buyerPhone"/);
  assert.match(docContractHtml, /data-editable-key="contract\.preambleZh"/);

  const docPackingHtml = renderToStaticMarkup(
    <DocumentGenerator
      order={order}
      customer={customer}
      billToCustomer={customer}
      supplier={supplier}
      bank={bank}
      logistics={seed.logisticsProviders[0]}
      products={seed.products}
      docLang="en"
      initialDocTab="packing"
      contractSettings={createDefaultContractSettings()}
      onChangeOrder={() => {}}
      onChangeDocLang={() => {}}
      onCreateNewOrder={() => {}}
      t={UI_TEXT.zh}
    />,
  );
  assert.match(docPackingHtml, /data-editable-key="pl\.volumeSummary"/);
  assert.match(docPackingHtml, /data-editable-key="pl\.cartonSize"/);
});

test('OrderWorkspace renders half-carton controls & savings hint, SystemSettingsPanel renders image upload inputs, and DocumentGenerator renders uploaded stamp & signature <img>', () => {
  const TINY_PNG =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const seed = createInitialErpState();
  const baseOrder = seed.orders[0];
  const order = {
    ...baseOrder,
    items: [
      {
        ...baseOrder.items[0],
        id: 'half-ui-1',
        quantity: 150,
        cartons: 1,
        setsPerCarton: 300,
        palletNo: '',
        cartonRange: '',
        sharedCartonGroupId: 'mix-1',
      },
      {
        ...baseOrder.items[1],
        id: 'half-ui-2',
        quantity: 80,
        cartons: 1,
        setsPerCarton: 160,
        palletNo: '',
        cartonRange: '',
        sharedCartonGroupId: 'mix-1',
      },
    ],
    docSpecialFields: {
      showCompanyStamp: true,
      showSignature: true,
      showDisclaimer: false,
      disclaimerText: '',
      customNote: '',
    },
  };
  const customer = seed.customers.find((c) => c.id === order.customerId)!;
  const supplier = seed.suppliers.find((s) => s.id === order.supplierId)!;
  const bank = seed.bankAccounts.find((b) => b.id === order.bankAccountId)!;
  const customSettings = {
    ...createDefaultContractSettings(),
    companyStampImage: TINY_PNG,
    signatureImage: TINY_PNG,
  };

  const wsHtml = renderToStaticMarkup(
    <OrderWorkspace
      order={order}
      customers={seed.customers}
      suppliers={seed.suppliers}
      logisticsProviders={seed.logisticsProviders}
      bankAccounts={seed.bankAccounts}
      products={seed.products}
      onChangeOrder={() => {}}
      onCreateNewOrder={() => {}}
      onDuplicateOrder={() => {}}
      onOpenDocuments={() => {}}
      onOpenHistory={() => {}}
      t={UI_TEXT.zh}
    />,
  );
  assert.match(wsHtml, /data-testid="auto-consolidate-btn"/);
  assert.match(wsHtml, /data-testid="half-carton-badge-0"/);
  assert.match(wsHtml, /data-testid="item-shared-group-0"/);
  assert.match(wsHtml, /data-testid="consolidated-savings-hint"/);

  const settingsHtml = renderToStaticMarkup(
    <SystemSettingsPanel
      settings={customSettings}
      onSaveSettings={() => {}}
      t={UI_TEXT.zh}
    />,
  );
  assert.match(settingsHtml, /data-testid="settings-upload-stamp-input"/);
  assert.match(settingsHtml, /data-testid="settings-upload-signature-input"/);
  assert.match(settingsHtml, /data-testid="settings-stamp-preview"/);
  assert.match(settingsHtml, /data-testid="settings-signature-preview"/);

  const packingHtml = renderToStaticMarkup(
    <DocumentGenerator
      order={order}
      customer={customer}
      billToCustomer={customer}
      supplier={supplier}
      bank={bank}
      logistics={seed.logisticsProviders[0]}
      products={seed.products}
      docLang="en"
      initialDocTab="packing"
      contractSettings={customSettings}
      onChangeOrder={() => {}}
      onChangeDocLang={() => {}}
      onUpdateContractSettings={() => {}}
      onCreateNewOrder={() => {}}
      t={UI_TEXT.zh}
    />,
  );
  assert.match(packingHtml, /Pallet 1/);
  assert.match(packingHtml, /data-testid="uploaded-stamp-img"/);
  assert.match(packingHtml, /data-testid="uploaded-signature-img"/);
});



