import { getSupabase } from './config.js';

// =============================================================================
// GESTIONE AUTENTICAZIONE SUPABASE
// =============================================================================

/**
 * Effettua il login con email e password.
 */
export async function login(email, password) {
  const sb = getSupabase();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Registra un nuovo passeggero/utente nel sistema.
 */
export async function register(email, password, nome, cognome) {
  const sb = getSupabase();
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: {
      data: {
        nome,
        cognome,
        ruolo: 'passeggero'
      }
    }
  });
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Termina la sessione corrente e reindirizza alla homepage.
 */
export async function logout() {
  const sb = getSupabase();
  await sb.auth.signOut();
  window.location.href = 'index.html';
}

/**
 * Restituisce l'utente attualmente autenticato.
 */
export async function getCurrentUser() {
  const sb = getSupabase();
  const { data: { user } } = await sb.auth.getUser();
  return user;
}

/**
 * Recupera i dati del profilo e il ruolo (passeggero / admin) dalla tabella utenti_profili.
 */
export async function getUserProfile() {
  const user = await getCurrentUser();
  if (!user) return null;

  const sb = getSupabase();
  const { data, error } = await sb
    .from('utenti_profili')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error) {
    console.error('Errore nel recupero del profilo:', error);
    return null;
  }
  return data;
}

/**
 * Route Guard: protegge le pagine riservate reindirizzando a login.html in caso di mancato accesso.
 * @param {string|null} requiredRole - 'admin' per pagine B2B, null per qualsiasi utente autenticato.
 */
export async function requireAuth(requiredRole = null) {
  const user = await getCurrentUser();
  if (!user) {
    window.location.href = `login.html?redirect=${encodeURIComponent(window.location.pathname)}`;
    return null;
  }

  const profile = await getUserProfile();
  if (requiredRole && profile?.ruolo !== requiredRole) {
    alert("Accesso negato: quest'area è riservata al personale amministrativo.");
    window.location.href = 'index.html';
    return null;
  }

  return { user, profile };
}

/**
 * Aggiorna dinamicamente la navbar in base allo stato di login dell'utente.
 */
export async function updateNavbarUI() {
  const authContainer = document.getElementById('navbar-auth-section');
  if (!authContainer) return;

  const profile = await getUserProfile();
  if (profile) {
    authContainer.innerHTML = `
      <div class="flex items-center space-x-3 text-sm">
        <span class="text-white font-medium">Ciao, <b class="text-lime-400">${profile.nome || 'Utente'}</b></span>
        ${profile.ruolo === 'admin' ? '<a href="admin.html" class="bg-lime-400 text-green-950 font-bold px-2 py-1 rounded text-xs">Pannello Admin</a>' : ''}
        <button id="btn-nav-logout" class="text-slate-300 hover:text-white border border-slate-600 px-3 py-1 rounded">Esci</button>
      </div>
    `;
    document.getElementById('btn-nav-logout')?.addEventListener('click', logout);
  } else {
    authContainer.innerHTML = `
      <a href="login.html" class="text-white hover:text-lime-400 text-sm font-semibold border border-lime-400/40 px-4 py-2 rounded-lg transition">
        Accedi / Area Riservata
      </a>
    `;
  }
}