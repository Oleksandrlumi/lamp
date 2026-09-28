// Input validation for admin edits and customer orders. Everything coming
// from a browser is treated as untrusted and rebuilt field by field.

export class ValidationError extends Error {}

const fail = (msg) => {
  throw new ValidationError(msg);
};

const LANGS = ['nl', 'en']; // shop languages (product descriptions)
const MAX_FRAMES = 12; // photos per colour
const PHOTO_URL = /^(\/uploads\/[a-f0-9]{32}\.(jpg|png|webp)|assets\/img\/lamps\/[A-Za-z0-9._-]{1,80})$/;

function str(v, name, { min = 0, max = 200 } = {}) {
  if (typeof v !== 'string') fail(`${name}: має бути текстом`);
  const s = v.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (s.length < min) fail(`${name}: обов’язкове поле`);
  if (s.length > max) fail(`${name}: максимум ${max} символів`);
  return s;
}

function num(v, name, { min, max, int = false }) {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) fail(`${name}: має бути числом`);
  if (n < min || n > max) fail(`${name}: від ${min} до ${max}`);
  return int ? Math.round(n) : Math.round(n * 100) / 100;
}

export const slugify = (s) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

export function validateProduct(input, catalog, { id } = {}) {
  if (!input || typeof input !== 'object') fail('Невірні дані');
  const colorIds = new Set(catalog.colors.map((c) => c.id));
  const tagline = {};
  for (const l of LANGS) tagline[l] = str(input.tagline?.[l] ?? '', `Опис (${l.toUpperCase()})`, { max: 300 });

  // Colours this lamp is sold in (at least one), in palette order.
  const wanted = Array.isArray(input.colors) ? input.colors.map(String) : [];
  const colors = catalog.colors.map((c) => c.id).filter((c) => wanted.includes(c));
  if (!colors.length) fail('Кольори: оберіть хоча б один колір');
  const defaultColor = String(input.defaultColor || '');
  if (!colors.includes(defaultColor)) fail('Колір за замовчуванням: має бути серед доступних кольорів');

  // Photo gallery per colour (or 'default' for all colours). Each frame has a
  // day photo (lamp off) and/or a night photo (lamp on).
  const photoUrl = (url) => {
    if (url === undefined || url === null || url === '') return '';
    if (typeof url !== 'string' || !PHOTO_URL.test(url)) fail('Фото: невірне посилання');
    return url;
  };
  const gallery = {};
  const rawGallery = input.gallery && typeof input.gallery === 'object' ? input.gallery : {};
  for (const [key, frames] of Object.entries(rawGallery)) {
    if (key !== 'default' && !colorIds.has(key)) fail(`Фото: невідомий колір ${key}`);
    if (key !== 'default' && !colors.includes(key)) continue; // colour no longer offered
    if (!Array.isArray(frames)) fail('Фото: невірні дані');
    if (frames.length > MAX_FRAMES) fail(`Фото: максимум ${MAX_FRAMES} на колір`);
    const list = frames
      .map((f) => ({ day: photoUrl(f?.day), night: photoUrl(f?.night) }))
      .filter((f) => f.day || f.night);
    if (list.length) gallery[key] = list;
  }

  if (!['table', 'pendant'].includes(input.type)) fail('Тип: настільна або підвісна');

  return {
    id,
    name: str(input.name, 'Назва', { min: 1, max: 60 }),
    type: input.type,
    price: num(input.price, 'Ціна', { min: 1, max: 100000 }),
    heightCm: num(input.heightCm, 'Висота', { min: 1, max: 500, int: true }),
    diameterCm: num(input.diameterCm, 'Діаметр', { min: 1, max: 500, int: true }),
    colors,
    defaultColor,
    tagline,
    gallery,
    visible: input.visible !== false,
  };
}

