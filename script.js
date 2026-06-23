'use strict';

/* =========================================================
   STATE
   ========================================================= */
let items = [];          // { id, name, qty, price }
let editingId = null;    // id of item currently being edited, or null
let receiptNumber = null;
let hasGenerated = false;
let nextItemId = 1;

const RECEIPT_WIDTH = 40; // characters — tuned for 80mm thermal paper at the print font size

/* =========================================================
   DOM REFERENCES
   ========================================================= */
const businessNameInput = document.getElementById('businessName');
const locationInput = document.getElementById('location');
const currencySelect = document.getElementById('currency');
const useTodayDateCheckbox = document.getElementById('useTodayDate');
const customDateField = document.getElementById('customDateField');
const customDateInput = document.getElementById('customDate');
const vatToggleCheckbox = document.getElementById('vatToggle');

const itemNameInput = document.getElementById('itemName');
const itemQtyInput = document.getElementById('itemQty');
const itemPriceInput = document.getElementById('itemPrice');
const addItemBtn = document.getElementById('addItemBtn');
const cancelEditBtn = document.getElementById('cancelEditBtn');
const itemFormError = document.getElementById('itemFormError');
const itemsBody = document.getElementById('itemsBody');
const itemsEmptyState = document.getElementById('itemsEmptyState');

const footerSelect = document.getElementById('footerSelect');
const customFooterField = document.getElementById('customFooterField');
const customFooterInput = document.getElementById('customFooterInput');

const generateBtn = document.getElementById('generateBtn');
const printBtn = document.getElementById('printBtn');
const darkModeToggle = document.getElementById('darkModeToggle');

const receiptContent = document.getElementById('receiptContent');

/* =========================================================
   HELPERS
   ========================================================= */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatMoney(num) {
  if (!isFinite(num)) num = 0;
  return num.toFixed(2);
}

// dd/mm/yyyy, numbers only — no month name
function formatDateDDMMYYYY(date) {
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
}

function generateReceiptNumber() {
  const now = new Date();
  return `RCP-${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`;
}

// Left-pad / right-pad utilities for the monospace receipt layout
function truncate(str, width) {
  if (str.length <= width) return str;
  if (width <= 1) return str.slice(0, width);
  return str.slice(0, width - 1) + '…';
}

function alignLeft(str, width) {
  str = truncate(str, width);
  return str + ' '.repeat(Math.max(width - str.length, 0));
}

function alignRight(str, width) {
  str = truncate(str, width);
  return ' '.repeat(Math.max(width - str.length, 0)) + str;
}

function alignCenter(str, width) {
  str = truncate(str, width);
  const totalPad = Math.max(width - str.length, 0);
  const left = Math.floor(totalPad / 2);
  const right = totalPad - left;
  return ' '.repeat(left) + str + ' '.repeat(right);
}

function divider(width, char) {
  return char.repeat(width);
}

// Two-column line: label on the left, value flush right
function twoCol(label, value, width) {
  label = String(label);
  value = String(value);
  const minGap = 1;
  const maxLabelWidth = Math.max(width - value.length - minGap, 0);
  label = truncate(label, maxLabelWidth);
  const gap = Math.max(width - label.length - value.length, minGap);
  return label + ' '.repeat(gap) + value;
}

// Three-column item row: name | qty | price (used for both the header and item rows)
const NAME_W = 20;
const QTY_W = 6;
const PRICE_W = RECEIPT_WIDTH - NAME_W - QTY_W; // 14
function itemRow(name, qty, price) {
  return alignLeft(String(name), NAME_W) + alignCenter(String(qty), QTY_W) + alignRight(String(price), PRICE_W);
}

/* =========================================================
   VALIDATION
   ========================================================= */
function validateBusinessFields() {
  if (!businessNameInput.value.trim()) {
    businessNameInput.reportValidity();
    businessNameInput.focus();
    return false;
  }
  if (!locationInput.value.trim()) {
    locationInput.reportValidity();
    locationInput.focus();
    return false;
  }
  return true;
}

function validateItemForm(name, qty, price) {
  if (!name.trim()) return 'Item name cannot be empty.';
  if (!isFinite(qty) || qty <= 0) return 'Quantity must be greater than zero.';
  if (!isFinite(price) || price < 0) return 'Unit price cannot be negative.';
  return null;
}

/* =========================================================
   ITEM CRUD
   ========================================================= */
