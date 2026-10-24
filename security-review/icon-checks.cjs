const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const iconSource = read('category-icons.js');
const lookup = vm.runInNewContext(iconSource + '; ({ categoryIconName, categoryDisplayName })');
const defaults = vm.runInNewContext(read('config.js') + '; DEFAULT_CATEGORY_CONFIG');
const backendMatch = read('backend.gs').match(/const CATEGORIES = (\{[\s\S]*?\});\s*return createJSONOutput/);
assert.ok(backendMatch, 'backend categories found');
const backend = vm.runInNewContext(`(${backendMatch[1]})`);
const symbols = new Set([...read('assets/category-icons.svg').matchAll(/<symbol id="([^"]+)"/g)].map(match => match[1]));

for (const config of [defaults, backend]) {
  for (const [category, detail] of Object.entries(config)) {
    const categoryIcon = lookup.categoryIconName(category);
    assert.notEqual(categoryIcon, 'circle-help', `category icon missing: ${category}`);
    assert.ok(symbols.has(categoryIcon), `symbol missing: ${categoryIcon}`);
    for (const subcategory of detail.subs) {
      const subIcon = lookup.categoryIconName(subcategory, true);
      assert.notEqual(subIcon, 'circle-help', `sub-category icon missing: ${subcategory}`);
      assert.ok(symbols.has(subIcon), `symbol missing: ${subIcon}`);
    }
  }
}
assert.equal(lookup.categoryDisplayName('🍔 Food'), 'Food');
assert.equal(lookup.categoryDisplayName('🛠️ Tools'), 'Tools');
assert.ok(symbols.has('circle-help'));
const html = read('index.html');
for (const id of ['inp-category', 'inp-subcategory', 'edit-category', 'edit-subcategory']) {
  assert.ok(html.includes(`id="${id}-icons"`), `icon choices missing for ${id}`);
}
const sw = read('sw.js');
assert.ok(sw.includes("'./category-icons.js'"));
assert.ok(sw.includes("'./assets/category-icons.svg'"));
console.log(`PASS: all built-in categories and sub-categories in both configs map to ${symbols.size} bundled outline symbols`);
