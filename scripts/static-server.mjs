/* Plain static server over the project root, for screenshot comparisons.
   No transforms: the legacy page must be served exactly as it is on disk. */
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const ROOT = process.argv[2];
const PORT = Number(process.argv[3] || 8099);
const MIME = {
    '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
    '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
    '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
    '.webmanifest': 'application/manifest+json',
};

createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const file = normalize(join(ROOT, url === '/' ? '/index.html' : url));
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    try {
        if (!statSync(file).isFile()) throw new Error('not a file');
    } catch { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream' });
    createReadStream(file).pipe(res);
}).listen(PORT, () => console.log('serving ' + ROOT + ' on ' + PORT));
