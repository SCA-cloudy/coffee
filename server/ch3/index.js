/*
 * 3장 (로스팅 공장 · 파일 시스템 취약점) 라우터
 *   GET  /ch3/:no/play   문제 페이지 (게임의 문제보기 창에 바로 뜸)
 * 성공하면 플래그를 화면에 그대로 보여준다. 참가자가 그 자리에서 복사해
 * 메인 게임의 FLAG 입력창에 직접 넣는 방식 (2장과 달리 서버 확인 요청이나
 * 검사 봇이 필요 없다).
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const config = require('../config');
const problems = require('./problems');
const { esc, page, flagBox } = require('./view');
const { readRawBody, getBoundary, parseMultipart, PNG_SIGNATURE, looksLikeRealImage } = require('./upload');

const router = express.Router();
router.use('/static', express.static(path.join(__dirname, 'public')));

const UPLOAD_LIMIT = 2 * 1024 * 1024; // 2MB면 이 문제들에 충분하다

function find(req, res, next) {
  const p = problems.find(x => String(x.no) === req.params.no);
  if (!p) return res.status(404).send('없는 문제입니다.');
  req.problem = p;
  next();
}
function flagFor(no) { return config.flags.ch3[no - 1]; }

function codeBox(text) { return '<div class="code-box">' + esc(text) + '</div>'; }
function mission(text) { return '<div class="mission"><strong>목표</strong> ' + esc(text) + '</div>'; }
function backLink() { return '<p><a href="./">돌아가기</a></p>'; }

// /ch3/1, /ch3/1/ → 문제 페이지로
router.get('/:no', (req, res) => res.redirect(req.baseUrl + '/' + encodeURIComponent(req.params.no) + '/play'));

/* ================= 01. 이중 확장자 우회 ================= */
const ALLOWED_SUBSTR_01 = ['.jpg', '.png'];
router.get('/1/play', (req, res) => {
  const p = problems[0];
  const body = codeBox(
    'POST ./upload (필드명 file)\n' +
    '  -> 파일명에 ".jpg" 또는 ".png" 라는 문자열이 "포함"되어 있으면 허용\n' +
    '  -> (실제 확장자가 정확히 무엇인지는 별도로 확인하지 않음)\n'
  ) +
    '<form method="POST" action="./upload" enctype="multipart/form-data">' +
    '<input type="file" name="file"> <button class="btn" type="submit">업로드</button></form>' +
    mission(p.goal);
  res.send(page(p, body));
});
router.post('/1/upload', async (req, res) => {
  const p = problems[0];
  try {
    const buf = await readRawBody(req, UPLOAD_LIMIT);
    const boundary = getBoundary(req);
    if (!boundary) throw new Error('multipart 형식이 아닙니다');
    const parts = parseMultipart(buf, boundary);
    const filePart = parts.find(x => x.field === 'file' && x.filename);
    if (!filePart) throw new Error('file 필드가 없습니다');
    const name = filePart.filename;
    const passesNaiveCheck = ALLOWED_SUBSTR_01.some(s => name.indexOf(s) !== -1);
    if (!passesNaiveCheck) {
      return res.send(page(p, '<div class="hint"><strong>차단됨</strong><p>jpg/png 파일만 업로드할 수 있습니다: ' + esc(name) + '</p></div>' + backLink()));
    }
    const realExt = path.extname(name).toLowerCase();
    const isRealImage = realExt === '.jpg' || realExt === '.jpeg' || realExt === '.png';
    if (isRealImage) {
      return res.send(page(p, '<div class="hint"><strong>업로드 성공</strong><p>' + esc(name) + ' (정상적인 이미지 파일입니다)</p></div>' + backLink()));
    }
    return res.send(page(p, '<div class="hint"><strong>업로드 성공</strong><p>' + esc(name) + '</p>' + flagBox(flagFor(1)) + '</div>' + backLink()));
  } catch (e) {
    res.send(page(p, '<div class="hint"><strong>오류</strong><p>' + esc(e.message) + '</p></div>' + backLink()));
  }
});

