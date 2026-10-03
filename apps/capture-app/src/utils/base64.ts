/**
 * Safe Base64 encoder and decoder for React Native / Hermes engine environments.
 * Avoids relying on browser global `atob` / `btoa` which cause ReferenceErrors in React Native.
 */

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

export function base64Encode(str: string): string {
  let output = '';
  let i = 0;
  while (i < str.length) {
    const chr1 = str.charCodeAt(i++);
    const chr2 = str.charCodeAt(i++);
    const chr3 = str.charCodeAt(i++);

    const enc1 = chr1 >> 2;
    const enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
    let enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
    let enc4 = chr3 & 63;

    if (isNaN(chr2)) {
      enc3 = enc4 = 64;
    } else if (isNaN(chr3)) {
      enc4 = 64;
    }

    output =
      output +
      CHARS.charAt(enc1) +
      CHARS.charAt(enc2) +
      CHARS.charAt(enc3) +
      CHARS.charAt(enc4);
  }
  return output;
}

export function base64Decode(str: string): string {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  let output = '';
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < base64.length; i++) {
    const char = base64.charAt(i);
    if (char === '=') break;
    const index = CHARS.indexOf(char);
    if (index === -1) continue;
    buffer = (buffer << 6) | index;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }
  return output;
}
