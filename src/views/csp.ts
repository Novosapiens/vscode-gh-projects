import { randomBytes } from 'node:crypto';

/** Random nonce for one webview load; scripts without it are blocked by the CSP. */
export function createNonce(): string {
  return randomBytes(18).toString('base64url');
}

/**
 * Strict Content-Security-Policy for our webviews: nothing by default, scripts only with the
 * nonce, styles/fonts from the extension, images from the extension or https (avatars, issue
 * images). No connect-src: the webview never talks to the network, only to the extension.
 */
export function buildCsp(cspSource: string, nonce: string): string {
  return [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    `style-src ${cspSource}`,
    `font-src ${cspSource}`,
    `img-src ${cspSource} https: data:`,
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}
