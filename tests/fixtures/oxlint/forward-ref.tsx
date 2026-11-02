import { forwardRef } from 'react';

interface ButtonProps {
  label: string;
}

export const Button = forwardRef(function Button({ label }: ButtonProps, ref: unknown) {
  return <button ref={ref as never}>{label}</button>;
});
