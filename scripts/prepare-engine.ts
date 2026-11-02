import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
const require = createRequire(import.meta.url);
const root = dirname(require.resolve('stockfish/package.json'));
mkdirSync('public/engine', { recursive: true });
for (const file of ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm'])
  copyFileSync(join(root, 'bin', file), join('public/engine', file));
copyFileSync(join(root, 'Copying.txt'), 'public/engine/Copying.txt');

writeFileSync(
  'public/engine/SOURCE.txt',
  'Stockfish.js 19.0.1, GPLv3\nSource and build instructions: https://github.com/nmrugg/stockfish.js/tree/0d5dd7944f88c817c07a26bc4fb1905d5f9c46d6\nSource archive: https://github.com/nmrugg/stockfish.js/archive/0d5dd7944f88c817c07a26bc4fb1905d5f9c46d6.tar.gz\nLicence: /engine/Copying.txt\nUnmodified lite single-threaded engine from stockfish npm 19.0.1.\n',
);
