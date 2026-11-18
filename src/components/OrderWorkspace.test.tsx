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
      supplier={undefined}
      bank={undefined}
      logistics={undefined}
      docLang="en"
      onChangeDocLang={() => {}}
      onCreateNewOrder={() => {}}
      t={t}
    />,
  );
  assert.match(html, /data-testid="empty-doc-state"/);
  assert.match(html, /暂无订单，请先点击右上角「新建订单」/);
});
