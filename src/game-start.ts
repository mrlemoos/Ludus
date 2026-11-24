export function isGuestLimitError(error: unknown) {
  return (
    !!error &&
    typeof error === 'object' &&
    'statusCode' in error &&
    error.statusCode === 403 &&
    'body' in error &&
    !!error.body &&
    typeof error.body === 'object' &&
    'error' in error.body &&
    error.body.error === 'guest_limit_reached'
  );
}
