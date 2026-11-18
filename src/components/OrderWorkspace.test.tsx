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
