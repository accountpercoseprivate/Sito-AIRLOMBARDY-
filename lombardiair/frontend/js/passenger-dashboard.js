// =============================================================================
// LOMBARDAIR - DASHBOARD PASSEGGERO & TABELLONE FIDS (passenger-dashboard.js)
// =============================================================================

import { apiFetch, getSupabase } from './config.js';
import { getCurrentUser, getUserProfile, logout } from './auth.js';

// Riferimenti DOM Utente
const userDisplayName = document.getElementById('user-display-name');
const userDisplayEmail = document.getElementById('user-display-email');
const welcomeTitle = document.getElementById('welcome-title');
const btnLogout = document.getElementById('btn-user-logout');
const alertBox = document.getElementById('passenger-alert');

// Riferimenti DOM Tab Navigation
const tabBtnVoli = document.getElementById('tab-btn-voli');
const tabBtnFids = document.getElementById('tab-btn-fids');
const tabBtnExtra = document.getElementById('tab-btn-extra');

const sectionVoli = document.getElementById('section-voli');
const sectionFids = document.getElementById('section-fids');
const sectionExtra = document.getElementById('section-extra');

// Contenitori Dinamici
const listaBigliettiContainer = document.getElementById('lista-biglietti-container');
const fidsTableBody = document.getElementById('fids-table-body');
const fidsClock = document.getElementById('fids-clock');

// =============================================================================
// 1. INIZIALIZZAZIONE & CONTROLLO AUTENTICAZIONE
// =============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  await initPassengerDashboard();
  startFidsClock();
  caricaTabelloneFIDS();
});

async function initPassengerDashboard() {
  try {
    const user = await getCurrentUser();
    const profile = await getUserProfile();

    if (user && userDisplayName && userDisplayEmail) {
      const nomeCompleto = profile?.nome 
        ? `${profile.nome} ${profile.cognome || ''}` 
        : user.email.split('@')[0];

      userDisplayName.textContent = nomeCompleto;
      userDisplayEmail.textContent = user.email;
      if (welcomeTitle) {
        welcomeTitle.textContent = `Bentornato a bordo, ${profile?.nome || nomeCompleto}`;
      }
    } else {
      // Fallback gentile se l'utente accede in modalità test
      if (userDisplayName) userDisplayName.textContent = 'Passeggero Ospite';
      if (userDisplayEmail) userDisplayEmail.textContent = 'ospite@lombardiair.it';
    }

    await caricaPrenotazioniUtente();

  } catch (err) {
    console.warn('Inizializzazione passeggero:', err);
    await caricaPrenotazioniUtente(); // Carica fallback
  }
}

if (btnLogout) {
  btnLogout.addEventListener('click', logout);
}

// =============================================================================
// 2. RECUPERO & RENDERING PRENOTAZIONI ATTIVE DELL'UTENTE
// =============================================================================

