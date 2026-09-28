// LUMI admin panel.
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const money = (n) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n);
const TYPES = { table: 'Настільна', pendant: 'Підвісна' };

let csrf = '';
let catalog = null;
let twoFactor = false;

/* ---------------- API ---------------- */
class AuthError extends Error {}

async function api(path, { method = 'GET', body, raw } = {}) {
  const headers = { Accept: 'application/json' };
  if (method !== 'GET') headers['X-CSRF-Token'] = csrf;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (raw) headers['Content-Type'] = raw.type;
  const res = await fetch(`/api/admin${path}`, {
    method,
    headers,
    credentials: 'same-origin',
    body: raw || (body !== undefined ? JSON.stringify(body) : undefined),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/login') {
    showLogin();
    throw new AuthError(data.error || 'Потрібно увійти');
  }
  if (!res.ok) throw new Error(data.error || `Помилка ${res.status}`);
  return data;
}

let toastTimer;
function toast(msg, error = false) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.toggle('is-error', error);
  el.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-visible'), 2800);
}
const fail = (err) => {
  if (!(err instanceof AuthError)) toast(err.message, true);
};

/* ---------------- Login ---------------- */
async function loadLoginOptions() {
  try {
    const res = await fetch('/api/admin/login-options', { credentials: 'same-origin' });
    twoFactor = (await res.json()).totp === true;
  } catch {}
  $('#loginCodeField').hidden = !twoFactor;
  $('#loginCodeField input').required = twoFactor;
}

function showLogin() {
  csrf = '';
  loadLoginOptions();
  $('#appView').hidden = true;
  $('#loginView').hidden = false;
  $('#editor').open && $('#editor').close();
  setTimeout(() => $('#loginForm [name=username]').focus(), 30);
}

async function showApp() {
  $('#loginView').hidden = true;
  $('#appView').hidden = false;
  await loadCatalog();
  api('/messages').then(updateMessageCount).catch(() => {});
}

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const button = $('button[type=submit]', form);
  $('#loginError').textContent = '';
  button.disabled = true;
  try {
    const data = await api('/login', {
      method: 'POST',
      body: { username: form.username.value, password: form.password.value, code: form.code.value },
    });
    csrf = data.csrf;
    form.reset();
    await showApp();
  } catch (err) {
    $('#loginError').textContent = err.message;
  } finally {
    button.disabled = false;
  }
});

$('#logout').addEventListener('click', async () => {
  await api('/logout', { method: 'POST' }).catch(() => {});
  showLogin();
});

/* ---------------- Tabs ---------------- */
$$('[data-tab]').forEach((b) =>
  b.addEventListener('click', () => {
    $$('[data-tab]').forEach((x) => x.classList.toggle('is-active', x === b));
    $$('[data-panel]').forEach((p) => (p.hidden = p.dataset.panel !== b.dataset.tab));
    if (b.dataset.tab === 'orders') loadOrders().catch(fail);
    if (b.dataset.tab === 'messages') loadMessages().catch(fail);
    if (b.dataset.tab === 'settings') renderSettings();
    if (b.dataset.tab === 'security' || b.dataset.tab === 'backup') loadTwoFactor().catch(fail);
  }),
);

/* ---------------- Products ---------------- */
const colorHex = (id) => catalog.colors.find((c) => c.id === id)?.hex || '#ccc';

async function loadCatalog() {
  catalog = await api('/catalog');
  renderProducts();
}

