// Run with node security-review/formula-checks.cjs. Mocks sheet writes; a live
// Sheets test is still needed after updating the Apps Script deployment.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '..', 'backend.gs'), 'utf8');
const transactions = [['uuid', 'date', 'user', 'category', 'sub', 'amount', 'note', 'synced', 'currency', 'fx']];
const audit = [['Timestamp', 'User', 'Action', 'Transaction_ID', 'Details']];
let formulaWrites = 0;
const record = value => {
  if (typeof value === 'string' && value.startsWith('=')) formulaWrites++;
  return value;
};
function sheet(rows) {
  return {
    getLastRow: () => rows.length,
    getRange(row, col, height = 1, width = 1) {
      return {
        getValues: () => Array.from({ length: height }, (_, i) =>
          Array.from({ length: width }, (_, j) => rows[row + i - 1]?.[col + j - 1] ?? '')),
        setValues: values => values.forEach((cells, i) => cells.forEach((value, j) => {
          rows[row + i - 1] ??= [];
          rows[row + i - 1][col + j - 1] = record(value);
        })),
        setValue: value => { rows[row - 1][col - 1] = record(value); }
      };
    },
    appendRow: values => rows.push(values.map(record)),
    deleteRow: row => rows.splice(row - 1, 1)
  };
}
const sheets = { Transactions: sheet(transactions), Audit_Log: sheet(audit) };
const context = vm.createContext({
  SpreadsheetApp: { openById: () => ({ getSheetByName: name => sheets[name] }), flush() {} },
  console: { error() {} }
});
vm.runInContext(source, context);
const finance = vm.runInContext('new FinanceService(new AuditService(), "editor@example.com")', context);
const id = '123e4567-e89b-42d3-a456-426614174000';
const base = { uuid: id, timestamp: '2026-10-24T00:00:00.000Z', user_tag: 'account_1',
  category: 'Income', sub_category: 'Salary', amount: 125, currency: 'USD', fx_rate: 32 };

assert.equal(finance.addTransactions([{ ...base, note: '=HYPERLINK("https://example.invalid")' }]).rows_added, 1);
assert.equal(transactions[1][6], "'=HYPERLINK(\"https://example.invalid\")");
assert.equal(transactions[1][5], 125);
assert.equal(transactions[1][9], 32);
assert.equal(formulaWrites, 0);
assert.equal(audit[1][3], id);
console.log('PASS: append stores formula-like notes as literal text and amounts as numbers');

finance.editTransaction({ id, date: '2026-10-24T01:00:00.000Z', category: 'Income',
  sub_category: 'Bonus', amount: -50, note: '  =IMPORTXML("https://example.invalid")' });
assert.equal(transactions[1][3], 'Income');
assert.equal(transactions[1][4], 'Bonus');
assert.equal(transactions[1][6], "'  =IMPORTXML(\"https://example.invalid\")");
assert.equal(transactions[1][5], -50);
assert.equal(transactions[1][8], 'USD');
assert.equal(transactions[1][9], 32);
assert.equal(formulaWrites, 0);
console.log('PASS: edit escapes all text fields and preserves numeric and currency fields');

const auditor = vm.runInContext('new AuditService()', context);
auditor.log('=USER()', 'UPDATE', '=ID()', '=DETAILS()');
assert.deepEqual(Array.from(audit.at(-1).slice(1)), ["'=USER()", 'UPDATE', "'=ID()", "'=DETAILS()"]);
assert.equal(formulaWrites, 0);
console.log('PASS: audit entries cannot become formulas');
assert.equal(context.sheetLiteral('@SUM(A1)'), "'@SUM(A1)");
assert.equal(context.sheetLiteral('\uFEFF=1+1'), "'\uFEFF=1+1");
assert.equal(context.sheetLiteral(-50), -50);

const before = transactions.length;
const badRows = [
  { ...base, uuid: '=bad', note: 'safe' },
  { ...base, uuid: 'another', category: '=1+1', note: 'safe' },
  { ...base, uuid: 'another', sub_category: '+SUM(A1)', note: 'safe' },
  { ...base, uuid: 'another', timestamp: '2026-02-30', note: 'safe' },
  { ...base, uuid: 'another', amount: '=1+1', note: 'safe' },
  { ...base, uuid: 'another', amount: Infinity, note: 'safe' },
  { ...base, uuid: 'another', currency: '=USD', note: 'safe' },
  { ...base, uuid: 'another', fx_rate: -1, note: 'safe' },
  { ...base, uuid: 'another', note: 'x'.repeat(1001) }
];
for (const row of badRows) assert.throws(() => finance.addTransactions([row]), /Invalid transaction data/);
assert.throws(() => finance.addTransactions(Array.from({ length: 101 }, () => ({ ...base, uuid: 'new', note: 'safe' }))), /Invalid transaction data/);
assert.equal(transactions.length, before);
assert.equal(formulaWrites, 0);
console.log('PASS: invalid types, sizes and formula-like IDs are rejected before sheet mutation');

const defaults = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'config.js'), 'utf8') + '; DEFAULT_CATEGORY_CONFIG');
for (const [category, detail] of Object.entries(defaults)) {
  for (const sub_category of detail.subs) {
    assert.doesNotThrow(() => context.validateTransactionData({ ...base, category, sub_category, note: 'offline default' }, false));
  }
}
console.log('PASS: every bundled offline category and legacy emoji label passes the server allowlist');
