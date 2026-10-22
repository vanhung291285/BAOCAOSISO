/**
 * Safe localStorage wrapper with QuotaExceededError handling, global monkeypatching, and sanitization.
 */

export function sanitizeClassId(classId: any): string {
  if (!classId) return '';
  if (typeof classId === 'string') return classId.trim();
  if (typeof classId === 'object') {
    if ('id' in classId && classId.id) return String(classId.id).trim();
    if ('class_id' in classId && classId.class_id) return String(classId.class_id).trim();
  }
  return String(classId).trim();
}

// Global protection against QuotaExceededError for all localStorage.setItem calls
if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
  try {
    const originalSetItem = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function (key: string, value: string) {
      // If saving class ID keys, sanitize value to be a clean short string
      let valToStore = value;
      if (key === 'sso_saved_class_id' || key === 'sso_device_alert_class_id') {
        valToStore = sanitizeClassId(value);
      }

      try {
        originalSetItem(key, valToStore);
      } catch (err: any) {
        if (
          err &&
          (err.name === 'QuotaExceededError' ||
            err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
            err.code === 22 ||
            err.code === 1014)
        ) {
          console.warn(`[SafeStorage] Quota exceeded when setting key "${key}". Cleaning non-critical cache...`);
          try {
            // Clean non-critical transient storage to free up quota
            localStorage.removeItem('sso_logs_v1');
            localStorage.removeItem('sso_notifications_v1');
            originalSetItem(key, valToStore);
          } catch (retryErr) {
            console.error(`[SafeStorage] Failed to set key "${key}" even after cache cleanup:`, retryErr);
          }
        } else {
          console.error(`[SafeStorage] Error setting localStorage key "${key}":`, err);
        }
      }
    };
  } catch (e) {
    console.warn('[SafeStorage] Could not monkeypatch localStorage:', e);
  }
}

export function safeSetItem(key: string, value: any): boolean {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return false;
  try {
    let valStr = typeof value === 'string' ? value : JSON.stringify(value);
    if (key === 'sso_saved_class_id' || key === 'sso_device_alert_class_id') {
      valStr = sanitizeClassId(value);
    }
    localStorage.setItem(key, valStr);
    return true;
  } catch (err: any) {
    console.error(`[SafeStorage] safeSetItem error for key "${key}":`, err);
    return false;
  }
}

export function safeGetItem(key: string): string | null {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(key);
  } catch (err) {
    console.error(`[SafeStorage] safeGetItem error for key "${key}":`, err);
    return null;
  }
}

export function safeRemoveItem(key: string): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(key);
  } catch (err) {
    console.error(`[SafeStorage] safeRemoveItem error for key "${key}":`, err);
  }
}
