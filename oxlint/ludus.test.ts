import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';

function lint(file: string): string {
  try {
    execFileSync(
      'pnpm',
      ['exec', 'oxlint', '--config', 'tests/fixtures/ludus-oxlint.json', '--format', 'unix', file],
      { encoding: 'utf8' },
    );
    return '';
  } catch (error) {
    const failed = error as { stdout?: string; stderr?: string };
    return `${failed.stdout ?? ''}\n${failed.stderr ?? ''}`;
  }
}

it('rejects an inline props type', () => {
  expect(lint('tests/fixtures/oxlint/inline-props.tsx')).toContain('interface ShareProfileProps');
});

it('rejects a local props type alias', () => {
  expect(lint('tests/fixtures/oxlint/type-alias-props.tsx')).toContain('interface PanelProps');
});

it('rejects a lowercase component name', () => {
  expect(lint('tests/fixtures/oxlint/lowercase-component.tsx')).toContain('PascalCase');
});

it('rejects more than five props on a local interface', () => {
  expect(lint('tests/fixtures/oxlint/too-many-props.tsx')).toContain('5');
});

it('rejects forwardRef', () => {
  expect(lint('tests/fixtures/oxlint/forward-ref.tsx')).toContain('ref as a prop');
});

it('rejects a second component parameter', () => {
  expect(lint('tests/fixtures/oxlint/second-parameter.tsx')).toContain('one props argument');
});

it('counts destructured imported props and ignores rest', () => {
  expect(lint('tests/fixtures/oxlint/imported-too-many.tsx')).toContain('5');
});

it('accepts a separate props interface, an imported type, and inline arrows', () => {
  expect(lint('tests/fixtures/oxlint/valid.tsx')).toBe('');
});
