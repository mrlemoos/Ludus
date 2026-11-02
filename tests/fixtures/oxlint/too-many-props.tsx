interface BoardProps {
  a: string;
  b: string;
  c: string;
  d: string;
  e: string;
  f: string;
}

export function Board({ a }: BoardProps) {
  return <div>{a}</div>;
}
