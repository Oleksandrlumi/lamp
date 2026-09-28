import { loadCatalog, PRODUCTS, COLORS, SIZES, productById, colorById, photoFor, isDark, unitPrice, dimensions } from './catalog.js';
import { t, setLang, getLang, onLangChange, applyTranslations, money } from './i18n.js';
import * as cart from './cart.js';
import { lookupAddress, NL_POSTCODE, formatPostcode } from './postcode.js';
import { initCursorLight } from './cursor-light.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const colourName = (id) => colorById(id)?.name[getLang()] ?? '';

// Product image: day and night photos for this colour if there are any,
// otherwise a flat colour panel (which glows in night mode).
function visualHtml(product, colorId) {
  const c = colorById(colorId);
  const { day, night } = photoFor(product.id, colorId);
  const no = String(PRODUCTS.indexOf(product) + 1).padStart(2, '0');
  const alt = `${esc(product.name)} — ${esc(colourName(colorId))}`;
  const cls = ['visual', isDark(c.hex) && 'is-dark', (day || night) && 'has-photo', night && 'has-night']
    .filter(Boolean)
    .join(' ');
  return `<div class="${cls}" style="--c:${c.hex}">
      ${day ? `<img class="visual__photo visual__photo--day" src="${esc(day)}" alt="${alt}" loading="lazy">` : ''}
      ${night ? `<img class="visual__photo visual__photo--night" src="${esc(night)}" alt="${day ? '' : alt}" loading="lazy">` : ''}
      <span class="visual__no">N° ${no}</span>
      <span class="visual__colour">${esc(colourName(colorId))}</span>
      <span class="visual__name">${esc(product.name)}</span>
    </div>`;
}

/* ---------------- Dialogs ---------------- */
function openDialog(d) {
  if (!d.open) d.showModal();
  document.body.classList.add('has-modal');
}
function closeDialog(d) {
  if (d.open) d.close();
}
$$('dialog').forEach((d) => {
  d.addEventListener('close', () => {
    if (!$$('dialog').some((x) => x.open)) document.body.classList.remove('has-modal');
  });
  // click on backdrop closes
  d.addEventListener('mousedown', (e) => {
    if (e.target === d) closeDialog(d);
  });
  d.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) closeDialog(d);
  });
});

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-visible'), 2400);
}

/* ---------------- Swatches ---------------- */
function renderSwatches(container, selectedId, onPick) {
  container.innerHTML = COLORS.map(
    (c) =>
      `<button type="button" class="swatch" style="--c:${c.hex}" data-color="${c.id}" aria-pressed="${c.id === selectedId}" aria-label="${esc(c.name[getLang()])}" title="${esc(c.name[getLang()])}"></button>`,
  ).join('');
  container.onclick = (e) => {
    const b = e.target.closest('[data-color]');
    if (b) onPick(b.dataset.color);
  };
}

/* ---------------- Colour preview ---------------- */
// Shows every lamp in the picked colour; "Original" restores each default.
let paletteColour = null;

function renderPalette() {
  renderSwatches($('#palette'), paletteColour, (id) => {
    paletteColour = id;
    PRODUCTS.forEach((p) => (cardColours[p.id] = id));
    renderPalette();
    renderGrid();
    $$('.card').forEach((el) => el.classList.add('is-in'));
  });
  $('#paletteReset').hidden = !paletteColour;
}

$('#paletteReset').addEventListener('click', () => {
  paletteColour = null;
  PRODUCTS.forEach((p) => (cardColours[p.id] = p.defaultColor));
  renderPalette();
  renderGrid();
  $$('.card').forEach((el) => el.classList.add('is-in'));
});

/* ---------------- Product grid ---------------- */
// Colour shown per product card; filled once the catalogue has loaded.
const cardColours = {};

