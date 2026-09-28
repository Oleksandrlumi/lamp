// Product catalogue, colours, sizes and product photos.

// Filled from the server (/api/catalog), which the admin panel edits.
export const COLORS = [];
export const SIZES = [];
export const PRODUCTS = [];
export const SHIPPING = {};

export async function loadCatalog() {
  const res = await fetch('/api/catalog', { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Catalog ${res.status}`);
  const data = await res.json();
  COLORS.splice(0, COLORS.length, ...data.colors);
  SIZES.splice(0, SIZES.length, ...data.sizes);
  PRODUCTS.splice(0, PRODUCTS.length, ...data.products);
  Object.assign(SHIPPING, data.shipping);
}

export const productById = (id) => PRODUCTS.find((p) => p.id === id);
export const colorById = (id) => COLORS.find((c) => c.id === id);
export const sizeById = (id) => SIZES.find((s) => s.id === id);

// Photo gallery for a product in a colour: a list of frames, each with a day
// photo (lamp off) and/or a night photo (lamp on). Falls back to the photos
// for all colours ('default'); empty when there are none.
export const framesFor = (productId, colorId) => {
  const g = productById(productId)?.gallery || {};
  return g[colorId]?.length ? g[colorId] : g.default || [];
};

// Colours a product is sold in.
export const coloursOf = (product) => COLORS.filter((c) => product.colors?.includes(c.id));

// Whether text on top of this colour should be light.
export function isDark(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.28;
}

export function unitPrice(product, sizeId) {
  return product.price + (sizeById(sizeId)?.priceDelta ?? 0);
}

export function dimensions(product, sizeId) {
  const s = sizeById(sizeId)?.scale ?? 1;
  return {
    height: Math.round(product.heightCm * s),
    diameter: Math.round(product.diameterCm * s),
  };
}
