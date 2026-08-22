// =============================================================================
// LOMBARDAIR - DASHBOARD PASSEGGERO REALE (passenger-dashboard.js)
// =============================================================================

import { getSupabase } from './config.js';
import { getCurrentUser, logout } from './auth.js';
import { startGateScanner3D } from './scanner-3d.js';

// Riferimenti DOM
const userDisplayName = document.getElementById('user-display-name');
const userDisplayEmail = document.getElementById('user-display-email');
const welcomeTitle = document.getElementById('welcome-title');
const btnLogout = document.getElementById('btn-user-logout');
const alertBox = document.getElementById('passenger-alert');

const tabBtnVoli = document.getElementById('tab-btn-voli');
const tabBtnBenefits = document.getElementById('tab-btn-benefits');
const tabBtnFids = document.getElementById('tab-btn-fids');
const tabBtnExtra = document.getElementById('tab-btn-extra');

const sectionVoli = document.getElementById('section-voli');
const sectionBenefits = document.getElementById('section-benefits');
const sectionFids = document.getElementById('section-fids');
const sectionExtra = document.getElementById('section-extra');

const listaBigliettiContainer = document.getElementById('lista-biglietti-container');
const listaRiscattiContainer = document.getElementById('lista-riscatti-container');
const fidsTableBody = document.getElementById('fids-table-body');
const fidsClock = document.getElementById('fids-clock');

let currentUser = null;
let currentProfile = null;
let userBookings = [];
let fidsVoliInMemoria = [];

// =============================================================================
// CALCOLO STATI IN TEMPO REALE (ORARIO REALE MINECRAFT CET)
// =============================================================================
function calcolaStatoVoloLive(volo) {
  if (volo.stato === 'cancellato') {
    return { testo: 'CANCELLATO', classe: 'text-rose-500 font-bold', pulse: '' };
  }

  const now = new Date();
  const dPartenza = new Date(volo.data_ora_partenza);
  const dArrivo = new Date(volo.data_ora_arrivo);

  // Sincronizza giorno con oggi per gli orari fissi giornalieri
  const partenzaOggi = new Date(now.getFullYear(), now.getMonth(), now.getDate(), dPartenza.getHours(), dPartenza.getMinutes(), 0);
  let arrivoOggi = new Date(now.getFullYear(), now.getMonth(), now.getDate(), dArrivo.getHours(), dArrivo.getMinutes(), 0);

  if (arrivoOggi <= partenzaOggi) {
    arrivoOggi.setDate(arrivoOggi.getDate() + 1);
  }

  const ritardo = volo.ritardo_minuti || 0;
  const partenzaEffettiva = new Date(partenzaOggi.getTime() + ritardo * 60000);
  const arrivoEffettivo = new Date(arrivoOggi.getTime() + ritardo * 60000);
  const imbarcoInizio = new Date(partenzaEffettiva.getTime() - 25 * 60000); // 25 min prima

  // 1. Atterrato: superato orario arrivo
  if (now >= arrivoEffettivo) {
    return { testo: 'ATTERRATO', classe: 'text-slate-500 font-semibold', pulse: '' };
  }
  // 2. In Volo: superata partenza ma prima di arrivo
  if (now >= partenzaEffettiva) {
    return { testo: 'IN VOLO', classe: 'text-blue-400 font-black', pulse: '' };
  }
  // 3. Imbarco: finestra 25 minuti prima
  if (now >= imbarcoInizio) {
    return { testo: 'IMBARCO', classe: 'text-lime-400 font-black', pulse: 'animate-pulse' };
  }
  // 4. Ritardo
  if (ritardo > 0) {
    return { testo: `RITARDO +${ritardo}M`, classe: 'text-amber-400 font-black', pulse: '' };
  }
  // 5. In Orario
  return { testo: 'IN ORARIO', classe: 'text-slate-200 font-extrabold', pulse: '' };
}

