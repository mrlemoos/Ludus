export function pressFromPointer(
  event: { type: string; button?: number },
  disabled: boolean,
): boolean | null {
  if (event.type === 'pointerdown') {
    return !disabled && event.button === 0;
  }
  if (
    event.type === 'pointerup' ||
    event.type === 'pointercancel' ||
    event.type === 'pointerleave'
  ) {
    return false;
  }
  return null;
}
