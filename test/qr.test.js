const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { PNG } = require('pngjs');
const jsQR = require('jsqr');
const { networkAddresses, selectAddress, publicUrl, exportQr } = require('../lib/qr-export');

test('identifica IPv4 privados sem escolher localhost, IPv6, APIPA ou IP público', () => {
  const entries = networkAddresses({
    wifi: [{ address: '192.168.1.50', family: 'IPv4', internal: false }],
    duplicate: [{ address: '192.168.1.50', family: 'IPv4', internal: false }],
    loopback: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
    ipv6: [{ address: 'fe80::1', family: 'IPv6', internal: false }],
    apipa: [{ address: '169.254.1.2', family: 'IPv4', internal: false }],
    public: [{ address: '8.8.8.8', family: 'IPv4', internal: false }]
  });
  assert.deepEqual(entries, [{ address: '192.168.1.50', name: 'wifi' }]);
  assert.equal(selectAddress(undefined, entries), '192.168.1.50');
  assert.throws(() => selectAddress('192.168.1.51', entries), /não está ativo/);
  assert.throws(() => selectAddress(undefined, [...entries, { name: 'vpn', address: '10.1.1.1' }]), /Mais de um IP/);
  assert.throws(() => selectAddress(undefined, []), /Nenhum IPv4/);
});

test('recusa localhost, URLs arbitrárias e portas inválidas no QR Code', () => {
  for (const host of ['localhost', '127.0.0.1', '0.0.0.0', 'https://example.com', '<script>', '192.168.1.500']) {
    assert.throws(() => publicUrl(host), /IPv4/);
  }
  for (const port of [0, 65536, 1.5, NaN]) assert.throws(() => publicUrl('10.0.0.2', port), /Porta/);
  assert.equal(publicUrl('172.20.0.2', 4000), 'http://172.20.0.2:4000/');
});

test('exporta PNG legível por decoder independente, cartaz e endereço; atualiza o IP nos arquivos', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'music-qr-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  let files = await exportQr({ host: '192.168.1.50', directory });
  let png = PNG.sync.read(await fs.readFile(files.pngFile));
  let decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  assert.equal(decoded.data, 'http://192.168.1.50:3000/');
  assert.equal(png.width, 1024);
  const svg = await fs.readFile(files.posterFile, 'utf8');
  assert.ok(svg.includes('Conecte-se ao Wi-Fi do bar'));
  assert.ok(svg.includes(files.url));
  assert.ok(!svg.includes('<image')); // No external image/font dependencies.
  assert.ok((await fs.readFile(path.join(directory, 'endereco.txt'), 'utf8')).includes(files.url));
  files = await exportQr({ host: '10.0.0.20', port: 4000, directory });
  png = PNG.sync.read(await fs.readFile(files.pngFile));
  decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  assert.equal(decoded.data, 'http://10.0.0.20:4000/');
  assert.ok(!(await fs.readdir(directory)).some(file => file.endsWith('.tmp')));
});

test('CLI lista redes sem gravar dados e rejeita IP que não pertence ao computador', () => {
  const script = path.join(__dirname, '..', 'scripts', 'export-qr.js');
  const addresses = JSON.parse(execFileSync(process.execPath, [script, '--list'], { encoding: 'utf8' }));
  assert.ok(Array.isArray(addresses));
  assert.throws(() => execFileSync(process.execPath, [script, '--host', '127.0.0.1'], { stdio: 'pipe' }));
});
