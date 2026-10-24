// --- CONFIGURATION & IAM ---
const SHEET_ID = '1NqBkNkuiiQJc30G3lDny18kGyBv584Q0tp3b6qFtPr4'; // <--- YOUR ID
const BACKEND_VERSION = '2026-10-24-security-remediation';
// Open the spreadsheet only after authentication and authorization succeed.
function getSpreadsheet() {
  return SpreadsheetApp.openById(SHEET_ID);
}

// 1. RBAC Configuration
const ROLES = {
  ADMIN: 3,
  EDITOR: 2,
  VIEWER: 1
};

// Hardcoded User List (IAM) - UPDATE THIS
const USER_DIRECTORY = {
  "contact@kthitsolution.com": "ADMIN",
  "thaesumsda@gmail.com": "EDITOR",
  "kyawthiha.kth22@gmail.com": "VIEWER"
};

// 2. Helper: JSON Response
function createJSONOutput(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// Sheets interprets leading '=' as a formula. Prefix formula-like text with
// an apostrophe so it is entered as literal cell text, including on audit rows.
function sheetLiteral(value) {
  if (typeof value !== 'string') return value;
  return /^[\s\u0000-\u001f\u200b-\u200d\u2060\ufeff]*[=+\-@]/u.test(value) ? "'" + value : value;
}

function requireText(value, maxLength, allowEmpty) {
  if (typeof value !== 'string' || value.length > maxLength || (!allowEmpty && !value.trim()) ||
      /[\u0000-\u0008\u000b-\u001f\u007f]/u.test(value)) throw new Error('Invalid transaction data');
  return value;
}

function requireId(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value)) {
    throw new Error('Invalid transaction data');
  }
  return value;
}

function requireDate(value) {
  requireText(value, 35, false);
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(value) ||
      !Number.isFinite(Date.parse(value)) ||
      new Date(value.slice(0, 10) + 'T00:00:00Z').toISOString().slice(0, 10) !== value.slice(0, 10)) {
    throw new Error('Invalid transaction data');
  }
  return value;
}

function getCategoryConfig() {
  return {
    'Daily Living': { type: 'EXPENSE', subs: ['Food', 'Transport', 'Utilities', 'Household', 'Family', 'Donation', 'Parent', 'Baby', 'IT Equipments and Accessories'] },
    Lifestyle: { type: 'EXPENSE', subs: ['Clothes', 'Cosmetic', 'Entertainment', 'Wearable'] },
    Agriculture: { type: 'EXPENSE', subs: ['Agri Inputs', 'Tools', 'Labor'] },
    'Assets & Savings': { type: 'ASSET', subs: ['Gold', 'Stocks', 'Land', 'Building', 'Savings'] },
    Loans: { type: 'LIABILITY', subs: ['Loan Received', 'Loan Repayment', 'Loan Interest'] },
    Income: { type: 'INCOME', subs: ['Salary', 'Bonus', 'Other'] },
    'Store Inventory': { type: 'ASSET', subs: ['Computers', 'Peripherals', 'Printers & Office', 'Networking & Parts'] },
    'Business Sales': { type: 'INCOME', subs: ['Project Payment', 'Consulting Fee', 'Product Sale'] },
    'Vehicle & Licenses': { type: 'EXPENSE', subs: ['Motorcycle', 'Car', 'Motorcycle License Renewal', 'Car License Renewal', 'Driving License Renewal', 'Fuel', 'Insurance'] },
    Maintenance: { type: 'EXPENSE', subs: ['Home', 'Appliance Repair', 'Car', 'Motor Cycle', 'Laptop', 'Phone', 'Other'] },
    'Tech & Electronics': { type: 'EXPENSE', subs: ['Laptop', 'Peripherals', 'Software', 'Phone', 'Tablet', 'Other'] }
  };
}

function normalizedSubcategory(value) {
  const label = value.replace(/^[\p{Extended_Pictographic}\uFE0F\u200D\s]+/u, '').trim();
  const aliases = { 'IT Equipments': 'IT Equipments and Accessories',
    'Moto License': 'Motorcycle License Renewal', 'Car License': 'Car License Renewal',
    'Driving License': 'Driving License Renewal', 'Motor Cycle': 'Motorcycle' };
  return Object.prototype.hasOwnProperty.call(aliases, label) ? aliases[label] : label;
}