// =============================================================================
// 1. INIZIALIZZAZIONE & DATI REALI
// =============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  startFidsClock();
  await fetchUserData();
  await caricaTabelloneFIDS();
  await caricaStoricoRiscatti();

  // Ricalcola dinamicamente gli stati ogni 5 secondi
  setInterval(() => {
    if (fidsVoliInMemoria.length > 0) {
      renderFidsTable(fidsVoliInMemoria);
    }
  }, 5000);
});

if (btnLogout) btnLogout.addEventListener('click', logout);

async function fetchUserData() {
  const sb = getSupabase();
  currentUser = await getCurrentUser();

  if (!currentUser) {
    window.location.href = 'login.html?redirect=passenger-dashboard.html';
    return;
  }

  try {
    const { data: profile, error } = await sb
      .from('utenti_profili')
      .select('*')
      .eq('id', currentUser.id)
      .single();

    currentProfile = profile || {
      nome: currentUser.user_metadata?.nome || currentUser.email.split('@')[0],
      cognome: currentUser.user_metadata?.cognome || '',
      loyalty_tier: 'Explorer',
      miles_balance: 0,
      xp_balance: 0
    };

    renderLoyaltyCard(currentProfile);
    await fetchUserBookings();

  } catch (err) {
    showAlert(`Errore profilo: ${err.message}`, true);
  }
}

function renderLoyaltyCard(p) {
  const nomeCompleto = `${p.nome || ''} ${p.cognome || ''}`.trim() || currentUser.email;
  
  if (userDisplayName) userDisplayName.textContent = nomeCompleto;
  if (userDisplayEmail) userDisplayEmail.textContent = currentUser.email;
  if (welcomeTitle) welcomeTitle.textContent = `Bentornato a bordo, ${p.nome || nomeCompleto}`;

  const xp = p.xp_balance || 0;
  let tier = p.loyalty_tier || 'Explorer';
  let nextThreshold = 100;
  let tierColor = 'bg-forest-800 text-lime-400 border border-lime-500/40';

  if (tier === 'Platinum' || xp >= 300) {
    tier = 'Platinum';
    nextThreshold = 300;
    tierColor = 'bg-slate-200 text-slate-950 font-black border border-slate-400';
  } else if (tier === 'Gold' || xp >= 180) {
    tier = 'Gold';
    nextThreshold = 300;
    tierColor = 'bg-amber-400 text-forest-950 font-black';
  } else if (tier === 'Silver' || xp >= 100) {
    tier = 'Silver';
    nextThreshold = 180;
    tierColor = 'bg-slate-300 text-forest-950 font-bold';
  }

  const heroLoyaltyBox = document.querySelector('.bg-white\\/5.border.border-white\\/10');
  if (heroLoyaltyBox) {
    heroLoyaltyBox.innerHTML = `
      <div class="w-12 h-12 rounded-2xl ${tierColor} flex items-center justify-center font-black text-xl shadow-md">
        ★
      </div>
      <div>
        <span class="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">Programma Flying Lomb</span>
        <span class="text-base font-black text-white">LombardiAIR ${tier}</span>
        <div class="flex items-center space-x-3 text-[11px] font-mono mt-0.5">
          <span class="text-lime-400 font-bold">${p.miles_balance || 0} Miglia</span>
          <span class="text-slate-400">•</span>
          <span class="text-slate-300">${xp}/${nextThreshold} XP</span>
        </div>
      </div>
    `;
  }

  const storeMilesBadge = document.getElementById('store-user-miles');
  if (storeMilesBadge) {
    storeMilesBadge.textContent = `${p.miles_balance || 0} Miglia Disponibili`;
  }
}

// =============================================================================
// 2. RECUPERO BIGLIETTI REALI DA SUPABASE
// =============================================================================

