// Offline security probes. No network requests or Google services are used.
// Regression tests for backend authentication and frontend request handling.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'backend.gs'), 'utf8');
const frontend = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const header = ['uuid', 'date', 'user', 'category', 'sub', 'amount', 'note', 'synced', 'currency', 'fx'];
class Sheet {
  constructor(rows) { this.rows = rows; }
  getLastRow() { return this.rows.length; }
  getRange(row, column, height = 1, width = 1) {
    return {
      getValues: () => Array.from({ length: height }, (_, i) =>
        Array.from({ length: width }, (_, j) => this.rows[row - 1 + i]?.[column - 1 + j] ?? '')),
      setValues: values => values.forEach((cells, i) => cells.forEach((value, j) => {
        this.rows[row - 1 + i] ??= [];
        this.rows[row - 1 + i][column - 1 + j] = value;
      })),
      setValue: value => { this.rows[row - 1][column - 1] = value; }
    };
  }
  appendRow(row) { this.rows.push(row); }
  deleteRow(row) { this.rows.splice(row - 1, 1); }
}
const transactions = new Sheet([header, ['seed', '2026-10-24', 'owner', 'Income', 'Salary', 100, 'private', '', 'THB', 1]]);
const audit = new Sheet([['Timestamp', 'User', 'Action', 'Transaction_ID', 'Details']]);
const tokens = { admin: 'A'.repeat(43), editor: 'E'.repeat(43), viewer: 'V'.repeat(43), unknown: 'U'.repeat(43) };
const sha256 = key => crypto.createHash('sha256').update(key).digest('hex');
const keyDirectory = {
  [sha256(tokens.admin)]: 'contact@kthitsolution.com',
  [sha256(tokens.editor)]: 'thaesumsda@gmail.com',
  [sha256(tokens.viewer)]: 'kyawthiha.kth22@gmail.com',
  [sha256(tokens.unknown)]: 'unlisted@example.com'
};
let configured = JSON.stringify(keyDirectory);
let spreadsheetOpens = 0;
let lockAttempts = 0;
let sheetAccessFails = false;
const context = vm.createContext({
  console: { log() {}, error() {} },
  SpreadsheetApp: { openById: () => { spreadsheetOpens++; if (sheetAccessFails) throw new Error('Google authorization required'); return { getSheetByName: name => name === 'Transactions' ? transactions : audit }; }, flush() {} },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => configured }) },
  Utilities: { DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
    computeDigest: (_, key) => [...crypto.createHash('sha256').update(key).digest()].map(byte => byte > 127 ? byte - 256 : byte) },
  LockService: { getScriptLock: () => ({ tryLock: () => { lockAttempts++; return true; }, releaseLock() {} }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: text => ({ setMimeType: () => JSON.parse(text) }) }
});
vm.runInContext(source, context);
const post = payload => context.doPost({ postData: { contents: JSON.stringify(payload) } });
const run = (name, probe) => { probe(); console.log(`PASS: ${name}`); };
const actions = ['READ', 'APPEND_ROWS', 'EDIT_TRANSACTION', 'DELETE_TRANSACTION'];
run('GET always rejects without opening the spreadsheet', () => {
  for (const key of [undefined, tokens.admin]) assert.equal(context.doGet({ parameter: { key } }).status, 'error');
  assert.equal(spreadsheetOpens, 0);
});
run('missing, incorrect, legacy and unlisted credentials cannot access any route', () => {
  for (const key of [undefined, '', 'p@ssw0rd', 'X'.repeat(43), tokens.unknown, {}, ['A']]) {
    for (const action of actions) assert.equal(post({ action, key, user: 'contact@kthitsolution.com', data: { id: 'seed' } }).status, 'error');
  }
  assert.equal(spreadsheetOpens, 0);
  assert.equal(lockAttempts, 0);
});
run('missing or malformed server configuration fails closed', () => {
  for (const config of [null, '', 'invalid JSON', '{}', 'null', '[]']) {
    configured = config;
    assert.equal(post({ action: 'READ', key: tokens.admin }).status, 'error');
  }
  configured = 'invalid JSON';
  assert.equal(post({ action: 'READ', key: tokens.admin }).message, 'Backend configuration error');
  configured = JSON.stringify(keyDirectory);
  assert.equal(spreadsheetOpens, 0);
});
run('setup check validates settings and spreadsheet access without printing secrets', () => {
  const validDirectory = { ...keyDirectory };
  delete validDirectory[sha256(tokens.unknown)];
  configured = JSON.stringify(validDirectory);
  context.verifyBackendSetup();
  configured = 'invalid JSON';
  assert.throws(() => context.verifyBackendSetup(), /not valid JSON/);
  configured = JSON.stringify(validDirectory);
  sheetAccessFails = true;
  assert.throws(() => context.verifyBackendSetup(), /Google authorization required/);
  assert.equal(post({ action: 'READ', key: tokens.admin }).message, 'Unable to read transactions');
  sheetAccessFails = false;
  configured = JSON.stringify(keyDirectory);
});
run('every configured role can read', () => {
  for (const role of ['admin', 'editor', 'viewer']) {
    assert.equal(post({ action: 'READ', key: tokens[role] }).data.recent_transactions[0].note, 'private');
  }
});
run('viewer cannot mutate; editor cannot delete; neither can forge their role', () => {
  const opensBefore = spreadsheetOpens;
  for (const action of actions.slice(1)) {
    assert.equal(post({ action, key: tokens.viewer, user: 'contact@kthitsolution.com', data: { id: 'seed' } }).message, 'Forbidden');
  }
  assert.equal(post({ action: 'DELETE_TRANSACTION', key: tokens.editor, data: { id: 'seed' } }).message, 'Forbidden');
  assert.equal(spreadsheetOpens, opensBefore);
  assert.equal(lockAttempts, 0);
});
run('editor and admin can append/edit with trusted audit identities', () => {
  for (const role of ['editor', 'admin']) {
    assert.equal(post({ action: 'APPEND_ROWS', key: tokens[role], user: 'forged', data: [{
      uuid: role, timestamp: '2026-10-24', user_tag: 'account_1', category: 'Income', sub_category: 'Salary', amount: 10, note: 'test'
    }] }).status, 'success');
    assert.equal(audit.rows.at(-1)[1], keyDirectory[sha256(tokens[role])]);
    assert.equal(post({ action: 'EDIT_TRANSACTION', key: tokens[role], data: {
      id: role, date: '2026-10-24', category: 'Income', sub_category: 'Salary', amount: 20, note: 'edited'
    } }).status, 'success');
  }
});
run('admin can delete', () => {
  assert.equal(post({ action: 'DELETE_TRANSACTION', key: tokens.admin, data: { id: 'seed' } }).status, 'success');
  assert.equal(transactions.rows.some(row => row[0] === 'seed'), false);
});
run('revocation takes effect on the next request', () => {
  const revoked = { ...keyDirectory };
  delete revoked[sha256(tokens.admin)];
  configured = JSON.stringify(revoked);
  const opensBefore = spreadsheetOpens;
  const locksBefore = lockAttempts;
  const rowsBefore = transactions.rows.length;
  const auditBefore = audit.rows.length;
  for (const action of actions) {
    const data = action === 'APPEND_ROWS' ? [{
      uuid: 'revoked', timestamp: '2026-10-24', user_tag: 'account_1',
      category: 'Income', sub_category: 'Salary', amount: 1, note: 'blocked'
    }] : { id: 'admin', date: '2026-10-24', category: 'Income',
      sub_category: 'Salary', amount: 1, note: 'blocked' };
    const result = post({ action, key: tokens.admin, data });
    assert.equal(result.message, 'Unauthorized');
    assert.equal(result.data, undefined);
  }
  assert.equal(spreadsheetOpens, opensBefore);
  assert.equal(lockAttempts, locksBefore);
  assert.equal(transactions.rows.length, rowsBefore);
  assert.equal(audit.rows.length, auditBefore);

  const rotatedKey = 'R'.repeat(43);
  revoked[sha256(rotatedKey)] = keyDirectory[sha256(tokens.admin)];
  configured = JSON.stringify(revoked);
  assert.equal(post({ action: 'READ', key: tokens.admin }).message, 'Unauthorized');
  assert.equal(post({ action: 'READ', key: rotatedKey }).status, 'success');
  configured = JSON.stringify(keyDirectory);
});
run('malformed requests and unknown actions fail without sheet access', () => {
  const before = spreadsheetOpens;
  for (const contents of ['null', '{}', 'invalid']) assert.equal(context.doPost({ postData: { contents } }).status, 'error');
  assert.equal(post({ key: tokens.admin, action: '__proto__' }).status, 'error');
  assert.equal(spreadsheetOpens, before);
});

