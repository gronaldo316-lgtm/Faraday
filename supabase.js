// Cliente mínimo para la API REST de Supabase (PostgREST). Sin dependencias externas.
(function () {
  const cfg = window.APP_CONFIG || {};
  const BASE = String(cfg.SUPABASE_URL || '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '') + '/rest/v1';
  const KEY = cfg.SUPABASE_KEY;

  async function req(path, opts = {}) {
    const res = await fetch(BASE + path, {
      ...opts,
      headers: { apikey: KEY, 'Content-Type': 'application/json', ...(opts.headers || {}) }
    });
    const txt = await res.text();
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${txt}`);
    return txt ? JSON.parse(txt) : null;
  }

  window.sb = {
    select: (table, qs = '') => req(`/${table}?select=*${qs}`),
    upsert: (table, rows, conflict) => rows.length
      ? req(`/${table}?on_conflict=${conflict}`, {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify(rows)
        })
      : Promise.resolve(),
    insert: (table, rows) => req(`/${table}`, {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(rows)
    }),
    remove: (table, filter) => req(`/${table}?${filter}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' }
    })
  };
})();