function requireNumber(value, positive) {
  if (typeof value !== 'number' || !Number.isFinite(value) || (positive ? value <= 0 : value === 0) ||
      Math.abs(value) > 1e15) throw new Error('Invalid transaction data');
  return value;
}

function validateTransactionData(data, editing) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid transaction data');
  const id = requireId(editing ? data.id : data.uuid);
  const date = requireDate(editing ? data.date : data.timestamp);
  const category = requireText(data.category, 100, false);
  const subCategory = requireText(data.sub_category, 100, false);
  const categories = getCategoryConfig();
  if (!Object.prototype.hasOwnProperty.call(categories, category) ||
      !categories[category].subs.some(sub => normalizedSubcategory(sub) === normalizedSubcategory(subCategory))) {
    throw new Error('Invalid transaction data');
  }
  const note = requireText(data.note == null ? '' : data.note, 1000, true);
  const amount = requireNumber(data.amount, false);
  const currency = data.currency == null ? 'THB' : data.currency;
  if (!['THB', 'USD', 'MMK'].includes(currency)) throw new Error('Invalid transaction data');
  const fxRate = requireNumber(data.fx_rate == null ? 1 : data.fx_rate, true);
  if (editing) return { id, date, category, sub_category: subCategory, note, amount, currency, fx_rate: fxRate };
  const userTag = requireText(data.user_tag, 32, false);
  if (!['account_1', 'account_2'].includes(userTag)) throw new Error('Invalid transaction data');
  return { uuid: id, timestamp: date, user_tag: userTag, category, sub_category: subCategory,
    note, amount, currency, fx_rate: fxRate };
}

// --- SERVICES ---

class AuthService {
  constructor(key) {
    // Keys must be randomly generated 32-byte base64url tokens, never passwords.
    if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{43,128}$/.test(key)) {
      throw new Error('Unauthorized');
    }
    const configured = PropertiesService.getScriptProperties().getProperty('MYBANK_ACCESS_KEYS');
    if (!configured) throw new Error('Unauthorized');
    let keys;
    try {
      keys = JSON.parse(configured);
    } catch (err) {
      throw new Error('Backend configuration error');
    }
    if (!keys || typeof keys !== 'object' || Array.isArray(keys)) {
      throw new Error('Backend configuration error');
    }
    const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, key, Utilities.Charset.UTF_8)
      .map(byte => ('0' + (byte & 255).toString(16)).slice(-2)).join('');
    if (!keys || Array.isArray(keys) || !Object.prototype.hasOwnProperty.call(keys, digest)) {
      throw new Error('Unauthorized');
    }
    const email = keys[digest];
    if (typeof email !== 'string' || !Object.prototype.hasOwnProperty.call(USER_DIRECTORY, email)) {
      throw new Error('Unauthorized');
    }
    this.currentUserEmail = email;
    this.roleLevel = ROLES[USER_DIRECTORY[email]];
    if (!Number.isInteger(this.roleLevel)) throw new Error('Unauthorized');
  }

  enforceRole(requiredRoleLevel, actionName) {
    if (this.roleLevel < requiredRoleLevel) throw new Error('Forbidden');
    return true;
  }
}

class SheetRepository {
  constructor() {
    this.sheet = getSpreadsheet().getSheetByName('Transactions');
  }

  getExistingUUIDs() {
    const lastRow = this.sheet.getLastRow();
    if (lastRow <= 1) return new Set();
    const rawIds = this.sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat();
    return new Set(rawIds.map(id => String(id)));
  }

  getExistingRows() {
    const lastRow = this.sheet.getLastRow();
    if (lastRow <= 1) return new Map();
    const rows = this.sheet.getRange(2, 1, lastRow - 1, 10).getValues();
    return new Map(rows.map(row => [String(row[0]), row]));
  }