function renderGrid() {
  const grid = $('#productGrid');
  grid.innerHTML = PRODUCTS.map((p) => {
    const d = dimensions(p, 'M');
    return `
      <article class="card reveal" data-id="${p.id}">
        <button class="card__media" type="button" aria-label="${esc(p.name)} — ${esc(t('card.configure'))}">
          ${visualHtml(p, cardColours[p.id])}
          <span class="card__hover">${esc(t('card.configure'))}</span>
        </button>
        <div class="card__body">
          <h3 class="card__name">${esc(p.name)}</h3>
          <p class="card__price"><small>${esc(t('card.from'))}</small>${money(unitPrice(p, 'S'))}</p>
          <p class="card__meta">${esc(t(`type.${p.type}`))} · ${d.height} × ⌀ ${d.diameter} cm</p>
          <div class="card__foot">
            <div class="swatches"></div>
            <span class="card__colour">${esc(colourName(cardColours[p.id]))}</span>
          </div>
        </div>
      </article>`;
  }).join('');

  $$('.card', grid).forEach((card) => {
    const p = productById(card.dataset.id);
    const swatchBox = $('.swatches', card);
    const pick = (id) => {
      cardColours[p.id] = id;
      $('.visual', card).outerHTML = visualHtml(p, id);
      $('.card__colour', card).textContent = colourName(id);
      renderSwatches(swatchBox, id, pick);
    };
    renderSwatches(swatchBox, cardColours[p.id], pick);
    $('.card__media', card).addEventListener('click', () => openConfigurator(p.id, cardColours[p.id]));
  });
  observeReveal();
}

/* ---------------- Product detail ---------------- */
const cfg = { product: null, colorId: '', size: 'M', qty: 1 };
const cfgDialog = $('#configurator');

function openConfigurator(productId, colorId) {
  cfg.product = productById(productId);
  cfg.colorId = colorId || cfg.product.defaultColor;
  cfg.size = 'M';
  cfg.qty = 1;
  renderConfigurator();
  openDialog(cfgDialog);
}

function renderConfigurator() {
  const p = cfg.product;
  if (!p) return;
  const dims = dimensions(p, cfg.size);
  $('#cfgVisual').innerHTML = visualHtml(p, cfg.colorId);
  $('#cfgType').textContent = t(`type.${p.type}`);
  $('#cfgName').textContent = p.name;
  $('#cfgTagline').textContent = p.tagline[getLang()];
  $('#cfgPrice').textContent = money(unitPrice(p, cfg.size));
  $('#cfgColourName').textContent = colourName(cfg.colorId);
  $('#cfgDims').textContent = `${dims.height} × ⌀ ${dims.diameter} cm`;
  $('#cfgQty').textContent = cfg.qty;
  $('#cfgTotal').textContent = money(unitPrice(p, cfg.size) * cfg.qty);

  renderSwatches($('#cfgSwatches'), cfg.colorId, (id) => {
    cfg.colorId = id;
    renderConfigurator();
  });

  $('#cfgSizes').innerHTML = SIZES.map((s) => {
    const d = dimensions(p, s.id);
    return `<button type="button" data-size="${s.id}" aria-pressed="${s.id === cfg.size}"><b>${s.id}</b><span>${d.height} cm · ${money(unitPrice(p, s.id))}</span></button>`;
  }).join('');

  const specs = [
    ['spec.dims', `${dims.height} × ⌀ ${dims.diameter} cm`],
    ['spec.fitting', t('spec.fitting.v')],
    ['spec.cable', t(p.type === 'table' ? 'spec.cable.table' : 'spec.cable.pendant')],
  ];
  $('#cfgSpecs').innerHTML = specs.map(([k, v]) => `<dt>${esc(t(k))}</dt><dd>${esc(v)}</dd>`).join('');
}