/* ================= 02. MIME 타입 변조 ================= */
const UPLOAD_DIR_02 = path.join(__dirname, 'uploads', '02');
fs.mkdirSync(UPLOAD_DIR_02, { recursive: true });
router.get('/2/play', (req, res) => {
  const p = problems[1];
  const body = codeBox(
    'POST ./upload (필드명 photo)\n' +
    '  -> 요청에 적힌 Content-Type 값이 "image/jpeg" 또는 "image/png" 면 통과\n' +
    '  -> (실제 파일 내용 검사: 없음 — 클라이언트가 보낸 Content-Type을 그대로 믿음)\n' +
    '  -> 통과하면 서버에 저장\n\n' +
    'GET ./review?file=이름\n' +
    '  -> 저장된 파일의 "진짜 내용"이 실제 이미지 시그니처로 시작하는지 검수\n'
  ) +
    '<form method="POST" action="./upload" enctype="multipart/form-data">' +
    '<input type="file" name="photo"> <button class="btn" type="submit">업로드</button></form>' +
    mission(p.goal);
  res.send(page(p, body));
});
router.post('/2/upload', async (req, res) => {
  const p = problems[1];
  try {
    const buf = await readRawBody(req, UPLOAD_LIMIT);
    const boundary = getBoundary(req);
    if (!boundary) throw new Error('multipart 형식이 아닙니다');
    const parts = parseMultipart(buf, boundary);
    const filePart = parts.find(x => x.field === 'photo' && x.filename);
    if (!filePart) throw new Error('photo 필드가 없습니다');
    // 취약 지점: 클라이언트가 보낸 Content-Type만 확인한다.
    if (filePart.contentType !== 'image/jpeg' && filePart.contentType !== 'image/png') {
      return res.send(page(p, '<div class="hint"><strong>거부됨</strong><p>이미지 파일만 업로드할 수 있습니다. (Content-Type: ' + esc(filePart.contentType || '없음') + ')</p></div>' + backLink()));
    }
    const safeName = filePart.filename.replace(/[\/\\]/g, '_');
    fs.writeFileSync(path.join(UPLOAD_DIR_02, safeName), filePart.data);
    res.send(page(p, '<div class="hint"><strong>업로드 성공</strong><p><code>' + esc(safeName) + '</code> (Content-Type: ' + esc(filePart.contentType) + ')</p>' +
      '<p><a href="./review?file=' + encodeURIComponent(safeName) + '">검수 결과 보기</a></p></div>'));
  } catch (e) {
    res.send(page(p, '<div class="hint"><strong>오류</strong><p>' + esc(e.message) + '</p></div>' + backLink()));
  }
});
router.get('/2/review', (req, res) => {
  const p = problems[1];
  const file = typeof req.query.file === 'string' ? req.query.file : '';
  const fp = path.join(UPLOAD_DIR_02, file.replace(/[\/\\]/g, '_'));
  if (!fs.existsSync(fp) || !fs.statSync(fp).isFile()) {
    return res.send(page(p, '<h1>파일을 찾을 수 없습니다</h1>' + backLink()));
  }
  const buf = fs.readFileSync(fp);
  const real = looksLikeRealImage(buf);
  let inner = '<h1>검수 결과: ' + esc(file) + '</h1>';
  if (real) inner += '<p>실제 이미지 시그니처가 확인되었습니다. 정상입니다.</p>';
  else inner += '<p>이 파일은 이미지 검증을 통과해 저장되었지만, 실제로는 이미지가 아닙니다 — 검증 우회 성공입니다.</p>' + flagBox(flagFor(2));
  res.send(page(p, inner + backLink()));
});

