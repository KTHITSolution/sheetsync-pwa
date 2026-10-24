# Remediation status

Current backend version: `2026-10-24-security-remediation`. This identifies local source, not proof that a versioned Apps Script deployment has been updated. Run `verifyBackendSetup` as the owner after pasting the complete backend and publish a new version before testing the hosted PWA.

| Review sequence | Current source and evidence | Still requires the owner |
| --- | --- | --- |
| 1. Restrict access, check sharing, retain evidence | The configured endpoint denied credential-free GET and invalid-key READ probes. Anonymous spreadsheet CSV export returned HTTP 401 on 24 October 2026; no financial records were printed. | Inventory active deployments and spreadsheet collaborators, archive insecure deployments, and retain spreadsheet/version-history and audit backups. A denied CSV probe does not verify every sharing setting or older URL. |
| 2. Server authentication, roles, audit identity | Every route checks the key hash and role before sheet access. Revoked keys fail on the next request. Audit actors come from verified keys. Every new row, edit, and deletion has a durable intent before mutation and a completion state afterward. | Publish the current backend, protect the audit sheet, and test real VIEWER, EDITOR, and ADMIN keys against disposable records. |
| 3. Safe rendering and sheet writes | Stored values use DOM text nodes. Text writes escape formula prefixes. The backend validates IDs, dates, finite numbers, supported currencies, account tags, category/sub-category pairs, request size, and batch size. Known emoji labels remain compatible. | Verify literal storage using `getFormula()` in a test copy and the deployed version. Custom category pairs must be added to `getCategoryConfig()` and redeployed. |
| 4. Sync acknowledgement and retry | Append responses list `accepted_ids`; only matching, unchanged local records are marked synced. Edits/deletes require a matching acknowledged ID. Missing, malformed, busy, rejected, and partial responses preserve unconfirmed work. Concurrent triggers share one queue; pulls preserve pending local changes. | Deploy the backend first for the complete fixes. An older server reply is accepted only after an authenticated read-back proves the exact record was stored; records absent from its recent-row window remain pending. |
| 5. Browser unlock and offline policy | Keys stay in memory. Lock/sign-out clears the key and rendered records, aborts outstanding requests, and locks other current app tabs. Unlock expires after 15 minutes without interaction or eight hours overall. Revoked-key responses lock the app. A separate erase action confirms pending-work loss before clearing app records/settings. | Use trusted device profiles and complete the deployment tests below. Cached records remain unencrypted until explicitly erased. |

## Browser and offline-data policy

A fresh unlock requires the backend to verify a private key online. An already unlocked page can record offline until its browser unlock expires. Background synchronization does not extend the inactivity limit. Leaving the page locks it. Erasing saved device data deletes the local transaction cache and queued edits after explicit confirmation; it does not delete Google Sheets records. Close older app tabs before erasing data.

The private access key is a revocable bearer credential, not a short-lived server session token. The browser lock timeout clears that credential from this page; it does not expire the key on the server. Server access ends when the hash is removed from `MYBANK_ACCESS_KEYS`. Browser controls are not protection against someone who can access the device profile, developer tools, or unencrypted IndexedDB files. Do not use retained offline data on shared or untrusted devices. Encryption at rest is not implemented, and remote key revocation cannot erase previously downloaded records.

## Audit ordering and recovery

Audit records retain the existing five columns. Each affected transaction gets its own row with a verified actor and JSON details containing `before`, `after`, and `state`:

- `PENDING`: the intent was written and flushed before attempting the financial mutation.
- `COMMITTED`: the mutation and completion update both flushed successfully.
- `UNCERTAIN`: the mutation raised an error; it may have partially applied and needs reconciliation.

An initial audit failure stops the mutation. If a financial write or completion update fails later, the durable intent retains recovery evidence and the API reports failure. Sheets does not provide a transaction spanning these separate calls. Protect `Audit_Log` from non-owner editing and retain backups. For any `PENDING` or `UNCERTAIN` entry, compare its transaction ID and before/after data with the actual Transactions row and spreadsheet version history before restoring or retrying. Do not automatically replay an unresolved entry: it may already have applied. Preserve the original intent and add a reconciliation note. Successful append retries confirm existing identical records without adding duplicates; conflicting ID reuse is rejected.

## Verification

Run these from the repository folder:

```powershell
node security-review/checks.cjs
node security-review/formula-checks.cjs
node security-review/session-sync-checks.cjs
node security-review/xss-checks.cjs
node security-review/category-checks.cjs
node security-review/icon-checks.cjs
```

These tests isolate Google services, browser state, and IndexedDB. They cover anonymous and invalid access, role denial, rotation/revocation, audit failures, idempotent retries, ID acknowledgements, concurrent triggers, lock/expiry, delayed responses, and explicit cache erasure. They do not substitute for Google deployment, sharing, permission, and real-sheet formula checks. Follow [DEPLOYMENT.md](DEPLOYMENT.md) for those checks.

Google documents [deployment versions](https://developers.google.com/apps-script/concepts/deployments) and [formula interpretation by Range writes](https://developers.google.com/apps-script/reference/spreadsheet/range). OWASP explains the limits of [browser storage](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html) and [client-side expiry](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).
