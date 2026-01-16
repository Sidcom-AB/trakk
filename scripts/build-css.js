import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import CleanCSS from 'clean-css';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const srcPath = path.join(__dirname, '../src/timeline.css');
const distPath = path.join(__dirname, '../dist/timeline.css');

// Ensure dist directory exists
const distDir = path.dirname(distPath);
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Read source CSS
const sourceCSS = fs.readFileSync(srcPath, 'utf8');

// Minify
const minified = new CleanCSS({
  level: 2,
  sourceMap: true
}).minify(sourceCSS);

if (minified.errors.length > 0) {
  console.error('CSS minification errors:', minified.errors);
  process.exit(1);
}

if (minified.warnings.length > 0) {
  console.warn('CSS minification warnings:', minified.warnings);
}

// Write minified CSS
fs.writeFileSync(distPath, minified.styles);

// Write source map
fs.writeFileSync(distPath + '.map', minified.sourceMap.toString());

console.log(`CSS built: ${distPath}`);
console.log(`  Original: ${sourceCSS.length} bytes`);
console.log(`  Minified: ${minified.styles.length} bytes`);
console.log(`  Reduction: ${((1 - minified.styles.length / sourceCSS.length) * 100).toFixed(1)}%`);