/* ================= 03. Path Traversal (무필터) ================= */
const BASE_DIR_03 = path.join(__dirname, 'data', '03');
const LOGS_DIR_03 = path.join(BASE_DIR_03, 'logs');
const SECRET_DIR_03 = path.join(BASE_DIR_03, 'secret');
fs.mkdirSync(LOGS_DIR_03, { recursive: true });
fs.mkdirSync(SECRET_DIR_03, { recursive: true });
fs.writeFileSync(path.join(LOGS_DIR_03, 'day1.txt'), '오늘의 로스팅 일지: 200도, 12분.');
fs.writeFileSync(path.join(LOGS_DIR_03, 'day2.txt'), '오늘의 로스팅 일지: 198도, 11분.');
fs.writeFileSync(path.join(SECRET_DIR_03, 'flag.txt'), flagFor(3));
router.get('/3/play', (req, res) => {
  const p = problems[2];
  const body = codeBox(
    'GET ./download?file=이름\n' +
    '  -> logs 폴더에서 "이름"을 그대로 찾아 전송\n' +
    '  -> (파일명 검증: 없음)\n'
  ) +
    '<p class="links">예시: <a href="./download?file=day1.txt">day1.txt</a> · <a href="./download?file=day2.txt">day2.txt</a></p>' +
    mission(p.goal);
  res.send(page(p, body));
});
router.get('/3/download', (req, res) => {
  const p = problems[2];
  const file = typeof req.query.file === 'string' ? req.query.file : '';
  if (!file) return res.redirect('./play');
  const fp = path.join(LOGS_DIR_03, file);
  if (fs.existsSync(fp) && fs.statSync(fp).isDirectory()) {
    const items = fs.readdirSync(fp);
    return res.send(page(p, '<h1>Index of ' + esc(file) + '</h1><ul>' + items.map(n => '<li>' + esc(n) + '</li>').join('') + '</ul>' + backLink()));
  }
  if (!fs.existsSync(fp) || !fs.statSync(fp).isFile()) {
    return res.send(page(p, '<h1>파일을 찾을 수 없습니다</h1><p><code>' + esc(file) + '</code></p>' + backLink()));
  }
  const content = fs.readFileSync(fp, 'utf8');
  const isFlag = content === flagFor(3);
  res.send(page(p, '<h1>' + esc(file) + '</h1><p>' + esc(content) + '</p>' + (isFlag ? flagBox(flagFor(3)) : '')));
});

/* ================= 04. 매직바이트 우회 ================= */
const UPLOAD_DIR_04 = path.join(__dirname, 'uploads', '04');
fs.mkdirSync(UPLOAD_DIR_04, { recursive: true });
router.get('/4/play', (req, res) => {
  const p = problems[3];
  const body = codeBox(
    'POST ./upload (필드명 photo)\n' +
    '  -> 업로드된 파일의 "첫 8바이트"가 PNG 시그니처\n' +
    '     (89 50 4E 47 0D 0A 1A 0A) 와 일치하면 통과\n' +
    '  -> 그 뒤에 오는 내용은 검사하지 않음\n\n' +
    'GET ./process?file=이름\n' +
    '  -> 내용 중 "[[RUN:leak_flag]]" 마커가 있으면 실제 값으로 치환해서\n' +
    '     실행한 것처럼 보여줌 (디버그용으로 남은 기능)\n'
  ) +
    '<form method="POST" action="./upload" enctype="multipart/form-data">' +
    '<input type="file" name="photo"> <button class="btn" type="submit">업로드</button></form>' +
    mission(p.goal);
  res.send(page(p, body));
});
router.post('/4/upload', async (req, res) => {
  const p = problems[3];
  try {
    const buf = await readRawBody(req, UPLOAD_LIMIT);
    const boundary = getBoundary(req);
    if (!boundary) throw new Error('multipart 형식이 아닙니다');
    const parts = parseMultipart(buf, boundary);
    const filePart = parts.find(x => x.field === 'photo' && x.filename);
    if (!filePart) throw new Error('photo 필드가 없습니다');
    const head = filePart.data.slice(0, 8);
    if (!head.equals(PNG_SIGNATURE)) {
      return res.send(page(p, '<div class="hint"><strong>거부됨</strong><p>PNG 시그니처가 확인되지 않았습니다.</p></div>' + backLink()));
    }
    const safeName = filePart.filename.replace(/[\/\\]/g, '_');
    fs.writeFileSync(path.join(UPLOAD_DIR_04, safeName), filePart.data);
    res.send(page(p, '<div class="hint"><strong>업로드 성공</strong><p><code>' + esc(safeName) + '</code></p>' +
      '<p><a href="./process?file=' + encodeURIComponent(safeName) + '">처리 결과 보기</a></p></div>'));
  } catch (e) {
    res.send(page(p, '<div class="hint"><strong>오류</strong><p>' + esc(e.message) + '</p></div>' + backLink()));
  }
});
router.get('/4/process', (req, res) => {
  const p = problems[3];
  const file = typeof req.query.file === 'string' ? req.query.file : '';
  const fp = path.join(UPLOAD_DIR_04, file.replace(/[\/\\]/g, '_'));
  if (!fs.existsSync(fp) || !fs.statSync(fp).isFile()) {
    return res.send(page(p, '<h1>파일을 찾을 수 없습니다</h1>' + backLink()));
  }
  const raw = fs.readFileSync(fp, 'latin1');
  const rendered = raw.replace(/\[\[RUN:([a-zA-Z_]+)\]\]/g, (m, token) => token === 'leak_flag' ? flagFor(4) : m);
  const isFlag = rendered.indexOf(flagFor(4)) !== -1;
  res.send(page(p, '<h1>' + esc(file) + '</h1><pre>' + esc(rendered) + '</pre>' + (isFlag ? flagBox(flagFor(4)) : '') + backLink()));
});

