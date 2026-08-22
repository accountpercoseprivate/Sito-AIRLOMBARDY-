// =============================================================================
// LOMBARDAIR - GESTIONE AUTENTICAZIONE SUPABASE (auth.js)
// =============================================================================

import { getSupabase } from './config.js';

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
  if (sb) {
    await sb.auth.signOut();
  }
  window.location.href = 'index.html';
}

/**
 * Restituisce l'utente attualmente autenticato.
 */
export async function getCurrentUser() {
  const sb = getSupabase();
  if (!sb) return null;
  const { data: { user } } = await sb.auth.getUser();
  return user;
}

/**
 * Recupera i dati del profilo e il ruolo dalla tabella utenti_profili.
 */
export async function getUserProfile() {
  const user = await getCurrentUser();
  if (!user) return null;

  const sb = getSupabase();
  if (!sb) return null;

  const { data, error } = await sb
    .from('utenti_profili')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error) {
    console.warn('Profilo in tabella utenti_profili non trovato, fallback su auth metadata:', error.message);
    return { 
      id: user.id, 
      nome: user.user_metadata?.nome || user.email.split('@')[0], 
      cognome: user.user_metadata?.cognome || '', 
      ruolo: user.user_metadata?.ruolo || 'passeggero' 
    };
  }
  return data;
}

/**
 * Route Guard: protegge le pagine riservate.
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
 * Aggiorna dinamicamente la navbar mostrando i pulsanti della Dashboard corretta.
 */
export async function updateNavbarUI() {
  const authContainer = document.getElementById('navbar-auth-section');
  if (!authContainer) return;

  const user = await getCurrentUser();
  if (!user) {
    authContainer.innerHTML = `
      <a href="login.html" class="inline-flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-bold text-white transition-all hover:-translate-y-0.5">
        <svg class="w-4 h-4 text-lime-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
        <span>Accedi / Area Riservata</span>
      </a>
    `;
    return;
  }

  const profile = await getUserProfile();
  const nomeVisualizzato = profile?.nome || user.email.split('@')[0];
  const isAdmin = profile?.ruolo === 'admin';

  authContainer.innerHTML = `
    <div class="flex items-center space-x-3 text-xs">
      <span class="text-slate-300 font-medium hidden sm:inline">
        Ciao, <b class="text-lime-400">${nomeVisualizzato}</b>
      </span>
      
      ${isAdmin ? `
        <a href="admin.html" class="px-3.5 py-2 rounded-xl bg-lime-500 hover:bg-lime-400 text-forest-950 font-black text-xs uppercase tracking-wider shadow-sm transition">
          Pannello Admin
        </a>
      ` : `
        <a href="passenger-dashboard.html" class="px-4 py-2 rounded-xl bg-lime-500 hover:bg-lime-400 text-forest-950 font-black text-xs uppercase tracking-wider shadow-cta-glow transition flex items-center space-x-1.5 hover:-translate-y-0.5">
          <span>✈️</span>
          <span>Area Passeggero</span>
        </a>
      `}
      
      <button id="btn-nav-logout" class="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-slate-300 hover:text-white text-xs font-bold transition">
        Esci
      </button>
    </div>
  `;

  document.getElementById('btn-nav-logout')?.addEventListener('click', logout);
}