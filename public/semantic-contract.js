export const SEMANTIC_API_VERSION = '2026-09-21';

export function clampSemanticZoom(value, min = 0.72, max = 5.5) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) throw new Error('Zoom must be a finite number');
  return Math.max(min, Math.min(max, numeric));
}

export function parseSectorId(id, grid = { cols: 64, rows: 32 }) {
  const match = /^S-(\d{2})-(\d{2})$/.exec(String(id || '').trim());
  if (!match) throw new Error('Sector id must look like S-00-00');
  const x = Number(match[1]);
  const y = Number(match[2]);
  if (x < 0 || y < 0 || x >= grid.cols || y >= grid.rows) {
    throw new Error('Sector is outside the Moonstake grid');
  }
  return { id: `S-${String(x).padStart(2, '0')}-${String(y).padStart(2, '0')}`, x, y };
}

export function searchSemanticEntities(query, { landmarks = [], claims = [] } = {}, limit = 10) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  const rows = [
    ...landmarks.map((item) => ({
      kind: 'landmark',
      id: item.id,
      title: item.name,
      subtitle: item.subtitle || '',
      haystack: `${item.name || ''} ${item.subtitle || ''}`.toLowerCase()
    })),
    ...claims.map((item) => ({
      kind: 'claim',
      id: item.id,
      title: item.brand,
      subtitle: item.tagline || 'Brand flag',
      haystack: `${item.brand || ''} ${item.tagline || ''}`.toLowerCase()
    }))
  ].filter((item) => item.haystack.includes(q));

  rows.sort((a, b) => {
    const aExact = a.title?.toLowerCase() === q ? 0 : 1;
    const bExact = b.title?.toLowerCase() === q ? 0 : 1;
    if (aExact !== bExact) return aExact - bExact;
    return String(a.title || '').localeCompare(String(b.title || ''));
  });

  return rows.slice(0, limit).map(({ haystack, ...item }) => item);
}

export function buildSemanticSnapshot(state = {}) {
  const activeClaim = state.activeClaim
    ? {
        id: state.activeClaim.id,
        brand: state.activeClaim.brand,
        sectors: Array.isArray(state.activeClaim.sectors) ? [...state.activeClaim.sectors] : []
      }
    : null;

  return {
    version: SEMANTIC_API_VERSION,
    view: {
      zoom: Number(state.zoom || 0),
      panX: Number(state.panX || 0),
      panY: Number(state.panY || 0),
      mode: state.mode || 'move'
    },
    selection: Array.from(state.selected || []),
    quote: {
      count: Number(state.quote?.count || 0),
      total: Number(state.quote?.total || 0),
      unavailable: Array.from(state.quote?.unavailable || [])
    },
    activeClaim,
    stats: state.stats ? { ...state.stats } : null,
    user: state.user ? { signedIn: true, brand: state.user.brand || '' } : { signedIn: false, brand: '' }
  };
}