/* ================= 05. Null Byte 우회 ================= */
const UPLOAD_DIR_05 = path.join(__dirname, 'uploads', '05');
fs.mkdirSync(UPLOAD_DIR_05, { recursive: true });
router.get('/5/play', (req, res) => {
  const p = problems[4];
  const body = codeBox(
    'POST ./upload (필드명 photo)\n' +
    '  -> 검증: 파일명 "전체 문자열"이 .jpg 또는 .png 로 끝나는지 확인\n' +
    '  -> 저장: 레거시 저장소 모듈에 그대로 전달\n' +
    '     (레거시 모듈은 파일명에 널 문자(\\0)가 있으면 그 지점에서\n' +
    '      문자열을 잘라서 사용함 — 옛날 C 기반 시스템의 동작을 그대로 재현)\n\n' +
    'GET ./process?file=이름\n' +
    '  -> 내용 중 "[[RUN:leak_flag]]" 마커가 있으면 실제 값으로 치환해서 보여줌\n'
  ) +
    '<form method="POST" action="./upload" enctype="multipart/form-data">' +
    '<input type="file" name="photo"> <button class="btn" type="submit">업로드</button></form>' +
    mission(p.goal);
  res.send(page(p, body));
});
router.post('/5/upload', async (req, res) => {
  const p = problems[4];
  try {
    const buf = await readRawBody(req, UPLOAD_LIMIT);
    const boundary = getBoundary(req);
    if (!boundary) throw new Error('multipart 형식이 아닙니다');
    // ascii(latin1) 로 헤더를 읽어야 파일명의 널바이트(\0)가 보존된다
    const parts = parseMultipart(buf, boundary, { ascii: true });
    const filePart = parts.find(x => x.field === 'photo' && x.filename);
    if (!filePart) throw new Error('photo 필드가 없습니다');
    const rawName = filePart.filename;
    if (!/\.(jpg|jpeg|png)$/i.test(rawName)) {
      return res.send(page(p, '<div class="hint"><strong>거부됨</strong><p>이미지 파일(.jpg, .png)만 업로드할 수 있습니다: <code>' + esc(rawName) + '</code></p></div>' + backLink()));
    }
    const nullIdx = rawName.indexOf('\u0000');
    const storedName = (nullIdx === -1 ? rawName : rawName.slice(0, nullIdx)).replace(/[\/\\]/g, '_');
    fs.writeFileSync(path.join(UPLOAD_DIR_05, storedName), filePart.data);
    res.send(page(p, '<div class="hint"><strong>업로드 성공</strong><p>검증한 이름: <code>' + esc(rawName) + '</code></p>' +
      '<p>실제 저장된 이름: <code>' + esc(storedName) + '</code></p>' +
      '<p><a href="./process?file=' + encodeURIComponent(storedName) + '">처리 결과 보기</a></p></div>'));
  } catch (e) {
    res.send(page(p, '<div class="hint"><strong>오류</strong><p>' + esc(e.message) + '</p></div>' + backLink()));
  }
});
router.get('/5/process', (req, res) => {
  const p = problems[4];
  const file = typeof req.query.file === 'string' ? req.query.file : '';
  const fp = path.join(UPLOAD_DIR_05, file.replace(/[\/\\]/g, '_'));
  if (!fs.existsSync(fp) || !fs.statSync(fp).isFile()) {
    return res.send(page(p, '<h1>파일을 찾을 수 없습니다</h1>' + backLink()));
  }
  const raw = fs.readFileSync(fp, 'utf8');
  const rendered = raw.replace(/\[\[RUN:([a-zA-Z_]+)\]\]/g, (m, token) => token === 'leak_flag' ? flagFor(5) : m);
  const isFlag = rendered.indexOf(flagFor(5)) !== -1;
  res.send(page(p, '<h1>' + esc(file) + '</h1><pre>' + esc(rendered) + '</pre>' + (isFlag ? flagBox(flagFor(5)) : '') + backLink()));
});

