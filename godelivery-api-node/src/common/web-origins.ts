export function trustedWebOrigins(webUrl: string): string[] {
  const configured = new URL(webUrl);
  const origins = [configured.origin];
  if (configured.protocol === 'http:' && configured.hostname === 'localhost') {
    configured.hostname = '127.0.0.1';
    origins.push(configured.origin);
  } else if (configured.protocol === 'http:' && configured.hostname === '127.0.0.1') {
    configured.hostname = 'localhost';
    origins.push(configured.origin);
  }
  return [...new Set(origins)];
}
