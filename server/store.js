// JSON file storage with atomic writes and automatic backups.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(root, '..', 'data'));
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const CATALOG = path.join(DATA_DIR, 'catalog.json');
const ORDERS = path.join(DATA_DIR, 'orders.json');
const MESSAGES = path.join(DATA_DIR, 'messages.json');
const AUDIT = path.join(DATA_DIR, 'audit.log');
const SECURITY = path.join(DATA_DIR, 'security.json'); // 2FA secret — never included in backups
const MAX_BACKUPS = 200;
const MAX_MESSAGES = 2000; // oldest questions are dropped beyond this
const MAX_AUDIT_BYTES = 5 * 1024 * 1024; // rotate audit.log at 5 MB (keeps one old file)

let catalog;
let orders;
let messages;
let queue = Promise.resolve();

// Serialise all writes so concurrent requests can't corrupt a file.
const serial = (fn) => (queue = queue.then(fn, fn));

async function writeAtomic(file, data) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  await fs.rename(tmp, file);
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

export async function initStore() {
  await fs.mkdir(UPLOAD_DIR, { recursive: true, mode: 0o700 });
  await fs.mkdir(BACKUP_DIR, { recursive: true, mode: 0o700 });
  const seed = JSON.parse(await fs.readFile(path.join(root, 'seed-catalog.json'), 'utf8'));
  catalog = await readJson(CATALOG, null);
  if (!catalog) {
    catalog = seed;
    await writeAtomic(CATALOG, catalog);
  } else {
    await syncColours(seed.colors);
  }
  orders = await readJson(ORDERS, []);
  messages = await readJson(MESSAGES, []);
}

// The colour palette is defined in code (seed-catalog.json). When it changes,
// update stored products: unknown default colours fall back to the first
// colour and photos for removed colours are dropped.
async function syncColours(colors) {
  const ids = new Set(colors.map((c) => c.id));
  const keepPhotos = (set = {}) => Object.fromEntries(Object.entries(set).filter(([k]) => k === 'default' || ids.has(k)));
  const products = catalog.products.map((p) => ({
    ...p,
    defaultColor: ids.has(p.defaultColor) ? p.defaultColor : colors[0].id,
    photos: keepPhotos(p.photos),
    photosNight: keepPhotos(p.photosNight),
  }));
  const next = { ...catalog, colors, products };
  if (JSON.stringify(next) !== JSON.stringify(catalog)) {
    await backupCatalog();
    await writeAtomic(CATALOG, next);
    catalog = next;
  }
}

export const getCatalog = () => catalog;
export const getOrders = () => orders;
export const getMessages = () => messages;

async function backupCatalog() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  await fs.copyFile(CATALOG, path.join(BACKUP_DIR, `catalog-${stamp}.json`)).catch(() => {});
  const files = (await fs.readdir(BACKUP_DIR)).filter((f) => f.startsWith('catalog-')).sort();
  await Promise.all(files.slice(0, Math.max(0, files.length - MAX_BACKUPS)).map((f) => fs.unlink(path.join(BACKUP_DIR, f))));
}

export const saveCatalog = (next) =>
  serial(async () => {
    await backupCatalog();
    await writeAtomic(CATALOG, next);
    catalog = next;
  });

export const addOrder = (order) =>
  serial(async () => {
    const next = [...orders, order];
    await writeAtomic(ORDERS, next);
    orders = next;
  });

// Customer questions from the contact form.
const saveMessages = (fn) =>
  serial(async () => {
    const next = fn(messages).slice(-MAX_MESSAGES);
    await writeAtomic(MESSAGES, next);
    messages = next;
  });
export const addMessage = (message) => saveMessages((list) => [...list, message]);
export const updateMessage = (id, patch) => saveMessages((list) => list.map((m) => (m.id === id ? { ...m, ...patch } : m)));
export const deleteMessage = (id) => saveMessages((list) => list.filter((m) => m.id !== id));

export async function audit(entry) {
  try {
    const { size } = await fs.stat(AUDIT).catch(() => ({ size: 0 }));
    if (size > MAX_AUDIT_BYTES) await fs.rename(AUDIT, `${AUDIT}.1`);
    await fs.appendFile(AUDIT, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`, { mode: 0o600 });
  } catch {}
}

export const readSecurity = () => readJson(SECURITY, {});
export const saveSecurity = (data) => serial(() => writeAtomic(SECURITY, data));
export const clearSecurity = () => fs.rm(SECURITY, { force: true });

export const readAudit = () => fs.readFile(AUDIT).catch(() => Buffer.alloc(0));

// Only files the upload handler itself created (random hex names).
export const UPLOAD_NAME = /^[a-f0-9]{32}\.(jpg|png|webp)$/;
export const listUploads = async () => (await fs.readdir(UPLOAD_DIR)).filter((f) => UPLOAD_NAME.test(f)).sort();
