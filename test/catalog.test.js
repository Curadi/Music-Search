const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { parseFilename, scanDirectory, indexSongs, searchSongs } = require('../lib/catalog');

test('separa artista e música no formato usado pelo bar, com código opcional', () => {
  assert.deepEqual(parseFilename('3DoorsDown-HereWithoutYou.mp4', 1), {
    id: '1', title: 'Here Without You', artist: '3 Doors Down', code: null, format: 'MP4'
  });
  assert.equal(parseFilename('001 - Legião Urbana - Tempo Perdido.MKV', 2).code, '001');
  assert.equal(parseFilename('Uma música.mp4', 3).artist, '');
  assert.equal(parseFilename('Artista - Uma - Música.mp4', 4).title, 'Uma - Música');
});

test('busca ignora acentos, ordem das palavras e pequenos erros; filtra artista e título', () => {
  const index = indexSongs([
    parseFilename('001-Legião Urbana-Tempo Perdido.mp4', 1),
    parseFilename('3DoorsDown-HereWithoutYou.mp4', 2),
    parseFilename('Chitãozinho & Xororó-Evidências.mp4', 3)
  ]);
  assert.equal(searchSongs(index, 'legiao perdido')[0].title, 'Tempo Perdido');
  assert.equal(searchSongs(index, 'you here')[0].artist, '3 Doors Down');
  assert.equal(searchSongs(index, 'evidencias')[0].title, 'Evidências');
  assert.equal(searchSongs(index, 'perdodo')[0].title, 'Tempo Perdido');
  assert.equal(searchSongs(index, '001')[0].code, '001');
  assert.equal(searchSongs(index, 'legiao', 'title').length, 0);
  assert.equal(searchSongs(index, 'legiao', 'artist').length, 1);
  assert.equal(searchSongs(index, 'zzzzzzzz').length, 0);
});

test('varre subpastas sem abrir vídeos, ignora outros arquivos e links simbólicos', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'music-catalog-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'coleção'));
  await fs.writeFile(path.join(root, 'coleção', 'Banda-Musica.mp4'), 'video');
  await fs.writeFile(path.join(root, 'notas.txt'), 'ignorar');
  await fs.symlink(path.join(root, 'coleção'), path.join(root, 'link'), process.platform === 'win32' ? 'junction' : 'dir');
  const songs = await scanDirectory(root);
  assert.equal(songs.length, 1);
  assert.equal(songs[0].title, 'Musica');
  assert.ok(!JSON.stringify(songs).includes(root));
});
