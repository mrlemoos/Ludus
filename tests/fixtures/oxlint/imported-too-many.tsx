import type { ButtonProps } from '@base-ui/react/button';

export function Button({ a, b, c, d, e, f, ...rest }: ButtonProps) {
  return (
    <button {...rest}>
      {a}
      {b}
      {c}
      {d}
      {e}
      {f}
    </button>
  );
}