function renderProducts() {
  const rows = catalog.products
    .map((p, i) => {
      const first = (p.gallery?.[p.defaultColor] || p.gallery?.default || [])[0] || {};
      const photo = first.day || first.night || '';
      const style = `--c:${colorHex(p.defaultColor)}${photo ? `;background-image:url('${photo}')` : ''}`;
      return `<tr data-id="${esc(p.id)}">
        <td><div class="thumb" style="${esc(style)}"></div></td>
        <td><div class="name">${esc(p.name)}</div><div class="muted">${esc(TYPES[p.type])} · ${p.heightCm} × ⌀ ${p.diameterCm} см</div><div class="dots">${(p.colors || []).map((c) => `<i style="--c:${esc(colorHex(c))}"></i>`).join('')}</div></td>
        <td><form class="price-edit" data-act="price"><input name="price" value="${esc(p.price)}" inputmode="decimal" aria-label="Ціна"><button class="btn btn--line btn--sm" type="submit">Зберегти</button></form></td>
        <td>${p.visible ? '<span class="badge badge--ok">у магазині</span>' : '<span class="badge badge--off">приховано</span>'}</td>
        <td><div class="row-actions">
          <button class="link-btn" type="button" data-act="up" ${i === 0 ? 'disabled' : ''} aria-label="Вище">↑</button>
          <button class="link-btn" type="button" data-act="down" ${i === catalog.products.length - 1 ? 'disabled' : ''} aria-label="Нижче">↓</button>
          <button class="btn btn--line btn--sm" type="button" data-act="edit">Редагувати</button>
          <button class="btn btn--danger btn--sm" type="button" data-act="delete">Видалити</button>
        </div></td>
      </tr>`;
    })
    .join('');
  $('#productTable').innerHTML = `<thead><tr><th></th><th>Товар</th><th>Ціна (M), €</th><th>Статус</th><th></th></tr></thead><tbody>${rows}</tbody>`;
}

const productPayload = (p, patch = {}) => ({ ...p, ...patch });

$('#productTable').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = e.target.closest('tr').dataset.id;
  const p = catalog.products.find((x) => x.id === id);
  try {
    await api(`/products/${encodeURIComponent(id)}`, { method: 'PUT', body: productPayload(p, { price: e.target.price.value }) });
    await loadCatalog();
    toast(`Ціну ${p.name} збережено`);
  } catch (err) {
    fail(err);
  }
});

$('#productTable').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const id = btn.closest('tr').dataset.id;
  const p = catalog.products.find((x) => x.id === id);
  try {
    if (btn.dataset.act === 'edit') return openEditor(p);
    if (btn.dataset.act === 'up' || btn.dataset.act === 'down') {
      await api(`/products/${encodeURIComponent(id)}/move`, { method: 'POST', body: { dir: btn.dataset.act } });
      await loadCatalog();
    }
    if (btn.dataset.act === 'delete') {
      if (!confirm(`Видалити «${p.name}»? Резервна копія каталогу зберігається на сервері.`)) return;
      await api(`/products/${encodeURIComponent(id)}`, { method: 'DELETE' });
      await loadCatalog();
      toast('Товар видалено');
    }
  } catch (err) {
    fail(err);
  }
});

/* ---------------- Product editor ---------------- */
const editor = $('#editor');
const pform = $('#productForm');
const MAX_FRAMES = 12;
let editing = null; // product id, or null for a new product
let colours = []; // colour ids this lamp is sold in
let gallery = {}; // { default | colourId: [{ day, night }] }

editor.addEventListener('click', (e) => {
  if (e.target.closest('[data-close]')) editor.close();
});

$('#addProduct').addEventListener('click', () =>
  openEditor({
    name: '',
    type: 'table',
    price: '',
    heightCm: '',
    diameterCm: '',
    colors: catalog.colors.map((c) => c.id),
    defaultColor: catalog.colors[0].id,
    tagline: { nl: '', en: '' },
    gallery: {},
    visible: true,
  }),
);

function openEditor(p) {
  editing = p.id || null;
  colours = [...(p.colors || catalog.colors.map((c) => c.id))];
  gallery = Object.fromEntries(Object.entries(p.gallery || {}).map(([k, v]) => [k, v.map((f) => ({ ...f }))]));
  $('#editorTitle').textContent = editing ? p.name : 'Новий товар';
  $('#productError').textContent = '';
  const f = pform.elements;
  f.name.value = p.name;
  f.type.value = p.type;
  f.price.value = p.price;
  f.heightCm.value = p.heightCm;
  f.diameterCm.value = p.diameterCm;
  f.visible.checked = p.visible !== false;
  for (const l of ['nl', 'en']) f[`tagline_${l}`].value = p.tagline?.[l] || '';
  renderColours(p.defaultColor);
  renderPhotos();
  editor.showModal();
}

