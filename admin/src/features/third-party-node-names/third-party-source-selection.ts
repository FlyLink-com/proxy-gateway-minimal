// This preference is not authentication or authority: only a source ID is
// retained, and callers must resolve it against a fresh authorized source list.
const STORAGE_KEY = "gccwebos.admin.third-party.selected-source.v1";
const SOURCE_ID = /^tpsrc_[0-9a-f]{32}$/;

export function clearThirdPartySourceSelection(): void {
  try { window.sessionStorage.removeItem(STORAGE_KEY); } catch { /* Storage may be disabled. */ }
}

export function readThirdPartySourceSelection(): string | null {
  try {
    const value = window.sessionStorage.getItem(STORAGE_KEY);
    if (value === null) return null;
    const parsed: unknown = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)
      && Object.keys(parsed).length === 2 && "version" in parsed && parsed.version === 1
      && "sourceId" in parsed && typeof parsed.sourceId === "string" && SOURCE_ID.test(parsed.sourceId)) return parsed.sourceId;
    clearThirdPartySourceSelection();
  } catch { clearThirdPartySourceSelection(); }
  return null;
}

export function rememberThirdPartySourceSelection(sourceId: string): void {
  if (!SOURCE_ID.test(sourceId)) { clearThirdPartySourceSelection(); return; }
  try { window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, sourceId })); } catch { /* Preference only. */ }
}
