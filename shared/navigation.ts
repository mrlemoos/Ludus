export function playReturnPath(value: unknown): string {
  return typeof value === 'string' && /^\/online\?invite=[0-9a-f-]{36}$/.test(value)
    ? value
    : '/play';
}
