// LUMI web server: serves the shop, the public catalogue/order API and the
// password-protected admin panel.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import {
  verifyPassword,
  safeEqual,
  createSession,
  getSession,
  destroySession,
  loginBlocked,
  recordLoginFailure,
  clearLoginFailures,
} from './auth.js';
import { initStore, getCatalog, getOrders, saveCatalog, addOrder, audit, UPLOAD_DIR } from './store.js';
import { validateProduct, validateSettings, validateOrder, orderTotals, slugify, ValidationError } from './validate.js';

const root = path.dirname(fileURLToPath(import.meta.url));
try {
  process.loadEnvFile(path.join(root, '..', '.env'));
} catch {}

const PROD = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT) || 8080;
const ADMIN_USER = process.env.ADMIN_USER || '';
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || '';
// Behind a reverse proxy (Render, Railway, nginx…) set TRUST_PROXY=1 so the
// real client IP is used for login rate limiting.
const TRUST_PROXY = process.env.TRUST_PROXY || (PROD ? '1' : '');
const COOKIE = PROD ? '__Host-lumi_admin' : 'lumi_admin';

if (!ADMIN_USER || !ADMIN_PASSWORD_HASH) {
  console.warn('⚠  ADMIN_USER / ADMIN_PASSWORD_HASH not set — the admin panel is disabled. Run `npm run set-admin`.');
}

await initStore();
const app = express();
app.disable('x-powered-by');
if (TRUST_PROXY) app.set('trust proxy', /^\d+$/.test(TRUST_PROXY) ? Number(TRUST_PROXY) : TRUST_PROXY);

/* ---------------- Security headers ---------------- */
app.use((req, res, next) => {
  res.set({
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "connect-src 'self' https://api.pdok.nl",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join('; '),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
  });
  if (PROD) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

/* ---------------- Helpers ---------------- */
function readCookie(req, name) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return '';
}

function setSessionCookie(res, value, maxAgeSec) {
  const attrs = [`${COOKIE}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${maxAgeSec}`];
  if (PROD) attrs.push('Secure');
  res.append('Set-Cookie', attrs.join('; '));
}

const noStore = (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
};

// Reject cross-site requests: the Origin header (sent by browsers on POST/PUT/
// DELETE) must match this host.
function sameOrigin(req) {
  const origin = req.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === req.get('host');
  } catch {
    return false;
  }
}

// Simple per-IP rate limiter for public endpoints.
function rateLimit({ windowMs, max }) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const list = (hits.get(req.ip) || []).filter((t) => now - t < windowMs);
    if (list.length >= max) return res.status(429).json({ error: 'Too many requests' });
    list.push(now);
    hits.set(req.ip, list);
    if (hits.size > 10000) hits.clear();
    next();
  };
}

const publicCatalog = () => {
  const c = getCatalog();
  return { colors: c.colors, sizes: c.sizes, shipping: c.shipping, products: c.products.filter((p) => p.visible) };
};

/* ---------------- Public API ---------------- */
app.get('/api/catalog', (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.json(publicCatalog());
});