export function validateSettings(input, catalog) {
  if (!input || typeof input !== 'object') fail('Невірні дані');
  const sizes = catalog.sizes.map((s) => ({
    ...s,
    priceDelta: num(input.sizes?.[s.id] ?? s.priceDelta, `Доплата за розмір ${s.id}`, { min: -10000, max: 10000 }),
  }));
  const shipping = {};
  for (const country of Object.keys(catalog.shipping)) {
    shipping[country] = num(input.shipping?.[country] ?? catalog.shipping[country], `Доставка ${country}`, { min: 0, max: 1000 });
  }
  shipping.NL = 0; // free shipping in the Netherlands is a promise of the shop
  return { sizes, shipping };
}

/* ---------------- Orders ---------------- */

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const NL_POSTCODE = /^[1-9][0-9]{3}\s?[A-Za-z]{2}$/;
export const FIRST_ORDER_DISCOUNT = 0.1;
const round2 = (n) => Math.round(n * 100) / 100;

export function validateOrder(input, catalog) {
  if (!input || typeof input !== 'object') fail('Invalid order');
  const c = input.customer || {};
  const a = input.address || {};
  const customer = {
    email: str(c.email, 'email', { min: 3, max: 254 }).toLowerCase(),
    firstName: str(c.firstName, 'firstName', { min: 1, max: 80 }),
    lastName: str(c.lastName, 'lastName', { min: 1, max: 80 }),
    phone: str(c.phone ?? '', 'phone', { max: 40 }),
  };
  if (!EMAIL.test(customer.email)) fail('Invalid email');
  const country = String(a.country || '');
  if (!(country in catalog.shipping)) fail('Invalid country');
  const address = {
    country,
    postcode: str(a.postcode, 'postcode', { min: 2, max: 12 }).toUpperCase(),
    houseNumber: str(a.houseNumber, 'houseNumber', { min: 1, max: 10 }),
    addition: str(a.addition ?? '', 'addition', { max: 10 }),
    street: str(a.street, 'street', { min: 1, max: 120 }),
    city: str(a.city, 'city', { min: 1, max: 80 }),
  };
  if (country === 'NL' && !NL_POSTCODE.test(address.postcode)) fail('Invalid postcode');

  if (!Array.isArray(input.items) || !input.items.length || input.items.length > 30) fail('Invalid items');
  const items = input.items.map((i) => {
    const product = catalog.products.find((p) => p.id === i?.productId && p.visible);
    const color = product?.colors.includes(i?.colorId) && catalog.colors.find((col) => col.id === i.colorId);
    const size = catalog.sizes.find((s) => s.id === i?.size);
    const qty = Number(i?.qty);
    if (!product || !color || !size || !Number.isInteger(qty) || qty < 1 || qty > 20) fail('Invalid item');
    const unitPrice = round2(product.price + size.priceDelta);
    return { productId: product.id, name: product.name, colorId: color.id, colorName: color.name.nl, size: size.id, qty, unitPrice, lineTotal: round2(unitPrice * qty) };
  });
  return { customer, address, items };
}

// Prices are always recalculated on the server from the current catalogue.
export function orderTotals(items, country, firstOrder, catalog) {
  const subtotal = round2(items.reduce((s, i) => s + i.lineTotal, 0));
  const discount = firstOrder ? round2(subtotal * FIRST_ORDER_DISCOUNT) : 0;
  const shipping = catalog.shipping[country] ?? 0;
  const total = round2(subtotal - discount + shipping);
  return { subtotal, discount, shipping, total, vat: round2(total - total / 1.21) };
}

/* ---------------- Contact form ---------------- */

export function validateMessage(input) {
  if (!input || typeof input !== 'object') fail('Invalid message');
  const email = str(input.email, 'email', { min: 3, max: 254 }).toLowerCase();
  if (!EMAIL.test(email)) fail('Invalid email');
  if (typeof input.message !== 'string') fail('Invalid message');
  // keep line breaks, drop other control characters, limit empty lines
  const message = input.message
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (message.length < 5 || message.length > 2000) fail('Invalid message');
  return {
    name: str(input.name, 'name', { min: 1, max: 80 }),
    email,
    message,
    lang: LANGS.includes(input.lang) ? input.lang : 'nl',
  };
}
