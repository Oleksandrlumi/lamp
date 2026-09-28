// Error pages (404/500): language, light switch and retry.
(function () {
  var lang = 'nl';
  try {
    var saved = localStorage.getItem('lumi.lang');
    if (saved === 'en' || saved === 'nl') lang = saved;
    else if (!/^nl\b/i.test(navigator.language || '')) lang = 'en';
  } catch (e) {}
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-nl]').forEach(function (el) {
    el.textContent = el.getAttribute('data-' + lang);
  });

  // 404: click the lamp to switch the light on (and off again)
  var lamp = document.getElementById('lampSwitch');
  if (lamp) {
    var label = lamp.querySelector('.err__switch');
    var texts = {
      nl: ['Doe het licht aan', 'Doe het licht uit'],
      en: ['Switch the light on', 'Switch the light off'],
    };
    lamp.addEventListener('click', function () {
      var on = document.body.classList.toggle('is-lit');
      lamp.setAttribute('aria-pressed', String(on));
      label.textContent = texts[lang][on ? 1 : 0];
    });
  }

  var retry = document.getElementById('retry');
  if (retry) retry.addEventListener('click', function () { location.reload(); });
})();