async function checkFrontend() {
  const script = frontend.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
  new vm.Script(script); // Syntax-check the complete inline application script.
  const helper = script.match(/async function apiRequest[\s\S]*?\n        }/)[0];
  const requests = [];
  let response = { ok: true, json: async () => ({ status: 'success' }) };
  const client = vm.createContext({ userKey: tokens.editor, SCRIPT_URL: 'https://example.invalid/exec',
    fetch: async (url, options) => { requests.push({ url, options }); return response; } });
  vm.runInContext(helper, client);
  await client.apiRequest('READ');
  assert.equal(requests[0].url, 'https://example.invalid/exec');
  assert.equal(requests[0].options.method, 'POST');
  assert.equal(JSON.parse(requests[0].options.body).key, tokens.editor);
  response = { ok: true, json: async () => ({ status: 'error', message: 'Forbidden' }) };
  await assert.rejects(client.apiRequest('APPEND_ROWS', []), /Forbidden/);
  response = { ok: false };
  await assert.rejects(client.apiRequest('READ'), /Server request failed/);
  client.userKey = '';
  const before = requests.length;
  await assert.rejects(client.apiRequest('READ'), /access key/);
  assert.equal(requests.length, before);
  console.log('PASS: frontend sends keys only in POST bodies and rejects failed responses');
}
checkFrontend().catch(error => { console.error(error); process.exitCode = 1; });
