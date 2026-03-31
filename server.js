const http = require('http');
const https = require('https');
const fs = require('fs');
const url = require('url');

const PORT = process.env.PORT || 8080;

// ✅ 서버에만 저장되는 비밀값들 (팀원에게 노출 안 됨)
const NAVER_CLIENT_ID     = process.env.NAVER_CLIENT_ID     || '';
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET || '';
const TEAM_PASSWORD       = process.env.TEAM_PASSWORD       || 'team1234'; // 기본값

// 간단한 세션 토큰 저장소 (메모리)
const validTokens = new Set();

function generateToken() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function sendJSON(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const parsed   = url.parse(req.url, true);
  const pathname = parsed.pathname;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  // ── index.html 서빙 ──────────────────────────────
  if (pathname === '/' || pathname === '/index.html') {
    try {
      const html = fs.readFileSync('index.html', 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch {
      res.writeHead(404);
      res.end('index.html 파일을 찾을 수 없습니다.');
    }
    return;
  }

  // ── 로그인 ──────────────────────────────────────
  if (pathname === '/login' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { password } = JSON.parse(body);
        if (password === TEAM_PASSWORD) {
          const token = generateToken();
          validTokens.add(token);
          // 7일 후 자동 만료
          setTimeout(() => validTokens.delete(token), 7 * 24 * 60 * 60 * 1000);
          sendJSON(res, 200, { ok: true, token });
        } else {
          sendJSON(res, 401, { ok: false, error: '비밀번호가 틀렸습니다.' });
        }
      } catch {
        sendJSON(res, 400, { ok: false, error: '잘못된 요청' });
      }
    });
    return;
  }

  // ── 네이버 검색 (토큰 인증 필요) ────────────────
  if (pathname === '/search') {
    const q     = parsed.query;
    const token = q.token || '';

    if (!validTokens.has(token)) {
      sendJSON(res, 401, { error: '로그인이 필요합니다.' });
      return;
    }

    if (!NAVER_CLIENT_ID || !NAVER_CLIENT_SECRET) {
      sendJSON(res, 500, { error: '서버에 네이버 API 키가 설정되지 않았습니다. 환경변수를 확인하세요.' });
      return;
    }

    const keyword = q.query   || '';
    const display = q.display || '20';
    const start   = q.start   || '1';
    const sort    = q.sort    || 'date';

    if (!keyword) { sendJSON(res, 400, { error: 'query 필요' }); return; }

    const apiPath = `/v1/search/news.json?query=${encodeURIComponent(keyword)}&display=${display}&start=${start}&sort=${sort}`;

    const proxyReq = https.request({
      hostname: 'openapi.naver.com',
      path: apiPath,
      method: 'GET',
      headers: {
        'X-Naver-Client-Id':     NAVER_CLIENT_ID,
        'X-Naver-Client-Secret': NAVER_CLIENT_SECRET,
      }
    }, (proxyRes) => {
      let data = '';
      proxyRes.on('data', c => data += c);
      proxyRes.on('end', () => {
        res.writeHead(proxyRes.statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(data);
      });
    });

    proxyReq.on('error', e => sendJSON(res, 500, { error: e.message }));
    proxyReq.end();
    return;
  }

  res.writeHead(404); res.end();
});

server.listen(PORT, () => {
  console.log('');
  console.log('========================================');
  console.log('  네이버 뉴스 검색 서버 시작!');
  console.log(`  http://localhost:${PORT}`);
  console.log('========================================');
  if (!NAVER_CLIENT_ID) console.warn('  ⚠️  NAVER_CLIENT_ID 환경변수 없음');
  if (!NAVER_CLIENT_SECRET) console.warn('  ⚠️  NAVER_CLIENT_SECRET 환경변수 없음');
  console.log('');
});
