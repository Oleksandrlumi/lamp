// Cart state, persistence and pricing rules.
import { productById, colorById, sizeById, unitPrice, SHIPPING } from './catalog.js';

export const FIRST_ORDER_DISCOUNT = 0.1;

const CART_KEY = 'lumi.cart';
const ORDERS_KEY = 'lumi.orders';
const listeners = new Set();

function read(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

let items = [];

// Call once the catalogue is loaded: drops items that no longer exist.
export function initCart() {
  items = read(CART_KEY, []).filter((i) => productById(i.productId) && colorById(i.colorId) && sizeById(i.size));
  emit();
}

function emit() {
  write(CART_KEY, items);
  listeners.forEach((fn) => fn(items));
}

export const onCartChange = (fn) => listeners.add(fn);
export const getItems = () => items;
export const itemCount = () => items.reduce((n, i) => n + i.qty, 0);

export function addItem({ productId, colorId, size, qty }) {
  const key = `${productId}|${colorId}|${size}`;
  const existing = items.find((i) => i.key === key);
  if (existing) existing.qty = Math.min(20, existing.qty + qty);
  else items = [...items, { key, productId, colorId, size, qty }];
  emit();
}

export function setQty(key, qty) {
  items = items
    .map((i) => (i.key === key ? { ...i, qty: Math.max(0, Math.min(20, qty)) } : i))
    .filter((i) => i.qty > 0);
  emit();
}

export const removeItem = (key) => setQty(key, 0);

export function clearCart() {
  items = [];
  emit();
}

export const lineTotal = (item) => unitPrice(productById(item.productId), item.size) * item.qty;

const round2 = (n) => Math.round(n * 100) / 100;

// Preview of whether an email qualifies for the first-order discount, based on
// orders placed in this browser. The server makes the final decision.
export function isFirstOrder(email) {
  const e = (email || '').trim().toLowerCase();
  if (!e) return true;
  return !read(ORDERS_KEY, []).some((o) => o.email === e);
}

export function totals({ country = 'NL', firstOrder = true } = {}) {
  const subtotal = round2(items.reduce((s, i) => s + lineTotal(i), 0));
  const discount = firstOrder ? round2(subtotal * FIRST_ORDER_DISCOUNT) : 0;
  const shipping = items.length ? (SHIPPING[country] ?? SHIPPING.FR) : 0;
  const total = round2(subtotal - discount + shipping);
  const vat = round2(total - total / 1.21);
  return { subtotal, discount, shipping, total, vat };
}

// Sends the order to the server, which recalculates all prices and decides on
// the first-order discount.
export async function placeOrder({ customer, address }) {
  const res = await fetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customer,
      address,
      items: items.map(({ productId, colorId, size, qty }) => ({ productId, colorId, size, qty })),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Order failed (${res.status})`);
  write(ORDERS_KEY, [...read(ORDERS_KEY, []), { id: data.id, email: data.email }]);
  clearCart();
  return data;
}