/* ================= 06. LFI ================= */
const BASE_DIR_06 = path.join(__dirname, 'data', '06');
const PAGES_DIR_06 = path.join(BASE_DIR_06, 'pages');
const CONFIG_DIR_06 = path.join(BASE_DIR_06, 'config');
fs.mkdirSync(PAGES_DIR_06, { recursive: true });
fs.mkdirSync(CONFIG_DIR_06, { recursive: true });
fs.writeFileSync(path.join(PAGES_DIR_06, 'about.txt'), '로스팅 공장 소개 페이지입니다.');
fs.writeFileSync(path.join(PAGES_DIR_06, 'notice.txt'), '정기 점검 안내: 매주 월요일.');
fs.writeFileSync(path.join(CONFIG_DIR_06, 'internal.conf'), 'DB_HOST=internal-db\nSECRET_FLAG=' + flagFor(6) + '\n');
router.get('/6/play', (req, res) => {
  const p = problems[5];
  const body = codeBox(
    'GET ./page?include=이름\n' +
    '  -> include에 있는 "../" 문자열을 전부 한 번에 제거 (한 번 훑고 끝, 다시 검사하지 않음)\n' +
    '  -> pages 폴더에서 그 결과를 찾아 포함시켜 보여줌\n'
  ) +
    '<p class="links">예시: <a href="./page?include=about.txt">about.txt</a> · <a href="./page?include=notice.txt">notice.txt</a></p>' +
    mission(p.goal);
  res.send(page(p, body));
});
router.get('/6/page', (req, res) => {
  const p = problems[5];
  const raw = typeof req.query.include === 'string' ? req.query.include : '';
  if (!raw) return res.redirect('./play');
  const filtered = raw.split('../').join('');
  const fp = path.join(PAGES_DIR_06, filtered);
  if (fs.existsSync(fp) && fs.statSync(fp).isDirectory()) {
    const items = fs.readdirSync(fp);
    return res.send(page(p, '<h1>Index of ' + esc(filtered) + '</h1><ul>' + items.map(n => '<li>' + esc(n) + '</li>').join('') + '</ul>' + backLink()));
  }
  if (!fs.existsSync(fp) || !fs.statSync(fp).isFile()) {
    return res.send(page(p, '<h1>파일을 찾을 수 없습니다</h1><p><code>' + esc(filtered) + '</code></p>' + backLink()));
  }
  const content = fs.readFileSync(fp, 'utf8');
  const isFlag = content.indexOf(flagFor(6)) !== -1;
  res.send(page(p, '<h1>' + esc(filtered) + '</h1><pre>' + esc(content) + '</pre>' + (isFlag ? flagBox(flagFor(6)) : '')));
});

