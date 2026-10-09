const search = document.querySelector('#search');
const songsList = document.querySelector('#songs');
const description = document.querySelector('#result-description');
const refreshButton = document.querySelector('#refresh');
const moreButton = document.querySelector('#load-more');
const notice = document.querySelector('#notice');
let field = 'all';
let loaded = 0;
let controller;
let debounce;
let requestNumber = 0;

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderSong(song) {
  const card = element('li', 'song-card');
  const icon = element('span', 'song-icon', '♫');
  icon.setAttribute('aria-hidden', 'true');
  const content = element('div', 'song-content');
  const title = element('h3', 'song-title', song.title);
  const artist = element('p', 'song-artist', song.artist || 'Artista não informado');
  const meta = element('div', 'song-meta');
  meta.append(element('span', 'available', 'No repertório'), element('span', 'song-code', song.code ? `Cód. ${song.code}` : song.format));
  content.append(title, artist, meta);
  card.append(icon, content);
  return card;
}

async function loadSongs({ append = false, refresh = false, quiet = false } = {}) {
  clearTimeout(debounce);
  debounce = null;
  controller?.abort();
  controller = new AbortController();
  const currentRequest = ++requestNumber;
  const q = search.value.trim();
  const params = new URLSearchParams({ q, field, offset: append ? String(loaded) : '0', limit: '24' });
  if (refresh) params.set('refresh', '1');
  songsList.setAttribute('aria-busy', 'true');
  refreshButton.disabled = true;
  moreButton.disabled = true;
  if (!quiet) description.textContent = 'Consultando o repertório…';
  try {
    const response = await fetch(`/api/songs?${params}`, { signal: controller.signal });
    if (!response.ok) throw new Error('Falha na consulta');
    const data = await response.json();
    if (currentRequest !== requestNumber) return;
    if (!append) { songsList.replaceChildren(); loaded = 0; }
    songsList.append(...data.songs.map(renderSong));
    loaded += data.songs.length;
    document.querySelector('#count').textContent = data.total.toLocaleString('pt-BR');
    document.querySelector('#catalog-title').firstChild.textContent = q ? 'Resultados da busca' : 'Explore o repertório';
    description.textContent = q
      ? `${data.total} ${data.total === 1 ? 'música encontrada' : 'músicas encontradas'} para “${q}”`
      : `${data.catalogTotal.toLocaleString('pt-BR')} ${data.catalogTotal === 1 ? 'música disponível' : 'músicas disponíveis'} para o seu próximo show.`;
    document.querySelector('#empty').hidden = data.total !== 0;
    document.querySelector('#empty-title').textContent = q ? 'Ainda não encontramos essa música' : 'O repertório está esperando as primeiras músicas';
    document.querySelector('#empty-description').textContent = q ? 'Tente outro trecho do nome ou procure pelo artista.' : 'Assim que a equipe adicionar vídeos à pasta, eles aparecerão aqui.';
    document.querySelector('#clear-search').hidden = !q;
    moreButton.hidden = loaded >= data.total;
    document.querySelector('#updated').textContent = `${data.stale ? 'Última consulta' : 'Atualizado'} às ${new Date(data.updatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
    document.querySelector('#catalog-dot').classList.toggle('warning', data.stale);
    notice.hidden = !data.demo && !data.stale;
    notice.textContent = data.stale
      ? 'A pasta de músicas está indisponível. Estamos mostrando o último catálogo consultado; novas músicas aparecerão quando a conexão for restabelecida.'
      : 'Modo de demonstração: este repertório é um exemplo. Na máquina do bar, a lista será montada a partir da pasta de vídeos.';
  } catch (error) {
    if (error.name === 'AbortError' || currentRequest !== requestNumber) return;
    description.textContent = 'Não foi possível consultar o catálogo. Confira a conexão com o Wi-Fi do bar e tente atualizar.';
    notice.hidden = false;
    notice.textContent = 'Sem conexão com o catálogo. Os resultados anteriores podem estar desatualizados.';
    document.querySelector('#catalog-dot').classList.add('warning');
  } finally {
    if (currentRequest === requestNumber) {
      songsList.setAttribute('aria-busy', 'false');
      refreshButton.disabled = false;
      moreButton.disabled = false;
    }
  }
}

document.querySelector('#search-form').addEventListener('submit', event => { event.preventDefault(); loadSongs(); });
search.addEventListener('input', () => {
  clearTimeout(debounce);
  // Immediately invalidate in-flight results so they cannot replace the new query.
  controller?.abort();
  requestNumber++;
  debounce = setTimeout(() => loadSongs(), 250);
});
document.querySelectorAll('[data-field]').forEach(button => button.addEventListener('click', () => {
  field = button.dataset.field;
  document.querySelectorAll('[data-field]').forEach(filter => {
    const selected = filter.dataset.field === field;
    filter.classList.toggle('active', selected);
    filter.setAttribute('aria-pressed', String(selected));
  });
  loadSongs();
}));
refreshButton.addEventListener('click', () => loadSongs({ refresh: true }));
moreButton.addEventListener('click', () => loadSongs({ append: true }));
document.querySelector('#clear-search').addEventListener('click', () => { search.value = ''; field = 'all'; document.querySelector('[data-field="all"]').click(); search.focus(); });
setInterval(() => {
  if (!document.hidden && !debounce && !refreshButton.disabled) loadSongs({ refresh: true, quiet: true });
}, 30000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && !refreshButton.disabled) loadSongs({ refresh: true });
});
loadSongs();

const dialog = document.querySelector('#suggestion-dialog');
const suggestionForm = document.querySelector('#suggestion-form');
const feedback = document.querySelector('#suggestion-feedback');
const sendSuggestion = document.querySelector('#send-suggestion');
let submitting = false;
document.querySelector('#open-suggestion').addEventListener('click', () => {
  feedback.textContent = '';
  feedback.classList.remove('error');
  dialog.showModal();
});
document.querySelector('#close-suggestion').addEventListener('click', () => dialog.close());
suggestionForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (submitting) return;
  const title = document.querySelector('#suggestion-song').value.trim();
  const artist = document.querySelector('#suggestion-artist').value.trim();
  if (title.length < 2 || artist.length < 2) {
    feedback.classList.add('error');
    feedback.textContent = 'Informe o nome da música e do cantor ou banda.';
    return;
  }
  submitting = true;
  sendSuggestion.disabled = true;
  feedback.classList.remove('error');
  feedback.textContent = 'Enviando sua sugestão…';
  try {
    const response = await fetch('/api/suggestions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, artist })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Não foi possível enviar a sugestão.');
    feedback.textContent = result.message;
    suggestionForm.reset();
  } catch (error) {
    feedback.classList.add('error');
    feedback.textContent = error.message === 'Failed to fetch' ? 'Confira a conexão com o Wi-Fi do bar e tente novamente.' : error.message;
  } finally {
    submitting = false;
    sendSuggestion.disabled = false;
  }
});
