// =============================================================================
// LOMBARDAIR - DASHBOARD PASSEGGERO REALE (passenger-dashboard.js)
// Integrazione Scanner Laser 3D, Check-in Atomico, Benefits & Nuovi Servizi Extra
// =============================================================================

import { getSupabase } from './config.js';
import { getCurrentUser, logout } from './auth.js';
import { startGateScanner3D } from './scanner-3d.js';

// Riferimenti DOM Utente & Club Flying Lomb
const userDisplayName = document.getElementById('user-display-name');
const userDisplayEmail = document.getElementById('user-display-email');
const welcomeTitle = document.getElementById('welcome-title');
const btnLogout = document.getElementById('btn-user-logout');
const alertBox = document.getElementById('passenger-alert');

// Riferimenti DOM Tab Navigation
const tabBtnVoli = document.getElementById('tab-btn-voli');
const tabBtnBenefits = document.getElementById('tab-btn-benefits');
const tabBtnFids = document.getElementById('tab-btn-fids');
const tabBtnExtra = document.getElementById('tab-btn-extra');

const sectionVoli = document.getElementById('section-voli');
const sectionBenefits = document.getElementById('section-benefits');
const sectionFids = document.getElementById('section-fids');
const sectionExtra = document.getElementById('section-extra');

// Contenitori Dinamici
const listaBigliettiContainer = document.getElementById('lista-biglietti-container');
const listaRiscattiContainer = document.getElementById('lista-riscatti-container');
const fidsTableBody = document.getElementById('fids-table-body');
const fidsClock = document.getElementById('fids-clock');

// Stato in memoria
let currentUser = null;
let currentProfile = null;
let userBookings = [];

// =============================================================================
// 1. INIZIALIZZAZIONE & CONTROLLO SESSIONE
// =============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  startFidsClock();
  await fetchUserData();
  await caricaTabelloneFIDS();
  await caricaStoricoRiscatti();
});

if (btnLogout) {
  btnLogout.addEventListener('click', logout);
}

/**
 * Recupera il profilo reale da Supabase e calcola lo stato "Flying Lomb"
 */
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

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

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
    showAlert(`Errore nel caricamento del profilo: ${err.message}`, true);
  }
}

/**
 * Renderizza il badge fedeltà Flying Lomb sia nella topbar che nell'Hero
 */
function renderLoyaltyCard(p) {
  const nomeCompleto = `${p.nome || ''} ${p.cognome || ''}`.trim() || currentUser.email;
  
  if (userDisplayName) userDisplayName.textContent = nomeCompleto;
  if (userDisplayEmail) userDisplayEmail.textContent = currentUser.email;
  if (welcomeTitle) welcomeTitle.textContent = `Bentornato a bordo, ${p.nome || nomeCompleto}`;

  const xp = p.xp_balance || 0;
  let tier = p.loyalty_tier || 'Explorer';
  let nextThreshold = 100;
  let tierColor = 'bg-slate-700 text-slate-200';

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
  } else {
    tier = 'Explorer';
    nextThreshold = 100;
    tierColor = 'bg-forest-800 text-lime-400 border border-lime-500/40';
  }

  // Aggiorna il box Flying Lomb nell'Hero
  const heroLoyaltyBox = document.querySelector('.bg-white\\/5.border.border-white\\/10') || document.querySelector('.bg-white\\/5');
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
// 2. RECUPERO PRENOTAZIONI ATTIVE & CARD BIGLIETTI (I MIEI VOLI)
// =============================================================================

