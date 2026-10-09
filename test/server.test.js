const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { setTimeout: delay } = require('node:timers/promises');
const { createApplication } = require('../server');

async function fixture(t, options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'music-api-'));
  const directory = path.join(root, 'videos');
  const dataDirectory = path.join(root, 'data');
  await fs.mkdir(directory);
  const file = path.join(directory, '3DoorsDown-HereWithoutYou.mp4');
  await fs.writeFile(file, 'video-inacessivel');
  const app = await createApplication({ directory, dataDirectory, refreshMs: 0, exportMs: 0, ...options });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => app.server.close(resolve)); await fs.rm(root, { recursive: true, force: true }); });
  return { ...app, root, directory, dataDirectory, file, url: `http://127.0.0.1:${app.server.address().port}` };
}

test('serve frontend e pesquisa, sem disponibilizar vídeos, caminhos, dados ou gravação no catálogo', async t => {
  const app = await fixture(t);
  const html = await fetch(app.url);
  assert.equal(html.status, 200);
  assert.ok((await html.text()).includes('Qual música você quer cantar?'));
  const result = await fetch(`${app.url}/api/songs?q=here%20without`);
  const body = await result.json();
  assert.equal(body.total, 1);
  assert.equal(body.songs[0].artist, '3 Doors Down');
  assert.ok(!JSON.stringify(body).includes(app.directory));
  for (const route of ['/videos/3DoorsDown-HereWithoutYou.mp4', '/server.js', '/data/suggestions.json', '/data/exports/sugestoes.xlsx', '/api/suggestions']) {
    assert.equal((await fetch(app.url + route)).status, 404);
  }
  assert.equal((await fetch(`${app.url}/api/songs`, { method: 'POST' })).status, 405);
  assert.equal((await fetch(`${app.url}/api/songs?field=bad`)).status, 400);
  assert.equal((await fetch(`${app.url}/api/songs?limit=101`)).status, 400);
  assert.equal((await fetch(`${app.url}/api/health`)).status, 200);
  assert.equal(await fs.readFile(app.file, 'utf8'), 'video-inacessivel');
});

test('botão de atualização detecta adições e remoções; mantém o último catálogo se a pasta cai', async t => {
  const app = await fixture(t);
  await fs.writeFile(path.join(app.directory, 'Queen-BohemianRhapsody.mkv'), 'novo');
  await delay(2050);
  let response = await fetch(`${app.url}/api/songs?refresh=1`);
  assert.equal((await response.json()).catalogTotal, 2);
  await fs.rm(app.file);
  await app.refresh();
  response = await fetch(`${app.url}/api/songs`);
  assert.equal((await response.json()).catalogTotal, 1);
  await fs.rename(app.directory, `${app.directory}-offline`);
  await assert.rejects(app.refresh());
  assert.equal((await fetch(`${app.url}/api/health`)).status, 503);
  const stale = await (await fetch(`${app.url}/api/songs`)).json();
  assert.equal(stale.stale, true);
  assert.equal(stale.catalogTotal, 1);
  await fs.rename(`${app.directory}-offline`, app.directory);
  await app.refresh();
  assert.equal((await fetch(`${app.url}/api/health`)).status, 200);
});

test('atualiza o catálogo automaticamente sem reiniciar', async t => {
  const app = await fixture(t, { refreshMs: 30 });
  await fs.writeFile(path.join(app.directory, 'Banda-NovaMusica.mp4'), 'novo');
  await delay(150);
  const data = await (await fetch(`${app.url}/api/songs`)).json();
  assert.equal(data.catalogTotal, 2);
});

test('exige música e artista, salva sugestões e rejeita origem externa e corpo grande', async t => {
  const app = await fixture(t);
  const post = (value, headers = {}) => fetch(`${app.url}/api/suggestions`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(value) });
  assert.equal((await post({ title: 'Here Without You' })).status, 400);
  assert.equal((await post({ title: 'Here Without You', artist: '  ' })).status, 400);
  assert.equal((await post({ title: 'Here Without You', artist: '3 Doors Down' }, { Origin: 'https://other.example' })).status, 403);
  assert.equal((await post({ title: 'Here Without You', artist: '3 Doors Down' }, { Origin: 'null' })).status, 403);
  assert.equal((await post({ title: 'a'.repeat(2100), artist: 'Banda' })).status, 413);
  const result = await post({ title: ' Here Without You ', artist: ' 3 Doors Down ' }, { Origin: app.url });
  assert.equal(result.status, 201);
  const rows = JSON.parse(await fs.readFile(path.join(app.dataDirectory, 'suggestions.json'), 'utf8'));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].artist, '3 Doors Down');
  assert.equal(rows[0].title, 'Here Without You');
  assert.equal(await fs.readFile(app.file, 'utf8'), 'video-inacessivel');
});

test('limita envio repetido de sugestões por endereço', async t => {
  const app = await fixture(t);
  for (let i = 0; i < 10; i++) {
    assert.equal((await fetch(`${app.url}/api/suggestions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: `Musica ${i}`, artist: 'Banda' }) })).status, 201);
  }
  assert.equal((await fetch(`${app.url}/api/suggestions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Musica', artist: 'Banda' }) })).status, 429);
});

test('rejeita armazenamento de sugestões dentro da coleção de vídeos', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'music-path-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await assert.rejects(createApplication({ directory: root, dataDirectory: path.join(root, 'sugestoes') }), /DATA_DIR/);
  assert.deepEqual(await fs.readdir(root), []);
});