$('#cfgSizes').addEventListener('click', (e) => {
  const b = e.target.closest('[data-size]');
  if (!b) return;
  cfg.size = b.dataset.size;
  renderConfigurator();
});
$('#cfgMinus').addEventListener('click', () => {
  cfg.qty = Math.max(1, cfg.qty - 1);
  renderConfigurator();
});
$('#cfgPlus').addEventListener('click', () => {
  cfg.qty = Math.min(20, cfg.qty + 1);
  renderConfigurator();
});
$('#cfgAdd').addEventListener('click', () => {
  cart.addItem({ productId: cfg.product.id, colorId: cfg.colorId, size: cfg.size, qty: cfg.qty });
  toast(`${cfg.product.name} · ${colourName(cfg.colorId)} — ${t('cfg.added')}`);
  const btn = $('#cartOpen');
  btn.classList.remove('bump');
  void btn.offsetWidth;
  btn.classList.add('bump');
  closeDialog(cfgDialog);
  openCart();
});

/* ---------------- Cart drawer ---------------- */
const cartDialog = $('#cart');
$('#cartOpen').addEventListener('click', openCart);

function openCart() {
  renderCart();
  openDialog(cartDialog);
}

function lineHtml(item) {
  const p = productById(item.productId);
  return `
    <div class="line" data-key="${esc(item.key)}">
      <div class="line__img">${visualHtml(p, item.colorId)}</div>
      <div>
        <p class="line__name">${esc(p.name)}</p>
        <p class="line__meta"><span class="line__dot" style="background:${colorById(item.colorId).hex}"></span>${esc(colourName(item.colorId))} · ${item.size}</p>
        <div class="line__controls">
          <div class="qty"><button type="button" data-act="dec" aria-label="−">−</button><span>${item.qty}</span><button type="button" data-act="inc" aria-label="+">+</button></div>
          <button class="line__remove" type="button" data-act="remove">${esc(t('cart.remove'))}</button>
        </div>
      </div>
      <p class="line__price">${money(cart.lineTotal(item))}</p>
    </div>`;
}

function totalsHtml(sums, country, firstOrder) {
  const shipKey = country === 'NL' ? 'cart.shipping' : 'co.shipping';
  return `
    <dt>${esc(t('cart.subtotal'))}</dt><dd>${money(sums.subtotal)}</dd>
    ${firstOrder ? `<dt class="is-discount">${esc(t('co.discount'))}</dt><dd class="is-discount">−${money(sums.discount)}</dd>` : ''}
    <dt>${esc(t(shipKey))}${country !== 'NL' ? ` (${esc(t(`country.${country}`))})` : ''}</dt>
    <dd class="${sums.shipping === 0 ? 'is-free' : ''}">${sums.shipping === 0 ? esc(t('cart.free')) : money(sums.shipping)}</dd>
    <dt class="total">${esc(t('cart.total'))}</dt><dd class="total">${money(sums.total)}</dd>
    <span class="vat">${esc(t('co.vat'))}</span>`;
}

function renderCart() {
  const items = cart.getItems();
  const body = $('#cartItems');
  const foot = $('#cartFoot');
  if (!items.length) {
    body.innerHTML = `<div class="drawer__empty"><p>${esc(t('cart.empty'))}</p><a class="btn btn--line" href="#collection" data-close>${esc(t('cart.browse'))}</a></div>`;
    foot.innerHTML = '';
    return;
  }
  body.innerHTML = items.map(lineHtml).join('');
  const sums = cart.totals({ country: 'NL', firstOrder: true });
  foot.innerHTML = `
    <dl class="totals">${totalsHtml(sums, 'NL', true)}</dl>
    <p class="drawer__note">${esc(t('cart.discountNote'))}</p>
    <button class="btn btn--dark btn--block" type="button" id="toCheckout">${esc(t('cart.checkout'))}</button>`;
  $('#toCheckout').addEventListener('click', () => {
    closeDialog(cartDialog);
    openCheckout();
  });
}

$('#cartItems').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const key = btn.closest('.line').dataset.key;
  const item = cart.getItems().find((i) => i.key === key);
  if (!item) return;
  if (btn.dataset.act === 'inc') cart.setQty(key, item.qty + 1);
  if (btn.dataset.act === 'dec') cart.setQty(key, item.qty - 1);
  if (btn.dataset.act === 'remove') cart.removeItem(key);
});

function updateCartCount() {
  const n = cart.itemCount();
  const el = $('#cartCount');
  el.textContent = n;
  el.classList.toggle('has-items', n > 0);
}

