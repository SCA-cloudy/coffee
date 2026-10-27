/* 3장 로스팅 페이지 공통 틀 */
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/*
 * 문제 페이지 틀: 위쪽 안내 띠(단계, 상황, 목표) + 아래 로스팅 공장 화면(body)
 */
function page(p, body, headExtra) {
  const banner = '<header class="banner">' +
    '<p class="eyebrow">3장 · ' + esc(p.step) + ' · ' + esc(p.feature) + '</p>' +
    '<p class="scene">' + esc(p.scene) + '</p>' +
    '<p class="goal"><b>목표</b> ' + esc(p.goal) + '</p>' +
    '</header>';
  return '<!doctype html><html lang="ko"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>' + esc(p.feature) + ' · 로스팅 공장</title>' +
    '<link rel="stylesheet" href="/ch3/static/roast.css">' +
    (headExtra || '') +
    '</head><body>' + banner + '<main>' + body + '</main></body></html>';
}

function flagBox(flag) {
  return '<div class="flag">FLAG: ' + esc(flag) + '</div>';
}

module.exports = { esc, page, flagBox };
