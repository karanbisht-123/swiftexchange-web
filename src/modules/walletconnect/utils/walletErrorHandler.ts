export function extractErrorMessage(error: any): string {
  if (!error) return 'Something went wrong, please try again in a moment.';
  if (typeof error === 'string') return error;

  const msg =
    error?.info?.error?.message || error?.shortMessage || error?.message || error?.cause?.message;

  if (!msg || msg.includes('UNKNOWN_ERROR') || msg.includes('could not coalesce error')) {
    return 'Something went wrong, please try again in a moment.';
  }
  return msg;
}

export function isUserRejection(error: any): boolean {
  if (!error) return false;

  const msg = extractErrorMessage(error).toLowerCase();

  return (
    error?.code === 4001 ||
    error?.code === 'ACTION_REJECTED' ||
    msg.includes('reject') ||
    msg.includes('denied') ||
    msg.includes('user closed modal') ||
    msg.includes('signature_timeout')
  );
}