function handleAddOrUpdateItem() {
  const name = itemNameInput.value;
  const qty = parseFloat(itemQtyInput.value);
  const price = parseFloat(itemPriceInput.value);

  const error = validateItemForm(name, qty, price);
  if (error) {
    itemFormError.textContent = error;
    return;
  }
  itemFormError.textContent = '';

  if (editingId !== null) {
    const item = items.find((it) => it.id === editingId);
    if (item) {
      item.name = name.trim();
      item.qty = qty;
      item.price = price;
    }
    exitEditMode();
  } else {
    items.push({ id: nextItemId++, name: name.trim(), qty, price });
  }

  itemNameInput.value = '';
  itemQtyInput.value = '';
  itemPriceInput.value = '';
  itemNameInput.focus(); // auto-focus next entry for rapid item entry

  renderItemsTable();
  renderReceipt();
}

function deleteItem(id) {
  items = items.filter((it) => it.id !== id);
  if (editingId === id) exitEditMode();
  renderItemsTable();
  renderReceipt();
}

function enterEditMode(id) {
  const item = items.find((it) => it.id === id);
  if (!item) return;
  editingId = id;
  itemNameInput.value = item.name;
  itemQtyInput.value = item.qty;
  itemPriceInput.value = item.price;
  addItemBtn.textContent = 'Update item';
  cancelEditBtn.hidden = false;
  itemNameInput.focus();
}

function exitEditMode() {
  editingId = null;
  addItemBtn.textContent = 'Add item';
  cancelEditBtn.hidden = true;
  itemNameInput.value = '';
  itemQtyInput.value = '';
  itemPriceInput.value = '';
  itemFormError.textContent = '';
}

/* =========================================================
   RENDER: ITEMS TABLE (editable list, not the receipt)
   ========================================================= */
function renderItemsTable() {
  itemsBody.innerHTML = '';
  itemsEmptyState.hidden = items.length !== 0;

  items.forEach((it) => {
    const lineTotal = it.qty * it.price;
    const tr = document.createElement('tr');
    if (it.id === editingId) tr.classList.add('is-editing');

    tr.innerHTML = `
      <td>${escapeHtml(it.name)}</td>
      <td>${escapeHtml(String(it.qty))}</td>
      <td>${formatMoney(it.price)}</td>
      <td>${formatMoney(lineTotal)}</td>
      <td class="items-table__actions">
        <button type="button" class="icon-btn" data-action="edit" data-id="${it.id}" aria-label="Edit ${escapeHtml(it.name)}">✏️</button>
        <button type="button" class="icon-btn" data-action="delete" data-id="${it.id}" aria-label="Delete ${escapeHtml(it.name)}">🗑️</button>
      </td>
    `;
    itemsBody.appendChild(tr);
  });
}

itemsBody.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const id = Number(btn.dataset.id);
  if (btn.dataset.action === 'delete') deleteItem(id);
  if (btn.dataset.action === 'edit') enterEditMode(id);
});

/* =========================================================
   TOTALS
   ========================================================= */
function calcTotals() {
  const subtotal = items.reduce((sum, it) => sum + it.qty * it.price, 0);
  const vatEnabled = vatToggleCheckbox.checked;
  const vat = vatEnabled ? subtotal * 0.16 : 0;
  const total = subtotal + vat;
  return { subtotal, vat, total, vatEnabled };
}

/* =========================================================
   RECEIPT DATE / FOOTER HELPERS
   ========================================================= */
function getReceiptDateDisplay() {
  if (useTodayDateCheckbox.checked) {
    return formatDateDDMMYYYY(new Date());
  }
  if (customDateInput.value) {
    // <input type="date"> gives yyyy-mm-dd — parse without timezone drift
    const [y, m, d] = customDateInput.value.split('-').map(Number);
    return formatDateDDMMYYYY(new Date(y, m - 1, d));
  }
  return formatDateDDMMYYYY(new Date());
}

function getFooterMessage() {
  switch (footerSelect.value) {
    case 'visit':
      return 'Visit Again';
    case 'noreturn':
      return 'Goods once sold cannot be returned';
    case 'custom':
      return customFooterInput.value.trim() || 'Thank you for shopping with us';
    default:
      return 'Thank you for shopping with us';
  }
}

/* =========================================================
   RENDER: THE RECEIPT PREVIEW ITSELF
   ========================================================= */
