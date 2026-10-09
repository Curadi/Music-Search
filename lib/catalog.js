const fs = require('node:fs/promises');
const path = require('node:path');

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.webm', '.mpeg', '.mpg', '.m4v', '.flv', '.vob', '.ts']);
const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });

function normalize(value) {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function parseFilename(filename, id) {
  const format = path.extname(filename).slice(1).toUpperCase();
  const stem = path.basename(filename, path.extname(filename)).replace(/_/g, ' ').trim();
  const parts = stem.split(/\s*[-–—]\s*/);
  const code = /^\d+$/.test(parts[0]) && parts.length > 1 ? parts.shift() : null;
  const readable = value => value.replace(/([a-zà-ÿ0-9])([A-ZÀ-Ý])/g, '$1 $2').trim();
  const artist = parts.length > 1 ? readable(parts.shift()) : '';
  const title = readable(parts.join(' - ') || stem);
  return { id: String(id), title, artist, code, format };
}

async function scanDirectory(directory) {
  const songs = [];
  async function walk(folder) {
    const entries = await fs.readdir(folder, { withFileTypes: true });
    entries.sort((a, b) => collator.compare(a.name, b.name));
    for (const entry of entries) {
      // Symlinks are deliberately ignored, including links to files outside the collection.
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) await walk(path.join(folder, entry.name));
      else if (entry.isFile() && VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        songs.push(parseFilename(entry.name, songs.length + 1));
      }
    }
  }
  await walk(directory);
  return songs.sort((a, b) => collator.compare(a.title, b.title) || collator.compare(a.artist, b.artist));
}

function indexSongs(songs) {
  return songs.map(song => ({
    song,
    title: normalize(song.title),
    artist: normalize(song.artist),
    all: normalize(`${song.title} ${song.artist} ${song.code || ''}`)
  }));
}

function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] !== b[j - 1]));
    }
    if (Math.min(...current) > max) return max + 1;
    previous = current;
  }
  return previous[b.length];
}

function searchSongs(index, query = '', field = 'all') {
  const normalized = normalize(query);
  if (!normalized) return index.map(item => item.song);
  const tokens = normalized.split(' ');
  const results = [];
  for (const item of index) {
    const text = item[field];
    const words = text.split(' ');
    let score = text === normalized ? 100 : text.includes(normalized) ? 60 : 0;
    let matches = true;
    for (const token of tokens) {
      if (words.includes(token)) score += 15;
      else if (text.includes(token)) score += 8;
      else {
        const max = token.length >= 8 ? 2 : token.length >= 4 ? 1 : 0;
        if (max && words.some(word => editDistance(token, word, max) <= max)) score += 2;
        else { matches = false; break; }
      }
    }
    if (matches) results.push({ song: item.song, score });
  }
  results.sort((a, b) => b.score - a.score || collator.compare(a.song.title, b.song.title) || collator.compare(a.song.artist, b.song.artist));
  return results.map(item => item.song);
}

module.exports = { scanDirectory, parseFilename, normalize, indexSongs, searchSongs };
