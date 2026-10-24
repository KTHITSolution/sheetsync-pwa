// Real frontend functions with isolated browser/IndexedDB stand-ins. No network.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
new vm.Script(script);
const auth = script.slice(script.indexOf("let userKey = '';"), script.indexOf('async function attemptLogin('));
const syncing = script.slice(script.indexOf('function transactionRevision('), script.indexOf("if ('serviceWorker' in navigator)"));
const item = (uuid, note = 'local') => ({ uuid, timestamp: '2026-10-24T00:00:00.000Z', user_tag: 'account_1',
  category: 'Income', sub_category: 'Salary', amount: 10, note, currency: 'USD', fx_rate: 32, synced: 0 });

function storage() {
  const values = {};
  Object.defineProperties(values, {
    getItem: { value: key => values[key] ?? null }, setItem: { value: (key, value) => { values[key] = String(value); } },
    removeItem: { value: key => { delete values[key]; } }
  });
  return values;
}

function harness(initial = [item('a'), item('b')]) {
  const tables = { transactions: new Map(initial.map(row => [row.uuid, structuredClone(row)])), syncQueue: new Map() };
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { value: '', textContent: '', style: {}, disabled: false,
      classList: { add() {}, remove() {} }, replaceChildren() { this.cleared = true; } });
    return nodes.get(id);
  };
  const store = name => ({
    get: async id => structuredClone(tables[name].get(id)),
    getAll: async () => [...tables[name].values()].map(row => structuredClone(row)),
    put: async row => tables[name].set(name === 'transactions' ? row.uuid : row.id, structuredClone(row)),
    clear: async () => tables[name].clear()
  });
  let now = 1000, responder;
  const requests = [], statuses = [], confirmations = [];
  const bodyClasses = new Set();
  const localStorage = storage();
  const db = {
    getAllFromIndex: async (_, index, value) => [...tables.transactions.values()].filter(row => value === undefined || row[index] === value).map(row => structuredClone(row)),
    getAll: async name => [...tables[name].values()].map(row => structuredClone(row)),
    count: async name => tables[name].size,
    get: async (name, id) => structuredClone(tables[name].get(id)),
    delete: async (name, id) => tables[name].delete(id),
    transaction: names => ({ store: store(typeof names === 'string' ? names : names[0]), objectStore: store, done: Promise.resolve() })
  };
  responder = action => ({ status: 'success', ...(action === 'READ' ? { data: { recent_transactions: [] } } : {}) });
  const context = vm.createContext({
    db, STORE_NAME: 'transactions', SCRIPT_URL: 'https://example.invalid/exec',
    localStorage, cachedTransactions: [item('cached')],
    document: { getElementById: node, body: { classList: { add: name => bodyClasses.add(name), remove: name => bodyClasses.delete(name) } } },
    Date: class extends Date { static now() { return now; } }, AbortController, setTimeout, clearTimeout,
    navigator: { onLine: true }, chartInstance: null, cashflowChartInstance: null,
    appSettings: {}, currentUser: 'account_1', DEFAULT_CATEGORY_CONFIG: {}, DEFAULT_EXCHANGE_RATES: {},
    CATEGORY_CONFIG: {}, EXCHANGE_RATES: {}, renderList() {}, populateCategoryUI() {}, checkIdentity() {},
    updateStatus: (...args) => statuses.push(args),
    confirm: text => { confirmations.push(text); return true; },
    fetch: async (_, options) => {
      const request = JSON.parse(options.body); requests.push(request);
      const result = await responder(request.action, request.data, options);
      return { ok: true, json: async () => result };
    }
  });
  vm.runInContext(auth + '\n' + syncing, context);
  const app = vm.runInContext('({ syncManager, apiRequest, lockApp, signOut, eraseLocalData, hasActiveSession, key: () => userKey })', context);
  const authenticate = () => vm.runInContext("userKey = 'A'.repeat(43); sessionGeneration++; lastActivity = unlockedAt = Date.now();", context);
  authenticate();
  return { ...app, context, tables, nodes, node, requests, statuses, bodyClasses, confirmations, localStorage,
    authenticate, respond: fn => { responder = fn; }, advance: ms => { now += ms; } };
}