async function fetchUserBookings() {
  if (!listaBigliettiContainer) return;

  try {
    const sb = getSupabase();
    const { data, error } = await sb
      .from('prenotazioni')
      .select('*, voli(*)')
      .eq('utente_id', currentUser.id)
      .neq('stato', 'annullata')
      .order('created_at', { ascending: false });

    if (error) throw error;

    userBookings = data || [];

    if (userBookings.length === 0) {
      listaBigliettiContainer.innerHTML = `
        <div class="p-12 text-center bg-white rounded-3xl border border-slate-200/80 shadow-sm">
          <div class="w-12 h-12 mx-auto rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 text-xl font-bold mb-3">
            ✈️
          </div>
          <h4 class="text-sm font-extrabold text-slate-800">Nessun biglietto acquistato</h4>
          <p class="text-xs text-slate-400 mt-1 mb-5">Non ci sono voli prenotati per il tuo account nel database.</p>
          <a href="index.html#tabellone" class="inline-flex px-5 py-2.5 rounded-xl bg-lime-500 hover:bg-lime-400 text-forest-950 font-black text-xs uppercase tracking-wider shadow-cta-glow transition">
            Prenota un Volo dal Tabellone
          </a>
        </div>
      `;
      return;
    }

    listaBigliettiContainer.innerHTML = userBookings.map(b => {
      const v = b.voli || {};
      const dPartenza = v.data_ora_partenza ? new Date(v.data_ora_partenza) : new Date();
      const oraPartenza = dPartenza.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
      const dataStr = dPartenza.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
      const isCheckedIn = b.check_in_status === true;

      const extraList = [];
      if (b.in_flight_meal) extraList.push('🍽️ Pasto');
      if (b.priority_boarding) extraList.push('🚀 Gruppo 1');
      if (b.pet_in_cabin) extraList.push('🐾 Pet');
      if (b.extra_baggage) extraList.push('🧳 Bagaglio');
      if (b.fast_track) extraList.push('⚡ Fast Track');
      if (b.lounge_access) extraList.push('🍸 Lounge');

      return `
        <div class="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200/90 shadow-card-soft hover:shadow-lg transition-all flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          
          <div class="flex items-start sm:items-center space-x-4">
            <div class="w-16 h-16 rounded-2xl bg-forest-900 text-lime-400 flex flex-col items-center justify-center flex-shrink-0 shadow-sm">
              <span class="text-[9px] font-black tracking-widest uppercase opacity-70">VOLO</span>
              <span class="text-sm font-black font-mono">${v.codice_volo || 'LMB'}</span>
            </div>

            <div>
              <div class="flex items-center space-x-2">
                <span class="text-lg font-black text-slate-900">${v.aeroporto_origine || 'LIN'}</span>
                <span class="text-lime-600 font-black text-sm">➔</span>
                <span class="text-lg font-black text-slate-900">${v.aeroporto_destinazione || 'MNZ'}</span>
                
                ${isCheckedIn ? `
                  <span class="ml-2 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300">
                    ✓ Check-in Effettuato
                  </span>
                ` : `
                  <span class="ml-2 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300">
                    ● Check-in Richiesto
                  </span>
                `}
              </div>
              
              <div class="text-xs text-slate-500 font-semibold mt-1 space-x-2">
                <span>Data: <b class="text-slate-800">${dataStr}</b> ore <b class="text-slate-800">${oraPartenza}</b></span>
                <span>•</span>
                <span>Passeggero: <b class="text-slate-800">${b.nome_passeggero} ${b.cognome_passeggero}</b></span>
              </div>

              ${extraList.length > 0 ? `
                <div class="mt-2 flex items-center gap-1.5 flex-wrap">
                  ${extraList.map(item => `
                    <span class="text-[10px] font-bold px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md border border-slate-200">
                      ${item}
                    </span>
                  `).join('')}
                </div>
              ` : ''}
            </div>
          </div>

          <div class="flex items-center space-x-4 border-t lg:border-t-0 pt-4 lg:pt-0 w-full lg:w-auto justify-between lg:justify-end">
            <div class="text-left lg:text-right">
              <span class="text-[10px] font-extrabold uppercase text-slate-400 block">Sedile / PNR</span>
              <span class="text-sm font-black text-forest-950 font-mono">
                ${b.posto_assegnato} • <span class="text-lime-700 font-bold">${b.codice_prenotazione}</span>
              </span>
            </div>

            <div class="flex items-center space-x-2">
              ${!isCheckedIn ? `
                <button onclick="eseguiCheckIn('${b.codice_prenotazione}')" class="px-5 py-2.5 rounded-xl bg-lime-500 hover:bg-lime-400 text-forest-950 font-black text-xs uppercase tracking-wider shadow-cta-glow transition active:scale-95 flex items-center space-x-1.5">
                  <span>⚡</span>
                  <span>Esegui Check-in</span>
                </button>
                <button disabled title="Effettua prima il check-in per sbloccare la carta 3D" class="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-400 font-bold text-xs cursor-not-allowed border border-slate-200">
                  Carta 3D 🔒
                </button>
              ` : `
                <a href="boarding-pass.html?pnr=${encodeURIComponent(b.codice_prenotazione)}" class="px-5 py-2.5 rounded-xl bg-forest-900 hover:bg-forest-850 text-lime-400 font-black text-xs uppercase tracking-wider shadow-sm transition flex items-center space-x-1.5 hover:-translate-y-0.5">
                  <span>Vedi Carta 3D</span>
                  <span>→</span>
                </a>
              `}
            </div>
          </div>

        </div>
      `;
    }).join('');

  } catch (err) {
    listaBigliettiContainer.innerHTML = `
      <div class="p-8 text-center text-red-600 font-bold text-xs bg-red-50 rounded-2xl border border-red-200">
        Errore recupero biglietti: ${err.message}
      </div>
    `;
  }
}

