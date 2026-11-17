# PNAP Security Specification (Phase 1 — FUR & State Machine)

## 1. Data Invariants (Consolidated 8 Improvements)
1. **Global Safety Net:** All unmatched Firestore paths deny read and write (`allow read, write: if false`).
2. **Authoritative Role Lookup:** `isAdmin()` checks `exists(/databases/$(database)/documents/pnap_admins/$(request.auth.uid))` or verified bootstrap admin email (`3silajaneiro@gmail.com` with `email_verified == true`), never client token claims.
3. **Provincial Isolation:** Provincial users (`PROVINCIAL_COMMAND`, `ESTABLISHMENT_DIRECTOR`, `OPERATIONAL_OFFICER`, `PENAL_CONTROL`, `REHABILITATION`, `GATE_SECURITY`, provincial `AUDITOR_INSPECTOR`) may only read/query records where `resource.data.provinceId == getUserProvince()`.
4. **Single National Identity (`pnap_identity_locks`):** Identity locks (`lockKey`) are strictly backend-managed (`allow create, update, delete: if false;` on client SDKs) to guarantee atomic uniqueness of `inmateId` / `matricula` / `biNumber`.
5. **Orthogonal Custody & Judicial Processes (`judicial_processes`):** Subcollection under `/pnap_inmates/{inmateId}` stores independent processes. Client SDKs cannot delete or arbitrarily mark processes `EXTINTO` to bypass definitive release checks.
6. **Strict Clinical Secrecy (`health_records`):** `/pnap_inmates/{inmateId}/health_records/{recordId}` is strictly isolated to `HEALTH_SPECIALIST` users matching the parent inmate's `provinceId` (Master Gate `get()` on parent FUR). Even `CENTRAL_ADMIN`, `ESTABLISHMENT_DIRECTOR`, and `OPERATIONAL_OFFICER` are DENIED clinical read/write access; only non-clinical `healthAlerts` live on the FUR root.
7. **Tamper-Proof Audit Trail (`pnap_audit_logs`):** Client SDKs are **100% forbidden** from `create`, `update`, and `delete` (`allow create, update, delete: if false;`). Only the Express backend via Firebase Admin SDK writes audit events. Reads are allowed only for `CENTRAL_ADMIN`, `AUDITOR_INSPECTOR`, or `PROVINCIAL_COMMAND` scoped to their province.
8. **Backend-Authoritative State Transitions & Optimistic Concurrency:** `pnap_movements`, `pnap_identity_locks`, `pnap_admissions`, `pnap_releases`, `pnap_legal_transitions`, and client `pnap_inmates` state transitions enforce strict monotonic `version` (`incoming().version == existing().version + 1`), terminal custody locks (`LIBERTADO`, `FALECIDO`), and disallow non-admin state mutation bypasses.
9. **No Self-Assigned Privileges:** Users cannot create or update `assignments` (`role`, `assignedProvinceId`, `assignedEstablishmentId`) in `pnap_users/{uid}`.
10. **Strict Path ID & Payload Size Bounds:** All document IDs match `^[a-zA-Z0-9_-]+$` (`<= 128` chars) and every string/list enforces explicit `.size()` boundaries.
11. **Visitor & Visit Control Isolation (`pnap_visitors`, `pnap_visits`):** Scoped strictly by `provinceId` (read-only for non-admin client SDKs; mutations executed exclusively via backend state validation against inmate custody state and disciplinary visit blocks).

## 2. The "Dirty Dozen" + State Machine Attack Payloads (All Must Return PERMISSION_DENIED)
1. **Unauthenticated Read:** Anonymous client attempts `get(/pnap_inmates/inm-lua-001)` -> DENIED.
2. **ID Poisoning:** Authenticated user attempts `get(/pnap_establishments/<1500-char-id>)` -> DENIED (`isValidId`).
3. **Self-Assigned Admin:** Provincial user writes `/pnap_users/{uid}` setting `assignments.role = "CENTRAL_ADMIN"` -> DENIED.
4. **Admin Collection Escalation:** Non-admin attempts `create(/pnap_admins/{uid})` -> DENIED.
5. **Cross-Province Inmate Read:** Luanda user executes `get(/pnap_inmates/inm-hua-001)` (`provinceId == "huambo"`) -> DENIED.
6. **Blanket Query Scraping:** Non-admin queries `collection(db, "pnap_inmates")` without provincial `where` -> DENIED (`allow list` evaluates `resource.data.provinceId`).
7. **Shadow Field Injection:** Authorized caller injects undocumented `shadowVerified: true` on `/pnap_inmates/{id}` or `/pnap_catalogs/{id}` -> DENIED (`hasOnly`).
8. **Email Spoofing (`email_verified: false`):** Token with `email == "3silajaneiro@gmail.com"` and `email_verified == false` attempts admin write -> DENIED.
9. **Clinical Data Exfiltration (Improvement #6):** `CENTRAL_ADMIN`, `PROVINCIAL_COMMAND`, or `OPERATIONAL_OFFICER` attempts `get(/pnap_inmates/inm-lua-001/health_records/hr-001)` -> DENIED (strict `HEALTH_SPECIALIST` gate).
10. **Audit Log Forgery / Tampering (Improvement #7):** Any client SDK user (including `CENTRAL_ADMIN`) attempts `create`, `update`, or `delete` on `/pnap_audit_logs/{eventId}` -> DENIED.
11. **Identity Lock / Movement Bypass (Improvements #1 & #4):** Client SDK attempts `create` or `update` on `/pnap_identity_locks/{lockKey}` or `/pnap_movements/{movementId}` -> DENIED.
12. **Terminal Release / Version Conflict Bypass (Improvements #3 & #8):** Client attempts updating `/pnap_inmates/{id}` after `currentStatus == "LIBERTADO"` or without incrementing `version` -> DENIED.
