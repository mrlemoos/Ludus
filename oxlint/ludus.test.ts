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
  // Arrange
  const file = 'tests/fixtures/oxlint/inline-props.tsx';

  // Act
  const output = lint(file);

  // Assert
  expect(output).toContain('interface ShareProfileProps');
});

it('rejects a local props type alias', () => {
  // Arrange
  const file = 'tests/fixtures/oxlint/type-alias-props.tsx';

  // Act
  const output = lint(file);

  // Assert
  expect(output).toContain('interface PanelProps');
});

it('rejects a lowercase component name', () => {
  // Arrange
  const file = 'tests/fixtures/oxlint/lowercase-component.tsx';

  // Act
  const output = lint(file);

  // Assert
  expect(output).toContain('PascalCase');
});

it('rejects more than five props on a local interface', () => {
  // Arrange
  const file = 'tests/fixtures/oxlint/too-many-props.tsx';

  // Act
  const output = lint(file);

  // Assert
  expect(output).toContain('5');
});

it('rejects forwardRef', () => {
  // Arrange
  const file = 'tests/fixtures/oxlint/forward-ref.tsx';

  // Act
  const output = lint(file);

  // Assert
  expect(output).toContain('ref as a prop');
});

it('rejects a second component parameter', () => {
  // Arrange
  const file = 'tests/fixtures/oxlint/second-parameter.tsx';

  // Act
  const output = lint(file);

  // Assert
  expect(output).toContain('one props argument');
});

it('counts destructured imported props and ignores rest', () => {
  // Arrange
  const file = 'tests/fixtures/oxlint/imported-too-many.tsx';

  // Act
  const output = lint(file);

  // Assert
  expect(output).toContain('5');
});

it('accepts a separate props interface, an imported type, and inline arrows', () => {
  // Arrange
  const file = 'tests/fixtures/oxlint/valid.tsx';

  // Act
  const output = lint(file);

  // Assert
  expect(output).toBe('');
});
