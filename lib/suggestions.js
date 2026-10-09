const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const ExcelJS = require('exceljs');

function localDateParts(date, timezone) {
  const values = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23'
  }).formatToParts(date).map(part => [part.type, part.value]));
  return { day: `${values.year}-${values.month}-${values.day}`, hour: Number(values.hour) };
}

function shiftDay(day, offset) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

async function createSuggestionStore({ dataDirectory, timezone = 'America/Sao_Paulo', now = () => new Date() }) {
  localDateParts(now(), timezone); // Fail at startup for an invalid timezone.
  const file = path.join(dataDirectory, 'suggestions.json');
  const exportsDirectory = path.join(dataDirectory, 'exports');
  await fs.mkdir(exportsDirectory, { recursive: true });
  let records = [];
  try {
    records = JSON.parse(await fs.readFile(file, 'utf8'));
    if (!Array.isArray(records) || records.some(row =>
      typeof row.id !== 'string' || typeof row.title !== 'string' || typeof row.artist !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(row.exportDate) || !Number.isFinite(Date.parse(row.createdAt)) ||
      (row.exportedAt !== null && !Number.isFinite(Date.parse(row.exportedAt)))
    )) throw new Error('Arquivo de sugestões inválido. Preserve o arquivo e restaure um backup.');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }

  let queue = Promise.resolve();
  const serialized = operation => {
    const result = queue.then(operation);
    queue = result.catch(() => {});
    return result;
  };
  async function save(next) {
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporary, JSON.stringify(next, null, 2), { mode: 0o600 });
      await fs.rename(temporary, file);
    } finally { await fs.rm(temporary, { force: true }); }
    records = next;
  }

  function add({ title, artist }) {
    return serialized(async () => {
      const date = now();
      const local = localDateParts(date, timezone);
      const record = {
        id: randomUUID(), title, artist, createdAt: date.toISOString(),
        exportDate: local.hour < 2 ? local.day : shiftDay(local.day, 1), exportedAt: null
      };
      await save([...records, record]);
      return record.id;
    });
  }

  function exportDue() {
    return serialized(async () => {
      const local = localDateParts(now(), timezone);
      const deadline = local.hour >= 2 ? local.day : shiftDay(local.day, -1);
      const dates = [...new Set(records.filter(row => !row.exportedAt && row.exportDate <= deadline).map(row => row.exportDate))].sort();
      const written = [];
      for (const day of dates) {
        const rows = records.filter(row => row.exportDate === day);
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Music Search';
        const sheet = workbook.addWorksheet('Sugestões', { views: [{ state: 'frozen', ySplit: 1 }] });
        sheet.columns = [
          { header: 'Música', key: 'title', width: 45 },
          { header: 'Cantor ou banda', key: 'artist', width: 35 },
          { header: `Recebida em (${timezone})`, key: 'createdAt', width: 30 }
        ];
        const formatter = new Intl.DateTimeFormat('pt-BR', { timeZone: timezone, dateStyle: 'short', timeStyle: 'medium' });
        for (const row of rows) sheet.addRow({ title: row.title, artist: row.artist, createdAt: formatter.format(new Date(row.createdAt)) });
        sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7552CB' } };
        sheet.autoFilter = { from: 'A1', to: 'C1' };
        const target = path.join(exportsDirectory, `sugestoes-${day}.xlsx`);
        const temporary = `${target}.${randomUUID()}.tmp`;
        try {
          await workbook.xlsx.writeFile(temporary);
          await fs.rename(temporary, target);
        } finally { await fs.rm(temporary, { force: true }); }
        const exportedAt = now().toISOString();
        await save(records.map(row => row.exportDate === day ? { ...row, exportedAt } : row));
        written.push(target);
      }
      return written;
    });
  }
  return { add, exportDue };
}

module.exports = { createSuggestionStore, localDateParts };
