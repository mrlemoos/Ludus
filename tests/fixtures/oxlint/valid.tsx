import type { ButtonProps } from '@base-ui/react/button';

interface PanelProps {
  title: string;
  children: string;
}

export function Panel({ title, children }: PanelProps) {
  return (
    <section>
      {title}
      {children}
    </section>
  );
}

export function Empty() {
  return <div />;
}

export function Button({ a, b, c, d, e, ...rest }: ButtonProps) {
  return (
    <button {...rest}>
      {a}
      {b}
      {c}
      {d}
      {e}
    </button>
  );
}

function useThing() {
  return <div />;
}

export function List() {
  const ids = ['a'];
  return (
    <ul>
      {ids.map((id) => (
        <li key={id}>{id}</li>
      ))}
    </ul>
  );
}

void useThing;
