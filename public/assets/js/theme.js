// Sets day/night theme before the page renders (avoids a flash).
// Night between 19:00 and 07:00 unless the visitor switched manually.
(function () {
  var t;
  try {
    t = sessionStorage.getItem('lumi.theme');
  } catch (e) {}
  if (t !== 'day' && t !== 'night') {
    var h = new Date().getHours();
    t = h >= 19 || h < 7 ? 'night' : 'day';
  }
  document.documentElement.dataset.theme = t;
})();
