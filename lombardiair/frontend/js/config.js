export const CONFIG = {
  // Indirizzo del backend FastAPI
  API_BASE_URL: 'http://localhost:8000/api/v1',

  // Credenziali Supabase del tuo progetto
  SUPABASE_URL: 'https://zfxjvkkovramshicckwi.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_sg415c14o-AQJoMOQrrXZA_bnsECYoU',
};

// Singleton Client Supabase
let supabaseClient = null;

export function getSupabase() {
  if (!supabaseClient) {
    if (!window.supabase) {
      console.error("SDK Supabase non trovato. Assicurati di importarlo via CDN nell'HTML.");
      return null;
    }
    supabaseClient = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
  }
  return supabaseClient;
}

/**
 * Wrapper centralizzato per le chiamate REST al backend FastAPI.
 * Inietta in automatico il token JWT dell'utente autenticato (se presente).
 */
export async function apiFetch(endpoint, options = {}) {
  const url = `${CONFIG.API_BASE_URL}${endpoint}`;
  const defaultHeaders = {
    'Content-Type': 'application/json',
  };

  const sb = getSupabase();
  if (sb) {
    const { data: { session } } = await sb.auth.getSession();
    if (session?.access_token) {
      defaultHeaders['Authorization'] = `Bearer ${session.access_token}`;
    }
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ detail: 'Errore di comunicazione con il server.' }));
    throw new Error(errorBody.detail || `Errore HTTP ${response.status}`);
  }

  if (response.status === 204) return null;
  return response.json();
}