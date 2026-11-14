const http = require('http'), fs = require('fs'), path = require('path');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.txt': 'text/plain', '.xml': 'application/xml', '.md': 'text/plain' };
module.exports = (root, harness, port) => new Promise((ok) => {
  const s = http.createServer((req, res) => {
    let u = decodeURIComponent(req.url.split('?')[0]); if (u === '/') u = '/index.html';
    let f = u.startsWith('/__mock/') ? path.join(harness, u.slice(8)) : path.join(root, u);
    fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end('nf'); } const extra = process.env.CSP ? { 'content-security-policy': process.env.CSP } : {}; res.writeHead(200, { ...extra, 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(d); });
  }).listen(port, () => ok(s));
});
