const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');

function walk(dir) {
  const files = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory() && !['node_modules', '.git', 'dist'].includes(e.name)) files.push(...walk(full));
    else if (e.isFile() && /\.(jsx|tsx|js|ts)$/.test(e.name)) files.push(full);
  }
  return files;
}

const files = walk(SRC);
const problems = [];

for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const dir = path.dirname(f);
  const imports = [...src.matchAll(/from\s+['"](\.[^'"]+)['"]/g)].map(m => m[1]);
  for (const imp of imports) {
    const base = path.resolve(dir, imp);
    const exts = ['', '.js', '.jsx', '.ts', '.tsx', '/index.js', '/index.jsx', '/index.ts', '/index.tsx'];
    const exists = exts.some(ext => fs.existsSync(base + ext));
    if (!exists) {
      const rel = path.relative(SRC, f).split(path.sep).join('/');
      problems.push('BROKEN: ' + rel + '  ->  ' + imp);
    }
  }
}

if (problems.length === 0) {
  console.log('All local import paths resolve correctly');
} else {
  problems.forEach(p => console.log(p));
  console.log('\n' + problems.length + ' broken path(s)');
}
