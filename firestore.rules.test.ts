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
  const customer = sanitizeCustomerPayload(
    { ...seed.customers[0], address: 'A'.repeat(1500), notifyParty: undefined },
    'uid-123',
  );
  assert.equal(customer.address.length, BLUEPRINT_LIMITS.LONG_MAX);
  assert.equal(customer.notifyParty, '');
  assert.equal(customer.ownerId, 'uid-123');

  const logistics = sanitizeLogisticsPayload(
    { ...seed.logisticsProviders[0], supportedModes: [] },
    'uid-123',
  );
  assert.deepEqual(logistics.supportedModes, ['SEA']);

  const product = sanitizeProductPayload(
    { ...seed.products[0], unitPrice: -10, defaultUnitsPerCarton: 0 },
    'uid-123',
  );
  assert.equal(product.unitPrice, 0);
  assert.equal(product.defaultUnitsPerCarton, 1);
});

test('firestore.rules includes default-deny catch-all, email_verified gate, and all blueprint collections', () => {
  const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
  assert.equal(fs.existsSync(rulesPath), true, 'firestore.rules must exist');
  const content = fs.readFileSync(rulesPath, 'utf8');

  assert.match(content, /match \/\{document=\*\*\}\s*\{\s*allow read, write: if false;\s*\}/);
  assert.match(content, /request\.auth\.token\.email_verified == true/);
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
