/**
 * Trigger a browser save for data already fetched by the app.
 *
 * Downloads cannot be plain links here: every file endpoint sits behind
 * `get_current_user`, and an `<a href>` or `window.open` sends no Authorization
 * header, so the request comes back 401. The file therefore has to be fetched
 * through the axios client (which attaches the token) and handed to the browser
 * as an object URL.
 */

/** Save an already-fetched payload under `filename`. */
export function downloadBlob(data: BlobPart, filename: string, mimeType?: string): void {
  const blob =
    data instanceof Blob ? data : new Blob([data], mimeType ? { type: mimeType } : undefined);
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // Defer revoke so Safari has time to start the download before the URL dies.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/**
 * Best-effort filename from a Content-Disposition header, falling back to
 * `fallback` when the header is absent or unparseable.
 */
export function filenameFromContentDisposition(
  header: string | undefined,
  fallback: string,
): string {
  if (!header) return fallback;
  // RFC 5987 form first (filename*=UTF-8''...), then the plain quoted form.
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1]);
    } catch {
      /* fall through to the plain form */
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain ? plain[1] : fallback;
}