// Colour checkboxes + default colour (only among the offered colours).
function renderColours(defaultColor = pform.elements.defaultColor.value) {
  $('#colourPicks').innerHTML = catalog.colors
    .map(
      (c) => `<label class="colour-pick"><input type="checkbox" value="${esc(c.id)}" ${colours.includes(c.id) ? 'checked' : ''}>
        <i style="--c:${esc(c.hex)}"></i><span>${esc(c.name.uk)}</span></label>`,
    )
    .join('');
  const offered = catalog.colors.filter((c) => colours.includes(c.id));
  $('#defaultColor').innerHTML = offered.map((c) => `<option value="${esc(c.id)}">${esc(c.name.uk)}</option>`).join('');
  pform.elements.defaultColor.value = colours.includes(defaultColor) ? defaultColor : offered[0].id;
}

$('#colourPicks').addEventListener('change', (e) => {
  const box = e.target.closest('input[type=checkbox]');
  if (!box) return;
  const next = catalog.colors.map((c) => c.id).filter((id) => (id === box.value ? box.checked : colours.includes(id)));
  if (!next.length) {
    box.checked = true;
    return toast('Потрібен хоча б один колір', true);
  }
  if (!box.checked && gallery[box.value]?.length && !confirm('Для цього кольору є фото. Прибрати колір разом з його фото (після збереження)?')) {
    box.checked = true;
    return;
  }
  colours = next;
  if (!box.checked) delete gallery[box.value];
  renderColours();
  renderPhotos();
});

function photoTile(url, mode, hex) {
  const style = `--c:${hex}${url ? `;background-image:url('${url}')` : ''}`;
  return `<div class="photo__mode" data-mode="${mode}">
      <div class="photo__img${url ? '' : ' is-empty'}${mode === 'night' ? ' is-night' : ''}" style="${esc(style)}"></div>
      <div class="photo__actions">
        <span class="photo__label">${mode === 'night' ? 'Ніч' : 'День'}</span>
        <label class="link-btn">${url ? 'Замінити' : 'Завантажити'}<input type="file" accept="image/jpeg,image/png,image/webp"></label>
        ${url ? '<button class="link-btn" type="button" data-remove>Прибрати</button>' : ''}
      </div>
    </div>`;
}

function renderPhotos() {
  const slots = [
    { id: 'default', name: 'Для всіх кольорів', hex: '#ddd' },
    ...catalog.colors.filter((c) => colours.includes(c.id)).map((c) => ({ id: c.id, name: c.name.uk, hex: c.hex })),
  ];
  $('#photoGrid').innerHTML = slots
    .map((s) => {
      const frames = gallery[s.id] || [];
      return `<section class="slot" data-slot="${esc(s.id)}">
        <div class="slot__head"><strong>${esc(s.name)}</strong><span class="muted">${frames.length ? `${frames.length} фото` : 'немає фото'}</span></div>
        <div class="frames">
          ${frames
            .map(
              (f, i) => `<div class="frame" data-i="${i}">
                <div class="photo__pair">${photoTile(f.day, 'day', s.hex)}${photoTile(f.night, 'night', s.hex)}</div>
                <div class="frame__foot">
                  <span class="frame__no">${i === 0 ? '№1 · головне' : `№${i + 1}`}</span>
                  <button class="link-btn" type="button" data-move="-1" ${i === 0 ? 'disabled' : ''} aria-label="Раніше">←</button>
                  <button class="link-btn" type="button" data-move="1" ${i === frames.length - 1 ? 'disabled' : ''} aria-label="Пізніше">→</button>
                  <button class="link-btn" type="button" data-remove-frame>Видалити</button>
                </div>
              </div>`,
            )
            .join('')}
          ${frames.length < MAX_FRAMES ? `<label class="frame frame--add"><span>+ Додати фото</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple></label>` : ''}
        </div>
      </section>`;
    })
    .join('');
}