/* ================= 07. 다운로드 경로 조작 (소스 유출) ================= */
const BASE_DIR_07 = path.join(__dirname, 'data', '07');
const PUBLIC_SRC_DIR_07 = path.join(BASE_DIR_07, 'public-src');
const SERVER_DIR_07 = path.join(BASE_DIR_07, 'server-config');
fs.mkdirSync(PUBLIC_SRC_DIR_07, { recursive: true });
fs.mkdirSync(SERVER_DIR_07, { recursive: true });
fs.writeFileSync(path.join(PUBLIC_SRC_DIR_07, 'main.js'), '// 프론트엔드 메인 스크립트\nconsole.log("로스팅 공장 포털");');
fs.writeFileSync(path.join(PUBLIC_SRC_DIR_07, 'style.css'), 'body { background: #1b140f; }');
fs.writeFileSync(path.join(SERVER_DIR_07, 'config.js'), '// 서버 내부 설정 (공개 금지)\nmodule.exports = {\n  dbPassword: "old_super_secret",\n  deployFlag: "' + flagFor(7) + '"\n};\n');
router.get('/7/play', (req, res) => {
  const p = problems[6];
  const body = codeBox(
    'GET ./source?file=이름\n' +
    '  -> public-src 폴더에서 "이름"을 그대로 찾아 전송\n' +
    '  -> (파일명 검증: 없음)\n'
  ) +
    '<p class="links">예시: <a href="./source?file=main.js">main.js</a> · <a href="./source?file=style.css">style.css</a></p>' +
    mission(p.goal);
  res.send(page(p, body));
});
router.get('/7/source', (req, res) => {
  const p = problems[6];
  const file = typeof req.query.file === 'string' ? req.query.file : '';
  if (!file) return res.redirect('./play');
  const fp = path.join(PUBLIC_SRC_DIR_07, file);
  if (fs.existsSync(fp) && fs.statSync(fp).isDirectory()) {
    const items = fs.readdirSync(fp);
    return res.send(page(p, '<h1>Index of ' + esc(file) + '</h1><ul>' + items.map(n => '<li>' + esc(n) + '</li>').join('') + '</ul>' + backLink()));
  }
  if (!fs.existsSync(fp) || !fs.statSync(fp).isFile()) {
    return res.send(page(p, '<h1>파일을 찾을 수 없습니다</h1><p><code>' + esc(file) + '</code></p>' + backLink()));
  }
  const content = fs.readFileSync(fp, 'utf8');
  const isFlag = content.indexOf(flagFor(7)) !== -1;
  res.send(page(p, '<h1>' + esc(file) + '</h1><pre>' + esc(content) + '</pre>' + (isFlag ? flagBox(flagFor(7)) : '')));
});

/* ================= 08. 웹쉘 업로드 → RCE ================= */
const UPLOAD_DIR_08 = path.join(__dirname, 'uploads', '08');
fs.mkdirSync(UPLOAD_DIR_08, { recursive: true });
router.get('/8/play', (req, res) => {
  const p = problems[7];
  const body = codeBox(
    'POST ./upload (필드명 script)\n' +
    '  -> 어떤 파일이든 검증 없이 그대로 저장\n\n' +
    'GET ./exec?file=이름\n' +
    '  -> 저장된 파일에서 이름을 찾아 "실행"\n' +
    '  -> 내용 중 "[[CMD:명령]]" 형태가 있으면 그 명령을 처리해서 결과를 보여줌\n' +
    '  -> 지원 명령: cat_flag (서버에 보관된 플래그 값을 출력)\n'
  ) +
    '<form method="POST" action="./upload" enctype="multipart/form-data">' +
    '<input type="file" name="script"> <button class="btn" type="submit">업로드</button></form>' +
    mission(p.goal);
  res.send(page(p, body));
});
router.post('/8/upload', async (req, res) => {
  const p = problems[7];
  try {
    const buf = await readRawBody(req, UPLOAD_LIMIT);
    const boundary = getBoundary(req);
    if (!boundary) throw new Error('multipart 형식이 아닙니다');
    const parts = parseMultipart(buf, boundary);
    const filePart = parts.find(x => x.field === 'script' && x.filename);
    if (!filePart) throw new Error('script 필드가 없습니다');
    // 취약 지점: 어떤 검증도 하지 않는다.
    const safeName = filePart.filename.replace(/[\/\\]/g, '_');
    fs.writeFileSync(path.join(UPLOAD_DIR_08, safeName), filePart.data);
    res.send(page(p, '<div class="hint"><strong>업로드 성공 (부분 점수)</strong><p><code>' + esc(safeName) + '</code></p>' +
      '<p><a href="./exec?file=' + encodeURIComponent(safeName) + '">실행하기</a></p></div>'));
  } catch (e) {
    res.send(page(p, '<div class="hint"><strong>오류</strong><p>' + esc(e.message) + '</p></div>' + backLink()));
  }
});
router.get('/8/exec', (req, res) => {
  const p = problems[7];
  const file = typeof req.query.file === 'string' ? req.query.file : '';
  const fp = path.join(UPLOAD_DIR_08, file.replace(/[\/\\]/g, '_'));
  if (!fs.existsSync(fp) || !fs.statSync(fp).isFile()) {
    return res.send(page(p, '<h1>파일을 찾을 수 없습니다</h1>' + backLink()));
  }
  const raw = fs.readFileSync(fp, 'utf8');
  const output = raw.replace(/\[\[CMD:([a-zA-Z_]+)\]\]/g, (m, cmd) => cmd === 'cat_flag' ? flagFor(8) : '(알 수 없는 명령: ' + cmd + ')');
  const isFlag = output.indexOf(flagFor(8)) !== -1;
  res.send(page(p, '<h1>실행 결과: ' + esc(file) + '</h1><pre>' + esc(output) + '</pre>' + (isFlag ? flagBox(flagFor(8)) : '') + backLink()));
});