// =============================================================================
// 3. CHECK-IN REALE CON SCANNER LASER 3D
// =============================================================================

window.eseguiCheckIn = function(codicePnr) {
  const biglietto = userBookings.find(b => b.codice_prenotazione === codicePnr);
  const volo = biglietto?.voli || {};

  startGateScanner3D(
    codicePnr, 
    { origine: volo.aeroporto_origine || 'LIN', destinazione: volo.aeroporto_destinazione || 'MNZ' },
    async () => {
      showAlert(`✓ Check-in completato per ${codicePnr}! (+5 XP / +50 Miglia accreditate).`);
      await fetchUserData();
    }
  );
};

// =============================================================================
// 4. STORE RISCATTO MIGLIA & STORICO REALE
// =============================================================================

window.richiediRiscatto = async function(tipoPremio, costoMiglia) {
  if (!currentProfile) return;

  if ((currentProfile.miles_balance || 0) < costoMiglia) {
    showAlert(`Saldo insufficiente: ti mancano ${costoMiglia - (currentProfile.miles_balance || 0)} miglia.`, true);
    return;
  }

  if (!confirm(`Confermi il riscatto di "${tipoPremio}" per ${costoMiglia} Miglia?`)) return;

  try {
    const sb = getSupabase();
    const { error } = await sb.rpc('richiedi_riscatto_premio', {
      p_tipo_premio: tipoPremio,
      p_costo_miglia: costoMiglia
    });

    if (error) throw error;

    showAlert(`✓ Richiesta riscatto inviata all'amministrazione! Miglia scalate: -${costoMiglia}.`);
    await fetchUserData();
    await caricaStoricoRiscatti();

  } catch (err) {
    showAlert(`Errore riscatto: ${err.message}`, true);
  }
};

