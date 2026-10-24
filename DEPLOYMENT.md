# Deploy the authenticated backend

The local fix does not change an existing Google Apps Script deployment. Until you complete these steps, an old public deployment remains vulnerable. First restrict access to the old deployment in Apps Script's deployment settings or archive it. Keep the spreadsheet's sharing restricted as well.

## 1. Create a separate private key for each person

From this repo's root, run this command locally (Node.js required), replacing the email with a user listed in `USER_DIRECTORY` in the backend:

```powershell
node security-review/generate-access-key.cjs your-email@example.com
```

The command prints a random 32-byte access key and a JSON object mapping its SHA-256 hash to that email. Save the private key in a password manager. Do not commit it, put it in `config.js`, or upload the output. Each key authenticates its holder as the configured user; it does not independently verify ownership of the email address. Distribute keys privately. Anyone holding a key has that user's access.

Update `USER_DIRECTORY` in the backend to your actual users and intended roles. ADMIN can read, append, edit and delete; EDITOR can read, append and edit; VIEWER can only read. These permissions apply across the shared ledger. Device account labels still control display/tagging and do not grant permissions or isolate users' records.

## 2. Configure Apps Script

1. In your Google Sheet, open **Extensions > Apps Script**.
2. Replace the old backend code with the complete contents of `backend.gs`. Check `SHEET_ID` and `USER_DIRECTORY`. Remove any duplicate old `doGet`/`doPost` handlers from other script files.
3. Open **Project Settings > Script Properties** and add a property named **MYBANK_ACCESS_KEYS**.
4. Paste the generated JSON object as the property value. For multiple users, combine their hash/email entries into one JSON object. Do not paste the private access keys here. Missing, invalid or empty configuration denies access.
5. Save the project. Limit Apps Script project editor access: editors can change the security code and settings.

Script Properties are server-side configuration supported by Google's [Properties service](https://developers.google.com/apps-script/guides/properties). The hash is computed using the Apps Script [Utilities service](https://developers.google.com/apps-script/reference/utilities/utilities).

## 3. Publish the new version and frontend together

1. Use **Deploy > Manage deployments > Edit > New version > Deploy** for the web app. Saving code alone does not update a versioned deployment. Authorize any requested new permissions as the owner.
2. The separately hosted PWA uses owner execution and an endpoint reachable by its users (commonly **Execute as: Me; Who has access: Anyone**). The new backend then enforces private-key authentication on every data request. Confirm the deployment is using the new code and keys before making it reachable. If you archived the old deployment, create a new web app deployment and update `SCRIPT_URL` in `sheetsync-pwa/config.js`.
3. Publish the updated `sheetsync-pwa` folder, including `index.html`, `config.js` and `sw.js`. No private key belongs in this folder. Open/reload the app, allow the updated service worker to activate, then close and reopen existing tabs/installed windows to load the new frontend. If an old screen persists, clear the app's cached files without clearing IndexedDB, which may contain unsynced transactions.
4. Enter the user's private key at login. The old password will not work. The key stays in page memory; a reload requires login again. An existing unlocked page can keep recording locally while offline, but a fresh login requires a connection. This change does not encrypt locally cached financial records or fix the separately reported HTML/formula injection issues.

All data reads now use authenticated POST requests; opening the endpoint URL in a browser must return an error with no financial data. User identity in audit entries comes from the configured key, never from the posted `user` label. Authentication/authorization runs before accessing sheets or taking write locks.

## 4. Verify and revoke old access

- Open the deployed endpoint directly: it must say `Use authenticated POST` and expose no records.
- Confirm an invalid key is denied and each valid user's allowed operations work.
- Confirm VIEWER writes and EDITOR deletes are rejected. Rejected appends must remain pending locally rather than appear synced.
- Archive any other old web app deployments that still run the insecure code. Updating one deployment does not secure other deployment URLs.
- To revoke a key, delete its hash entry from MYBANK_ACCESS_KEYS. Revocation applies to the next request, including from an already unlocked app. To rotate, generate a new key, replace the property entry, and give the new key to its user. Existing downloaded local data cannot be revoked remotely.

Local regression checks: `node security-review/checks.cjs`. These use mocks and do not replace verifying your actual deployment. No live deployment was changed or tested by the local fix.