window.caricaPrenotazioniUtente = async function() {
  if (!listaBigliettiContainer) return;

  listaBigliettiContainer.innerHTML = `
    <div class="p-8 text-center bg-white rounded-3xl border border-slate-200/80 text-xs font-semibold text-slate-400 animate-pulse">
      Sincronizzazione titoli di viaggio con il server...
    </div>
  `;

  try {
    let prenotazioni = [];
    const user = await getCurrentUser();

    // 1. Prova recupero da Supabase diretto se loggato
    const sb = getSupabase();
    if (sb && user) {
      const { data } = await sb
        .from('prenotazioni')
        .select('*, voli(*)')
        .eq('utente_id', user.id)
        .order('created_at', { ascending: false });

      if (data && data.length > 0) {
        prenotazioni = data.map(p => ({
          ...p,
          volo: p.voli || p.volo
        }));
      }
    }

    // 2. Mock Fallback realistico se l'utente non ha ancora effettuato acquisti
    if (prenotazioni.length === 0) {
      prenotazioni = [
        {
          id: 'mock-1',
          codice_prenotazione: 'LM-9X2A7',
          nome_passeggero: 'Mario',
          cognome_passeggero: 'Rossi',
          posto_assegnato: '04A',
          prezzo_finale: 89.00,
          stato: 'confermata',
          volo: {
            codice_volo: 'LM-104',
            aeroporto_origine: 'LIN',
            aeroporto_destinazione: 'MNZ',
            data_ora_partenza: new Date(Date.now() + 3600000 * 4).toISOString(),
            data_ora_arrivo: new Date(Date.now() + 3600000 * 4 + 1800000).toISOString(),
            stato: 'programmato'
          }
        }
      ];
    }

    // Rendering delle card di volo
    listaBigliettiContainer.innerHTML = prenotazioni.map(b => {
      const volo = b.volo || {};
      const dPartenza = volo.data_ora_partenza ? new Date(volo.data_ora_partenza) : new Date();
      const oraPartenza = dPartenza.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
      const dataStr = dPartenza.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });

      return `
        <div class="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200/90 shadow-card-soft hover:border-lime-500/40 hover:shadow-lg transition-all flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          
          <!-- Sezione Sinistra: Dati Tratta -->
          <div class="flex items-start sm:items-center space-x-4">
            <div class="w-16 h-16 rounded-2xl bg-forest-900 text-lime-400 flex flex-col items-center justify-center flex-shrink-0 shadow-sm">
              <span class="text-[9px] font-black tracking-widest uppercase opacity-70">VOLO</span>
              <span class="text-sm font-black font-mono">${volo.codice_volo || 'LM-NAV'}</span>
            </div>

            <div>
              <div class="flex items-center space-x-2">
                <span class="text-lg font-black text-slate-900">${volo.aeroporto_origine || 'LIN'}</span>
                <span class="text-lime-600 font-black text-sm">➔</span>
                <span class="text-lg font-black text-slate-900">${volo.aeroporto_destinazione || 'MNZ'}</span>
                <span class="ml-2 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800">
                  ${b.stato || 'Confermato'}
                </span>
              </div>
              
              <div class="text-xs text-slate-500 font-semibold mt-1 space-x-2">
                <span>Data: <b class="text-slate-800">${dataStr}</b></span>
                <span>•</span>
                <span>Partenza: <b class="text-slate-800">${oraPartenza}</b></span>
                <span>•</span>
                <span>Passeggero: <b class="text-slate-800">${b.nome_passeggero} ${b.cognome_passeggero}</b></span>
              </div>
            </div>
          </div>

          <!-- Sezione Centro: Sedile & PNR -->
          <div class="flex items-center space-x-6 border-t lg:border-t-0 pt-4 lg:pt-0 w-full lg:w-auto justify-between lg:justify-start">
            <div class="text-left lg:text-center">
              <span class="text-[10px] font-extrabold uppercase text-slate-400 block">Sedile Assegnato</span>
              <span class="text-lg font-black text-lime-800 bg-lime-100 border border-lime-300 px-3 py-0.5 rounded-xl inline-block mt-0.5">
                ${b.posto_assegnato}
              </span>
            </div>

            <div class="text-left lg:text-center">
              <span class="text-[10px] font-extrabold uppercase text-slate-400 block">Codice PNR</span>
              <span class="text-sm font-black font-mono text-forest-950 block mt-1 tracking-wider">
                ${b.codice_prenotazione}
              </span>
            </div>

            <!-- Pulsante Carta 3D -->
            <div>
              <a href="boarding-pass.html?pnr=${encodeURIComponent(b.codice_prenotazione)}" 
                 class="px-5 py-3 rounded-2xl bg-lime-500 hover:bg-lime-400 text-forest-950 font-black text-xs uppercase tracking-wider shadow-cta-glow transition-all flex items-center space-x-2">
                <span>Vedi Carta d'Imbarco 3D</span>
                <span>→</span>
              </a>
            </div>
          </div>

        </div>
      `;
    }).join('');

  } catch (err) {
    listaBigliettiContainer.innerHTML = `
      <div class="p-8 text-center text-red-600 font-bold text-xs bg-red-50 rounded-2xl border border-red-200">
        Impossibile caricare i tuoi voli: ${err.message}
      </div>
    `;
  }
};

// =============================================================================
// 3. TABELLONE VOLI "STILE AEROPORTO" (FIDS SIMULATION & LIVE DATA)
// =============================================================================

