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

const pointerCases = [
  {
    name: 'presses on a primary pointer down',
    type: 'pointerdown',
    button: 0,
    disabled: false,
    expected: true,
  },
  {
    name: 'ignores a secondary pointer down',
    type: 'pointerdown',
    button: 2,
    disabled: false,
    expected: false,
  },
  {
    name: 'ignores a primary pointer down when disabled',
    type: 'pointerdown',
    button: 0,
    disabled: true,
    expected: false,
  },
  {
    name: 'releases on pointerup',
    type: 'pointerup',
    button: 0,
    disabled: false,
    expected: false,
  },
  {
    name: 'releases on pointercancel',
    type: 'pointercancel',
    button: 0,
    disabled: false,
    expected: false,
  },
  {
    name: 'releases on pointerleave',
    type: 'pointerleave',
    button: 0,
    disabled: false,
    expected: false,
  },
  {
    name: 'ignores a click',
    type: 'click',
    button: 0,
    disabled: false,
    expected: null,
  },
] as const;

it.each(pointerCases)('$name', ({ type, button, disabled, expected }) => {
  // Arrange
  const event = { type, button };

  // Act
  const pressed = pressFromPointer(event, disabled);

  // Assert
  expect(pressed).toBe(expected);
});

function ruleBody(css: string, selector: string) {
  const start = css.indexOf(selector);
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  return css.slice(open + 1, close);
}

const buttonTargets =
  /\.(header-play|language-trigger|game-primary|game-secondary|move-notation)|replay-controls button|feature-page button|board-tools \.game-secondary/;

function sharedButtonApplies(css: string) {
  let header = '';
  const applies: string[] = [];
  for (const line of css.split('\n')) {
    if (line.includes('@apply')) {
      if (buttonTargets.test(header)) {
        applies.push(line);
      }
    } else if (line.includes('{')) {
      header = line;
    }
  }
  return applies;
}

const stylesheet = readFileSync('src/styles.css', 'utf8');
const sharedApplies = sharedButtonApplies(stylesheet).map((line, index) => ({ index, line }));

it('defines fine-hover for a fine pointer', () => {
  // Arrange

  // Act
  const css = stylesheet;

  // Assert
  expect(css).toMatch(
    /@custom-variant fine-hover\s*\{[^}]*@media \(hover: hover\) and \(pointer: fine\)/,
  );
});

it('applies shared button feedback to the named controls', () => {
  // Arrange

  // Act
  const count = sharedApplies.length;

  // Assert
  expect(count).toBeGreaterThan(0);
});

it.each(sharedApplies)('shared button apply $index does not use a hover utility', ({ line }) => {
  // Arrange

  // Act
  const apply = line;

  // Assert
  expect(apply).not.toMatch(/(?<![\w-])hover:/);
});

it('suppresses native touch feedback on the shared button', () => {
  // Arrange

  // Act
  const button = ruleBody(stylesheet, '.ui-button {');

  // Assert
  expect(button).toMatch(/-webkit-tap-highlight-color:\s*transparent/);
  expect(button).toMatch(/touch-action:\s*manipulation/);
  expect(button).toMatch(/user-select:\s*none/);
});

it('dims a pressed button', () => {
  // Arrange

  // Act
  const pressed = ruleBody(
    stylesheet,
    ".ui-button[data-pressed='true']:not(:disabled):not([aria-disabled='true'])",
  );

  // Assert
  expect(pressed).toMatch(/opacity:\s*0?\.72/);
});

it('routes every button through the shared component', () => {
  // Arrange
  const files = walk('src').filter((file) => file.endsWith('.tsx'));

  // Act
  const raw = files.filter((file) =>
    /<button[\s/>]|<motion\.button/.test(readFileSync(file, 'utf8')),
  );
  const base = files.filter((file) =>
    readFileSync(file, 'utf8').includes("from '@base-ui/react/button'"),
  );

  // Assert
  expect(raw.map((file) => file.replaceAll('\\', '/'))).toEqual(['src/components/button.tsx']);
  expect(base.map((file) => file.replaceAll('\\', '/'))).toEqual(['src/components/button.tsx']);
});
