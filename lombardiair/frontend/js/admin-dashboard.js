// =============================================================================
// LOMBARDAIR - CONTROL ROOM AMMINISTRATIVA B2B REALE (admin-dashboard.js)
// Gestione Azioni Rapide Ritardi, Manifest Extra, Approvazione Premi & Punti
// =============================================================================

import { getSupabase } from './config.js';
import { requireAuth, logout } from './auth.js';

// Riferimenti DOM Utente & Feedback
const userNameDisplay = document.getElementById('admin-user-name');
const btnLogout = document.getElementById('btn-admin-logout');
const alertBox = document.getElementById('admin-alert');

// Riferimenti DOM KPI
const kpiTotVoli = document.getElementById('kpi-totale-voli');
const kpiVoliAttivi = document.getElementById('kpi-voli-attivi');
const kpiTotPrenotazioni = document.getElementById('kpi-totale-prenotazioni');
const kpiTotIncassi = document.getElementById('kpi-totale-incassi');

// Riferimenti DOM Tabelle
const tableVoliBody = document.getElementById('table-voli-body');
const tablePasseggeriBody = document.getElementById('table-passeggeri-body');
const tablePremiBody = document.getElementById('table-premi-body');
const tableUtentiBody = document.getElementById('table-utenti-body');

// Riferimenti DOM Switcher Tab (4 Sezioni)
const tabVoli = document.getElementById('tab-voli');
const tabPasseggeri = document.getElementById('tab-passeggeri');
const tabPremi = document.getElementById('tab-premi');
const tabUtenti = document.getElementById('tab-utenti');

const sectionVoli = document.getElementById('section-voli');
const sectionPasseggeri = document.getElementById('section-passeggeri');
const sectionPremi = document.getElementById('section-premi');
const sectionUtenti = document.getElementById('section-utenti');

// Riferimenti DOM Modali
const btnOpenModal = document.getElementById('btn-open-modal-volo');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnCancelModal = document.getElementById('btn-cancel-modal');
const modalVolo = document.getElementById('modal-nuovo-volo');
const formCreateFlight = document.getElementById('form-create-flight');
const btnSubmitFlight = document.getElementById('btn-submit-flight');

const modalModificaVolo = document.getElementById('modal-modifica-volo');
const formEditFlight = document.getElementById('form-edit-flight');

const modalPuntiUtente = document.getElementById('modal-punti-utente');
const formPuntiUtente = document.getElementById('form-punti-utente');

// =============================================================================
// UTILITY & FEEDBACK VISIVO
// =============================================================================

function showAlert(message, isError = false) {
  if (!alertBox) return;
  alertBox.textContent = message;
  alertBox.className = `mb-6 p-4 rounded-2xl text-xs font-bold leading-relaxed border transition-all duration-300 ${
    isError 
      ? 'bg-red-50 text-red-700 border-red-200' 
      : 'bg-emerald-50 text-emerald-800 border-emerald-200 shadow-sm'
  }`;
  alertBox.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  setTimeout(() => alertBox.classList.add('hidden'), 5000);
}

function formatDate(isoStr) {
  if (!isoStr) return '---';
  const d = new Date(isoStr);
  return `${d.toLocaleDateString('it-IT')} ore ${d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`;
}

// =============================================================================
// INIZIALIZZAZIONE DASHBOARD & CONTROLLO ACCESSO
// =============================================================================

async function initDashboard() {
  const sessionData = await requireAuth('admin');
  if (!sessionData) return;

  const { profile } = sessionData;
  if (userNameDisplay) {
    userNameDisplay.textContent = `Operatore: ${profile?.nome || 'Alessandro'} ${profile?.cognome || 'Di Blasio'} (Admin)`;
  }

  await Promise.all([
    loadStats(),
    loadFlightsTable(),
    loadPassengersTable(),
    loadPremiTable(),
    loadUtentiTable()
  ]);
}

// =============================================================================
// 1. CARICAMENTO METRICHE KPI REALI DA SUPABASE
// =============================================================================

