const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { scanDirectory, indexSongs, searchSongs } = require('./lib/catalog');
const { createSuggestionStore } = require('./lib/suggestions');
const { selectAddress, exportQr } = require('./lib/qr-export');

const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/favicon.svg', ['favicon.svg', 'image/svg+xml']]
]);

async function createApplication({ directory, demo = false, refreshMs = 30000, dataDirectory = path.join(__dirname, 'data'), timezone = 'America/Sao_Paulo', exportMs = 60000, now } = {}) {
  if (!demo && !directory) throw new Error('Defina KARAOKE_DIR com a pasta de vídeos ou execute npm run demo.');
  let index = [];
  let updatedAt = null;
  let scanError = false;
  let refreshing = null;
  async function refresh() {
    if (refreshing) return refreshing;
    refreshing = (async () => {
      try {
        const songs = demo ? require('./lib/demo') : await scanDirectory(directory);
        index = indexSongs(songs);
        updatedAt = new Date().toISOString();
        scanError = false;
      } catch (error) {
        scanError = true;
        throw error;
      } finally { refreshing = null; }
    })();
    return refreshing;
  }
  await refresh();
  // Suggestion data must never be written inside the video collection.
  if (directory) {
    const videosRoot = await fs.realpath(directory);
    let existingParent = path.resolve(dataDirectory);
    const missing = [];
    while (true) {
      try { existingParent = await fs.realpath(existingParent); break; }
      catch (error) {
        if (error.code !== 'ENOENT') throw error;
        missing.unshift(path.basename(existingParent));
        existingParent = path.dirname(existingParent);
      }
    }
    const resolvedData = path.join(existingParent, ...missing);
    const relative = path.relative(videosRoot, resolvedData);
    if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) {
      throw new Error('DATA_DIR deve ficar fora da pasta de vídeos.');
    }
  }
  const suggestions = await createSuggestionStore({ dataDirectory, timezone, now });
  let exportError = false;
  const runExport = async () => {
    try {
      const files = await suggestions.exportDue();
      exportError = false;
      for (const file of files) console.log(`Excel de sugestões salvo: ${file}`);
    } catch (error) { exportError = true; console.error(`Falha ao exportar sugestões: ${error.message}`); }
  };
  await runExport();
  const exportTimer = exportMs > 0 ? setInterval(runExport, exportMs) : null;
  exportTimer?.unref();
  const submissions = new Map();
  const timer = !demo && refreshMs > 0 ? setInterval(() => {
    refresh().catch(error => console.error(`Falha ao atualizar catálogo: ${error.message}`));
  }, refreshMs) : null;
  timer?.unref();

  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    const send = (status, data) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : JSON.stringify(data));
    };
    let url;
    try { url = new URL(req.url, 'http://localhost'); }
    catch { return send(400, { error: 'Endereço inválido.' }); }
    if (url.pathname === '/api/suggestions' && req.method === 'POST') {
      // Do not accept cross-origin form submissions from unrelated websites.
      const origin = req.headers.origin;
      let allowedOrigin = !origin;
      try { if (origin) allowedOrigin = new URL(origin).host === req.headers.host; } catch {}
      if (!allowedOrigin || req.headers['sec-fetch-site'] === 'cross-site') return send(403, { error: 'Origem não permitida.' });
      if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') return send(415, { error: 'Envie a sugestão em JSON.' });
      const ip = req.socket.remoteAddress;
      const currentTime = Date.now();
      for (const [key, entry] of submissions) if (currentTime - entry.start >= 60000) submissions.delete(key);
      const rate = submissions.get(ip) || { start: currentTime, count: 0 };
      if (rate.count >= 10 || (!submissions.has(ip) && submissions.size >= 10000)) return send(429, { error: 'Muitas sugestões. Aguarde um minuto e tente novamente.' });
      rate.count++;
      submissions.set(ip, rate);
      const chunks = [];
      let bytes = 0;
      try {
        for await (const chunk of req) {
          bytes += chunk.length;
          if (bytes <= 2048) chunks.push(chunk);
        }
        if (bytes > 2048) return send(413, { error: 'Sugestão muito longa.' });
        let input;
        try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return send(400, { error: 'Sugestão inválida.' }); }
        if (!input || typeof input.title !== 'string' || typeof input.artist !== 'string') return send(400, { error: 'Informe a música e o cantor ou banda.' });
        const title = input.title.trim();
        const artist = input.artist.trim();
        if (title.length < 2 || artist.length < 2 || title.length > 120 || artist.length > 120 || /[\u0000-\u001f]/.test(title + artist)) {
          return send(400, { error: 'Preencha música e cantor ou banda com 2 a 120 caracteres.' });
        }
        await suggestions.add({ title, artist });
        return send(201, { message: 'Sugestão recebida! Obrigado por ajudar a ampliar o repertório.' });
      } catch (error) {
        console.error(`Falha ao salvar sugestão: ${error.message}`);
        return send(500, { error: 'Não foi possível salvar a sugestão. Tente novamente.' });
      }
    }
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.setHeader('Allow', url.pathname === '/api/suggestions' ? 'POST' : 'GET, HEAD');
      return send(405, { error: 'Somente consulta é permitida.' });
    }
    try {
      if (url.pathname === '/api/health') {
        return send(scanError || exportError ? 503 : 200, { status: scanError ? 'stale' : exportError ? 'export-error' : 'ok', total: index.length, updatedAt, demo, suggestions: { exportHealthy: !exportError, timezone, cutoff: '02:00' } });
      }
      if (url.pathname === '/api/songs') {
        const q = url.searchParams.get('q') || '';
        const field = url.searchParams.get('field') || 'all';
        const limit = Number(url.searchParams.get('limit') ?? 24);
        const offset = Number(url.searchParams.get('offset') ?? 0);
        if (q.length > 256 || !['all', 'title', 'artist'].includes(field) || !Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0) {
          return send(400, { error: 'Parâmetros de consulta inválidos.' });
        }
        // A fresh scan reads directory entries only; it never changes the collection.
        // Coalesce concurrent requests and avoid repeated scans within two seconds.
        if (url.searchParams.get('refresh') === '1' && Date.now() - Date.parse(updatedAt) >= 2000) {
          await refresh().catch(error => console.error(`Falha ao atualizar catálogo: ${error.message}`));
        }
        const matches = searchSongs(index, q, field);
        return send(200, { songs: matches.slice(offset, offset + limit), total: matches.length, catalogTotal: index.length, updatedAt, demo, stale: scanError });
      }
      const asset = assets.get(url.pathname);
      if (!asset) return send(404, { error: 'Página não encontrada.' });
      const content = await fs.readFile(path.join(__dirname, 'public', asset[0]));
      res.writeHead(200, { 'Content-Type': asset[1], 'Cache-Control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch (error) {
      console.error(`Falha na requisição: ${error.message}`);
      send(500, { error: 'Não foi possível concluir a consulta.' });
    }
  });
  server.requestTimeout = 15000;
  server.on('close', () => { clearInterval(timer); clearInterval(exportTimer); });
  return { server, refresh };
}