  appendBulk(rowsArray) {
    if (rowsArray.length === 0) return 0;
    const lastRow = this.sheet.getLastRow();
    this.sheet.getRange(lastRow + 1, 1, rowsArray.length, 10)
      .setValues(rowsArray.map(row => row.map(sheetLiteral)));
    return rowsArray.length;
  }

  findRowIndexById(uuid) {
    const lastRow = this.sheet.getLastRow();
    if (lastRow <= 1) return -1;
    const ids = this.sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat();
    const index = ids.indexOf(uuid);
    return index === -1 ? -1 : index + 2;
  }

  updateRow(rowIndex, data) {
    const current = this.getRowData(rowIndex);
    const row = [current[0], data.date, current[2], data.category, data.sub_category,
      data.amount, data.note, new Date().toISOString(), data.currency, data.fx_rate];
    this.sheet.getRange(rowIndex, 1, 1, 10).setValues([row.map(sheetLiteral)]);
  }
  // [NEW] Helper to get raw data before deletion
  getRowData(rowIndex) {
    // Fetch 10 columns (A to J)
    return this.sheet.getRange(rowIndex, 1, 1, 10).getValues()[0];
  }

  // [NEW] Hard Delete
  deleteRow(rowIndex) {
    this.sheet.deleteRow(rowIndex);
  }
}

class FinanceService {
  // Inject AuditService and User Identity
  constructor(auditService, currentUserEmail) {
    this.repo = new SheetRepository();
    this.audit = auditService;
    this.user = currentUserEmail;
  }

  mutate(action, changes, write) {
    // A durable intent with all before/after data must exist before any mutation.
    const receipt = this.audit.begin(this.user, action, changes);
    let result;
    try {
      result = write();
      SpreadsheetApp.flush();
    } catch (err) {
      try { this.audit.finish(receipt, 'UNCERTAIN'); } catch (_) { /* Durable PENDING intent remains. */ }
      throw err;
    }
    // If this fails, the PENDING intent remains for owner reconciliation.
    this.audit.finish(receipt, 'COMMITTED');
    return result;
  }

  addTransactions(rawRows) {
    if (!Array.isArray(rawRows) || rawRows.length < 1 || rawRows.length > 100) {
      throw new Error('Invalid transaction data');
    }
    const unique = new Map();
    rawRows.forEach(row => {
      const checked = validateTransactionData(row, false);
      if (unique.has(checked.uuid) && JSON.stringify(unique.get(checked.uuid)) !== JSON.stringify(checked)) {
        throw new Error('Conflicting transaction ID');
      }
      unique.set(checked.uuid, checked);
    });
    const checkedRows = Array.from(unique.values());
    const existing = this.repo.getExistingRows();
    const serverTime = new Date().toISOString();
    checkedRows.forEach(r => {
      if (!existing.has(r.uuid)) return;
      const row = existing.get(r.uuid);
      const sameText = (stored, input) => stored === input || stored === sheetLiteral(input);
      if (Date.parse(row[1]) !== Date.parse(r.timestamp) || !sameText(row[2], r.user_tag) ||
          !sameText(row[3], r.category) || !sameText(row[4], r.sub_category) ||
          row[5] !== r.amount || !sameText(row[6], r.note) || row[8] !== r.currency || row[9] !== r.fx_rate) {
        throw new Error('Conflicting transaction ID');
      }
    });
    const newRows = checkedRows.filter(r => !existing.has(r.uuid));
    const acceptedIds = checkedRows.map(r => r.uuid);
    if (newRows.length === 0) return { rows_added: 0, accepted_ids: acceptedIds };

    const values = newRows.map(r => [
      r.uuid, r.timestamp, r.user_tag, r.category, r.sub_category,
      r.amount, r.note, serverTime, r.currency, r.fx_rate
    ]);

    const count = this.mutate('CREATE', newRows.map((r, i) => ({ id: r.uuid, before: null, after: values[i] })),
      () => this.repo.appendBulk(values));
    return { rows_added: count, accepted_ids: acceptedIds };
  }

