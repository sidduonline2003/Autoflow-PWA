// Centralized feature flags
// POSTPROD_ENABLED can be controlled by REACT_APP_POSTPROD_ENABLED.
// For backward compatibility, it falls back to REACT_APP_FEATURE_POSTPROD.
export const POSTPROD_ENABLED = (() => {
  const v = process.env.REACT_APP_POSTPROD_ENABLED;
  if (v != null) {
    const s = String(v).toLowerCase();
    return !(s === 'false' || s === '0' || s === 'off');
  }
  const legacy = process.env.REACT_APP_FEATURE_POSTPROD;
  if (legacy == null) return true; // default on
  const s = String(legacy).toLowerCase();
  return !(s === 'false' || s === '0' || s === 'off');
})();
