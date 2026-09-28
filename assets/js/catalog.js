// Product catalogue, filament colours, sizes and product photos.

export const COLORS = [
  { id: 'ivory', hex: '#EAE3D4', name: { nl: 'Ivoor', en: 'Ivory', uk: 'Слонова кістка' } },
  { id: 'sand', hex: '#D6C2A1', name: { nl: 'Zand', en: 'Sand', uk: 'Пісок' } },
  { id: 'blush', hex: '#DDB0A2', name: { nl: 'Roze klei', en: 'Clay pink', uk: 'Рожева глина' } },
  { id: 'terracotta', hex: '#B8653F', name: { nl: 'Terracotta', en: 'Terracotta', uk: 'Теракота' } },
  { id: 'ochre', hex: '#C99A3E', name: { nl: 'Oker', en: 'Ochre', uk: 'Охра' } },
  { id: 'sage', hex: '#A3AD93', name: { nl: 'Salie', en: 'Sage', uk: 'Шавлія' } },
  { id: 'forest', hex: '#46594A', name: { nl: 'Woud', en: 'Forest', uk: 'Лісовий' } },
  { id: 'ocean', hex: '#4A6F87', name: { nl: 'Oceaan', en: 'Ocean', uk: 'Океан' } },
  { id: 'midnight', hex: '#27304A', name: { nl: 'Middernacht', en: 'Midnight', uk: 'Опівніч' } },
  { id: 'graphite', hex: '#3B3A38', name: { nl: 'Grafiet', en: 'Graphite', uk: 'Графіт' } },
];

export const SIZES = [
  { id: 'S', scale: 0.8, priceDelta: -20 },
  { id: 'M', scale: 1, priceDelta: 0 },
  { id: 'L', scale: 1.3, priceDelta: 40 },
];

// Product photos. Put image files in assets/img/lamps/ and list them here.
// `default` is shown for every colour; add a colour id to show a photo of the
// lamp in that specific colour, e.g.
//   nova: { default: 'assets/img/lamps/nova.jpg', terracotta: 'assets/img/lamps/nova-terracotta.jpg' },
// Until a photo is set, the lamp is shown as an elegant colour panel.
export const PHOTOS = {
  nova: {},
  dune: {},
  bloom: {},
  helix: {},
  strata: {},
  ripple: {},
};

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
    tagline: {
      nl: 'Een gloeiende bol met spiraalribben die het licht laten draaien.',
      en: 'A glowing orb with spiral ribs that make the light swirl.',
      uk: 'Сяюча куля зі спіральними ребрами, що закручують світло.',
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
    tagline: {
      nl: 'Golvende ribben, geïnspireerd op door de wind gevormde duinen.',
      en: 'Undulating ribs inspired by wind-shaped dunes.',
      uk: 'Хвилясті ребра, натхненні дюнами, які формує вітер.',
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
    tagline: {
      nl: 'Een hanglamp als een openvallende bloem, met zes zachte bloembladen.',
      en: 'A pendant like an opening flower, with six soft petals.',
      uk: 'Підвісна лампа, мов квітка, що розкривається, — шість м’яких пелюсток.',
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
    tagline: {
      nl: 'Een gedraaide zeshoek: strak van dichtbij, vloeiend van een afstand.',
      en: 'A twisted hexagon: crisp up close, fluid from afar.',
      uk: 'Закручений шестикутник: чіткий зблизька, плавний здалеку.',
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
    tagline: {
      nl: 'Terrassen van licht — een koepel opgebouwd uit gestapelde ringen.',
      en: 'Terraces of light — a dome built from stacked rings.',
      uk: 'Тераси світла — купол зі складених кілець.',
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
    tagline: {
      nl: 'Een gebreide textuur van golven die het licht zacht verstrooit.',
      en: 'A knitted texture of ripples that softly diffuses the light.',
      uk: 'В’язана текстура хвиль, що м’яко розсіює світло.',
    },
  },
];

export const productById = (id) => PRODUCTS.find((p) => p.id === id);
export const colorById = (id) => COLORS.find((c) => c.id === id);
export const sizeById = (id) => SIZES.find((s) => s.id === id);

export const photoFor = (productId, colorId) => {
  const set = PHOTOS[productId] || {};
  return set[colorId] || set.default || '';
};

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
