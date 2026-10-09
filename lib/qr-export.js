const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { randomUUID } = require('node:crypto');
const QRCode = require('qrcode');

function networkAddresses(interfaces = os.networkInterfaces()) {
  const addresses = [];
  for (const [name, entries] of Object.entries(interfaces)) {
    for (const entry of entries || []) {
      if (entry.family !== 'IPv4' || entry.internal || !isPrivateIPv4(entry.address)) continue;
      if (!addresses.some(item => item.address === entry.address)) addresses.push({ name, address: entry.address });
    }
  }
  return addresses;
}

function isPrivateIPv4(value) {
  if (net.isIP(value) !== 4) return false;
  const parts = value.split('.').map(Number);
  return parts[0] === 10 || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168);
}

function publicUrl(host, port = 3000) {
  if (!isPrivateIPv4(host)) throw new Error('Escolha um IPv4 da rede local (10.x, 172.16–31.x ou 192.168.x); localhost não funciona nos celulares.');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Porta inválida para o QR Code.');
  return `http://${host}:${port}/`;
}

function selectAddress(requested, addresses = networkAddresses()) {
  if (requested) {
    if (!addresses.some(item => item.address === requested)) throw new Error('O IP escolhido não está ativo neste computador. Selecione novamente a rede do bar.');
    return requested;
  }
  if (addresses.length === 1) return addresses[0].address;
  if (!addresses.length) throw new Error('Nenhum IPv4 privado encontrado. Conecte o computador à rede do bar.');
  throw new Error('Mais de um IP disponível. Selecione a rede do bar com o exportador ou configure PUBLIC_HOST.');
}

function posterSvg(url, qr) {
  const size = qr.modules.size;
  const squares = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (qr.modules.get(y, x)) squares.push(`M${x + 4} ${y + 4}h1v1h-1z`);
  }
  // URL is built exclusively from a validated IPv4 and port; no arbitrary XML input.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600" viewBox="0 0 1200 1600">
<rect width="1200" height="1600" fill="#f7f5f0"/>
<rect x="70" y="70" width="1060" height="1460" rx="40" fill="#fffefa" stroke="#e3e1d8" stroke-width="3"/>
<g text-anchor="middle" font-family="Arial, Helvetica, sans-serif" fill="#292b2a">
<text x="600" y="200" font-size="45" font-weight="700">musicsearch<tspan fill="#7552cb">.</tspan></text>
<text x="600" y="300" font-size="24" letter-spacing="5" fill="#7552cb">O PALCO É SEU</text>
<text x="600" y="390" font-size="58" font-weight="700">Qual música você</text>
<text x="600" y="462" font-size="58" font-weight="700">vai cantar hoje?</text>
<text x="600" y="545" font-size="29" fill="#73756e">Conecte-se ao Wi-Fi do bar e leia o QR Code.</text>
<svg x="260" y="620" width="680" height="680" viewBox="0 0 ${size + 8} ${size + 8}" shape-rendering="crispEdges"><rect width="${size + 8}" height="${size + 8}" fill="#ffffff"/><path d="${squares.join('')}" fill="#000000"/></svg>
<text x="600" y="1375" font-size="30">Consulte o repertório pelo seu celular.</text>
<text x="600" y="1432" font-size="24" fill="#73756e">${url}</text>
</g></svg>\n`;
}

async function writeAtomic(file, content) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try { await fs.writeFile(temporary, content); await fs.rename(temporary, file); }
  finally { await fs.rm(temporary, { force: true }); }
}

async function exportQr({ host, port = 3000, directory }) {
  const url = publicUrl(host, port);
  if (!directory) throw new Error('Informe a pasta de saída do QR Code.');
  const qr = QRCode.create(url, { errorCorrectionLevel: 'M' });
  const png = await QRCode.toBuffer(url, { type: 'png', width: 1024, margin: 4, errorCorrectionLevel: 'M', color: { dark: '#000000ff', light: '#ffffffff' } });
  await fs.mkdir(directory, { recursive: true });
  const pngFile = path.join(directory, 'qr-code.png');
  const posterFile = path.join(directory, 'cartaz-qr-code.svg');
  await writeAtomic(pngFile, png);
  await writeAtomic(posterFile, posterSvg(url, qr));
  await writeAtomic(path.join(directory, 'endereco.txt'), `Music Search\n${url}\n\nConecte o celular ao mesmo Wi-Fi do computador.\n`);
  return { url, pngFile, posterFile };
}

module.exports = { networkAddresses, selectAddress, publicUrl, exportQr };
