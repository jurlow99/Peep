import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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

function parseImports(src) {
  const imported = new Set();
  const re = /import\s+(?:type\s+)?([\s\S]*?)\s+from\s+['"][^'"]+['"]/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const part = m[1].trim();
    const ns = part.match(/[*]\s+as\s+(\w+)/);
    if (ns) { imported.add(ns[1]); continue; }
    const defNamed = part.match(/^(\w+)\s*,\s*\{([\s\S]*)\}/);
    if (defNamed) {
      imported.add(defNamed[1]);
      defNamed[2].split(',').forEach(s => {
        const n = s.trim().split(/\s+as\s+/).pop().trim();
        if (/^\w+$/.test(n)) imported.add(n);
      });
      continue;
    }
    const named = part.match(/\{([\s\S]*)\}/);
    if (named) {
      named[1].split(',').forEach(s => {
        const n = s.trim().split(/\s+as\s+/).pop().trim();
        if (/^\w+$/.test(n)) imported.add(n);
      });
      continue;
    }
    if (/^\w+$/.test(part)) imported.add(part);
  }
  return imported;
}

function parseLocalDefs(src) {
  const defs = new Set();
  const patterns = [
    /^(?:export\s+(?:default\s+)?)?(?:async\s+)?(?:function[*]?|class|const|let|var)\s+(\w+)/gm,
    /^  (?:async\s+)?(?:function[*]?|const|let|var)\s+(\w+)/gm,
    /^    (?:async\s+)?(?:function[*]?|const|let|var)\s+(\w+)/gm,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(src)) !== null) defs.add(m[1]);
  }
  return defs;
}

function stripNoise(src) {
  // Remove line comments
  src = src.replace(/\/\/[^\n]*/g, ' ');
  // Remove block comments
  src = src.replace(/\/[*][\s\S]*?[*]\//g, ' ');
  // Remove string contents (leave the quotes so structure is preserved)
  // Use a simple approach: replace quoted content with empty quotes
  let result = '';
  let i = 0;
  while (i < src.length) {
    if (src[i] === '"' || src[i] === "'" || src[i] === '`') {
      const q = src[i];
      result += q;
      i++;
      while (i < src.length) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === q) { result += q; i++; break; }
        i++;
      }
    } else {
      result += src[i];
      i++;
    }
  }
  return result;
}

const BUILTINS = new Set([
  'React','useState','useEffect','useRef','useMemo','useCallback','useContext','useReducer',
  'useLayoutEffect','useId','useTransition','useDeferredValue','useInsertionEffect',
  'useImperativeHandle','useDebugValue','useSyncExternalStore','StrictMode','Component',
  'createRoot','Suspense','Fragment','createContext','forwardRef','Children','cloneElement',
  'createElement','memo','lazy','startTransition','createPortal','flushSync',
  'console','window','document','navigator','setTimeout','clearTimeout','setInterval',
  'clearInterval','Promise','JSON','Math','Date','parseInt','parseFloat','isNaN','isFinite',
  'Boolean','String','Number','Array','Object','Error','Map','Set','URL','URLSearchParams',
  'fetch','FormData','AbortController','Blob','File','FileReader','sessionStorage',
  'localStorage','history','location','alert','confirm','encodeURIComponent',
  'decodeURIComponent','atob','btoa','undefined','null','true','false','NaN','Infinity',
  'globalThis','process','require','module','exports','Deno','self','crypto','performance',
  'structuredClone','queueMicrotask','MutationObserver','ResizeObserver','IntersectionObserver',
  'requestAnimationFrame','cancelAnimationFrame','CustomEvent','Event','Symbol','Proxy',
  'Reflect','WeakMap','WeakSet','RegExp','SyntaxError','TypeError','RangeError',
  'ReferenceError','HTMLElement','Element','ArrayBuffer','DataView','WeakRef',
  'FinalizationRegistry','Int8Array','Uint8Array','Uint16Array','Int32Array',
  'Float32Array','Float64Array','SharedArrayBuffer',
]);

const allFiles = walk(SRC);

// Build export map
const exportMap = {};
for (const f of allFiles) {
  const src = fs.readFileSync(f, 'utf8');
  const names = [];
  const re1 = /^export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var)\s+(\w+)/gm;
  const re2 = /^export\s*\{([^}]+)\}/gm;
  let m;
  while ((m = re1.exec(src)) !== null) names.push(m[1]);
  while ((m = re2.exec(src)) !== null) {
    m[1].split(',').forEach(s => {
      const n = s.trim().split(/\s+as\s+/).pop().trim();
      if (n) names.push(n);
    });
  }
  exportMap[f] = names;
}

let totalFound = 0;
const seenKeys = new Set();

for (const f of allFiles) {
  const rawSrc = fs.readFileSync(f, 'utf8');
  const src = stripNoise(rawSrc);
  const imported = parseImports(rawSrc);
  const localDefs = parseLocalDefs(rawSrc);
  const allDefined = new Set([...imported, ...localDefs, ...BUILTINS]);

  const jsxUsed = [...src.matchAll(/<([A-Z]\w+)/g)].map(m => m[1]);
  const constUsed = [...src.matchAll(/\b([A-Z][A-Z0-9_]{2,})\b/g)].map(m => m[1]);
  const hookUsed = [...src.matchAll(/\b(use[A-Z]\w+)\s*[(]/g)].map(m => m[1]);
  const pascalUsed = [...src.matchAll(/\b([A-Z][a-z]\w*)\s*[(]/g)].map(m => m[1]);
  const camelUsed = [...src.matchAll(/\b([a-z][a-zA-Z]{4,})\s*[(]/g)].map(m => m[1]);

  const allUsed = new Set([...jsxUsed, ...constUsed, ...hookUsed, ...pascalUsed, ...camelUsed]);

  const missing = [];
  for (const name of allUsed) {
    if (allDefined.has(name)) continue;
    const key = f + ':' + name;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    const exportedIn = allFiles.filter(ef => ef !== f && exportMap[ef]?.includes(name));
    if (exportedIn.length > 0) {
      const sources = exportedIn.map(x => path.relative(SRC, x).replace(/\\/g, '/')).join(', ');
      missing.push(`  ✗ ${name}  →  from ${sources}`);
      totalFound++;
    }
  }

  if (missing.length > 0) {
    const rel = path.relative(SRC, f).replace(/\\/g, '/');
    console.log(`\n${rel}:`);
    missing.sort().forEach(l => console.log(l));
  }
}

console.log(totalFound === 0 ? '\n✓ All clear' : `\nTotal: ${totalFound} missing import(s)`);
