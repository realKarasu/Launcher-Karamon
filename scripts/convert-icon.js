const fs   = require('fs');
const path = require('path');

const src  = path.join(__dirname, '..', 'assets', 'icon.png');
const dest = path.join(__dirname, '..', 'assets', 'icon.ico');

if (!fs.existsSync(src)) {
  console.error('assets/icon.png introuvable');
  process.exit(1);
}

const pngToIco = require('png-to-ico');
pngToIco(src)
  .then(buf => { fs.writeFileSync(dest, buf); console.log('icon.ico généré.'); })
  .catch(e  => { console.error(e); process.exit(1); });
