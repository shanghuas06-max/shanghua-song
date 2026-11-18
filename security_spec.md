# HARDLOCK Export Management System v3 — Firestore Security Specification

## 1. Data Invariants
1. **Per-User Strict Tenant Isolation**: Every business document (`customers`, `suppliers`, `logisticsProviders`, `bankAccounts`, `products`, `orders`, `auditLogs`) lives exclusively under `/users/{userId}/...` and carries `ownerId == userId == request.auth.uid`. No user can read, list, create, update, or delete another user's workspace or records.
2. **Email Verification Gate**: All authenticated reads and writes require `request.auth != null && request.auth.token.email_verified == true`.
3. **Master Gate Integrity**: No subcollection record under `/users/{userId}/...` can be accessed or created unless `/users/{userId}` exists (`hasParentUser(userId)`).
4. **Path Variable Hardening**: Every document ID (`userId`, `customerId`, `supplierId`, `providerId`, `bankId`, `productId`, `orderId`, `logId`) must match `^[a-zA-Z0-9_\-]+$` with length `1..128`.
5. **Strict Key & Volumetric Boundaries**: Every write validates `hasAll` + `hasOnly`, strict data types, `.size()` caps on every string, `.size() <= 50` on `orders.items`, `.size() <= 4` on `logisticsProviders.supportedModes`, immutable `ownerId`/`id`/`createdAt`, and server-enforced `request.time` timestamps.

## 2. The "Dirty Dozen" Adversarial Payloads
| # | Attack Vector | Target Collection | Expected Result | Guard Mechanism |
|---|---|---|---|---|
| 1 | Unauthenticated `get` / `list` | `/users/{uid}/orders` | `PERMISSION_DENIED` | `isSignedIn()` + `isVerifiedOwner()` |
| 2 | Unverified Email (`email_verified: false`) | `/users/{uid}` | `PERMISSION_DENIED` | `request.auth.token.email_verified == true` |
| 3 | Cross-Tenant Read/List (`uidA` queries `uidB`) | `/users/{uidB}/customers` | `PERMISSION_DENIED` | `isVerifiedOwner(userId)` + `resource.data.ownerId == request.auth.uid` |
| 4 | Cross-Tenant Identity Spoof (`ownerId: uidB` on create) | `/users/{uidA}/orders/{id}` | `PERMISSION_DENIED` | `data.ownerId == request.auth.uid && data.ownerId == userId` |
| 5 | Shadow / Ghost Field Injection (`isAdmin: true`) | `/users/{uidA}` | `PERMISSION_DENIED` | `data.keys().hasOnly([...])` |
| 6 | Path ID Poisoning (`id: "../admin"` or 500 chars) | `/users/{uidA}/products/{id}` | `PERMISSION_DENIED` | `isValidId(docId)` |
| 7 | Oversized String / Denial-of-Wallet (`address` > 1000 chars) | `/users/{uidA}/customers/{id}` | `PERMISSION_DENIED` | `data.address.size() <= 1000` |
| 8 | Unbounded Array Injection (`items.size() == 51`) | `/users/{uidA}/orders/{id}` | `PERMISSION_DENIED` | `data.items.size() <= 50` |
| 9 | Client Clock Spoofing (`createdAt` != `request.time`) | `/users/{uidA}/orders/{id}` | `PERMISSION_DENIED` | `incoming().createdAt == request.time` |
| 10 | Immutable `ownerId` / `createdAt` Mutation on Update | `/users/{uidA}/orders/{id}` | `PERMISSION_DENIED` | `incoming().ownerId == existing().ownerId && incoming().createdAt == existing().createdAt` |
| 11 | Orphaned Subcollection Write (no parent `/users/{uid}`) | `/users/{uid}/orders/{id}` | `PERMISSION_DENIED` | `hasParentUser(userId)` |
| 12 | Immutable Audit Log Tampering (`update` on `auditLogs`) | `/users/{uidA}/auditLogs/{id}` | `PERMISSION_DENIED` | `allow update: if false;` |
