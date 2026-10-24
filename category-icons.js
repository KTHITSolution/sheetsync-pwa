// Icon names are a fixed allowlist of locally bundled Lucide outline symbols.
const CATEGORY_ICON_NAMES = {
  'Daily Living': 'house', 'Lifestyle': 'sparkles', 'Agriculture': 'sprout',
  'Assets & Savings': 'landmark', 'Loans': 'hand-coins', 'Income': 'wallet',
  'Vehicle & Licenses': 'car-front', 'Maintenance': 'wrench',
  'Tech & Electronics': 'laptop', 'Store Inventory': 'boxes',
  'Business Sales': 'store'
};

const SUBCATEGORY_ICON_NAMES = {
  'Food': 'utensils', 'Transport': 'bus-front', 'Utilities': 'zap',
  'Household': 'lamp-desk', 'Family': 'users-round', 'Donation': 'heart-handshake',
  'Parent': 'person-standing', 'Baby': 'baby', 'IT Equipments': 'monitor',
  'IT Equipments and Accessories': 'monitor', 'Clothes': 'shirt',
  'Cosmetic': 'paintbrush', 'Entertainment': 'clapperboard', 'Wearable': 'watch',
  'Agri Inputs': 'wheat', 'Tools': 'hammer', 'Labor': 'hard-hat',
  'Gold': 'gem', 'Stocks': 'chart-no-axes-combined', 'Land': 'mountain',
  'Building': 'building-2', 'Savings': 'piggy-bank',
  'Loan Received': 'hand-coins', 'Loan Repayment': 'banknote',
  'Loan Interest': 'percent', 'Salary': 'briefcase-business', 'Bonus': 'gift',
  'Other': 'ellipsis', 'Motorcycle': 'bike', 'Motor Cycle': 'bike',
  'Car': 'car-front', 'Moto License': 'id-card',
  'Motorcycle License Renewal': 'id-card', 'Car License': 'id-card',
  'Car License Renewal': 'id-card', 'Driving License': 'id-card',
  'Driving License Renewal': 'id-card', 'Fuel': 'fuel', 'Insurance': 'shield-check',
  'Home': 'house', 'Appliance Repair': 'wrench', 'Laptop': 'laptop',
  'Phone': 'smartphone', 'Peripherals': 'mouse', 'Software': 'disc-3',
  'Tablet': 'tablet', 'Computers': 'monitor',
  'Printers & Office': 'printer', 'Networking & Parts': 'network',
  'Project Payment': 'folder-check', 'Consulting Fee': 'messages-square',
  'Product Sale': 'tag'
};

function categoryDisplayName(value) {
  // Legacy defaults include leading emoji; retain the original value when saving.
  return String(value || '').replace(/^[\p{Extended_Pictographic}\uFE0F\u200D\s]+/u, '').trim();
}

function categoryIconName(value, isSubcategory = false) {
  const names = isSubcategory ? SUBCATEGORY_ICON_NAMES : CATEGORY_ICON_NAMES;
  return names[categoryDisplayName(value)] || 'circle-help';
}

function createCategoryIcon(value, isSubcategory = false) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'category-outline-icon');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `./assets/category-icons.svg#${categoryIconName(value, isSubcategory)}`);
  svg.appendChild(use);
  return svg;
}
