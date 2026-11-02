interface ButtonProps {
  label: string;
}

export function Button({ label }: ButtonProps, ref: unknown) {
  return <button ref={ref as never}>{label}</button>;
}