async function fetchUserBookings() {
  if (!listaBigliettiContainer) return;

  listaBigliettiContainer.innerHTML = `
    <div class="p-10 text-center bg-white rounded-3xl border border-slate-200/80 text-xs font-semibold text-slate-400 animate-pulse">
      Caricamento titoli di viaggio dal database Supabase...
    </div>
  `;

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

    // Fallback dimostrativo se non ci sono ancora biglietti nel database
    if (userBookings.length === 0) {
      userBookings = [
        {
          id: 'demo-flight',
          codice_prenotazione: 'LM-8K9F2',
          nome_passeggero: currentProfile?.nome || 'Test',
          cognome_passeggero: currentProfile?.cognome || 'User',
          posto_assegnato: '04A',
          prezzo_finale: 89.00,
          stato: 'confermata',
          check_in_status: false,
          in_flight_meal: false,
          priority_boarding: false,
          pet_in_cabin: false,
          extra_baggage: false,
          fast_track: false,
          lounge_access: false,
          seat_selection_fee: 0,
          voli: {
            codice_volo: 'LM-102',
            aeroporto_origine: 'LIN',
            aeroporto_destinazione: 'MNZ',
            data_ora_partenza: new Date(Date.now() + 3600000 * 2).toISOString(),
            data_ora_arrivo: new Date(Date.now() + 3600000 * 2 + 1500000).toISOString(),
            stato: 'programmato'
          }
        }
      ];
    }

    // Rendering delle Card Biglietto
    listaBigliettiContainer.innerHTML = userBookings.map(b => {
      const v = b.voli || {};
      const dPartenza = v.data_ora_partenza ? new Date(v.data_ora_partenza) : new Date();
      const oraPartenza = dPartenza.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
      const dataStr = dPartenza.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
      const isCheckedIn = b.check_in_status === true;

      const extraList = [];
      if (b.in_flight_meal) extraList.push('🍽️ Pasto Catering');
      if (b.priority_boarding) extraList.push('🚀 Gruppo 1 Priority');
      if (b.pet_in_cabin) extraList.push('🐾 Pet Pass');
      if (b.extra_baggage) extraList.push('🧳 Bagaglio 23kg');
      if (b.fast_track) extraList.push('⚡ Fast Track');
      if (b.lounge_access) extraList.push('🍸 Lounge VIP');
      if (b.seat_selection_fee > 0) extraList.push('⭐ Posto Premium');

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
        Errore durante il recupero dei biglietti: ${err.message}
      </div>
    `;
  }
}

// =============================================================================
// 3. CHECK-IN CON SCANNER LASER 3D (+5 XP e +50 Miglia)
// =============================================================================

window.eseguiCheckIn = function(codicePnr) {
  const biglietto = userBookings.find(b => b.codice_prenotazione === codicePnr);
  const volo = biglietto?.voli || {};

  startGateScanner3D(
    codicePnr, 
    { origine: volo.aeroporto_origine || 'LIN', destinazione: volo.aeroporto_destinazione || 'MNZ' },
    async () => {
      showAlert(`✓ Check-in completato per ${codicePnr}! Hai guadagnato +5 XP e +50 Miglia.`);
      if (biglietto) biglietto.check_in_status = true;
      await fetchUserData();
    }
  );
};

// =============================================================================
// 4. STORE RISCATTO MIGLIA & BENEFIT
// =============================================================================

window.richiediRiscatto = async function(tipoPremio, costoMiglia) {
  if (!currentProfile) return;

  if ((currentProfile.miles_balance || 0) < costoMiglia) {
    showAlert(`Saldo insufficiente: ti mancano ${costoMiglia - (currentProfile.miles_balance || 0)} miglia per richiedere questo premio.`, true);
    return;
  }

  if (!confirm(`Confermi la richiesta di riscatto per "${tipoPremio}" al costo di ${costoMiglia} Miglia?`)) {
    return;
  }

  try {
    const sb = getSupabase();
    showAlert(`Elaborazione riscatto "${tipoPremio}" in corso...`);

    const { data, error } = await sb.rpc('richiedi_riscatto_premio', {
      p_tipo_premio: tipoPremio,
      p_costo_miglia: costoMiglia
    });

    if (error) throw error;

    showAlert(`✓ Richiesta di riscatto per "${tipoPremio}" inviata all'amministrazione! Miglia scalate: -${costoMiglia}.`);
    await fetchUserData();
    await caricaStoricoRiscatti();

  } catch (err) {
    showAlert(`Errore nel riscatto del premio: ${err.message}`, true);
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
          Nessuna richiesta di riscatto premio inviata finora.
        </div>
      `;
      return;
    }

    listaRiscattiContainer.innerHTML = riscatti.map(r => {
      const dataStr = new Date(r.created_at).toLocaleDateString('it-IT');
      let statusBadge = '';

      if (r.stato === 'in_attesa') {
        statusBadge = '<span class="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-amber-100 text-amber-900 border border-amber-300">⏳ In Attesa Approvazione Admin</span>';
      } else if (r.stato === 'approvato') {
        statusBadge = '<span class="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-300">✓ Approvato & Convalidato</span>';
      } else {
        statusBadge = '<span class="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-rose-100 text-rose-800 border border-rose-200">✕ Rifiutato (Miglia Rimborsate)</span>';
      }

      return `
        <div class="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div>
            <div class="font-extrabold text-slate-900 text-sm">${r.tipo_premio}</div>
            <div class="text-slate-500 text-[11px] mt-0.5">
              Data: <b>${dataStr}</b> • Costo: <b class="text-forest-900 font-mono">-${r.costo_miglia} Miglia</b>
              ${r.note_admin ? `<span class="block text-slate-600 mt-1 italic">Nota Admin: ${r.note_admin}</span>` : ''}
            </div>
          </div>
          <div>${statusBadge}</div>
        </div>
      `;
    }).join('');

  } catch (err) {
    console.warn('Errore storico riscatti:', err);
  }
}

// =============================================================================
// 5. TABELLONE FIDS REALE
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
      .limit(10);

    if (error) throw error;

    const listaVoli = (voli && voli.length > 0) ? voli : [
      { data_ora_partenza: new Date(Date.now() + 1800000).toISOString(), aeroporto_destinazione: 'MONZA HUB (MNZ)', codice_volo: 'LM 102', stato: 'in_imbarco', is_private_charter: false },
      { data_ora_partenza: new Date(Date.now() + 7200000).toISOString(), aeroporto_destinazione: 'MILANO MALPENSA (MXP)', codice_volo: 'LM 104', stato: 'programmato', is_private_charter: false },
      { data_ora_partenza: new Date(Date.now() + 14400000).toISOString(), aeroporto_destinazione: 'MILANO LINATE (LIN)', codice_volo: 'LM 201', stato: 'programmato', is_private_charter: false }
    ];

    fidsTableBody.innerHTML = listaVoli.map(v => {
      const d = new Date(v.data_ora_partenza);
      const orario = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
      
      let statusColor = 'text-slate-300';
      let pulseAnim = '';
      let statusText = 'IN ORARIO';

      if (v.stato === 'in_imbarco') {
        statusColor = 'text-lime-400 font-black';
        pulseAnim = 'animate-pulse';
        statusText = 'IMBARCO';
      } else if (v.stato === 'in_volo') {
        statusColor = 'text-blue-400 font-black';
        statusText = 'IN VOLO';
      } else if (v.stato === 'atterrato') {
        statusColor = 'text-slate-500 font-semibold';
        statusText = 'ATTERRATO';
      } else if (v.stato === 'in_ritardo') {
        statusColor = 'text-amber-400 font-black';
        statusText = `RITARDO +${v.ritardo_minuti || 15}M`;
      }

      return `
        <tr class="hover:bg-slate-900/80 transition font-mono border-b border-slate-900">
          <td class="py-3.5 px-4 text-amber-300 font-black">${orario}</td>
          <td class="py-3.5 px-4 text-white font-black tracking-wider">
            ${v.aeroporto_destinazione} 
            ${v.is_private_charter ? '<span class="ml-2 px-1.5 py-0.5 text-[9px] bg-amber-400/20 text-amber-300 border border-amber-400/30 rounded">VIP CHARTER</span>' : ''}
          </td>
          <td class="py-3.5 px-4 text-lime-400 font-extrabold">${v.codice_volo}</td>
          <td class="py-3.5 px-4 text-center font-black text-amber-400">G04</td>
          <td class="py-3.5 px-4 text-right ${statusColor} ${pulseAnim} tracking-widest uppercase">
            ${statusText}
          </td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    fidsTableBody.innerHTML = `
      <tr>
        <td colspan="5" class="py-6 text-center text-red-400 font-mono text-xs">
          Errore radar FIDS: ${err.message}
        </td>
      </tr>
    `;
  }
};

// =============================================================================
// 6. ACQUISTO SERVIZI EXTRA
// =============================================================================

window.aggiungiServizioExtra = async function(tipoServizio, prezzo) {
  if (userBookings.length === 0) {
    showAlert("Nessuna prenotazione attiva trovata.", true);
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

    if (userBookings[0].id !== 'demo-flight') {
      const { error } = await sb
        .from('prenotazioni')
        .update(updatePayload)
        .eq('codice_prenotazione', pnrAttivo);

      if (error) throw error;
    } else {
      Object.assign(userBookings[0], updatePayload);
    }

    showAlert(`✓ Servizio ${tipoServizio} (€ ${prezzo.toFixed(2)}) aggiunto con successo al volo ${pnrAttivo}!`);
    await fetchUserBookings();

  } catch (err) {
    showAlert(`Errore nell'acquisto del servizio: ${err.message}`, true);
  }
};

// =============================================================================
// 7. UTILITY: OROLOGIO, ALERT & TABS SWITCHER (COMPLETI E FUNZIONANTI)
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