cart.onCartChange(() => {
  updateCartCount();
  if (cartDialog.open) renderCart();
  if (checkoutDialog.open && !checkoutDialog.classList.contains('is-done')) renderSummary();
});

/* ---------------- Checkout ---------------- */
const checkoutDialog = $('#checkout');
const form = $('#checkoutForm');
const field = (name) => form.elements[name];

function openCheckout() {
  if (!cart.getItems().length) return;
  checkoutDialog.classList.remove('is-done');
  $('#checkoutDone').hidden = true;
  updateCountryMode();
  renderSummary();
  openDialog(checkoutDialog);
  setTimeout(() => field('email').focus(), 50);
}

function renderSummary() {
  const country = field('country').value;
  const email = field('email').value;
  const firstOrder = cart.isFirstOrder(email);
  const sums = cart.totals({ country, firstOrder });
  $('#summaryItems').innerHTML = cart
    .getItems()
    .map((i) => {
      const p = productById(i.productId);
      return `<li>${visualHtml(p, i.colorId)}<span>${esc(p.name)} × ${i.qty}<small>${esc(colourName(i.colorId))} · ${i.size}</small></span><b>${money(cart.lineTotal(i))}</b></li>`;
    })
    .join('');
  $('#summaryTotals').innerHTML = totalsHtml(sums, country, firstOrder);
  const notice = $('#discountNotice');
  notice.hidden = firstOrder;
  notice.textContent = firstOrder ? '' : t('co.discountUsed');
}

function updateCountryMode() {
  const nl = field('country').value === 'NL';
  $('#autofillHint').hidden = !nl;
  field('postcode').placeholder = nl ? '1234 AB' : '';
  if (!nl) setLookup('', '');
}

field('country').addEventListener('change', () => {
  updateCountryMode();
  renderSummary();
  scheduleLookup();
});
field('email').addEventListener('input', () => renderSummary());

// ---- Postcode lookup ----
let lookupTimer;
let lookupCtrl;
function setLookup(state, text) {
  const el = $('#lookupStatus');
  el.dataset.state = state;
  el.textContent = text;
}

function scheduleLookup() {
  clearTimeout(lookupTimer);
  lookupTimer = setTimeout(runLookup, 350);
}

async function runLookup() {
  if (field('country').value !== 'NL') return;
  const pc = field('postcode').value.trim();
  const nr = field('houseNumber').value.trim();
  if (!NL_POSTCODE.test(pc) || !/^\d+/.test(nr)) {
    setLookup('', '');
    return;
  }
  lookupCtrl?.abort();
  lookupCtrl = new AbortController();
  setLookup('loading', t('co.lookup.loading'));
  try {
    const res = await lookupAddress(pc, nr, field('addition').value, lookupCtrl.signal);
    if (!res) {
      setLookup('notfound', t('co.lookup.notfound'));
      return;
    }
    field('postcode').value = res.postcode;
    for (const [name, value] of [['street', res.street], ['city', res.city]]) {
      const input = field(name);
      input.value = value;
      input.classList.add('is-autofilled');
      clearError(input);
    }
    $('#additionList').innerHTML = res.additions.map((a) => `<option value="${esc(a)}">`).join('');
    setLookup('found', `${t('co.lookup.found')}: ${res.street} ${nr}${field('addition').value ? ` ${field('addition').value}` : ''}, ${res.postcode} ${res.city}`);
  } catch (err) {
    if (err.name === 'AbortError') return;
    setLookup('error', t('co.lookup.error'));
  }
}

['postcode', 'houseNumber', 'addition'].forEach((n) => field(n).addEventListener('input', scheduleLookup));
field('postcode').addEventListener('blur', () => {
  if (field('country').value === 'NL' && NL_POSTCODE.test(field('postcode').value.trim())) {
    field('postcode').value = formatPostcode(field('postcode').value);
  }
});
['street', 'city'].forEach((n) => field(n).addEventListener('input', () => field(n).classList.remove('is-autofilled')));

