// Run with node security-review/xss-checks.cjs. Exercises the actual renderers
// using a small DOM that rejects HTML parsing, with hostile stored values.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
new vm.Script(script);

class Element {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.style = {};
    this.listeners = {};
    this._text = '';
  }
  set textContent(value) { this._text = String(value); }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  set innerHTML(_) { throw new Error('HTML parsing must not be used for stored data'); }
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.append(child); return child; }
  replaceChildren(...children) { this.children = children; this._text = ''; }
  addEventListener(name, handler) { this.listeners[name] = handler; }
}

const nodes = new Map();
const document = {
  createElement: tag => new Element(tag),
  getElementById: id => nodes.get(id)
};
const byId = id => { const node = new Element('div'); nodes.set(id, node); return node; };
const maliciousCategory = '<img src=x onerror="window.stolen=true">';
const maliciousSubcategory = '<svg onload="window.stolen=true">';
const maliciousId = "');window.stolen=true;//";
const edits = [];
const context = vm.createContext({ document, openEditModal: id => edits.push(id),
  getBudgetLimits: () => ({ [maliciousCategory]: 100 }),
  getCategoryType: () => 'EXPENSE',
  convertCurrency: n => n,
  appSettings: { displayCurrency: 'THB' },
  getCurrencySymbol: () => '฿' });
function loadFunction(name, nextName) {
  const start = script.indexOf(`function ${name}(`);
  const end = script.indexOf(nextName, start);
  assert.ok(start >= 0 && end > start, `Could not locate ${name}`);
  vm.runInContext(script.slice(start, end), context);
}
loadFunction('createTransactionItem', 'let chartInstance');
loadFunction('renderBudgets', 'function getBudgetLimits');
loadFunction('openBudgetSettings', 'function closeBudgetSettings');

const row = context.createTransactionItem({
  uuid: maliciousId, category: maliciousCategory, sub_category: maliciousSubcategory,
  amount: -12, currency: 'THB'
}, '👤 Me', '฿', 'red', '✓');
assert.equal(row.tag, 'li');
assert.match(row.textContent, /<img src=x onerror=/);
assert.match(row.textContent, /<svg onload=/);
assert.deepEqual(row.children.map(child => child.tag), ['div', 'div']);
assert.equal(typeof row.listeners.click, 'function');
row.listeners.click();
assert.deepEqual(edits, [maliciousId]);
assert.equal(context.window?.stolen, undefined);
console.log('PASS: hostile transaction fields remain text and edit click uses the exact ID');

const budgetList = byId('budget-list');
context.renderBudgets([{ timestamp: new Date().toISOString(), category: maliciousCategory,
  amount: -12, currency: 'THB' }]);
assert.match(budgetList.textContent, /<img src=x onerror=/);
assert.equal(budgetList.children.length, 1);
assert.equal(budgetList.children[0].tag, 'div');
console.log('PASS: hostile budget category remains text');

const budgetInputs = byId('budget-inputs');
byId('budget-settings-title');
byId('budget-settings-modal').style = {};
context.openBudgetSettings();
assert.match(budgetInputs.textContent, /<img src=x onerror=/);
assert.equal(budgetInputs.children.length, 1);
assert.equal(budgetInputs.children[0].children[1].tag, 'input');
console.log('PASS: hostile budget setting label remains text');

assert.equal(/\.innerHTML\s*=/.test(script), false);
console.log('PASS: application script has no innerHTML assignments');