async function caricaStoricoRiscatti() {
  if (!listaRiscattiContainer) return;

  try {
    const sb = getSupabase();
    const { data: riscatti, error } = await sb
      .from('richieste_premi')
      .select('*')
      .eq('utente_id', currentUser.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!riscatti || riscatti.length === 0) {
      listaRiscattiContainer.innerHTML = `
        <div class="p-6 text-center text-slate-400 text-xs font-semibold">
          Nessuna richiesta di riscatto inviata finora.
        </div>
      `;
      return;
    }

    listaRiscattiContainer.innerHTML = riscatti.map(r => {
      const dataStr = new Date(r.created_at).toLocaleDateString('it-IT');
      let statusBadge = '';

      if (r.stato === 'in_attesa') {
        statusBadge = '<span class="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-amber-100 text-amber-900 border border-amber-300">⏳ In Attesa</span>';
      } else if (r.stato === 'approvato') {
        statusBadge = '<span class="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-300">✓ Approvato</span>';
      } else {
        statusBadge = '<span class="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-rose-100 text-rose-800 border border-rose-200">✕ Rifiutato (Rimborsato)</span>';
      }

      return `
        <div class="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div>
            <div class="font-extrabold text-slate-900 text-sm">${r.tipo_premio}</div>
            <div class="text-slate-500 text-[11px] mt-0.5">
              Data: <b>${dataStr}</b> • Costo: <b class="text-forest-900 font-mono">-${r.costo_miglia} Miglia</b>
              ${r.note_admin ? `<span class="block text-slate-600 mt-1 italic">Nota: ${r.note_admin}</span>` : ''}
            </div>
          </div>
          <div>${statusBadge}</div>
        </div>
      `;
    }).join('');

  } catch (err) {
    console.warn('Errore storico:', err);
  }
}

// =============================================================================
// 5. TABELLONE FIDS REALE (TRATTA COMPLETA & STATI LIVE AUTOMATICI)
// =============================================================================

window.caricaTabelloneFIDS = async function() {
  if (!fidsTableBody) return;

  try {
    const sb = getSupabase();
    const { data: voli, error } = await sb
      .from('voli')
      .select('*')
      .neq('stato', 'cancellato')
      .order('data_ora_partenza', { ascending: true })
      .limit(15);

    if (error) throw error;

    fidsVoliInMemoria = voli || [];
    renderFidsTable(fidsVoliInMemoria);

  } catch (err) {
    fidsTableBody.innerHTML = `<tr><td colspan="5" class="py-6 text-center text-red-400 font-mono text-xs">Errore radar FIDS: ${err.message}</td></tr>`;
  }
};

function renderFidsTable(voli) {
  if (!fidsTableBody) return;

  if (!voli || voli.length === 0) {
    fidsTableBody.innerHTML = `
      <tr>
        <td colspan="5" class="py-8 text-center text-slate-500 font-mono">
          NESSUN VOLO PROGRAMMATO SUL RADAR CENTRALE
        </td>
      </tr>
    `;
    return;
  }

  fidsTableBody.innerHTML = voli.map(v => {
    const d = new Date(v.data_ora_partenza);
    const orario = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    const statoInfo = calcolaStatoVoloLive(v);

    return `
      <tr class="hover:bg-slate-900/80 transition font-mono border-b border-slate-900">
        <td class="py-3.5 px-4 text-amber-300 font-black text-sm">${orario}</td>
        <td class="py-3.5 px-4 text-white font-black tracking-wider">
          <span class="text-white">${v.aeroporto_origine}</span>
          <span class="text-lime-400 font-bold px-1">➔</span>
          <span class="text-white">${v.aeroporto_destinazione}</span>
          ${v.is_private_charter ? '<span class="ml-2 px-1.5 py-0.5 text-[9px] bg-amber-400/20 text-amber-300 border border-amber-400/30 rounded">VIP CHARTER</span>' : ''}
        </td>
        <td class="py-3.5 px-4 text-lime-400 font-extrabold text-sm">${v.codice_volo}</td>
        <td class="py-3.5 px-4 text-center font-black text-amber-400">G04</td>
        <td class="py-3.5 px-4 text-right ${statoInfo.classe} ${statoInfo.pulse} tracking-widest uppercase">
          ${statoInfo.testo}
        </td>
      </tr>
    `;
  }).join('');
}

