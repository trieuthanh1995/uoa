/* Ú òa – máy chủ tĩnh tối giản (Node 18+, không cần thư viện). Chạy: node server.js  → http://localhost:3000 */
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = __dirname, PORT = +process.env.PORT || 3000;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
http.createServer((req, res) => {
  let u = decodeURIComponent((req.url || '/').split('?')[0]); if (u === '/') u = '/index.html';
  const f = path.normalize(path.join(ROOT, u));
  if (!f.startsWith(ROOT) || /\/(server|test-sim|bal)\.js$/.test(u)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(data);
  });
}).listen(PORT, () => console.log('Ú òa chạy tại http://localhost:' + PORT));
