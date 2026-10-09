const path = require('node:path');
const { networkAddresses, selectAddress, exportQr } = require('../lib/qr-export');

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--list') { console.log(JSON.stringify(networkAddresses())); return; }
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--host', '--port', '--output'].includes(args[i]) || !args[i + 1]) throw new Error('Uso: node scripts/export-qr.js [--host IP] [--port 3000] [--output pasta]');
    options[args[i].slice(2)] = args[i + 1];
  }
  const host = selectAddress(options.host || process.env.PUBLIC_HOST);
  const result = await exportQr({ host, port: Number(options.port || process.env.PORT || 3000), directory: options.output || path.join(process.env.DATA_DIR || path.join(__dirname, '..', 'data'), 'qr') });
  console.log(JSON.stringify(result));
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
