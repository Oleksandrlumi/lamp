// Product catalogue, filament colours and sizes.
// Shapes are parametric: `radius(theta, v)` returns the shade radius at angle
// theta (0..2π) and normalised height v (0 = bottom, 1 = top).

const TAU = Math.PI * 2;
const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export const COLORS = [
  { id: 'ivory', hex: '#EDE6D6', name: { nl: 'Ivoor', en: 'Ivory', uk: 'Слонова кістка' } },
  { id: 'sand', hex: '#D8C3A0', name: { nl: 'Zand', en: 'Sand', uk: 'Пісок' } },
  { id: 'blush', hex: '#E3A99A', name: { nl: 'Roze klei', en: 'Clay pink', uk: 'Рожева глина' } },
  { id: 'terracotta', hex: '#C0643F', name: { nl: 'Terracotta', en: 'Terracotta', uk: 'Теракота' } },
  { id: 'ochre', hex: '#D4A23A', name: { nl: 'Oker', en: 'Ochre', uk: 'Охра' } },
  { id: 'sage', hex: '#9DAE8E', name: { nl: 'Salie', en: 'Sage', uk: 'Шавлія' } },
  { id: 'forest', hex: '#3F5A45', name: { nl: 'Woud', en: 'Forest', uk: 'Лісовий' } },
  { id: 'ocean', hex: '#3E6E8E', name: { nl: 'Oceaan', en: 'Ocean', uk: 'Океан' } },
  { id: 'midnight', hex: '#23304A', name: { nl: 'Middernacht', en: 'Midnight', uk: 'Опівніч' } },
  { id: 'graphite', hex: '#3A3A3C', name: { nl: 'Grafiet', en: 'Graphite', uk: 'Графіт' } },
];

export const SIZES = [
  { id: 'S', scale: 0.8, priceDelta: -20 },
  { id: 'M', scale: 1, priceDelta: 0 },
  { id: 'L', scale: 1.3, priceDelta: 40 },
];

export const PRODUCTS = [
  {
    id: 'nova',
    name: 'Nova',
    type: 'table',
    price: 129,
    heightCm: 28,
    diameterCm: 26,
    printHours: 14,
    defaultColor: 'terracotta',
    height: 1.9,
    tagline: {
      nl: 'Een gloeiende bol met spiraalribben die het licht laten draaien.',
      en: 'A glowing orb with spiral ribs that make the light swirl.',
      uk: 'Сяюча куля зі спіральними ребрами, що закручують світло.',
    },
    radius(theta, v) {
      const base = 0.95 * Math.pow(Math.sin(Math.PI * (0.1 + 0.8 * v)), 0.85);
      return base * (1 + 0.045 * Math.cos(24 * (theta + 2.4 * v)));
    },
  },
  {
    id: 'dune',
    name: 'Dune',
    type: 'table',
    price: 149,
    heightCm: 38,
    diameterCm: 20,
    printHours: 19,
    defaultColor: 'sand',
    height: 2.4,
    tagline: {
      nl: 'Golvende ribben, geïnspireerd op door de wind gevormde duinen.',
      en: 'Undulating ribs inspired by wind-shaped dunes.',
      uk: 'Хвилясті ребра, натхненні дюнами, які формує вітер.',
    },
    radius(theta, v) {
      const base = 0.6 - 0.13 * Math.sin(Math.PI * v) + 0.04 * v;
      const rib = Math.abs(Math.sin(10 * theta + 0.9 * Math.sin(3 * Math.PI * v)));
      return base * (1 + 0.08 * rib);
    },
  },
  {
    id: 'bloom',
    name: 'Bloom',
    type: 'pendant',
    price: 169,
    heightCm: 24,
    diameterCm: 42,
    printHours: 22,
    defaultColor: 'blush',
    height: 1.35,
    tagline: {
      nl: 'Een hanglamp als een openvallende bloem, met zes zachte bloembladen.',
      en: 'A pendant like an opening flower, with six soft petals.',
      uk: 'Підвісна лампа, мов квітка, що розкривається, — шість м’яких пелюсток.',
    },
    radius(theta, v) {
      const w = 1 - v;
      const base = 0.13 + 0.92 * Math.pow(Math.sin((Math.PI / 2) * w), 1.25);
      const petals = 0.13 * Math.cos(6 * theta) * Math.pow(w, 1.6);
      const fine = 0.012 * Math.cos(48 * theta);
      return base * (1 + petals + fine);
    },
  },
  {
    id: 'helix',
    name: 'Helix',
    type: 'table',
    price: 119,
    heightCm: 34,
    diameterCm: 18,
    printHours: 12,
    defaultColor: 'ocean',
    height: 2.2,
    tagline: {
      nl: 'Een gedraaide zeshoek: strak van dichtbij, vloeiend van een afstand.',
      en: 'A twisted hexagon: crisp up close, fluid from afar.',
      uk: 'Закручений шестикутник: чіткий зблизька, плавний здалеку.',
    },
    radius(theta, v) {
      const n = 6;
      const seg = TAU / n;
      const t = theta + 1.5 * v;
      const local = ((t % seg) + seg) % seg - seg / 2;
      const poly = Math.cos(seg / 2) / Math.cos(local);
      const base = 0.56 + 0.07 * Math.sin(Math.PI * v);
      return base * (0.2 + 0.8 * poly);
    },
  },
  {
    id: 'strata',
    name: 'Strata',
    type: 'pendant',
    price: 179,
    heightCm: 22,
    diameterCm: 46,
    printHours: 24,
    defaultColor: 'ochre',
    height: 1.15,
    tagline: {
      nl: 'Terrassen van licht — een koepel opgebouwd uit gestapelde ringen.',
      en: 'Terraces of light — a dome built from stacked rings.',
      uk: 'Тераси світла — купол зі складених кілець.',
    },
    radius(theta, v) {
      const n = 8;
      const f = v * n;
      const vq = (Math.floor(f) + smoothstep(0.78, 1, f - Math.floor(f))) / n;
      const base = 0.12 + 0.95 * Math.pow(Math.cos((vq * Math.PI) / 2), 0.75);
      return base * (1 + 0.006 * Math.cos(64 * theta));
    },
  },
  {
    id: 'ripple',
    name: 'Ripple',
    type: 'table',
    price: 139,
    heightCm: 30,
    diameterCm: 24,
    printHours: 16,
    defaultColor: 'sage',
    height: 2.0,
    tagline: {
      nl: 'Een gebreide textuur van golven die het licht zacht verstrooit.',
      en: 'A knitted texture of ripples that softly diffuses the light.',
      uk: 'В’язана текстура хвиль, що м’яко розсіює світло.',
    },
    radius(theta, v) {
      const base = 0.76 - 0.3 * v;
      const knit = 0.05 * Math.cos(16 * theta + 5 * Math.sin(TAU * v));
      const rings = 0.02 * Math.sin(36 * Math.PI * v);
      return base * (1 + knit + rings);
    },
  },
];

export const productById = (id) => PRODUCTS.find((p) => p.id === id);
export const colorById = (id) => COLORS.find((c) => c.id === id);
export const sizeById = (id) => SIZES.find((s) => s.id === id);

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
