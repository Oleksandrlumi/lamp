// Interactive "lamp light" that follows the pointer.
// - A soft warm glow trails the cursor (stronger in night mode, where it acts
//   like carrying a small lamp through the dark page).
// - It grows over links, buttons and lamps, and flickers on click.
// - Light falls on the product images from where the cursor is.
// Only for mouse/trackpad users; off for touch screens and reduced motion.

export function initCursorLight() {
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  if (!fine.matches || reduced.matches) return;

  const glow = document.createElement('div');
  glow.className = 'cursor-light';
  glow.setAttribute('aria-hidden', 'true');
  document.body.append(glow);

  let x = innerWidth / 2;
  let y = innerHeight / 2;
  let gx = x;
  let gy = y;
  let raf = 0;

  const tick = () => {
    // ease towards the pointer so the light trails softly behind it
    gx += (x - gx) * 0.16;
    gy += (y - gy) * 0.16;
    glow.style.transform = `translate3d(${gx}px, ${gy}px, 0)`;
    raf = Math.abs(x - gx) + Math.abs(y - gy) > 0.3 ? requestAnimationFrame(tick) : 0;
  };

  const HOT = 'a, button, [role="button"], input, select, textarea, label, .card__media, .swatch';

  addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
      x = e.clientX;
      y = e.clientY;
      glow.classList.add('is-on');
      glow.classList.toggle('is-hot', Boolean(e.target.closest?.(HOT)));
      if (!raf) raf = requestAnimationFrame(tick);

      // light falling on a product image from the cursor position
      const media = e.target.closest?.('.card__media, .configurator__visual');
      if (media) {
        const r = media.getBoundingClientRect();
        media.style.setProperty('--lx', `${((x - r.left) / r.width) * 100}%`);
        media.style.setProperty('--ly', `${((y - r.top) / r.height) * 100}%`);
      }
    },
    { passive: true },
  );

  document.addEventListener('pointerleave', () => glow.classList.remove('is-on'));
  addEventListener('blur', () => glow.classList.remove('is-on'));
  addEventListener('pointerdown', () => {
    glow.classList.remove('is-flicker');
    void glow.offsetWidth;
    glow.classList.add('is-flicker');
  });
}
