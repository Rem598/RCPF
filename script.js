'use strict';

/* =========================================================
   STATE
   ========================================================= */
let items = [];          // { id, name, qty, price }
let editingId = null;    // id of item currently being edited, or null
let receiptNumber = null;
let hasGenerated = false;
let nextItemId = 1;

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
  // Item prices are entered VAT-inclusive — the sum of line totals IS the
  // amount the customer pays, whether or not VAT is broken out below.
  const total = items.reduce((sum, it) => sum + it.qty * it.price, 0);
  const vatEnabled = vatToggleCheckbox.checked;
  const VAT_RATE = 0.16;
  // Extract the VAT portion already baked into `total`: vat = total * rate/(1+rate)
  const vat = vatEnabled ? total * (VAT_RATE / (1 + VAT_RATE)) : 0;
  const subtotal = total - vat;
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
  const businessName = (businessNameInput.value.trim() || 'Your Business Name').toUpperCase();
  const location = locationInput.value.trim() || 'Your location';
  const dateDisplay = getReceiptDateDisplay();
  const receiptNoDisplay = hasGenerated ? receiptNumber : 'Not yet generated';
  const { subtotal, vat, total, vatEnabled } = calcTotals();
  const footerMessage = getFooterMessage();

  const itemsHtml = items.length === 0
    ? `<div class="r-empty">No items added yet</div>`
    : items
        .map((it) => {
          const lineTotal = formatMoney(it.qty * it.price);
          const safeName = escapeHtml(it.name);
          return `
        <div class="r-item-row">
          <span class="r-item-name" title="${safeName}">${safeName}</span>
          <span class="r-item-qty">${escapeHtml(String(it.qty))}</span>
          <span class="r-item-price">${lineTotal}</span>
        </div>`;
        })
        .join('');

  const vatRowHtml = vatEnabled
    ? `<div class="r-row"><span>VAT (16%)</span><span>${formatMoney(vat)}</span></div>`
    : '';

  receiptContent.innerHTML = `
    <div class="r-business" title="${escapeHtml(businessName)}">${escapeHtml(businessName)}</div>
    <div class="r-location">${escapeHtml(location)}</div>
    <div class="r-row"><span>Receipt #:</span><span>${escapeHtml(receiptNoDisplay)}</span></div>
    <div class="r-row"><span>Date:</span><span>${escapeHtml(dateDisplay)}</span></div>
    <div class="r-divider"></div>
    <div class="r-item-row r-item-header">
      <span class="r-item-name">Item</span>
      <span class="r-item-qty">Qty</span>
      <span class="r-item-price">Price</span>
    </div>
    ${itemsHtml}
    <div class="r-divider"></div>
    <div class="r-row"><span>Subtotal</span><span>${formatMoney(subtotal)}</span></div>
    ${vatRowHtml}
    <div class="r-divider r-divider--strong"></div>
    <div class="r-row r-total"><span>TOTAL</span><span>${formatMoney(total)}</span></div>
    <div class="r-footer">${escapeHtml(footerMessage)}</div>
  `;
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
