// Cart state, persistence and pricing rules.
import { productById, colorById, unitPrice } from './catalog.js';

export const FIRST_ORDER_DISCOUNT = 0.1;

// Shipping rates in euro. The Netherlands ships free.
export const SHIPPING = { NL: 0, BE: 6.95, DE: 7.95, LU: 9.95, FR: 12.95, AT: 12.95 };

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

let items = read(CART_KEY, []).filter((i) => productById(i.productId) && colorById(i.colorId));

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

// Whether an email address qualifies for the first-order discount.
// Note: this only knows about orders placed in this browser; a production
// shop must verify this on the server when the order is created.
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

export function placeOrder({ customer, address }) {
  const email = customer.email.trim().toLowerCase();
  const firstOrder = isFirstOrder(email);
  const sums = totals({ country: address.country, firstOrder });
  const id = `LUMI-${Date.now().toString(36).toUpperCase().slice(-6)}`;
  const order = {
    id,
    email,
    customer,
    address,
    items,
    ...sums,
    firstOrder,
    createdAt: new Date().toISOString(),
  };
  write(ORDERS_KEY, [...read(ORDERS_KEY, []), order]);
  clearCart();
  return order;
}
