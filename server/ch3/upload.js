/* 3장 로스팅 파일 업로드 문제 공용 헬퍼: 요청 본문을 Buffer로 모으고 multipart/form-data를 파싱한다 */

// 요청 본문을 Buffer로 모아서 콜백에 넘긴다 (바이너리를 다룰 수 있어야 해서 express.urlencoded 대신 직접 처리)
function readRawBody(req, limitBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', c => {
      size += c.length;
      if (limitBytes && size > limitBytes) { req.destroy(); return reject(new Error('업로드 용량이 너무 큽니다')); }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function getBoundary(req) {
  const ct = req.headers['content-type'] || '';
  const m = ct.match(/boundary=(.+)$/);
  return m ? m[1] : null;
}

// 최소한의 multipart/form-data 파서. 각 파트의 field명, 파일명, Content-Type, 본문(Buffer)을 반환한다.
// ascii: true 면 헤더를 'binary'(latin1)로 해석한다 (파일명에 널바이트가 섞인 경우에 필요).
function parseMultipart(buf, boundary, opts) {
  const headerEncoding = (opts && opts.ascii) ? 'binary' : 'utf8';
  const delim = Buffer.from('--' + boundary);
  const parts = [];
  let idx = buf.indexOf(delim);
  while (idx !== -1) {
    const next = buf.indexOf(delim, idx + delim.length);
    if (next === -1) break;
    let chunk = buf.slice(idx + delim.length, next);
    if (chunk.slice(0, 2).toString() === '\r\n') chunk = chunk.slice(2);
    const headerEnd = chunk.indexOf('\r\n\r\n');
    if (headerEnd !== -1) {
      const headerStr = chunk.slice(0, headerEnd).toString(headerEncoding);
      let body = chunk.slice(headerEnd + 4);
      if (body.slice(-2).toString() === '\r\n') body = body.slice(0, -2);
      const nameMatch = headerStr.match(/name="([^"]*)"/);
      const filenameMatch = headerStr.match(/filename="([^"]*)"/);
      const ctMatch = headerStr.match(/Content-Type:\s*([^\r\n]+)/i);
      parts.push({
        field: nameMatch ? nameMatch[1] : '',
        filename: filenameMatch ? filenameMatch[1] : null,
        contentType: ctMatch ? ctMatch[1].trim() : '',
        data: body
      });
    }
    idx = next;
  }
  return parts;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);

function looksLikeRealImage(buf) {
  if (buf.length >= 3 && buf[0] === JPEG_SIGNATURE[0] && buf[1] === JPEG_SIGNATURE[1] && buf[2] === JPEG_SIGNATURE[2]) return true;
  if (buf.length >= 8 && buf.slice(0, 4).equals(PNG_SIGNATURE.slice(0, 4))) return true;
  return false;
}

module.exports = { readRawBody, getBoundary, parseMultipart, PNG_SIGNATURE, JPEG_SIGNATURE, looksLikeRealImage };