function renderReceipt() {
  const businessName = (businessNameInput.value.trim() || 'YOUR BUSINESS NAME').toUpperCase();
  const location = locationInput.value.trim() || 'Your location';
  const currency = currencySelect.value;
  const dateDisplay = getReceiptDateDisplay();
  const receiptNoDisplay = hasGenerated ? receiptNumber : '— not yet generated —';
  const { subtotal, vat, total, vatEnabled } = calcTotals();
  const footerMessage = getFooterMessage();

  const lines = [];
  lines.push({ text: divider(RECEIPT_WIDTH, '='), cls: 'divider' });
  lines.push({ text: alignCenter(businessName, RECEIPT_WIDTH), cls: 'bold business-name' });
  lines.push({ text: alignCenter(location, RECEIPT_WIDTH), cls: 'location' });
  lines.push({ text: '', cls: '' });
  lines.push({ text: twoCol('Receipt #:', receiptNoDisplay, RECEIPT_WIDTH), cls: '' });
  lines.push({ text: twoCol('Date:', dateDisplay, RECEIPT_WIDTH), cls: '' });
  lines.push({ text: twoCol('Currency:', currency, RECEIPT_WIDTH), cls: '' });
  lines.push({ text: divider(RECEIPT_WIDTH, '-'), cls: 'divider' });
  lines.push({ text: itemRow('Item', 'Qty', 'Price'), cls: 'bold' });

  if (items.length === 0) {
    lines.push({ text: alignCenter('No items added yet', RECEIPT_WIDTH), cls: 'muted' });
  } else {
    items.forEach((it) => {
      const lineTotal = formatMoney(it.qty * it.price);
      lines.push({ text: itemRow(it.name, it.qty, lineTotal), cls: 'item-row' });
    });
  }

  lines.push({ text: divider(RECEIPT_WIDTH, '-'), cls: 'divider' });
  lines.push({ text: twoCol('Subtotal', formatMoney(subtotal), RECEIPT_WIDTH), cls: '' });
  if (vatEnabled) {
    lines.push({ text: twoCol('VAT (16%)', formatMoney(vat), RECEIPT_WIDTH), cls: '' });
  }
  lines.push({ text: divider(RECEIPT_WIDTH, '='), cls: 'divider' });
  lines.push({ text: twoCol('TOTAL', formatMoney(total), RECEIPT_WIDTH), cls: 'bold total' });
  lines.push({ text: '', cls: '' });
  lines.push({ text: alignCenter(footerMessage, RECEIPT_WIDTH), cls: 'footer-msg' });

  receiptContent.innerHTML = lines
    .map((line) => `<span class="${line.cls}">${escapeHtml(line.text)}</span>`)
    .join('\n');
}

/* =========================================================
   GENERATE / PRINT
   ========================================================= */
function handleGenerate() {
  if (!validateBusinessFields()) return;
  receiptNumber = generateReceiptNumber();
  hasGenerated = true;
  renderReceipt();
}

function handlePrint() {
  if (!validateBusinessFields()) return;
  if (!hasGenerated) {
    receiptNumber = generateReceiptNumber();
    hasGenerated = true;
    renderReceipt();
  }
  window.print();
}

/* =========================================================
   DATE / VAT / FOOTER INTERACTIONS
   ========================================================= */
function updateDateFieldState() {
  customDateInput.disabled = useTodayDateCheckbox.checked;
}

function updateCustomFooterVisibility() {
  customFooterField.hidden = footerSelect.value !== 'custom';
}

/* =========================================================
   DARK MODE (in-memory only — see note below)
   ========================================================= */
function toggleDarkMode() {
  const isDark = document.body.classList.toggle('dark');
  darkModeToggle.setAttribute('aria-pressed', String(isDark));
  darkModeToggle.querySelector('.icon-moon').textContent = isDark ? '☀️' : '🌙';
  darkModeToggle.querySelector('.dm-label').textContent = isDark ? 'Light mode' : 'Dark mode';
}

/* =========================================================
   EVENT WIRING
   ========================================================= */
addItemBtn.addEventListener('click', handleAddOrUpdateItem);
cancelEditBtn.addEventListener('click', exitEditMode);

[itemNameInput, itemQtyInput, itemPriceInput].forEach((input) => {
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddOrUpdateItem();
    }
  });
});

generateBtn.addEventListener('click', handleGenerate);
printBtn.addEventListener('click', handlePrint);
darkModeToggle.addEventListener('click', toggleDarkMode);

useTodayDateCheckbox.addEventListener('change', () => {
  updateDateFieldState();
  renderReceipt();
});
customDateInput.addEventListener('change', renderReceipt);
vatToggleCheckbox.addEventListener('change', renderReceipt);
currencySelect.addEventListener('change', renderReceipt);
businessNameInput.addEventListener('input', renderReceipt);
locationInput.addEventListener('input', renderReceipt);

footerSelect.addEventListener('change', () => {
  updateCustomFooterVisibility();
  renderReceipt();
});
customFooterInput.addEventListener('input', renderReceipt);

/* =========================================================
   INIT
   ========================================================= */
updateDateFieldState();
updateCustomFooterVisibility();
renderItemsTable();
renderReceipt();
