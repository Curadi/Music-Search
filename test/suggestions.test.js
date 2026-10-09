const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const ExcelJS = require('exceljs');
const { createSuggestionStore } = require('../lib/suggestions');

test('exporta Excel às 02:00 de Brasília, preserva texto e não duplica ao reiniciar', async t => {
  const dataDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'music-suggestions-'));
  t.after(() => fs.rm(dataDirectory, { recursive: true, force: true }));
  let date = new Date('2026-10-08T04:59:00Z'); // 01:59 em Brasília.
  const now = () => date;
  let store = await createSuggestionStore({ dataDirectory, now });
  await Promise.all([
    store.add({ title: 'Here Without You', artist: '3 Doors Down' }),
    store.add({ title: '=1+1', artist: 'Cantor com acentuação' })
  ]);
  assert.deepEqual(await store.exportDue(), []);
  date = new Date('2026-10-08T05:00:00Z');
  const files = await store.exportDue();
  assert.equal(files.length, 1);
  assert.equal(path.basename(files[0]), 'sugestoes-2026-10-08.xlsx');
  const book = new ExcelJS.Workbook();
  await book.xlsx.readFile(files[0]);
  const sheet = book.getWorksheet('Sugestões');
  assert.equal(sheet.rowCount, 3);
  assert.equal(sheet.getCell('A2').value, 'Here Without You');
  assert.equal(sheet.getCell('B2').value, '3 Doors Down');
  assert.equal(sheet.getCell('A3').type, ExcelJS.ValueType.String);
  assert.equal(sheet.getCell('A3').value, '=1+1');
  store = await createSuggestionStore({ dataDirectory, now });
  assert.deepEqual(await store.exportDue(), []);
  await store.add({ title: 'Música depois das duas', artist: 'Outra Banda' });
  assert.deepEqual(await store.exportDue(), []);
  date = new Date('2026-10-09T05:01:00Z');
  const next = await store.exportDue();
  assert.equal(path.basename(next[0]), 'sugestoes-2026-10-09.xlsx');
});

test('recupera exportações pendentes após dias desligado, incluindo virada de mês', async t => {
  const dataDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'music-catchup-'));
  t.after(() => fs.rm(dataDirectory, { recursive: true, force: true }));
  let date = new Date('2026-10-31T23:00:00Z');
  const now = () => date;
  const store = await createSuggestionStore({ dataDirectory, now });
  await store.add({ title: 'Música da noite', artist: 'Banda do bar' });
  date = new Date('2026-11-03T15:00:00Z');
  const restarted = await createSuggestionStore({ dataDirectory, now });
  const files = await restarted.exportDue();
  assert.equal(path.basename(files[0]), 'sugestoes-2026-11-01.xlsx');
  assert.deepEqual(await restarted.exportDue(), []);
});

test('não sobrescreve dados corrompidos', async t => {
  const dataDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'music-corrupt-'));
  t.after(() => fs.rm(dataDirectory, { recursive: true, force: true }));
  await fs.writeFile(path.join(dataDirectory, 'suggestions.json'), 'dados antigos inválidos');
  await assert.rejects(createSuggestionStore({ dataDirectory }));
  assert.equal(await fs.readFile(path.join(dataDirectory, 'suggestions.json'), 'utf8'), 'dados antigos inválidos');
});
