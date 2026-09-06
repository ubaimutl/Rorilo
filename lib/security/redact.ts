const SECRET_VALUE_KEYS = [
  'apiKey',
  'apiToken',
  'clientSecret',
  'refreshToken',
  'accessToken',
  'password',
  'token',
];

const SECRET_TOKEN_PATTERNS = [
  /\bvck_[A-Za-z0-9_-]+\b/g,
  /\bsk-[A-Za-z0-9_-]+\b/g,
  /\bsk_[A-Za-z0-9_-]+\b/g,
  /\bpk_[A-Za-z0-9_-]+\b/g,
  /\bapify_api_[A-Za-z0-9_-]+\b/g,
];

export function redactSecrets(value: unknown): string {
  let text = value instanceof Error ? value.message : String(value ?? '');
  for (const key of SECRET_VALUE_KEYS) {
    const quoted = new RegExp(`(${key}\\s*:\\s*")[^"]*(")`, 'gi');
    const jsonQuoted = new RegExp(`("${key}"\\s*:\\s*")[^"]*(")`, 'gi');
    text = text.replace(quoted, '$1[redacted]$2').replace(jsonQuoted, '$1[redacted]$2');
  }
  for (const pattern of SECRET_TOKEN_PATTERNS) {
    text = text.replace(pattern, '[redacted]');
  }
  return text;
}

export function publicSettingsError(error: unknown): string {
  const message = redactSecrets(error);
  if (
    message.includes('Unknown argument') ||
    message.includes('Invalid `prisma.') ||
    message.includes('PrismaClientValidationError')
  ) {
    return 'Settings database client is out of date. Restart the dev server after the Prisma update, then try again.';
  }
  return message || 'Failed to save settings.';
}
