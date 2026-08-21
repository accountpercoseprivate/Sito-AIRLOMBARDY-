// =============================================================================
// LOMBARDAIR - CONFIGURAZIONE GLOBALE & API CLIENT (PRODUZIONE)
// =============================================================================

export const CONFIG = {
  // Backend API su Render
  API_BASE_URL: 'https://sito-airlombardy.onrender.com/api/v1',

  // Progetto Supabase
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
 * Wrapper centralizzato per le chiamate REST al backend FastAPI su Render.
 * Inietta in automatico il token JWT dell'utente autenticato e gestisce gli errori in modo leggibile.
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
    
    // Gestione ed estrazione chiara degli errori di validazione Pydantic/FastAPI
    let errorMsg = errorBody.detail;
    if (Array.isArray(errorMsg)) {
      errorMsg = errorMsg.map(e => {
        const campo = e.loc ? e.loc[e.loc.length - 1] : 'Parametro';
        return `Campo '${campo}': ${e.msg}`;
      }).join(' | ');
    } else if (typeof errorMsg === 'object' && errorMsg !== null) {
      errorMsg = JSON.stringify(errorMsg);
    }

    throw new Error(errorMsg || `Errore HTTP ${response.status}`);
  }

  if (response.status === 204) return null;
  return response.json();
}