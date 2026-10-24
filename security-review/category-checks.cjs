// Run with node security-review/category-checks.cjs.
// Exercises the real selection and save functions with a small DOM/DB stand-in.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
new vm.Script(script);

class Field {
  constructor() { this.children = []; this.value = ''; this.disabled = false; this.style = {}; }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren() { this.children = []; this.value = ''; }
  focus() { this.focused = true; }
}
const fields = new Map();
const field = id => { const result = new Field(); fields.set(id, result); return result; };
for (const id of ['inp-category', 'inp-subcategory', 'inp-amount', 'inp-note',
  'edit-category', 'edit-subcategory', 'edit-amount', 'edit-note', 'edit-uuid', 'edit-date', 'edit-modal']) field(id);
const alerts = [];
const saved = [];
let dbGets = 0;
const context = vm.createContext({
  document: { createElement: () => new Field(), getElementById: id => fields.get(id) },
  localStorage: { getItem: () => null },
  alert: message => alerts.push(message),
  CATEGORY_CONFIG: {
    'Daily Living': { type: 'EXPENSE', subs: ['Food', 'Transport'] },
    'Assets & Savings': { type: 'ASSET', subs: ['Savings'] },
    Income: { type: 'INCOME', subs: ['Salary', 'Bonus'] }
  },
  currentType: 'Income', currentCurrency: 'THB', currentUser: 'account_1',
  EXCHANGE_RATES: { THB: 1 }, STORE_NAME: 'transactions',
  hasActiveSession: () => true, sessionGeneration: 1,
  getCategoryType: () => 'INCOME',
  crypto: { randomUUID: () => 'new-id' },
  db: { put: async (_, tx) => saved.push(tx), get: async () => { dbGets++; return { synced: 0 }; },
    transaction: () => ({ objectStore: () => ({ put: async tx => saved.push(tx) }), done: Promise.resolve() }) },
  closeForm() {}, renderList() {}, syncManager: { push() {}, processQueue() {}, whenIdle: async () => {} }
});
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'category-icons.js'), 'utf8'), context);
function loadFunction(name, nextName) {
  let start = script.indexOf(`async function ${name}(`);
  if (start < 0) start = script.indexOf(`function ${name}(`);
  const end = script.indexOf(nextName, start);
  assert.ok(start >= 0 && end > start, `Could not locate ${name}`);
  vm.runInContext(script.slice(start, end), context);
}
loadFunction('addSelectPrompt', 'function appendCategoryOptions');
loadFunction('appendCategoryOptions', 'function populateCategoryUI');
loadFunction('populateCategoryUI', 'function updateSubCategories');
loadFunction('updateSubCategories', 'function validateCategoryFields');
loadFunction('validateCategoryFields', 'function openForm');
loadFunction('saveTransaction', 'async function renderList');
loadFunction('saveEdit', 'function toggleChartMode');

async function main() {
  context.populateCategoryUI(true);
  const category = fields.get('inp-category');
  const subcategory = fields.get('inp-subcategory');
  assert.equal(category.value, '');
  assert.equal(category.children[0].textContent, 'Select category');
  assert.equal(category.children[0].selected, true);
  assert.equal(category.children[1].label, 'Suggested for Income');
  assert.deepEqual(category.children[1].children.map(o => o.value), ['Income']);
  assert.equal(subcategory.disabled, true);
  assert.equal(subcategory.value, '');
  console.log('PASS: income form suggests matching categories without selecting one');

  fields.get('inp-amount').value = '50';
  await context.saveTransaction();
  assert.equal(saved.length, 0);
  assert.equal(alerts.at(-1), 'Select a category.');
  assert.equal(category.focused, true);

  category.value = 'Income';
  context.updateSubCategories();
  assert.equal(subcategory.disabled, false);
  assert.equal(subcategory.value, '');
  await context.saveTransaction();
  assert.equal(saved.length, 0);
  assert.equal(alerts.at(-1), 'Select a sub-category for the chosen category.');
  subcategory.value = 'Food'; // Valid elsewhere, but not under Income.
  await context.saveTransaction();
  assert.equal(saved.length, 0);
  subcategory.value = 'Salary';
  await context.saveTransaction();
  assert.equal(saved.length, 1);
  assert.equal(saved[0].category, 'Income');
  assert.equal(saved[0].sub_category, 'Salary');
  console.log('PASS: add rejects missing/mismatched choices and saves a valid pair');

  context.currentType = 'Expense';
  context.populateCategoryUI(true);
  assert.equal(category.value, '');
  assert.deepEqual(category.children[1].children.map(o => o.value), ['Daily Living', 'Assets & Savings']);
  assert.deepEqual(category.children[2].children.map(o => o.value), ['Income']);
  assert.equal(subcategory.disabled, true);
  console.log('PASS: a new expense resets choices and suggests expense/asset categories');

  fields.get('edit-amount').value = '10';
  fields.get('edit-category').value = '';
  await context.saveEdit();
  assert.equal(dbGets, 0);
  assert.equal(alerts.at(-1), 'Select a category.');
  fields.get('edit-category').value = 'Income';
  fields.get('edit-subcategory').value = '';
  await context.saveEdit();
  assert.equal(dbGets, 0);
  assert.equal(alerts.at(-1), 'Select a sub-category for the chosen category.');
  fields.get('edit-subcategory').value = 'Bonus';
  fields.get('edit-uuid').value = 'existing';
  fields.get('edit-date').value = '2026-10-24T15:00';
  await context.saveEdit();
  assert.equal(dbGets, 1);
  assert.equal(saved.length, 2);
  assert.equal(saved[1].category, 'Income');
  assert.equal(saved[1].sub_category, 'Bonus');
  console.log('PASS: edit rejects missing choices and saves a valid category pair');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