async function upload(file) {
  if (file.size > 8 * 1024 * 1024) throw new Error(`${file.name}: файл завеликий (макс. 8 МБ)`);
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error(`${file.name}: лише JPG, PNG або WebP`);
  return (await api('/uploads', { method: 'POST', raw: file })).url;
}

$('#photoGrid').addEventListener('change', async (e) => {
  const input = e.target.closest('input[type=file]');
  const files = [...(input?.files || [])];
  if (!files.length) return;
  const slot = input.closest('[data-slot]').dataset.slot;
  const frame = input.closest('[data-i]');
  const list = (gallery[slot] ||= []);
  try {
    if (frame) {
      // replace the day or night photo of one frame
      toast('Завантаження…');
      list[Number(frame.dataset.i)][input.closest('[data-mode]').dataset.mode] = await upload(files[0]);
    } else {
      // add new frames (day photos), several files at once
      const room = MAX_FRAMES - list.length;
      if (files.length > room) toast(`Можна додати ще ${room} фото`, true);
      for (const [n, file] of files.slice(0, room).entries()) {
        toast(`Завантаження ${n + 1} з ${Math.min(files.length, room)}…`);
        list.push({ day: await upload(file), night: '' });
        renderPhotos();
      }
    }
    renderPhotos();
    toast('Фото завантажено — не забудьте зберегти товар');
  } catch (err) {
    renderPhotos();
    fail(err);
  }
});

$('#photoGrid').addEventListener('click', (e) => {
  const frameEl = e.target.closest('[data-i]');
  if (!frameEl) return;
  const slot = e.target.closest('[data-slot]').dataset.slot;
  const list = gallery[slot];
  const i = Number(frameEl.dataset.i);
  if (e.target.closest('[data-remove]')) {
    list[i][e.target.closest('[data-mode]').dataset.mode] = '';
    if (!list[i].day && !list[i].night) list.splice(i, 1);
  } else if (e.target.closest('[data-remove-frame]')) {
    list.splice(i, 1);
  } else if (e.target.closest('[data-move]')) {
    const j = i + Number(e.target.closest('[data-move]').dataset.move);
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
  } else return;
  if (!list.length) delete gallery[slot];
  renderPhotos();
});

pform.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = pform.elements;
  const body = {
    name: f.name.value,
    type: f.type.value,
    price: f.price.value,
    heightCm: f.heightCm.value,
    diameterCm: f.diameterCm.value,
    colors: colours,
    defaultColor: f.defaultColor.value,
    visible: f.visible.checked,
    tagline: { nl: f.tagline_nl.value, en: f.tagline_en.value },
    gallery,
  };
  const button = $('button[type=submit]', pform);
  button.disabled = true;
  try {
    if (editing) await api(`/products/${encodeURIComponent(editing)}`, { method: 'PUT', body });
    else await api('/products', { method: 'POST', body });
    editor.close();
    await loadCatalog();
    toast('Збережено');
  } catch (err) {
    if (!(err instanceof AuthError)) $('#productError').textContent = err.message;
  } finally {
    button.disabled = false;
  }
});

/* ---------------- Settings ---------------- */
const COUNTRIES = { NL: 'Нідерланди', BE: 'Бельгія', DE: 'Німеччина', LU: 'Люксембург', FR: 'Франція', AT: 'Австрія' };

function renderSettings() {
  $('#sizeFields').innerHTML = catalog.sizes
    .map((s) => `<label class="field"><span>Розмір ${esc(s.id)}</span><input name="size_${esc(s.id)}" value="${esc(s.priceDelta)}" inputmode="decimal"></label>`)
    .join('');
  $('#shippingFields').innerHTML = Object.entries(catalog.shipping)
    .map(
      ([c, v]) =>
        `<label class="field"><span>${esc(COUNTRIES[c] || c)}</span><input name="ship_${esc(c)}" value="${esc(v)}" inputmode="decimal" ${c === 'NL' ? 'disabled' : ''}></label>`,
    )
    .join('');
}

