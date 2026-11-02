import { pressFromPointer } from './button-press';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

it('presses on a primary pointer down and releases when the pointer ends', () => {
  expect(pressFromPointer({ button: 0, type: 'pointerdown' }, false)).toBe(true);
  expect(pressFromPointer({ button: 2, type: 'pointerdown' }, false)).toBe(false);
  expect(pressFromPointer({ button: 0, type: 'pointerdown' }, true)).toBe(false);
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
    expect(pressFromPointer({ type, button: 0 }, false)).toBe(false);
  }
  expect(pressFromPointer({ button: 0, type: 'click' }, false)).toBeNull();
});

function ruleBody(css: string, selector: string) {
  const start = css.indexOf(selector);
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  return css.slice(open + 1, close);
}

it('keeps button hover and press feedback on the shared button class', () => {
  const css = readFileSync('src/styles.css', 'utf8');
  expect(css).toMatch(/@custom-variant fine-hover\s*\{[^}]*@media \(hover: hover\) and \(pointer: fine\)/);
  const targets = /\.(header-play|language-trigger|game-primary|game-secondary|move-notation)|replay-controls button|feature-page button|board-tools \.game-secondary/;
  let header = '';
  const applies: string[] = [];
  for (const line of css.split('\n')) {
    if (line.includes('@apply')) {
      if (targets.test(header)) applies.push(line);
    } else if (line.includes('{')) header = line;
  }
  expect(applies.length).toBeGreaterThan(0);
  for (const line of applies) expect(line).not.toMatch(/(?<![\w-])hover:/);
  const button = ruleBody(css, '.ui-button {');
  expect(button).toMatch(/-webkit-tap-highlight-color:\s*transparent/);
  expect(button).toMatch(/touch-action:\s*manipulation/);
  expect(button).toMatch(/user-select:\s*none/);
  expect(ruleBody(css, ".ui-button[data-pressed='true']:not(:disabled):not([aria-disabled='true'])")).toMatch(/opacity:\s*0?\.72/);
});

it('routes every button through the shared component', () => {
  const files = walk('src').filter((file) => file.endsWith('.tsx'));
  const raw = files.filter((file) =>
    /<button[\s/>]|<motion\.button/.test(readFileSync(file, 'utf8')),
  );
  const base = files.filter((file) =>
    readFileSync(file, 'utf8').includes("from '@base-ui/react/button'"),
  );
  expect(raw.map((file) => file.replaceAll('\\', '/'))).toEqual(['src/components/button.tsx']);
  expect(base.map((file) => file.replaceAll('\\', '/'))).toEqual(['src/components/button.tsx']);
});
