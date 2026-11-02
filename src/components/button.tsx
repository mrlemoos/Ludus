import { pressFromPointer } from './button-press';
import { Button as BaseButton } from '@base-ui/react/button';
import type { ButtonProps } from '@base-ui/react/button';
import { motion } from 'motion/react';
import type { HTMLMotionProps } from 'motion/react';
import { useState } from 'react';
import type { PointerEvent } from 'react';

function trackPress(
  setPressed: (pressed: boolean) => void,
  event: { type: string; button?: number },
  disabled: boolean,
) {
  const next = pressFromPointer(event, disabled);
  if (next !== null) {setPressed(next);}
}

function buttonClass(className?: string) {
  return ['ui-button', className].filter(Boolean).join(' ');
}

export function Button({ className, disabled, ref, ...props }: ButtonProps) {
  const [pressed, setPressed] = useState(false);
  const off = Boolean(disabled);
  const { onPointerDown, onPointerUp, onPointerCancel, onPointerLeave, ...rest } = props;
  return (
    <BaseButton
      {...rest}
      ref={ref}
      disabled={disabled}
      data-pressed={pressed && !off ? 'true' : undefined}
      className={
        typeof className === 'function'
          ? (state) => buttonClass(className(state))
          : buttonClass(className)
      }
      onPointerDown={(event) => {
        trackPress(setPressed, event, off);
        onPointerDown?.(event);
      }}
      onPointerUp={(event) => {
        trackPress(setPressed, event, off);
        onPointerUp?.(event);
      }}
      onPointerCancel={(event) => {
        trackPress(setPressed, event, off);
        onPointerCancel?.(event);
      }}
      onPointerLeave={(event) => {
        trackPress(setPressed, event, off);
        onPointerLeave?.(event);
      }}
    />
  );
}

export function MotionButton({
  className,
  disabled,
  type,
  ref,
  ...props
}: HTMLMotionProps<'button'>) {
  const [pressed, setPressed] = useState(false);
  const off = Boolean(disabled);
  const { onPointerDown, onPointerUp, onPointerCancel, onPointerLeave, ...rest } = props;
  function track(event: PointerEvent<HTMLButtonElement>) {
    trackPress(setPressed, event, off);
  }
  return (
    <motion.button
      {...rest}
      ref={ref}
      type={type ?? 'button'}
      disabled={off}
      data-pressed={pressed && !off ? 'true' : undefined}
      className={buttonClass(typeof className === 'string' ? className : undefined)}
      onPointerDown={(event) => {
        track(event);
        onPointerDown?.(event);
      }}
      onPointerUp={(event) => {
        track(event);
        onPointerUp?.(event);
      }}
      onPointerCancel={(event) => {
        track(event);
        onPointerCancel?.(event);
      }}
      onPointerLeave={(event) => {
        track(event);
        onPointerLeave?.(event);
      }}
    />
  );
}
