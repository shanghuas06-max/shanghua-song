import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  BLUEPRINT_LIMITS,
  isValidFirestoreId,
  sanitizeCustomerPayload,
  sanitizeLogisticsPayload,
  sanitizeOrderPayload,
  sanitizeProductPayload,
} from './src/utils/firestoreSanitizers';
import { createInitialErpState } from './src/data/seedData';

test('Dirty Dozen #4 & #6: ID validation rejects path traversal and oversized IDs', () => {
  assert.equal(isValidFirestoreId('ord-2026-001'), true);
  assert.equal(isValidFirestoreId('../admin'), false);
  assert.equal(isValidFirestoreId('id with spaces'), false);
  assert.equal(isValidFirestoreId('a'.repeat(129)), false);
  assert.equal(isValidFirestoreId(''), false);
});

test('Dirty Dozen #7 & #8: Volumetric sanitizers enforce blueprint string and array bounds', () => {
  const seed = createInitialErpState();
  const baseOrder = seed.orders[0];
  const oversizedOrder = {
    ...baseOrder,
    remarks: 'X'.repeat(2500),
    items: Array.from({ length: 65 }, (_, idx) => ({
      ...baseOrder.items[0],
      id: `oi-${idx}`,
      quantity: -5,
    })),
  };

  const sanitized = sanitizeOrderPayload(oversizedOrder, 'user-abc');
  assert.equal(sanitized.ownerId, 'user-abc');
  assert.equal(sanitized.remarks.length, BLUEPRINT_LIMITS.LONG_MAX);
  assert.equal(sanitized.items.length, BLUEPRINT_LIMITS.MAX_ORDER_ITEMS);
  assert.equal(sanitized.items[0].quantity, 0);
});

test('Sanitizers clamp customer, product, and logistics payloads cleanly', () => {
  const seed = createInitialErpState();
  const sanitizedCustom = sanitizeCustomerPayload(
    {
      ...seed.customers[0],
      address: 'A'.repeat(1500),
      notifyParty: undefined,
      fax: undefined,
      taxOrImporterId: undefined,
      customPrices: [
        { productId: 'prod-1', unitPrice: 1.45 },
        { productId: '../bad', unitPrice: 99 },
        {
          productId: 'prod-2',
          unitPrice: -5,
          tieredPrices: [{ minQty: 500, maxQty: null, unitPrice: 88 }],
        },
      ],
    },
    'uid-123',
  );
  assert.equal(sanitizedCustom.address.length, BLUEPRINT_LIMITS.LONG_MAX);
  assert.equal(sanitizedCustom.notifyParty, '');
  assert.equal(sanitizedCustom.fax, '');
  assert.equal(sanitizedCustom.taxOrImporterId, '');
  assert.equal(sanitizedCustom.ownerId, 'uid-123');
  assert.deepEqual(sanitizedCustom.customPrices, [
    { productId: 'prod-1', unitPrice: 1.45, tieredPrices: [] },
    {
      productId: 'prod-2',
      unitPrice: 0,
      tieredPrices: [{ minQty: 500, maxQty: null, unitPrice: 88 }],
    },
  ]);

  const defaultCustomer = sanitizeCustomerPayload(
    { ...seed.customers[0], customPrices: undefined },
    'uid-123',
  );
  assert.deepEqual(defaultCustomer.customPrices, []);

  const logistics = sanitizeLogisticsPayload(
    { ...seed.logisticsProviders[0], supportedModes: [] },
    'uid-123',
  );
  assert.deepEqual(logistics.supportedModes, ['SEA']);

  const product = sanitizeProductPayload(
    {
      ...seed.products[0],
      unitPrice: -10,
      defaultUnitsPerCarton: 0,
      tieredPrices: [{ minQty: 100, maxQty: 500, unitPrice: 400 }],
    },
    'uid-123',
  );
  assert.equal(product.unitPrice, 0);
  assert.equal(product.defaultUnitsPerCarton, 1);
  assert.equal(product.currency, 'JPY');
  assert.equal(product.tieredPrices.length, 1);
});

test('firestore.rules includes default-deny catch-all, email_verified gate, and all blueprint collections', () => {
  const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
  assert.equal(fs.existsSync(rulesPath), true, 'firestore.rules must exist');
  const content = fs.readFileSync(rulesPath, 'utf8');

  assert.match(content, /match \/\{document=\*\*\}\s*\{\s*allow read, write: if false;\s*\}/);
  assert.match(content, /request\.auth\.token\.email_verified == true/);
  assert.match(content, /id\.matches\('\^\[a-zA-Z0-9_-\]\+\$'\)/);
  assert.doesNotMatch(content, /hasParentUser/);
  assert.match(content, /taxOrImporterId/);
  assert.match(content, /tieredPrices/);
  assert.match(content, /exchangeRate/);
  assert.match(content, /cartonsPerLayer/);
  for (const col of [
    'customers',
    'suppliers',
    'logisticsProviders',
    'bankAccounts',
    'products',
    'orders',
    'auditLogs',
  ]) {
    assert.match(content, new RegExp(`match /${col}/\\{`), `Missing rules for ${col}`);
  }
});

test('Empty-master new order payload satisfies all firestore.rules order keys and ID rules', () => {
  const newOrderPayload = sanitizeOrderPayload(
    {
      id: 'ord-1794974911865',
      invoiceNo: 'HL-INV-2026-1110',
      poNo: 'PO-1110',
      orderDate: '2026-11-17',
      paymentTerms: 'T/T IN ADVANCE',
      currency: 'USD',
      supplierId: '',
      customerId: '',
      bankAccountId: '',
      items: [],
      shipping: {
        mode: 'SEA',
        logisticsProviderId: '',
        incoterm: 'FOB',
        incotermPlace: 'OSAKA',
        portOfLoading: 'OSAKA PORT, JAPAN',
        portOfDischarge: '',
        vesselOrFlightOrCourier: '',
        trackingOrBlNo: '',
        etd: '2026-11-17',
        eta: '2026-11-17',
        shippingMarksMain: 'HARDLOCK',
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
      createdAt: '2026-11-17T08:00:00.000Z',
      updatedAt: '2026-11-17T08:00:00.000Z',
    },
    'lR7l5ycBWuN33sMDB5ZWKuuof7n1',
  );

  assert.equal(isValidFirestoreId(newOrderPayload.id), true);
  assert.equal(isValidFirestoreId(newOrderPayload.ownerId), true);
  assert.equal(Object.keys(newOrderPayload).length, 25); // + createdAt & updatedAt serverTimestamp = 27
  assert.equal(Object.keys(newOrderPayload.shipping).length, 12);
  assert.equal(Object.keys(newOrderPayload.costs).length, 8);
  assert.equal(newOrderPayload.exchangeRate, 150);
  assert.equal(newOrderPayload.cartonsPerLayer, 12);
  assert.equal(newOrderPayload.billToCustomerId, '');
  assert.equal(newOrderPayload.itemHeader, '');
  assert.equal(newOrderPayload.palletCount, 0);
  assert.equal(newOrderPayload.emptyCartons, 0);
  assert.deepEqual(newOrderPayload.packingRows, []);
});
