export const VIEW_STATE_PREFIX = "erp-view-state:v1:";
export const VIEW_SCROLL_PREFIX = "erp-view-scroll:v1:";

export function clearRememberedViewState(): void {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(VIEW_STATE_PREFIX) || key?.startsWith(VIEW_SCROLL_PREFIX)) {
        sessionStorage.removeItem(key);
      }
    }
  } catch {
    // Logging out must work even if storage is unavailable.
  }
}