async function loadStats() {
  try {
    const sb = getSupabase();

    const [voliRes, prenRes] = await Promise.all([
      sb.from('voli').select('id, stato'),
      sb.from('prenotazioni').select('id, prezzo_finale, stato').neq('stato', 'annullata')
    ]);

    const voli = voliRes.data || [];
    const prenotazioni = prenRes.data || [];

    const totVoli = voli.length;
    const voliAttivi = voli.filter(v => v.stato === 'programmato' || v.stato === 'in_imbarco' || v.stato === 'in_volo' || v.stato === 'in_ritardo').length;
    const totPrenotazioni = prenotazioni.length;
    const incassoTotale = prenotazioni.reduce((acc, p) => acc + parseFloat(p.prezzo_finale || 0), 0);

    if (kpiTotVoli) kpiTotVoli.textContent = totVoli;
    if (kpiVoliAttivi) kpiVoliAttivi.textContent = voliAttivi;
    if (kpiTotPrenotazioni) kpiTotPrenotazioni.textContent = totPrenotazioni;
    if (kpiTotIncassi) {
      kpiTotIncassi.textContent = `€ ${incassoTotale.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
  } catch (err) {
    console.error('Errore caricamento KPI:', err);
  }
}

// =============================================================================
// 2. TABELLA FLOTTA VOLI & AZIONI RAPIDE RITARDI (+15M / +30M / RIPRISTINO)
// =============================================================================

window.loadFlightsTable = async function() {
  if (!tableVoliBody) return;

  try {
    const sb = getSupabase();
    const { data: flights, error } = await sb
      .from('voli')
      .select('*')
      .order('data_ora_partenza', { ascending: true });

    if (error) throw error;

    if (!flights || flights.length === 0) {
      tableVoliBody.innerHTML = `
        <tr>
          <td colspan="7" class="px-6 py-16 text-center text-slate-400 font-bold">
            Nessun volo registrato. Clicca su "+ Aggiungi Nuovo Volo" per iniziare.
          </td>
        </tr>
      `;
      return;
    }

    tableVoliBody.innerHTML = flights.map(v => {
      const isCancellato = v.stato === 'cancellato';
      const hasRitardo = v.ritardo_minuti > 0;

      let statoBadge = `<span class="badge-status ${v.stato}">${v.stato}</span>`;
      if (hasRitardo) {
        statoBadge = `<span class="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-amber-100 text-amber-950 border border-amber-300">⚠️ RITARDO +${v.ritardo_minuti}M</span>`;
      }

      return `
        <tr class="hover:bg-slate-50/80 transition border-b border-slate-100 text-xs">
          <td class="px-6 py-4 font-mono font-black text-forest-950 text-sm">
            ${v.codice_volo}
          </td>
          <td class="px-6 py-4">
            <span class="font-extrabold text-slate-900">${v.aeroporto_origine}</span> 
            <span class="text-lime-600 font-bold px-1">➔</span> 
            <span class="font-extrabold text-slate-900">${v.aeroporto_destinazione}</span>
          </td>
          <td class="px-6 py-4 font-semibold">
            <div class="text-slate-900"><b>Partenza:</b> ${formatDate(v.data_ora_partenza)}</div>
            <div class="text-slate-400"><b>Arrivo:</b> ${formatDate(v.data_ora_arrivo)}</div>
          </td>
          <td class="px-6 py-4 text-center">
            <span class="font-black ${v.posti_disponibili <= 5 ? 'text-red-600' : 'text-slate-800'}">
              ${v.posti_disponibili}
            </span>
            <span class="text-xs text-slate-400 font-bold">/ ${v.posti_totali}</span>
          </td>
          <td class="px-6 py-4 font-black font-mono text-slate-900 text-sm">
            € ${parseFloat(v.prezzo_base).toFixed(2)}
          </td>
          <td class="px-6 py-4">
            <div class="flex items-center gap-1.5 flex-wrap">
              ${statoBadge}
              ${v.is_private_charter ? `
                <span class="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300">
                  VIP Charter
                </span>
              ` : ''}
            </div>
          </td>
          <td class="px-6 py-4 text-right space-x-1 whitespace-nowrap">
            <!-- Azioni Rapide Ritardi -->
            ${!isCancellato ? `
              <button onclick="dichiaraRitardo('${v.id}', '${v.codice_volo}', 15)" title="Applica 15 minuti di ritardo" class="px-2 py-1 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg text-[10px] font-black text-amber-800 transition">
                ⏱️ +15m
              </button>
              <button onclick="dichiaraRitardo('${v.id}', '${v.codice_volo}', 30)" title="Applica 30 minuti di ritardo" class="px-2 py-1 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg text-[10px] font-black text-amber-800 transition">
                ⏱️ +30m
              </button>
              ${hasRitardo ? `
                <button onclick="ripristinaVolo('${v.id}', '${v.codice_volo}')" title="Ripristina schedulazione regolare" class="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg text-[10px] font-black text-emerald-800 transition">
                  ✓ In Orario
                </button>
              ` : ''}
              <button onclick="apriModaleModificaVolo('${v.id}', '${v.codice_volo}', ${v.prezzo_base}, '${v.stato}')" class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-700 transition">
                ✏️ Modifica
              </button>
              <button onclick="cancellaVolo('${v.id}', '${v.codice_volo}')" class="text-red-600 hover:text-red-800 text-[10px] font-bold bg-red-50 hover:bg-red-100 border border-red-200 px-2.5 py-1 rounded-lg transition">
                Cancella
              </button>
            ` : `
              <span class="text-xs text-slate-400 font-semibold italic">Cancellato</span>
            `}
          </td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    tableVoliBody.innerHTML = `<tr><td colspan="7" class="px-6 py-8 text-center text-red-600 font-bold">${err.message}</td></tr>`;
  }
};

window.dichiaraRitardo = async function(voloId, codice, minuti) {
  try {
    const sb = getSupabase();
    showAlert(`Applicazione ritardo di +${minuti} minuti al volo ${codice}...`);

    const { data, error } = await sb.rpc('imposta_ritardo_volo_admin', {
      p_volo_id: voloId,
      p_minuti_ritardo: minuti,
      p_nuovo_stato: 'in_ritardo'
    });

    if (error) throw error;

    showAlert(`✓ Volo ${codice} aggiornato con +${minuti} minuti di ritardo.`);
    await loadFlightsTable();
    await loadStats();

  } catch (err) {
    showAlert(`Errore applicazione ritardo: ${err.message}`, true);
  }
};

window.ripristinaVolo = async function(voloId, codice) {
  try {
    const sb = getSupabase();
    showAlert(`Ripristino orario regolare per volo ${codice}...`);

    const { data, error } = await sb.rpc('imposta_ritardo_volo_admin', {
      p_volo_id: voloId,
      p_minuti_ritardo: 0,
      p_nuovo_stato: 'programmato'
    });

    if (error) throw error;

    showAlert(`✓ Volo ${codice} ripristinato su "In Orario".`);
    await loadFlightsTable();
    await loadStats();

  } catch (err) {
    showAlert(`Errore ripristino: ${err.message}`, true);
  }
};

window.cancellaVolo = async function(id, codice) {
  if (confirm(`Confermi la cancellazione del volo ${codice}? L'operazione aggiornerà lo stato in 'cancellato'.`)) {
    try {
      const sb = getSupabase();
      const { error } = await sb.from('voli').update({ stato: 'cancellato' }).eq('id', id);
      if (error) throw error;
      showAlert(`Volo ${codice} contrassegnato come cancellato.`);
      await loadFlightsTable();
      await loadStats();
    } catch (err) {
      showAlert(`Errore cancellazione: ${err.message}`, true);
    }
  }
};

window.apriModaleModificaVolo = function(id, codice, prezzo, stato) {
  document.getElementById('edit-volo-id').value = id;
  document.getElementById('edit-volo-title').textContent = `Modifica Volo ${codice}`;
  document.getElementById('edit-volo-prezzo').value = prezzo;
  document.getElementById('edit-volo-stato').value = stato;
  modalModificaVolo?.classList.remove('hidden');
};

if (formEditFlight) {
  formEditFlight.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-volo-id').value;
    const nuovoPrezzo = parseFloat(document.getElementById('edit-volo-prezzo').value);
    const nuovoStato = document.getElementById('edit-volo-stato').value;

    try {
      const sb = getSupabase();
      const { error } = await sb.from('voli').update({
        prezzo_base: nuovoPrezzo,
        stato: nuovoStato
      }).eq('id', id);

      if (error) throw error;

      modalModificaVolo?.classList.add('hidden');
      showAlert("Volo e tariffa base aggiornati con successo.");
      await loadFlightsTable();
      await loadStats();
    } catch (err) {
      alert(`Errore salvataggio: ${err.message}`);
    }
  });
}