/* ================= 09. Zip Slip ================= */
const SANDBOX_DIR_09 = path.join(__dirname, 'data', '09', 'sandbox');
const SECRET_DIR_09 = path.join(__dirname, 'data', '09', 'secret');
fs.mkdirSync(SANDBOX_DIR_09, { recursive: true });
fs.mkdirSync(SECRET_DIR_09, { recursive: true });
fs.writeFileSync(path.join(SANDBOX_DIR_09, 'notes.txt'), '참고용 샘플 파일입니다. 이 폴더 안의 파일만 미리보기로 보일 예정입니다.');
fs.writeFileSync(path.join(SECRET_DIR_09, 'flag.txt'), flagFor(9));
const zipUploads = {}; // id -> [{name}]

function parseZipEntries(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd === -1) throw new Error('zip 형식이 아닙니다 (EOCD 없음)');
  const cdOffset = buf.readUInt32LE(eocd + 16);
  const cdCount = buf.readUInt16LE(eocd + 10);
  const entries = [];
  let p = cdOffset;
  for (let i = 0; i < cdCount; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const name = buf.slice(p + 46, p + 46 + nameLen).toString('utf8');
    entries.push({ name });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}
router.get('/9/play', (req, res) => {
  const p = problems[8];
  const body = codeBox(
    'POST ./upload (필드명 archive, zip 파일)\n' +
    '  -> zip 안에 "기록된" 각 항목 이름을 목록으로 표시\n\n' +
    'GET ./preview?id=&idx=\n' +
    '  -> 해당 항목의 "기록된 이름"을 그대로 sandbox 폴더 기준 경로로 사용해\n' +
    '     서버에 있는 원본 파일을 다시 읽어 보여줌\n'
  ) +
    '<form method="POST" action="./upload" enctype="multipart/form-data">' +
    '<input type="file" name="archive" accept=".zip"> <button class="btn" type="submit">업로드</button></form>' +
    mission(p.goal);
  res.send(page(p, body));
});
router.post('/9/upload', async (req, res) => {
  const p = problems[8];
  try {
    const buf = await readRawBody(req, UPLOAD_LIMIT);
    const boundary = getBoundary(req);
    if (!boundary) throw new Error('multipart 형식이 아닙니다');
    const parts = parseMultipart(buf, boundary);
    const filePart = parts.find(x => x.field === 'archive' && x.filename);
    if (!filePart) throw new Error('archive 필드가 없습니다');
    const entries = parseZipEntries(filePart.data);
    const id = crypto.randomBytes(4).toString('hex');
    zipUploads[id] = entries;
    const rows = entries.map((e, i) => '<li><code>' + esc(e.name) + '</code> — <a href="./preview?id=' + id + '&idx=' + i + '">미리보기</a></li>').join('');
    res.send(page(p, '<div class="hint"><strong>업로드 결과</strong><ul>' + rows + '</ul></div>'));
  } catch (e) {
    res.send(page(p, '<div class="hint"><strong>오류</strong><p>' + esc(e.message) + '</p></div>' + backLink()));
  }
});
router.get('/9/preview', (req, res) => {
  const p = problems[8];
  const id = typeof req.query.id === 'string' ? req.query.id : '';
  const idx = parseInt(req.query.idx, 10);
  const entries = zipUploads[id];
  if (!entries || !entries[idx]) {
    return res.status(404).send(page(p, '<h1>업로드 기록을 찾을 수 없습니다</h1>' + backLink()));
  }
  const name = entries[idx].name;
  const resolved = path.join(SANDBOX_DIR_09, name);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    return res.send(page(p, '<h1>미리보기: ' + esc(name) + '</h1><p>해당 경로에 파일이 없습니다.</p>' + backLink()));
  }
  const content = fs.readFileSync(resolved, 'utf8');
  const isFlag = content === flagFor(9);
  res.send(page(p, '<h1>미리보기: ' + esc(name) + '</h1><pre>' + esc(content) + '</pre>' + (isFlag ? flagBox(flagFor(9)) : '') + backLink()));
});

