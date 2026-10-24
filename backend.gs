// --- CONFIGURATION & IAM ---
const SHEET_ID = '1NqBkNkuiiQJc30G3lDny18kGyBv584Q0tp3b6qFtPr4'; // <--- YOUR ID
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

// --- SERVICES ---

class AuthService {
  constructor(key) {
    // Keys must be randomly generated 32-byte base64url tokens, never passwords.
    if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{43,128}$/.test(key)) {
      throw new Error('Unauthorized');
    }
    const configured = PropertiesService.getScriptProperties().getProperty('MYBANK_ACCESS_KEYS');
    if (!configured) throw new Error('Unauthorized');
    const keys = JSON.parse(configured);
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

  appendBulk(rowsArray) {
    if (rowsArray.length === 0) return 0;
    const lastRow = this.sheet.getLastRow();
    this.sheet.getRange(lastRow + 1, 1, rowsArray.length, 10).setValues(rowsArray);
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
    this.sheet.getRange(rowIndex, 2).setValue(data.date);
    this.sheet.getRange(rowIndex, 4).setValue(data.category);
    this.sheet.getRange(rowIndex, 5).setValue(data.sub_category);
    this.sheet.getRange(rowIndex, 6).setValue(data.amount);
    this.sheet.getRange(rowIndex, 7).setValue(data.note);
    this.sheet.getRange(rowIndex, 8).setValue(new Date().toISOString());
    this.sheet.getRange(rowIndex, 9).setValue(data.currency);
    this.sheet.getRange(rowIndex, 10).setValue(data.fx_rate);
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

  addTransactions(rawRows) {
    // ... [Existing Idempotency Logic] ...
    const existingIds = this.repo.getExistingUUIDs();
    const serverTime = new Date().toISOString();
    const newRows = rawRows.filter(r => !existingIds.has(String(r.uuid)));

    if (newRows.length === 0) return 0;

    const values = newRows.map(r => [
      r.uuid, r.timestamp, r.user_tag, r.category, r.sub_category,
      r.amount, r.note, serverTime, r.currency || 'THB', r.fx_rate || 1
    ]);

    // 1. Persist
    const count = this.repo.appendBulk(values);

    // 2. [AUDIT] Log Creation
    // We log the first ID as a reference, or you could loop and log all
    if (count > 0) {
      this.audit.log(this.user, 'CREATE', newRows[0].uuid, `Added ${count} transactions`);
    }

    return count;
  }

  editTransaction(editData) {
    const rowIndex = this.repo.findRowIndexById(editData.id);
    if (rowIndex === -1) throw new Error("Transaction ID not found.");

    // 1. Update
    const safeData = {
      ...editData,
      currency: editData.currency || 'THB',
      fx_rate: editData.fx_rate || 1
    };
    this.repo.updateRow(rowIndex, safeData);

    // 2. [AUDIT] Log Update
    // We log exactly what critical fields changed (Amount/Category)
    this.audit.log(this.user, 'UPDATE', editData.id, {
      newAmount: safeData.amount,
      newCategory: safeData.category,
      note: "Edited via App"
    });

    return editData.id;
  }

  // [NEW] Delete Logic with Backup
  deleteTransaction(uuid) {
    const rowIndex = this.repo.findRowIndexById(uuid);
    if (rowIndex === -1) throw new Error("ID not found for deletion.");

    // 1. Fetch Data for Backup (The "Undo" Safety Net)
    const rowData = this.repo.getRowData(rowIndex);

    // 2. Delete
    this.repo.deleteRow(rowIndex);

    // 3. [AUDIT] Log the DELETION with the BACKUP DATA
    this.audit.log(this.user, 'DELETE', uuid, {
      backupData: rowData, // Saves the entire array [uuid, date, cat, amount...]
      reason: "User requested delete"
    });

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
    try {
      const timestamp = new Date().toISOString();
      // Ensure details are stringified for cell storage
      const detailString = typeof details === 'object' ? JSON.stringify(details) : String(details);

      this.sheet.appendRow([
        timestamp,
        userEmail,
        action,
        txId,
        detailString
      ]);
      // Force save to ensure log persists even if subsequent code fails
      SpreadsheetApp.flush();
    } catch (e) {
      console.error("Audit Log Failed: " + e.toString());
    }
  }
}
// --- CONTROLLERS ---

function doPost(e) {
  let lock;
  let locked = false;

  try {
    const payload = JSON.parse(e.postData.contents);
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

    lock = LockService.getScriptLock();
    locked = lock.tryLock(30000);
    if (!locked) return createJSONOutput({ status: 'error', message: 'Busy' });
    const audit = new AuditService();
    const finance = new FinanceService(audit, auth.currentUserEmail);

    // --- ROUTER ---
    if (action === 'APPEND_ROWS') {
      auth.enforceRole(ROLES.EDITOR, 'APPEND_ROWS');
      const count = finance.addTransactions(payload.data);
      return createJSONOutput({ status: 'success', result: { rows_added: count } });
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
    const message = err.message === 'Unauthorized' || err.message === 'Forbidden'
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

    const CATEGORIES = {
      "Daily Living": { "type": "EXPENSE", "subs": ["Food", "Transport", "Utilities", "Household", "Family", "Donation", "Parent", "Baby", "IT Equipments and Accessories"] },
      "Lifestyle": { "type": "EXPENSE", "subs": ["Clothes", "Cosmetic", "Entertainment", "Wearable"] },
      "Agriculture": { "type": "EXPENSE", "subs": ["Agri Inputs", "Tools", "Labor"] },
      "Assets & Savings": { "type": "ASSET", "subs": ["Gold", "Stocks", "Land", "Building", "Savings"] },
      "Loans": { "type": "LIABILITY", "subs": ["Loan Received", "Loan Repayment", "Loan Interest"] },
      "Income": { "type": "INCOME", "subs": ["Salary", "Bonus", "Other"] },
      "Store Inventory": {
        "type": "ASSET",
        "subs": ["Computers", "Peripherals", "Printers & Office", "Networking & Parts"]
      },
      "Business Sales": {
        "type": "INCOME",
        "subs": ["Project Payment", "Consulting Fee", "Product Sale"]
      },
      "Vehicle & Licenses": { "type": "EXPENSE", "subs": ["Motorcycle", "Car", "Motorcycle License Renewal", "Car License Renewal", "Driving License Renewal", "Fuel", "Insurance"] },
      "Maintenance": { "type": "EXPENSE", "subs": ["Home", "Appliance Repair", "Car", "Motor Cycle", "Laptop", "Phone", "Other"] },
      "Tech & Electronics": { "type": "EXPENSE", "subs": ["Laptop", "Peripherals", "Software", "Phone", "Tablet", "Other"] },
    };

    return createJSONOutput({
      status: 'success',
      data: {
        recent_transactions: transactions,
        category_config: CATEGORIES,
        exchange_rates: RATES
      }
    });
  } catch (err) {
    return createJSONOutput({ status: 'error', message: 'Request failed' });
  }
}