// =============================================================================
// 3. MANIFEST PASSEGGERI (CHECK-IN STATUS & TUTTI I 6 SERVIZI EXTRA)
// =============================================================================

window.loadPassengersTable = async function() {
  if (!tablePasseggeriBody) return;

  try {
    const sb = getSupabase();
    const { data: bookings, error } = await sb
      .from('prenotazioni')
      .select('*, voli(*)')
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!bookings || bookings.length === 0) {
      tablePasseggeriBody.innerHTML = `<tr><td colspan="8" class="px-6 py-16 text-center text-slate-400 font-bold">Nessun biglietto emesso finora.</td></tr>`;
      return;
    }

    tablePasseggeriBody.innerHTML = bookings.map(b => {
      const v = b.voli || {};
      const isCheckedIn = b.check_in_status === true;

      // Elenco Completo Servizi Extra Reali
      const extras = [];
      if (b.in_flight_meal) extras.push('<span class="px-2 py-0.5 bg-orange-50 text-orange-900 border border-orange-200 rounded text-[10px] font-bold">🍽️ Pasto Catering</span>');
      if (b.priority_boarding) extras.push('<span class="px-2 py-0.5 bg-lime-50 text-forest-900 border border-lime-300 rounded text-[10px] font-bold">🚀 Gruppo 1 Priority</span>');
      if (b.pet_in_cabin) extras.push('<span class="px-2 py-0.5 bg-purple-50 text-purple-900 border border-purple-200 rounded text-[10px] font-bold">🐾 Pet Pass</span>');
      if (b.extra_baggage) extras.push('<span class="px-2 py-0.5 bg-blue-50 text-blue-800 rounded border border-blue-200 text-[10px] font-bold">🧳 Bagaglio 23kg</span>');
      if (b.fast_track) extras.push('<span class="px-2 py-0.5 bg-lime-50 text-forest-900 rounded border border-lime-300 text-[10px] font-bold">⚡ Fast Track</span>');
      if (b.lounge_access) extras.push('<span class="px-2 py-0.5 bg-amber-50 text-amber-800 rounded border border-amber-300 text-[10px] font-bold">🍸 Lounge VIP</span>');
      if (b.seat_selection_fee > 0) extras.push('<span class="px-2 py-0.5 bg-slate-100 text-slate-800 rounded border border-slate-200 text-[10px] font-bold">⭐ Posto Premium</span>');

      return `
        <tr class="hover:bg-slate-50/80 transition border-b border-slate-100 text-xs">
          <td class="px-6 py-4 font-mono font-black text-forest-950 text-sm">${b.codice_prenotazione}</td>
          <td class="px-6 py-4 font-bold text-slate-900">
            ${b.nome_passeggero} ${b.cognome_passeggero}
            <span class="block text-[10px] text-slate-400 font-mono uppercase">${b.documento_identita}</span>
          </td>
          <td class="px-6 py-4 font-bold text-slate-800">${v.codice_volo || 'LMB'} (${v.aeroporto_origine || ''} ➔ ${v.aeroporto_destinazione || ''})</td>
          <td class="px-6 py-4 text-center">
            <span class="font-black text-xs text-lime-800 bg-lime-100 border border-lime-300 px-2.5 py-1 rounded-lg">${b.posto_assegnato}</span>
          </td>
          <td class="px-6 py-4">
            ${isCheckedIn ? `
              <span class="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-300">✓ Check-in Effettuato</span>
            ` : `
              <span class="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-rose-100 text-rose-800 border border-rose-200">✕ Non Effettuato</span>
            `}
          </td>
          <td class="px-6 py-4">
            <div class="flex items-center gap-1.5 flex-wrap">
              ${extras.length > 0 ? extras.join('') : '<span class="text-slate-400 italic text-[11px]">Nessuno</span>'}
            </div>
          </td>
          <td class="px-6 py-4 font-black font-mono text-slate-900">€ ${parseFloat(b.prezzo_finale).toFixed(2)}</td>
          <td class="px-6 py-4 text-xs text-slate-500 font-semibold">${formatDate(b.created_at)}</td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    tablePasseggeriBody.innerHTML = `<tr><td colspan="8" class="px-6 py-8 text-center text-red-600 font-bold">${err.message}</td></tr>`;
  }
};

// =============================================================================
// 4. TABELLA APPROVAZIONE RISCATTI PREMI (STORE MIGLIA)
// =============================================================================

window.loadPremiTable = async function() {
  if (!tablePremiBody) return;

  try {
    const sb = getSupabase();
    const { data: richieste, error } = await sb
      .from('richieste_premi')
      .select('*, utenti_profili(*)')
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!richieste || richieste.length === 0) {
      tablePremiBody.innerHTML = `<tr><td colspan="6" class="px-6 py-16 text-center text-slate-400 font-bold">Nessuna richiesta di riscatto premio presente.</td></tr>`;
      return;
    }

    tablePremiBody.innerHTML = richieste.map(r => {
      const u = r.utenti_profili || {};
      const nomeUtente = `${u.nome || ''} ${u.cognome || ''}`.trim() || 'Cittadino';
      const isPending = r.stato === 'in_attesa';

      let statusHtml = '';
      if (r.stato === 'in_attesa') {
        statusHtml = '<span class="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-amber-100 text-amber-900 border border-amber-300">⏳ In Attesa</span>';
      } else if (r.stato === 'approvato') {
        statusHtml = '<span class="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-300">✓ Approvato</span>';
      } else {
        statusHtml = '<span class="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-rose-100 text-rose-800 border border-rose-200">✕ Rifiutato (Rimborsato)</span>';
      }

      return `
        <tr class="hover:bg-slate-50/80 transition border-b border-slate-100 text-xs">
          <td class="px-6 py-4 text-slate-500 font-semibold">${formatDate(r.created_at)}</td>
          <td class="px-6 py-4 font-bold text-slate-900">
            ${nomeUtente}
            <span class="block text-[10px] text-slate-400 font-mono">${u.codice_fiscale || ''}</span>
          </td>
          <td class="px-6 py-4 font-extrabold text-forest-950">${r.tipo_premio}</td>
          <td class="px-6 py-4 text-center font-mono font-black text-lime-700">-${r.costo_miglia} Miglia</td>
          <td class="px-6 py-4">${statusHtml}</td>
          <td class="px-6 py-4 text-right space-x-1.5 whitespace-nowrap">
            ${isPending ? `
              <button onclick="gestisciPremio('${r.id}', 'approvato')" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition">
                ✓ Approva
              </button>
              <button onclick="gestisciPremio('${r.id}', 'rifiutato')" class="px-3 py-1.5 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-xs font-bold transition">
                ✕ Rifiuta & Rimborsa
              </button>
            ` : `
              <span class="text-xs text-slate-400 italic">Elaborato</span>
            `}
          </td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    tablePremiBody.innerHTML = `<tr><td colspan="6" class="px-6 py-8 text-center text-red-600 font-bold">${err.message}</td></tr>`;
  }
};

window.gestisciPremio = async function(richiestaId, azione) {
  const nota = azione === 'rifiutato' ? prompt("Inserisci la motivazione del rifiuto (opzionale):") : null;

  try {
    const sb = getSupabase();
    showAlert(`Elaborazione richiesta premio in corso...`);

    const { data, error } = await sb.rpc('gestisci_richiesta_premio_admin', {
      p_richiesta_id: richiestaId,
      p_nuovo_stato: azione,
      p_note: nota
    });

    if (error) throw error;

    showAlert(`✓ Richiesta premio contrassegnata come "${azione}" con successo!`);
    await loadPremiTable();
    await loadUtentiTable();

  } catch (err) {
    showAlert(`Errore gestione premio: ${err.message}`, true);
  }
};

// =============================================================================
// 5. ANAGRAFICA CITTADINI & RETTIFICA PUNTI / TIER
// =============================================================================

window.loadUtentiTable = async function() {
  if (!tableUtentiBody) return;

  try {
    const sb = getSupabase();
    const { data: utenti, error } = await sb
      .from('utenti_profili')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!utenti || utenti.length === 0) {
      tableUtentiBody.innerHTML = `<tr><td colspan="7" class="px-6 py-16 text-center text-slate-400 font-bold">Nessun utente registrato nel sistema.</td></tr>`;
      return;
    }

    tableUtentiBody.innerHTML = utenti.map(u => {
      const nomeCompleto = `${u.nome || ''} ${u.cognome || ''}`.trim() || 'Utente';
      const tier = u.loyalty_tier || 'Explorer';

      let tierBadge = 'bg-forest-800 text-lime-400';
      if (tier === 'Silver') tierBadge = 'bg-slate-200 text-slate-900 border border-slate-300';
      if (tier === 'Gold') tierBadge = 'bg-amber-400 text-forest-950 font-black';
      if (tier === 'Platinum') tierBadge = 'bg-slate-900 text-lime-400 font-black border border-white/20';

      return `
        <tr class="hover:bg-slate-50/80 transition border-b border-slate-100 text-xs">
          <td class="px-6 py-4 font-bold text-slate-900">
            ${nomeCompleto}
            <span class="block text-[10px] text-slate-400 font-mono">${u.id}</span>
          </td>
          <td class="px-6 py-4 font-mono uppercase text-slate-600 font-semibold">${u.codice_fiscale || '---'}</td>
          <td class="px-6 py-4">
            <span class="px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider ${tierBadge}">
              ★ ${tier}
            </span>
          </td>
          <td class="px-6 py-4 text-center font-mono font-black text-slate-800 text-sm">${u.xp_balance || 0} XP</td>
          <td class="px-6 py-4 text-center font-mono font-black text-lime-700 text-sm">${u.miles_balance || 0} Miglia</td>
          <td class="px-6 py-4">
            <span class="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${u.ruolo === 'admin' ? 'bg-purple-100 text-purple-900 border border-purple-300' : 'bg-slate-100 text-slate-600'}">
              ${u.ruolo}
            </span>
          </td>
          <td class="px-6 py-4 text-right">
            <button onclick="apriModalePunti('${u.id}', '${nomeCompleto}')" class="px-3 py-1.5 bg-lime-500 hover:bg-lime-400 text-forest-950 font-black rounded-xl text-xs transition">
              ⚙️ Rettifica Punti
            </button>
          </td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    tableUtentiBody.innerHTML = `<tr><td colspan="7" class="px-6 py-8 text-center text-red-600 font-bold">${err.message}</td></tr>`;
  }
};

window.apriModalePunti = function(userId, nome) {
  document.getElementById('punti-utente-id').value = userId;
  document.getElementById('punti-modal-title').textContent = `Rettifica Punti: ${nome}`;
  document.getElementById('punti-xp-delta').value = 0;
  document.getElementById('punti-miglia-delta').value = 0;
  modalPuntiUtente?.classList.remove('hidden');
};

if (formPuntiUtente) {
  formPuntiUtente.addEventListener('submit', async (e) => {
    e.preventDefault();
    const userId = document.getElementById('punti-utente-id').value;
    const xpDelta = parseInt(document.getElementById('punti-xp-delta').value, 10) || 0;
    const migliaDelta = parseInt(document.getElementById('punti-miglia-delta').value, 10) || 0;

    try {
      const sb = getSupabase();
      showAlert(`Aggiornamento punti cittadino in corso...`);

      const { data, error } = await sb.rpc('modifica_punteggio_utente_admin', {
        p_utente_id: userId,
        p_xp_delta: xpDelta,
        p_miglia_delta: migliaDelta
      });

      if (error) throw error;

      modalPuntiUtente?.classList.add('hidden');
      showAlert("Punteggio e Tier aggiornati con successo.");
      await loadUtentiTable();

    } catch (err) {
      alert(`Errore aggiornamento punti: ${err.message}`);
    }
  });
}

// =============================================================================
// 6. CREAZIONE NUOVO VOLO & CHARTER
// =============================================================================

function toggleModal(show) {
  if (!modalVolo) return;
  if (show) {
    modalVolo.classList.remove('hidden');
  } else {
    modalVolo.classList.add('hidden');
    formCreateFlight?.reset();
  }
}

if (btnOpenModal) btnOpenModal.addEventListener('click', () => toggleModal(true));
if (btnCloseModal) btnCloseModal.addEventListener('click', () => toggleModal(false));
if (btnCancelModal) btnCancelModal.addEventListener('click', () => toggleModal(false));

if (formCreateFlight) {
  formCreateFlight.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (btnSubmitFlight) {
      btnSubmitFlight.disabled = true;
      btnSubmitFlight.textContent = 'Registrazione in corso...';
    }

    try {
      const capienza = parseInt(document.getElementById('nuovo-posti').value, 10);
      const isCharter = document.getElementById('nuovo-charter')?.checked || false;

      const payload = {
        codice_volo: document.getElementById('nuovo-codice').value.trim().toUpperCase(),
        aeroporto_origine: document.getElementById('nuovo-origine').value,
        aeroporto_destinazione: document.getElementById('nuovo-destinazione').value.trim().toUpperCase(),
        data_ora_partenza: new Date(document.getElementById('nuovo-partenza').value).toISOString(),
        data_ora_arrivo: new Date(document.getElementById('nuovo-arrivo').value).toISOString(),
        posti_totali: capienza,
        posti_disponibili: capienza,
        prezzo_base: parseFloat(document.getElementById('nuovo-prezzo').value),
        stato: 'programmato',
        is_private_charter: isCharter
      };

      const sb = getSupabase();
      const { error } = await sb.from('voli').insert([payload]);

      if (error) throw error;

      toggleModal(false);
      showAlert(`Nuovo volo ${payload.codice_volo} (${isCharter ? 'VIP Charter' : 'Di Linea'}) registrato con successo nel tabellone.`);
      await loadFlightsTable();
      await loadStats();

    } catch (err) {
      alert(`Impossibile registrare il volo: ${err.message}`);
    } finally {
      if (btnSubmitFlight) {
        btnSubmitFlight.disabled = false;
        btnSubmitFlight.textContent = 'Registra Volo';
      }
    }
  });
}

// =============================================================================
// 7. SWITCHER A 4 TAB & LOGOUT
// =============================================================================

function resetAdminTabs() {
  [tabVoli, tabPasseggeri, tabPremi, tabUtenti].forEach(tab => {
    if (tab) tab.className = 'px-4 py-2.5 rounded-xl text-slate-600 hover:text-slate-900 text-xs font-bold transition-all flex items-center space-x-2';
  });
  [sectionVoli, sectionPasseggeri, sectionPremi, sectionUtenti].forEach(sec => sec?.classList.add('hidden'));
}

if (tabVoli) {
  tabVoli.addEventListener('click', () => {
    resetAdminTabs();
    tabVoli.className = 'px-4 py-2.5 rounded-xl bg-forest-900 text-white text-xs font-extrabold shadow-sm transition-all flex items-center space-x-2';
    sectionVoli?.classList.remove('hidden');
    loadFlightsTable();
  });
}

if (tabPasseggeri) {
  tabPasseggeri.addEventListener('click', () => {
    resetAdminTabs();
    tabPasseggeri.className = 'px-4 py-2.5 rounded-xl bg-forest-900 text-white text-xs font-extrabold shadow-sm transition-all flex items-center space-x-2';
    sectionPasseggeri?.classList.remove('hidden');
    loadPassengersTable();
  });
}

if (tabPremi) {
  tabPremi.addEventListener('click', () => {
    resetAdminTabs();
    tabPremi.className = 'px-4 py-2.5 rounded-xl bg-forest-900 text-white text-xs font-extrabold shadow-sm transition-all flex items-center space-x-2';
    sectionPremi?.classList.remove('hidden');
    loadPremiTable();
  });
}

if (tabUtenti) {
  tabUtenti.addEventListener('click', () => {
    resetAdminTabs();
    tabUtenti.className = 'px-4 py-2.5 rounded-xl bg-forest-900 text-white text-xs font-extrabold shadow-sm transition-all flex items-center space-x-2';
    sectionUtenti?.classList.remove('hidden');
    loadUtentiTable();
  });
}

if (btnLogout) btnLogout.addEventListener('click', logout);

// Avvio automatico dashboard
initDashboard();