  editTransaction(editData) {
    const id = requireId(editData && editData.id);
    const rowIndex = this.repo.findRowIndexById(id);
    if (rowIndex === -1) throw new Error("Transaction ID not found.");
    const currentRow = this.repo.getRowData(rowIndex);
    const safeData = validateTransactionData({
      ...editData,
      currency: editData.currency == null ? currentRow[8] || 'THB' : editData.currency,
      fx_rate: editData.fx_rate == null ? currentRow[9] || 1 : editData.fx_rate
    }, true);

    this.mutate('UPDATE', [{ id, before: currentRow, after: safeData }],
      () => this.repo.updateRow(rowIndex, safeData));

    return safeData.id;
  }

  // [NEW] Delete Logic with Backup
  deleteTransaction(uuid) {
    requireId(uuid);
    const rowIndex = this.repo.findRowIndexById(uuid);
    if (rowIndex === -1) return uuid; // An already deleted ID is an idempotent success.

    // 1. Fetch Data for Backup (The "Undo" Safety Net)
    const rowData = this.repo.getRowData(rowIndex);

    this.mutate('DELETE', [{ id: uuid, before: rowData, after: null }],
      () => this.repo.deleteRow(rowIndex));

    return uuid;
  }
}
class AuditService {
  constructor() {
    const spreadsheet = getSpreadsheet();
    this.sheet = spreadsheet.getSheetByName('Audit_Log');

    // Auto-create sheet if missing (Safety mechanism)
    if (!this.sheet) {
      this.sheet = spreadsheet.insertSheet('Audit_Log');
      this.sheet.appendRow(['Timestamp', 'User', 'Action', 'Transaction_ID', 'Details']);
      // IMPORTANT: Right-click this 'Audit_Log' tab in Sheets -> Protect Sheet -> "Only You"
    }
  }

  log(userEmail, action, txId, details) {
    const detailString = typeof details === 'object' ? JSON.stringify(details) : String(details);
    this.sheet.appendRow([new Date().toISOString(), userEmail, action, txId, detailString].map(sheetLiteral));
    SpreadsheetApp.flush(); // Propagate failure rather than permit an unaudited mutation.
  }

  begin(userEmail, action, changes) {
    const startRow = this.sheet.getLastRow() + 1;
    const timestamp = new Date().toISOString();
    const details = changes.map(change => ({ state: 'PENDING', before: change.before, after: change.after }));
    this.sheet.getRange(startRow, 1, changes.length, 5).setValues(changes.map((change, index) =>
      [timestamp, userEmail, action, change.id, JSON.stringify(details[index])].map(sheetLiteral)));
    SpreadsheetApp.flush();
    return { startRow, details };
  }

  finish(receipt, state) {
    this.sheet.getRange(receipt.startRow, 5, receipt.details.length, 1).setValues(
      receipt.details.map(detail => [JSON.stringify({ ...detail, state })]));
    SpreadsheetApp.flush();
  }
}
// --- CONTROLLERS ---

function doPost(e) {
  let lock;
  let locked = false;
  let stage = 'request parsing';

  try {
    if (!e || !e.postData || typeof e.postData.contents !== 'string' || e.postData.contents.length > 200000) {
      throw new Error('Invalid request');
    }
    const payload = JSON.parse(e.postData.contents);
    stage = 'authentication';
    const auth = new AuthService(payload.key);
    const action = payload.action;
    const requiredRoles = {
      READ: ROLES.VIEWER,
      APPEND_ROWS: ROLES.EDITOR,
      EDIT_TRANSACTION: ROLES.EDITOR,
      DELETE_TRANSACTION: ROLES.ADMIN
    };
    if (!Object.prototype.hasOwnProperty.call(requiredRoles, action)) {
      return createJSONOutput({ status: 'error', message: 'Unknown Action' });
    }
    auth.enforceRole(requiredRoles[action], action);
    if (action === 'READ') return readData();

    stage = 'write operation';
    lock = LockService.getScriptLock();
    locked = lock.tryLock(30000);
    if (!locked) return createJSONOutput({ status: 'error', message: 'Busy' });
    const audit = new AuditService();
    const finance = new FinanceService(audit, auth.currentUserEmail);

    // --- ROUTER ---
    if (action === 'APPEND_ROWS') {
      auth.enforceRole(ROLES.EDITOR, 'APPEND_ROWS');
      const result = finance.addTransactions(payload.data);
      return createJSONOutput({ status: 'success', result });
    }
    else if (action === 'EDIT_TRANSACTION') {
      auth.enforceRole(ROLES.EDITOR, 'EDIT_TRANSACTION');
      const id = finance.editTransaction(payload.data);
      return createJSONOutput({ status: 'success', result: { updated_id: id } });
    }
    else if (action === 'DELETE_TRANSACTION') {
      auth.enforceRole(ROLES.ADMIN, 'DELETE_TRANSACTION');
      const id = finance.deleteTransaction(payload.data.id);
      return createJSONOutput({ status: 'success', result: { deleted_id: id } });
    }
    else {
      return createJSONOutput({ status: 'error', message: 'Unknown Action' });
    }

  } catch (err) {
    // Do not log payloads or exception text from parsing; they can contain keys.
    console.error('[My Bank] POST failed during ' + stage + ': ' + (err.name || 'Error'));
    const message = ['Unauthorized', 'Forbidden', 'Backend configuration error'].includes(err.message)
      ? err.message : 'Request failed';
    return createJSONOutput({ status: 'error', message: message });
  } finally {
    if (locked) lock.releaseLock();
  }
}