$('#settingsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.currentTarget.elements;
  const body = {
    sizes: Object.fromEntries(catalog.sizes.map((s) => [s.id, f[`size_${s.id}`].value])),
    shipping: Object.fromEntries(Object.keys(catalog.shipping).map((c) => [c, f[`ship_${c}`].value])),
  };
  try {
    await api('/settings', { method: 'PUT', body });
    await loadCatalog();
    renderSettings();
    toast('Збережено');
  } catch (err) {
    fail(err);
  }
});

/* ---------------- Orders ---------------- */
async function loadOrders() {
  const orders = await api('/orders');
  const rows = orders
    .map((o) => {
      const items = o.items.map((i) => `${esc(i.name)} · ${esc(i.colorName)} · ${esc(i.size)} × ${i.qty}`).join('<br>');
      const a = o.address;
      return `<tr>
        <td><strong>${esc(o.id)}</strong><div class="muted">${esc(new Date(o.createdAt).toLocaleString('uk-UA'))}</div></td>
        <td>${esc(o.customer.firstName)} ${esc(o.customer.lastName)}<div class="muted">${esc(o.customer.email)}${o.customer.phone ? ` · ${esc(o.customer.phone)}` : ''}</div></td>
        <td>${esc(a.street)} ${esc(a.houseNumber)}${a.addition ? ` ${esc(a.addition)}` : ''}<div class="muted">${esc(a.postcode)} ${esc(a.city)}, ${esc(a.country)}</div></td>
        <td>${items}</td>
        <td><strong>${money(o.total)}</strong>${o.discount ? `<div class="muted">−10%: ${money(o.discount)}</div>` : ''}</td>
      </tr>`;
    })
    .join('');
  $('#orderTable').innerHTML = orders.length
    ? `<thead><tr><th>Замовлення</th><th>Клієнт</th><th>Адреса</th><th>Товари</th><th>Сума</th></tr></thead><tbody>${rows}</tbody>`
    : '<tbody><tr><td>Замовлень поки немає.</td></tr></tbody>';
}

/* ---------------- Questions ---------------- */
function updateMessageCount(messages) {
  const open = messages.filter((m) => !m.done).length;
  $('#messageCount').textContent = open;
  $('#messageCount').hidden = !open;
}

async function loadMessages() {
  const messages = await api('/messages');
  updateMessageCount(messages);
  $('#messageList').innerHTML = messages.length
    ? messages
        .map((m) => {
          const reply = `mailto:${encodeURIComponent(m.email)}?subject=${encodeURIComponent(m.lang === 'en' ? 'Your question to LUMI' : 'Je vraag aan LUMI')}`;
          return `<article class="message${m.done ? ' is-done' : ''}" data-id="${esc(m.id)}">
            <header class="message__head">
              <div><strong>${esc(m.name)}</strong> <span class="muted">${esc(m.email)} · ${esc((m.lang || 'nl').toUpperCase())}</span></div>
              <span class="muted">${esc(new Date(m.createdAt).toLocaleString('uk-UA'))}</span>
            </header>
            <p class="message__text">${esc(m.message)}</p>
            <div class="message__actions">
              <a class="btn btn--sm btn--dark" href="${esc(reply)}">Відповісти</a>
              <button class="btn btn--sm btn--line" type="button" data-done="${m.done ? 'false' : 'true'}">${m.done ? 'Повернути в нові' : 'Позначити як відповіли'}</button>
              <button class="btn btn--sm btn--danger" type="button" data-delete>Видалити</button>
              ${m.done ? '<span class="badge badge--ok">Відповіли</span>' : '<span class="badge">Нове</span>'}
            </div>
          </article>`;
        })
        .join('')
    : '<p class="muted">Питань поки немає.</p>';
}