// ---- Validation ----
function showError(input, msg) {
  const wrap = input.closest('.field');
  wrap.classList.add('has-error');
  $('.field__error', wrap).textContent = msg;
}
function clearError(input) {
  const wrap = input.closest('.field');
  wrap?.classList.remove('has-error');
  const err = wrap && $('.field__error', wrap);
  if (err) err.textContent = '';
}
$$('input', form).forEach((i) => i.addEventListener('input', () => clearError(i)));

function validate() {
  let first = null;
  const fail = (input, msg) => {
    showError(input, msg);
    first ??= input;
  };
  for (const name of ['email', 'firstName', 'lastName', 'postcode', 'houseNumber', 'street', 'city']) {
    const input = field(name);
    clearError(input);
    if (!input.value.trim()) fail(input, t('co.required'));
  }
  const email = field('email');
  if (email.value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.value.trim())) fail(email, t('co.invalidEmail'));
  const pc = field('postcode');
  if (field('country').value === 'NL' && pc.value.trim() && !NL_POSTCODE.test(pc.value.trim())) fail(pc, t('co.invalidPostcode'));
  first?.focus();
  return !first;
}

let placing = false;
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (placing || !validate()) return;
  const v = (n) => field(n).value.trim();
  const button = $('#placeOrder');
  placing = true;
  button.disabled = true;
  let order;
  try {
    order = await cart.placeOrder({
    customer: { email: v('email'), firstName: v('firstName'), lastName: v('lastName'), phone: v('phone') },
    address: {
      country: v('country'),
      postcode: v('country') === 'NL' ? formatPostcode(v('postcode')) : v('postcode'),
      houseNumber: v('houseNumber'),
      addition: v('addition'),
      street: v('street'),
      city: v('city'),
    },
    });
  } catch (err) {
    console.error(err);
    toast(t('co.error'));
    return;
  } finally {
    placing = false;
    button.disabled = false;
  }
  $('#doneText').innerHTML = t('co.done.text', { id: esc(order.id), email: esc(order.email) });
  $('#doneSaved').textContent = order.discount > 0 ? t('co.done.saved', { amount: money(order.discount) }) : '';
  checkoutDialog.classList.add('is-done');
  $('#checkoutDone').hidden = false;
  form.reset();
  $$('.is-autofilled', form).forEach((i) => i.classList.remove('is-autofilled'));
  setLookup('', '');
});

/* ---------------- Language ---------------- */
function syncLangButtons() {
  $$('[data-lang]').forEach((b) => b.classList.toggle('is-active', b.dataset.lang === getLang()));
}
$$('[data-lang]').forEach((b) => b.addEventListener('click', () => setLang(b.dataset.lang)));
onLangChange(() => {
  syncLangButtons();
  applyTheme(document.documentElement.dataset.theme);
  renderPalette();
  renderGrid();
  $$('.reveal').forEach((el) => el.classList.add('is-in'));
  if (cfgDialog.open) renderConfigurator();
  if (cartDialog.open) renderCart();
  if (checkoutDialog.open) renderSummary();
});

/* ---------------- Contact form ---------------- */
const askForm = $('#askForm');
const askField = (n) => askForm.elements[n];
const askStatus = (key, error = false) => {
  const el = $('#askStatus');
  el.textContent = key ? t(key) : '';
  el.classList.toggle('is-error', error);
};
$$('input, textarea', askForm).forEach((i) => i.addEventListener('input', () => clearError(i)));

let asking = false;
askForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (asking) return;
  const v = (n) => askField(n).value.trim();
  let first = null;
  const check = (name, ok, key) => {
    clearError(askField(name));
    if (ok) return;
    showError(askField(name), t(key));
    first ??= askField(name);
  };
  check('name', v('name'), 'ask.err.name');
  check('email', /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v('email')), 'ask.err.email');
  check('message', v('message').length >= 5, 'ask.err.message');
  if (first) return first.focus();

  const button = $('button[type=submit]', askForm);
  asking = true;
  button.disabled = true;
  button.textContent = t('ask.sending');
  askStatus('');
  try {
    const res = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: v('name'), email: v('email'), message: v('message'), website: askField('website').value, lang: getLang() }),
    });
    if (res.status === 429) return askStatus('ask.tooMany', true);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    askForm.reset();
    askStatus('ask.sent');
  } catch {
    askStatus('ask.error', true);
  } finally {
    asking = false;
    button.disabled = false;
    button.textContent = t('ask.send');
  }
});