function doGet(e) {
  // Credentials and financial data must not travel in URLs.
  return createJSONOutput({ status: 'error', message: 'Use authenticated POST' });
}

// Run manually in the Apps Script editor as the deployment owner. This checks
// server setup and triggers any newly required Google authorization prompts.
// It never prints keys, hashes, emails, or transaction contents.
function verifyBackendSetup() {
  const configured = PropertiesService.getScriptProperties().getProperty('MYBANK_ACCESS_KEYS');
  if (!configured) throw new Error('MYBANK_ACCESS_KEYS is missing');
  let keys;
  try {
    keys = JSON.parse(configured);
  } catch (err) {
    throw new Error('MYBANK_ACCESS_KEYS is not valid JSON');
  }
  if (!keys || typeof keys !== 'object' || Array.isArray(keys)) {
    throw new Error('MYBANK_ACCESS_KEYS must be a JSON object');
  }
  const digests = Object.keys(keys);
  if (digests.length === 0 || digests.some(digest => !/^[0-9a-f]{64}$/.test(digest) ||
      typeof keys[digest] !== 'string' || !Object.prototype.hasOwnProperty.call(USER_DIRECTORY, keys[digest]))) {
    throw new Error('Access-key hash or user directory entry is invalid');
  }
  const sheet = getSpreadsheet().getSheetByName('Transactions');
  if (!sheet) throw new Error('Transactions sheet was not found');
  console.log('[My Bank] Backend ' + BACKEND_VERSION + ' setup OK: ' + digests.length + ' configured key(s), Transactions sheet accessible.');
}

// Internal helper: Apps Script routes HTTP only through doGet/doPost.
function readData() {
  try {
    const txSheet = getSpreadsheet().getSheetByName('Transactions');
    const lastRow = txSheet.getLastRow();
    let transactions = [];

    if (lastRow > 1) {
      const startRow = Math.max(2, lastRow - 49);
      const data = txSheet.getRange(startRow, 1, lastRow - startRow + 1, 10).getValues();
      transactions = data.map(row => ({
        uuid: row[0], timestamp: row[1], user_tag: row[2],
        category: row[3], sub_category: row[4], amount: row[5], note: row[6],
        synced_at: row[7], currency: row[8], fx_rate: row[9]
      })).reverse();
    }

    const RATES = { "base": "THB", "rates": { "THB": 1, "USD": 32, "MMK": 0.008 } };

    const CATEGORIES = getCategoryConfig();

    return createJSONOutput({
      status: 'success',
      backend_version: BACKEND_VERSION,
      data: {
        recent_transactions: transactions,
        category_config: CATEGORIES,
        exchange_rates: RATES
      }
    });
  } catch (err) {
    console.error('[My Bank] READ failed: ' + (err.stack || err));
    return createJSONOutput({ status: 'error', message: 'Unable to read transactions' });
  }
}