/* ================= 10. RFI (보스) ================= */
const LOCAL_PAGES_10 = { about: '로스팅 공장 소개 페이지입니다.', notice: '정기 점검 안내: 매주 월요일.' };
const RFI_MAX_BYTES = 256 * 1024;
function fetchRemote(urlStr) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(urlStr); } catch (e) { return reject(new Error('잘못된 주소입니다')); }
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.get(u, { timeout: 4000 }, res => {
      const chunks = [];
      let size = 0;
      res.on('data', c => {
        size += c.length;
        if (size > RFI_MAX_BYTES) { req.destroy(new Error('응답이 너무 큽니다')); return; }
        chunks.push(c);
      });
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.on('timeout', () => req.destroy(new Error('요청 시간 초과')));
    req.on('error', reject);
  });
}
function renderContent10(raw) {
  const rendered = raw.replace(/\[\[RUN:([a-zA-Z_]+)\]\]/g, (m, token) => token === 'leak_flag' ? flagFor(10) : m);
  return { rendered, isFlag: rendered.indexOf(flagFor(10)) !== -1 };
}
router.get('/10/play', (req, res) => {
  const p = problems[9];
  const body = codeBox(
    'GET ./render?src=값\n' +
    '  -> 값이 "http://" 또는 "https://" 로 시작하면,\n' +
    '     그 주소의 내용을 서버가 직접 가져와서 그대로 포함시켜 보여줌\n' +
    '     (가져오는 내용의 출처 검증: 없음 — 아무 주소나 허용)\n' +
    '  -> 아니면 로컬에 미리 등록된 조각(about, notice) 중에서 찾음\n\n' +
    '포함된 내용 중 "[[RUN:leak_flag]]" 마커가 있으면, 그 자리를 실제 값으로\n' +
    '치환해서 실행한 것처럼 보여줌\n'
  ) +
    '<p class="links">예시: <a href="./render?src=about">about</a> · <a href="./render?src=notice">notice</a></p>' +
    mission(p.goal);
  res.send(page(p, body));
});
router.get('/10/render', async (req, res) => {
  const p = problems[9];
  const src = typeof req.query.src === 'string' ? req.query.src : '';
  if (!src) return res.redirect('./play');
  if (/^https?:\/\//i.test(src)) {
    try {
      const text = await fetchRemote(src);
      const r = renderContent10(text);
      return res.send(page(p, '<div class="hint"><strong>원격 포함 결과: ' + esc(src) + '</strong><pre>' + esc(r.rendered) + '</pre>' + (r.isFlag ? flagBox(flagFor(10)) : '') + '</div>'));
    } catch (e) {
      return res.send(page(p, '<div class="hint"><strong>가져오기 실패</strong><p>' + esc(e.message) + '</p></div>'));
    }
  }
  if (Object.prototype.hasOwnProperty.call(LOCAL_PAGES_10, src)) {
    const r = renderContent10(LOCAL_PAGES_10[src]);
    return res.send(page(p, '<div class="hint"><strong>' + esc(src) + '</strong><pre>' + esc(r.rendered) + '</pre></div>'));
  }
  res.send(page(p, '<div class="hint"><strong>찾을 수 없음</strong><p><code>' + esc(src) + '</code></p></div>'));
});

// 아직 만들지 않은 문제: 안내 띠와 준비 중 표시
router.get('/:no/play', find, (req, res) => {
  res.send(page(req.problem, '<p class="empty">준비 중인 문제입니다.</p>'));
});

module.exports = router;