/* ---------------- Misc ---------------- */
// In-page links scroll smoothly without leaving #top / #faq in the address bar.
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const id = a.getAttribute('href').slice(1);
  const target = id === 'top' ? null : document.getElementById(id);
  if (id !== 'top' && !target) return;
  e.preventDefault();
  if (target) target.scrollIntoView({ behavior: 'smooth' });
  else window.scrollTo({ top: 0, behavior: 'smooth' });
});
let revealObserver;
function observeReveal() {
  revealObserver ??= new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('is-in');
          revealObserver.unobserve(e.target);
        }
      }),
    { rootMargin: '0px 0px -8% 0px' },
  );
  $$('.reveal:not(.is-in)').forEach((el) => revealObserver.observe(el));
}

window.addEventListener('scroll', () => $('#nav').classList.toggle('is-scrolled', window.scrollY > 10), { passive: true });
$('#year').textContent = new Date().getFullYear();

/* ---------------- Day / night ---------------- */
const nightByClock = () => {
  const h = new Date().getHours();
  return h >= 19 || h < 7;
};

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const night = theme === 'night';
  $('#themeLabel').textContent = t(night ? 'theme.night' : 'theme.day');
  $('#themeToggle').setAttribute('aria-pressed', String(night));
  $('meta[name=theme-color]').setAttribute('content', night ? '#11100d' : '#f3f0ea');
}

$('#themeToggle').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'night' ? 'day' : 'night';
  try {
    sessionStorage.setItem('lumi.theme', next);
  } catch {}
  applyTheme(next);
});

// Follow the clock while the page stays open, unless switched manually.
setInterval(() => {
  let manual = null;
  try {
    manual = sessionStorage.getItem('lumi.theme');
  } catch {}
  if (!manual) applyTheme(nightByClock() ? 'night' : 'day');
}, 60 * 1000);

/* ---------------- Cookie consent & welcome offer ---------------- */
const store = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {}
  },
};

// Consent choice ('all' or 'necessary'). The shop itself only uses functional
// storage; anything optional added later (analytics…) must check for 'all'.
const consent = () => store.get('lumi.consent');

function maybeShowWelcome() {
  if (store.get('lumi.welcome') || store.get('lumi.orders')) return;
  setTimeout(() => {
    if ($$('dialog').some((d) => d.open)) return;
    openDialog($('#welcome'));
  }, 2500);
}

$('#welcome').addEventListener('close', () => store.set('lumi.welcome', 'seen'));

if (!consent()) $('#cookie').hidden = false;
else maybeShowWelcome();

$('#cookie').addEventListener('click', (e) => {
  const b = e.target.closest('[data-consent]');
  if (!b) return;
  store.set('lumi.consent', b.dataset.consent);
  $('#cookie').hidden = true;
  maybeShowWelcome();
});

/* ---------------- Boot ---------------- */
applyTranslations();
applyTheme(document.documentElement.dataset.theme || 'day');
syncLangButtons();
try {
  await loadCatalog();
  cart.initCart();
} catch (err) {
  console.error(err);
  toast(t('catalog.error'));
}
PRODUCTS.forEach((p) => (cardColours[p.id] = p.defaultColor));
initCursorLight();
updateCartCount();
renderPalette();
renderGrid();

// Arriving with a hash (e.g. /#collection from the 404 page): scroll there once
// the grid is rendered, then drop the hash from the address bar.
if (location.hash) {
  let target = null;
  try {
    target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
  } catch {}
  history.replaceState(null, '', location.pathname + location.search);
  if (target) requestAnimationFrame(() => target.scrollIntoView());
}