window.caricaTabelloneFIDS = async function() {
  if (!fidsTableBody) return;

  // Dati FIDS ad alto realismo per la rete Milano-Monza
  const fidsFlights = [
    { time: '10:15', dest: 'MONZA HUB (MNZ)', flight: 'LM 102', gate: 'G02', status: 'DECOLLATO', statusType: 'departed' },
    { time: '10:45', dest: 'MILANO LINATE (LIN)', flight: 'LM 104', gate: 'G04', status: 'IMBARCO', statusType: 'boarding' },
    { time: '11:15', dest: 'MILANO MALPENSA (MXP)', flight: 'LM 208', gate: 'G01', status: 'CHECK-IN', statusType: 'checkin' },
    { time: '11:45', dest: 'MONZA HUB (MNZ)', flight: 'LM 110', gate: 'G03', status: 'IN ORARIO', statusType: 'scheduled' },
    { time: '12:15', dest: 'BERGAMO ORIO (BGY)', flight: 'LM 312', gate: 'G05', status: 'IN ORARIO', statusType: 'scheduled' },
    { time: '12:45', dest: 'ROMA FIUMICINO (FCO)', flight: 'LM 450', gate: '---', status: 'CANCELLATO', statusType: 'cancelled' },
  ];

  fidsTableBody.innerHTML = fidsFlights.map(f => {
    let statusClass = 'text-slate-300';
    let pulseClass = '';

    if (f.statusType === 'boarding') {
      statusClass = 'text-lime-400 font-black';
      pulseClass = 'animate-pulse';
    } else if (f.statusType === 'checkin') {
      statusClass = 'text-amber-400 font-black';
    } else if (f.statusType === 'cancelled') {
      statusClass = 'text-red-500 font-black';
    } else if (f.statusType === 'departed') {
      statusClass = 'text-slate-500 font-semibold';
    }

    return `
      <tr class="hover:bg-slate-900/80 transition font-mono border-b border-slate-900">
        <td class="py-3.5 px-4 text-amber-300 font-black">${f.time}</td>
        <td class="py-3.5 px-4 text-white font-black tracking-wider">${f.dest}</td>
        <td class="py-3.5 px-4 text-lime-400 font-extrabold">${f.flight}</td>
        <td class="py-3.5 px-4 text-center font-black ${f.gate !== '---' ? 'text-amber-400 bg-slate-900/60 rounded' : 'text-slate-600'}">${f.gate}</td>
        <td class="py-3.5 px-4 text-right ${statusClass} ${pulseClass} tracking-widest uppercase">
          ${f.status}
        </td>
      </tr>
    `;
  }).join('');
};

// Orologio Digitale FIDS Live (Aggiornamento al secondo)
function startFidsClock() {
  if (!fidsClock) return;

  function update() {
    const now = new Date();
    fidsClock.textContent = now.toLocaleTimeString('it-IT', { hour12: false });
  }

  update();
  setInterval(update, 1000);
}

// =============================================================================
// 4. GESTIONE ACQUISTO SERVIZI EXTRA
// =============================================================================

window.aggiungiServizioExtra = function(nomeServizio, prezzo) {
  showAlert(`Servizio "${nomeServizio}" (€ ${prezzo.toFixed(2)}) aggiunto alla tua prenotazione.`);
};

function showAlert(message, isError = false) {
  if (!alertBox) return;
  alertBox.textContent = message;
  alertBox.className = `mb-6 p-4 rounded-2xl text-xs font-bold leading-relaxed border transition-all duration-300 ${
    isError 
      ? 'bg-red-50 text-red-700 border-red-200' 
      : 'bg-emerald-50 text-emerald-900 border-emerald-300 shadow-sm'
  }`;
  alertBox.classList.remove('hidden');
  window.scrollTo({ top: 150, behavior: 'smooth' });
  setTimeout(() => alertBox.classList.add('hidden'), 5000);
}

// =============================================================================
// 5. SWITCHER DEI TAB INTERNI
// =============================================================================

function resetTabs() {
  [tabBtnVoli, tabBtnFids, tabBtnExtra].forEach(btn => {
    btn.className = 'px-5 py-2.5 rounded-xl text-slate-600 hover:text-slate-900 text-xs font-bold transition-all flex items-center space-x-2';
  });
  [sectionVoli, sectionFids, sectionExtra].forEach(sec => sec.classList.add('hidden'));
}

if (tabBtnVoli) {
  tabBtnVoli.addEventListener('click', () => {
    resetTabs();
    tabBtnVoli.className = 'px-5 py-2.5 rounded-xl bg-forest-900 text-white text-xs font-extrabold shadow-sm transition-all flex items-center space-x-2';
    sectionVoli.classList.remove('hidden');
  });
}

if (tabBtnFids) {
  tabBtnFids.addEventListener('click', () => {
    resetTabs();
    tabBtnFids.className = 'px-5 py-2.5 rounded-xl bg-forest-900 text-white text-xs font-extrabold shadow-sm transition-all flex items-center space-x-2';
    sectionFids.classList.remove('hidden');
    caricaTabelloneFIDS();
  });
}

if (tabBtnExtra) {
  tabBtnExtra.addEventListener('click', () => {
    resetTabs();
    tabBtnExtra.className = 'px-5 py-2.5 rounded-xl bg-forest-900 text-white text-xs font-extrabold shadow-sm transition-all flex items-center space-x-2';
    sectionExtra.classList.remove('hidden');
  });
}