// =============================================================================
// 6. ACQUISTO SERVIZI EXTRA REALI SU SUPABASE
// =============================================================================

window.aggiungiServizioExtra = async function(tipoServizio, prezzo) {
  if (userBookings.length === 0) {
    showAlert("Non ci sono prenotazioni attive nel database su cui aggiungere extra.", true);
    return;
  }

  const pnrAttivo = userBookings[0].codice_prenotazione;

  try {
    const sb = getSupabase();
    const updatePayload = {};

    if (tipoServizio.includes('Pasto')) updatePayload.in_flight_meal = true;
    else if (tipoServizio.includes('Gruppo 1')) updatePayload.priority_boarding = true;
    else if (tipoServizio.includes('Animale')) updatePayload.pet_in_cabin = true;
    else if (tipoServizio.includes('Bagaglio')) updatePayload.extra_baggage = true;
    else if (tipoServizio.includes('Fast Track')) updatePayload.fast_track = true;
    else if (tipoServizio.includes('Lounge')) updatePayload.lounge_access = true;

    const { error } = await sb
      .from('prenotazioni')
      .update(updatePayload)
      .eq('codice_prenotazione', pnrAttivo);

    if (error) throw error;

    showAlert(`✓ Servizio ${tipoServizio} aggiunto con successo al volo ${pnrAttivo}!`);
    await fetchUserBookings();

  } catch (err) {
    showAlert(`Errore acquisto servizio: ${err.message}`, true);
  }
};

// =============================================================================
// 7. UTILITY & TAB SWITCHER
// =============================================================================

function startFidsClock() {
  if (!fidsClock) return;
  const update = () => {
    fidsClock.textContent = new Date().toLocaleTimeString('it-IT', { hour12: false });
  };
  update();
  setInterval(update, 1000);
}

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

function resetTabs() {
  [tabBtnVoli, tabBtnBenefits, tabBtnFids, tabBtnExtra].forEach(btn => {
    if (btn) btn.className = 'px-5 py-2.5 rounded-xl text-slate-600 hover:text-slate-900 text-xs font-bold transition-all flex items-center space-x-2';
  });
  [sectionVoli, sectionBenefits, sectionFids, sectionExtra].forEach(sec => sec?.classList.add('hidden'));
}

if (tabBtnVoli) {
  tabBtnVoli.addEventListener('click', () => {
    resetTabs();
    tabBtnVoli.className = 'px-5 py-2.5 rounded-xl bg-forest-900 text-white text-xs font-extrabold shadow-sm transition-all flex items-center space-x-2';
    sectionVoli?.classList.remove('hidden');
  });
}

if (tabBtnBenefits) {
  tabBtnBenefits.addEventListener('click', () => {
    resetTabs();
    tabBtnBenefits.className = 'px-5 py-2.5 rounded-xl bg-forest-900 text-white text-xs font-extrabold shadow-sm transition-all flex items-center space-x-2';
    sectionBenefits?.classList.remove('hidden');
    caricaStoricoRiscatti();
  });
}

if (tabBtnFids) {
  tabBtnFids.addEventListener('click', () => {
    resetTabs();
    tabBtnFids.className = 'px-5 py-2.5 rounded-xl bg-forest-900 text-white text-xs font-extrabold shadow-sm transition-all flex items-center space-x-2';
    sectionFids?.classList.remove('hidden');
    caricaTabelloneFIDS();
  });
}

if (tabBtnExtra) {
  tabBtnExtra.addEventListener('click', () => {
    resetTabs();
    tabBtnExtra.className = 'px-5 py-2.5 rounded-xl bg-forest-900 text-white text-xs font-extrabold shadow-sm transition-all flex items-center space-x-2';
    sectionExtra?.classList.remove('hidden');
  });
}