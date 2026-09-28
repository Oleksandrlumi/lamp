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
const AUDIT = path.join(DATA_DIR, 'audit.log');
const MAX_BACKUPS = 200;

let catalog;
let orders;
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
  catalog = await readJson(CATALOG, null);
  if (!catalog) {
    catalog = JSON.parse(await fs.readFile(path.join(root, 'seed-catalog.json'), 'utf8'));
    await writeAtomic(CATALOG, catalog);
  }
  orders = await readJson(ORDERS, []);
}

export const getCatalog = () => catalog;
export const getOrders = () => orders;

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

export const audit = (entry) =>
  fs.appendFile(AUDIT, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`, { mode: 0o600 }).catch(() => {});
