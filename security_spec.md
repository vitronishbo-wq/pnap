# PNAP Security Specification (Phase 0)

## 1. Data Invariants
1. **Global Safety Net:** All unmatched Firestore paths deny read and write (`allow read, write: if false`).
2. **Authoritative Role Lookup:** `isAdmin()` checks `exists(/databases/$(database)/documents/pnap_admins/$(request.auth.uid))` or verified bootstrap admin email (`3silajaneiro@gmail.com` with `email_verified == true`), never client token claims.
3. **Provincial Isolation:** Provincial users (`PROVINCIAL_COMMAND`, `ESTABLISHMENT_DIRECTOR`, `OPERATIONAL_OFFICER`) may only read/query records where `resource.data.provinceId == getUserProvince()`.
4. **No Self-Assigned Privileges:** Users cannot create or update `role`, `assignedProvinceId`, or `assignedEstablishmentId` in `pnap_users/{uid}`.
5. **Immutable Audit Trail:** `pnap_audit_logs/{eventId}` forbids `update` and `delete` for all client SDK callers.
6. **Terminal Custody Lock:** Once an inmate's `currentStatus` is terminal (`LIBERTADO`, `FALECIDO`, `EVADIDO`, `TRANSFERIDO`), non-admin client updates are rejected.
7. **Strict Path ID & Payload Size Bounds:** All document IDs match `^[a-zA-Z0-9_-]+$` (`<= 128` chars) and strings/maps enforce explicit size limits.

## 2. The "Dirty Dozen" Attack Payloads (All Must Return PERMISSION_DENIED)
1. **Unauthenticated Read:** Anonymous client attempts `get(/pnap_inmates/inm-lua-001)` -> DENIED.
2. **ID Poisoning:** Authenticated user attempts `get(/pnap_establishments/<1500-char-id>)` -> DENIED (`isValidId`).
3. **Self-Assigned Admin:** Provincial user writes `/pnap_users/{uid}` setting `assignments.role = "CENTRAL_ADMIN"` -> DENIED.
4. **Admin Collection Escalation:** Non-admin attempts `create(/pnap_admins/{uid})` -> DENIED.
5. **Cross-Province Inmate Read:** Luanda user executes `get(/pnap_inmates/inm-hua-001)` (`provinceId == "huambo"`) -> DENIED.
6. **Blanket Query Scraping:** Non-admin queries `collection(db, "pnap_inmates")` without `where("provinceId", "==", assignedProvince)` -> DENIED (`allow list` evaluates `resource.data.provinceId`).
7. **Shadow Field Injection:** Authorized user updates `/pnap_inmates/{id}` injecting undocumented `shadowVerified: true` -> DENIED (`hasOnly`).
8. **Email Spoofing (`email_verified: false`):** Token with `email == "3silajaneiro@gmail.com"` and `email_verified == false` attempts admin write -> DENIED.
9. **Provisioning Escalation:** Provincial Command attempts `create(/pnap_establishments/est-hua-new)` -> DENIED (admin-only).
10. **Audit Log Tampering:** Any user (including admin via client SDK) attempts `update` or `delete` on `/pnap_audit_logs/{eventId}` -> DENIED.
11. **PII Blanket Profile Read:** User A attempts `get(/pnap_users/userB)` -> DENIED.
12. **Terminal State Bypass:** Non-admin attempts updating `/pnap_inmates/{id}` after `currentStatus == "LIBERTADO"` -> DENIED.