async function main() {
  for (const response of [
    { status: 'error', message: 'Busy' },
    { status: 'success' },
    { status: 'success', result: { rows_added: 2 } },
    { status: 'success', result: { rows_added: 2, accepted_ids: ['a', 'unknown'] } },
    { status: 'success', result: { rows_added: 2, accepted_ids: ['a', 'a'] } }
  ]) {
    const h = harness(); h.respond(() => response);
    await h.syncManager.processQueue();
    assert.equal(h.tables.transactions.get('a').synced, 0);
    assert.equal(h.tables.transactions.get('b').synced, 0);
    const legacyProbe = response.status === 'success' && !Array.isArray(response.result?.accepted_ids);
    assert.equal(h.requests.length, legacyProbe ? 2 : 1);
  }
  console.log('PASS: busy, rejected, missing and malformed acknowledgements retain pending data');

  const partial = harness();
  partial.respond(() => ({ status: 'success', result: { rows_added: 1, accepted_ids: ['a'] } }));
  await partial.syncManager.processQueue();
  assert.equal(partial.tables.transactions.get('a').synced, 1);
  assert.equal(partial.tables.transactions.get('b').synced, 0);
  assert.equal(partial.requests.length, 1);
  console.log('PASS: partial acknowledgement marks only the confirmed record');

  const legacy = harness();
  legacy.respond(action => action === 'APPEND_ROWS' ? { status: 'success', result: { rows_added: 2 } } :
    { status: 'success', data: { recent_transactions: [item('a'), item('b', 'different server value')] } });
  await legacy.syncManager.processQueue();
  assert.equal(legacy.tables.transactions.get('a').synced, 1);
  assert.equal(legacy.tables.transactions.get('b').synced, 0);
  console.log('PASS: legacy backend replies require an exact authenticated read-back before confirmation');

  const success = harness();
  success.respond((action, data) => action === 'READ' ? { status: 'success', data: { recent_transactions: [] } } :
    { status: 'success', result: { rows_added: data.length, accepted_ids: data.map(row => row.uuid) } });
  const first = success.syncManager.processQueue();
  assert.equal(success.syncManager.processQueue(), first);
  await first;
  assert.equal(success.requests.filter(r => r.action === 'APPEND_ROWS').length, 1);
  assert.equal(success.tables.transactions.get('b').synced, 1);
  console.log('PASS: overlapping sync triggers share one operation');

  const changed = harness([item('a')]);
  changed.respond(action => {
    if (action === 'READ') return { status: 'success', data: { recent_transactions: [item('a', 'server old')] } };
    changed.tables.transactions.get('a').note = 'new local edit';
    return { status: 'success', result: { rows_added: 1, accepted_ids: ['a'] } };
  });
  await changed.syncManager.processQueue();
  assert.equal(changed.tables.transactions.get('a').synced, 0);
  assert.equal(changed.tables.transactions.get('a').note, 'new local edit');
  console.log('PASS: a stale acknowledgement or pull cannot overwrite a pending local revision');

  for (const type of ['EDIT_TRANSACTION', 'DELETE_TRANSACTION']) {
    const queued = harness([]);
    queued.tables.syncQueue.set(1, { id: 1, type, payload: { id: 'a' } });
    queued.respond(() => ({ status: 'success', result: { updated_id: 'wrong', deleted_id: 'wrong' } }));
    await queued.syncManager.processQueue();
    assert.equal(queued.tables.syncQueue.size, 1);
    queued.respond(action => action === 'READ' ? { status: 'success', data: { recent_transactions: [] } } :
      { status: 'success', result: { updated_id: 'a', deleted_id: 'a' } });
    await queued.syncManager.processQueue();
    assert.equal(queued.tables.syncQueue.size, 0);
  }
  console.log('PASS: queued edits/deletes require the matching confirmed ID');

  const queuedPull = harness([{ ...item('a', 'local queued edit'), synced: 1 }]);
  queuedPull.tables.syncQueue.set(1, { id: 1, type: 'EDIT_TRANSACTION', payload: { id: 'a' } });
  queuedPull.respond(() => ({ status: 'success', data: { recent_transactions: [item('a', 'older server note')] } }));
  await queuedPull.syncManager.pull();
  assert.equal(queuedPull.tables.transactions.get('a').note, 'local queued edit');
  console.log('PASS: a pull preserves a locally queued edit even when its original append was synced');

  const revoked = harness();
  revoked.respond(() => ({ status: 'error', message: 'Unauthorized' }));
  await revoked.syncManager.processQueue();
  assert.equal(revoked.key(), '');
  assert.ok(revoked.bodyClasses.has('app-locked'));
  assert.equal(revoked.node('app').inert, true);
  assert.equal(revoked.node('tx-list').cleared, true);
  await revoked.syncManager.processQueue();
  assert.equal(revoked.requests.length, 1);
  assert.equal(revoked.tables.transactions.get('a').synced, 0);
  console.log('PASS: revoked credentials clear the in-memory key, lock the UI and stop retrying');

  const late = harness();
  let release;
  late.respond(() => new Promise(resolve => { release = resolve; }));
  const running = late.syncManager.processQueue();
  while (!release) await new Promise(resolve => setImmediate(resolve));
  late.signOut();
  release({ status: 'success', result: { rows_added: 2, accepted_ids: ['a', 'b'] } });
  await running;
  assert.equal(late.tables.transactions.get('a').synced, 0);
  assert.equal(late.key(), '');
  console.log('PASS: sign-out ignores a late response and retains pending work');

  const delayedErase = harness();
  let releaseErase;
  delayedErase.respond(() => new Promise(resolve => { releaseErase = resolve; }));
  const beforeErase = delayedErase.syncManager.processQueue();
  while (!releaseErase) await new Promise(resolve => setImmediate(resolve));
  const erasing = delayedErase.eraseLocalData();
  while (delayedErase.key()) await new Promise(resolve => setImmediate(resolve));
  releaseErase({ status: 'success', result: { rows_added: 2, accepted_ids: ['a', 'b'] } });
  await Promise.all([beforeErase, erasing]);
  assert.equal(delayedErase.tables.transactions.size, 0);
  console.log('PASS: device erasure waits for in-flight sync and a delayed reply cannot restore records');

  const idle = harness(); idle.advance(15 * 60 * 1000);
  assert.equal(idle.hasActiveSession(), false);
  assert.equal(idle.key(), '');
  const absolute = harness(); absolute.advance(8 * 60 * 60 * 1000);
  vm.runInContext('lastActivity = Date.now()', absolute.context);
  assert.equal(absolute.hasActiveSession(), false);
  console.log('PASS: browser unlock expires after inactivity or the absolute time limit');

  const unlocked = harness([]); unlocked.lockApp();
  unlocked.node('login-pass').value = 'temporary input';
  const unlockStart = script.indexOf('function unlockApp(');
  vm.runInContext(script.slice(unlockStart, script.indexOf('// --- APP STARTUP ---', unlockStart)), unlocked.context);
  unlocked.context.unlockApp('B'.repeat(43));
  await unlocked.syncManager.whenIdle();
  assert.equal(unlocked.node('app').inert, false);
  assert.equal(unlocked.node('login-pass').value, '');
  assert.equal(unlocked.hasActiveSession(), true);
  console.log('PASS: verified unlock restores the dashboard and clears the input field');

  const erase = harness();
  erase.tables.syncQueue.set(1, { id: 1, type: 'EDIT_TRANSACTION', payload: { id: 'a' } });
  erase.localStorage.setItem('myBankSettings', 'private preferences');
  erase.localStorage.setItem('unrelated', 'retain');
  erase.context.confirm = () => false;
  await erase.eraseLocalData();
  assert.equal(erase.tables.transactions.size, 2);
  erase.context.confirm = text => { erase.confirmations.push(text); return true; };
  await erase.eraseLocalData();
  assert.match(erase.confirmations[0], /2 unsynced transaction\(s\) and 1 queued/);
  assert.equal(erase.tables.transactions.size, 0);
  assert.equal(erase.tables.syncQueue.size, 0);
  assert.equal(erase.localStorage.getItem('myBankSettings'), null);
  assert.equal(erase.localStorage.getItem('unrelated'), 'retain');
  assert.equal(erase.requests.length, 0);
  assert.equal(erase.key(), '');
  console.log('PASS: explicit local erasure warns about pending work, clears app data and leaves the cloud untouched');

  const locked = harness(); locked.lockApp();
  const renderStart = script.indexOf('async function renderList(');
  vm.runInContext(script.slice(renderStart, script.indexOf('function createTransactionItem(', renderStart)), locked.context);
  locked.context.db.getAllFromIndex = () => { throw new Error('Locked render read private records'); };
  await locked.context.renderList();
  console.log('PASS: the locked page does not read cached transaction data for rendering');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