app.post('/api/orders', rateLimit({ windowMs: 60 * 60 * 1000, max: 20 }), express.json({ limit: '32kb' }), async (req, res, next) => {
  try {
    if (!sameOrigin(req)) return res.status(403).json({ error: 'Forbidden' });
    const catalog = getCatalog();
    const { customer, address, items } = validateOrder(req.body, catalog);
    const firstOrder = !getOrders().some((o) => o.customer.email === customer.email);
    const order = {
      id: `LUMI-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
      createdAt: new Date().toISOString(),
      customer,
      address,
      items,
      firstOrder,
      ...orderTotals(items, address.country, firstOrder, catalog),
      status: 'new',
    };
    await addOrder(order);
    const { id, subtotal, discount, shipping, total } = order;
    res.status(201).json({ id, email: customer.email, subtotal, discount, shipping, total, firstOrder });
  } catch (err) {
    next(err);
  }
});

/* ---------------- Admin auth ---------------- */
const admin = express.Router();
admin.use(noStore);
admin.use(express.json({ limit: '64kb' }));

admin.post('/login', async (req, res) => {
  if (!ADMIN_USER || !ADMIN_PASSWORD_HASH) return res.status(503).json({ error: 'Адмінку не налаштовано' });
  if (!sameOrigin(req)) return res.status(403).json({ error: 'Forbidden' });
  const wait = loginBlocked(req.ip);
  if (wait) return res.status(429).json({ error: `Забагато спроб. Спробуйте через ${wait} хв.` });

  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string' || password.length > 256 || username.length > 256) {
    return res.status(400).json({ error: 'Невірні дані' });
  }
  // Always run the (slow) password check so timing doesn't reveal the username.
  const passwordOk = await verifyPassword(password, ADMIN_PASSWORD_HASH);
  const ok = safeEqual(username, ADMIN_USER) && passwordOk;
  if (!ok) {
    recordLoginFailure(req.ip);
    audit({ action: 'login_failed', ip: req.ip });
    await new Promise((r) => setTimeout(r, 400 + Math.random() * 400));
    return res.status(401).json({ error: 'Невірний логін або пароль' });
  }
  clearLoginFailures(req.ip);
  const old = readCookie(req, COOKIE);
  if (old) destroySession(old);
  const sid = createSession(ADMIN_USER, req.ip);
  setSessionCookie(res, sid, 12 * 60 * 60);
  audit({ action: 'login', ip: req.ip });
  res.json({ csrf: getSession(sid).csrf });
});

admin.post('/logout', (req, res) => {
  const sid = readCookie(req, COOKIE);
  if (sid) destroySession(sid);
  setSessionCookie(res, '', 0);
  res.json({ ok: true });
});

// Everything below requires a valid session; changes also require the CSRF
// token and a same-origin request.
admin.use((req, res, next) => {
  const session = getSession(readCookie(req, COOKIE));
  if (!session) return res.status(401).json({ error: 'Потрібно увійти' });
  if (req.method !== 'GET') {
    const token = req.get('x-csrf-token') || '';
    if (!sameOrigin(req) || !safeEqual(token, session.csrf)) return res.status(403).json({ error: 'Forbidden' });
  }
  req.session = session;
  next();
});

admin.get('/session', (req, res) => res.json({ csrf: req.session.csrf }));

admin.get('/catalog', (req, res) => res.json(getCatalog()));

admin.get('/orders', (req, res) => res.json([...getOrders()].reverse()));

admin.post('/products', async (req, res, next) => {
  try {
    const catalog = getCatalog();
    let id = slugify(String(req.body?.name || '')) || 'lamp';
    for (let n = 2; catalog.products.some((p) => p.id === id); n++) id = `${slugify(req.body.name) || 'lamp'}-${n}`;
    const product = validateProduct(req.body, catalog, { id });
    await saveCatalog({ ...catalog, products: [...catalog.products, product] });
    audit({ action: 'product_create', id, ip: req.ip });
    res.status(201).json(product);
  } catch (err) {
    next(err);
  }
});

admin.put('/products/:id', async (req, res, next) => {
  try {
    const catalog = getCatalog();
    const idx = catalog.products.findIndex((p) => p.id === req.params.id);
    if (idx < 0) return res.status(404).json({ error: 'Товар не знайдено' });
    const product = validateProduct(req.body, catalog, { id: req.params.id });
    const products = catalog.products.map((p, i) => (i === idx ? product : p));
    await saveCatalog({ ...catalog, products });
    audit({ action: 'product_update', id: product.id, price: product.price, ip: req.ip });
    res.json(product);
  } catch (err) {
    next(err);
  }
});

admin.delete('/products/:id', async (req, res, next) => {
  try {
    const catalog = getCatalog();
    if (!catalog.products.some((p) => p.id === req.params.id)) return res.status(404).json({ error: 'Товар не знайдено' });
    await saveCatalog({ ...catalog, products: catalog.products.filter((p) => p.id !== req.params.id) });
    audit({ action: 'product_delete', id: req.params.id, ip: req.ip });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

admin.post('/products/:id/move', async (req, res, next) => {
  try {
    const catalog = getCatalog();
    const products = [...catalog.products];
    const idx = products.findIndex((p) => p.id === req.params.id);
    const to = idx + (req.body?.dir === 'up' ? -1 : 1);
    if (idx < 0 || to < 0 || to >= products.length) return res.json({ ok: true });
    [products[idx], products[to]] = [products[to], products[idx]];
    await saveCatalog({ ...catalog, products });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

admin.put('/settings', async (req, res, next) => {
  try {
    const catalog = getCatalog();
    const settings = validateSettings(req.body, catalog);
    await saveCatalog({ ...catalog, ...settings });
    audit({ action: 'settings_update', ip: req.ip });
    res.json(settings);
  } catch (err) {
    next(err);
  }
});

// Photo upload: the raw image is the request body. Only real JPEG/PNG/WebP
// files (checked by their magic bytes) are accepted, and they get a random name.
const IMAGE_TYPES = [
  { ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: 'webp', test: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
];
admin.post(
  '/uploads',
  express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '8mb' }),
  async (req, res, next) => {
    try {
      const buf = req.body;
      if (!Buffer.isBuffer(buf) || buf.length < 12) return res.status(400).json({ error: 'Завантажте JPG, PNG або WebP до 8 МБ' });
      const type = IMAGE_TYPES.find((t) => t.test(buf));
      if (!type) return res.status(400).json({ error: 'Файл не є зображенням JPG, PNG або WebP' });
      const name = `${crypto.randomBytes(16).toString('hex')}.${type.ext}`;
      await fs.writeFile(path.join(UPLOAD_DIR, name), buf, { mode: 0o644 });
      audit({ action: 'upload', file: name, ip: req.ip });
      res.status(201).json({ url: `/uploads/${name}` });
    } catch (err) {
      next(err);
    }
  },
);

app.use('/api/admin', admin);

/* ---------------- Static files ---------------- */
app.use(
  '/uploads',
  express.static(UPLOAD_DIR, {
    dotfiles: 'deny',
    index: false,
    maxAge: '30d',
    immutable: true,
    setHeaders: (res) => res.set('Content-Disposition', 'inline'),
  }),
);
app.use('/admin', noStore, (req, res, next) => {
  res.set('X-Robots-Tag', 'noindex, nofollow');
  next();
});
app.use(express.static(path.join(root, '..', 'public'), { dotfiles: 'deny', extensions: ['html'] }));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

/* ---------------- Errors ---------------- */
app.use((err, req, res, next) => {
  if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Файл або запит завеликий' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Невірні дані' });
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

app.listen(PORT, () => console.log(`LUMI running on http://localhost:${PORT}`));