async function main() {
  const demo = process.argv.includes('--demo');
  const host = process.env.HOST || '0.0.0.0';
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT deve ser um número entre 1 e 65535.');
  const { server } = await createApplication({ directory: process.env.KARAOKE_DIR, demo, dataDirectory: process.env.DATA_DIR || path.join(__dirname, 'data'), timezone: process.env.EXPORT_TIMEZONE || 'America/Sao_Paulo' });
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  server.listen(port, host, async () => {
    console.log(`Music Search iniciado na porta ${port}${demo ? ' (demonstração)' : ''}.`);
    if (host === '0.0.0.0') {
      for (const interfaces of Object.values(os.networkInterfaces())) {
        for (const address of interfaces || []) {
          if (address.family === 'IPv4' && !address.internal) console.log(`Na rede do bar: http://${address.address}:${port}`);
        }
      }
    }
    if (host === '0.0.0.0') {
      try {
        const address = selectAddress(process.env.PUBLIC_HOST);
        const files = await exportQr({ host: address, port, directory: path.join(process.env.DATA_DIR || path.join(__dirname, 'data'), 'qr') });
        console.log(`QR Code: ${files.pngFile}\nCartaz para impressão: ${files.posterFile}`);
      } catch (error) { console.warn(`QR Code não exportado: ${error.message} Use exportar-qr-code.bat para escolher o IP.`); }
    }
    if (process.platform === 'win32' && process.env.OPEN_BROWSER === '1') {
      const opener = require('node:child_process').spawn('rundll32.exe', ['url.dll,FileProtocolHandler', `http://127.0.0.1:${port}/`], { detached: true, stdio: 'ignore' });
      opener.on('error', error => console.warn(`Abra o navegador manualmente: ${error.message}`));
      opener.unref();
    }
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { createApplication };