$('#messageList').addEventListener('click', async (e) => {
  const item = e.target.closest('.message');
  if (!item) return;
  const id = item.dataset.id;
  const doneBtn = e.target.closest('[data-done]');
  try {
    if (doneBtn) {
      await api(`/messages/${id}`, { method: 'PUT', body: { done: doneBtn.dataset.done === 'true' } });
      await loadMessages();
    } else if (e.target.closest('[data-delete]')) {
      if (!confirm('Видалити це питання назавжди?')) return;
      await api(`/messages/${id}`, { method: 'DELETE' });
      await loadMessages();
      toast('Видалено');
    }
  } catch (err) {
    fail(err);
  }
});

/* ---------------- Backup ---------------- */
$('#backupForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const button = $('button[type=submit]', form);
  $('#backupError').textContent = '';
  button.disabled = true;
  button.textContent = 'Готуємо архів…';
  try {
    const res = await fetch('/api/admin/backup', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: JSON.stringify({ password: form.password.value, code: form.code.value }),
    });
    if (res.status === 401) return showLogin();
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Помилка ${res.status}`);
    }
    const blob = await res.blob();
    const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') || '')?.[1] || 'lumi-backup.zip';
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    toast('Резервну копію завантажено');
  } catch (err) {
    $('#backupError').textContent = err.message;
  } finally {
    form.reset();
    button.disabled = false;
    button.textContent = 'Завантажити резервну копію';
  }
});

/* ---------------- Two-factor login ---------------- */
async function loadTwoFactor() {
  twoFactor = (await api('/2fa')).enabled;
  $('#tfaStatus').innerHTML = twoFactor
    ? '<span class="badge badge--ok">Увімкнено</span> Для входу потрібен код із телефона.'
    : '<span class="badge badge--off">Вимкнено</span> Рекомендуємо увімкнути.';
  $('#tfaStart').hidden = twoFactor;
  $('#tfaDisable').hidden = !twoFactor;
  $('#tfaConfirm').hidden = true;
  $('#tfaError').textContent = '';
  $$('[data-needs-2fa]').forEach((el) => {
    el.hidden = !twoFactor;
    $('input', el).required = twoFactor;
  });
}

$('#tfaStart').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  $('#tfaError').textContent = '';
  try {
    const { secret } = await api('/2fa/setup', { method: 'POST', body: { password: form.password.value } });
    form.reset();
    $('#tfaSecret').textContent = secret.match(/.{1,4}/g).join(' ');
    $('#tfaSecret').dataset.raw = secret;
    $('#tfaStart').hidden = true;
    $('#tfaConfirm').hidden = false;
  } catch (err) {
    if (!(err instanceof AuthError)) $('#tfaError').textContent = err.message;
  }
});

$('#tfaCopy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('#tfaSecret').dataset.raw);
    toast('Ключ скопійовано');
  } catch {
    toast('Не вдалося скопіювати — перепишіть ключ вручну', true);
  }
});

$('#tfaConfirm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  $('#tfaError').textContent = '';
  try {
    await api('/2fa/enable', { method: 'POST', body: { code: form.code.value } });
    form.reset();
    $('#tfaSecret').textContent = '';
    delete $('#tfaSecret').dataset.raw;
    await loadTwoFactor();
    toast('Двофакторний вхід увімкнено');
  } catch (err) {
    if (!(err instanceof AuthError)) $('#tfaError').textContent = err.message;
  }
});

$('#tfaDisable').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  $('#tfaError').textContent = '';
  if (!confirm('Вимкнути двофакторний вхід? Тоді для входу знову буде достатньо лише пароля.')) return;
  try {
    await api('/2fa/disable', { method: 'POST', body: { password: form.password.value, code: form.code.value } });
    form.reset();
    await loadTwoFactor();
    toast('Двофакторний вхід вимкнено');
  } catch (err) {
    if (!(err instanceof AuthError)) $('#tfaError').textContent = err.message;
  }
});

/* ---------------- Boot ---------------- */
try {
  const s = await api('/session');
  csrf = s.csrf;
  await showApp();
} catch (err) {
  if (!(err instanceof AuthError)) showLogin();
}
