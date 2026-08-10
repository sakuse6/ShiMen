const UUID_RE = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

function normalizeCandidate(value: string | null | undefined): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function isOpaqueSessionTitle(value: string | null | undefined): boolean {
  const text = normalizeCandidate(value);
  if (!text) return true;
  if (UUID_RE.test(text)) return true;
  if (/^(pending-|new_session_)/i.test(text)) return true;
  return false;
}

export function resolveSessionTitle(
  candidates: Array<string | null | undefined>,
  fallbackTitle: string,
): string {
  for (const candidate of candidates) {
    const text = normalizeCandidate(candidate);
    if (!isOpaqueSessionTitle(text)) {
      return text;
    }
  }
  return normalizeCandidate(fallbackTitle) || "\u65b0\u5bf9\u8bdd";
}
