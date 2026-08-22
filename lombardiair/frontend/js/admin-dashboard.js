// =============================================================================
// LOMBARDAIR - CONTROL ROOM AMMINISTRATIVA B2B (admin-dashboard.js)
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

// Riferimenti DOM Switcher Tab
const tabVoli = document.getElementById('tab-voli');
const tabPasseggeri = document.getElementById('tab-passeggeri');
const sectionVoli = document.getElementById('section-voli');
const sectionPasseggeri = document.getElementById('section-passeggeri');

// Riferimenti DOM Modale Nuovo Volo
const btnOpenModal = document.getElementById('btn-open-modal-volo');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnCancelModal = document.getElementById('btn-cancel-modal');
const modalVolo = document.getElementById('modal-nuovo-volo');
const formCreateFlight = document.getElementById('form-create-flight');
const btnSubmitFlight = document.getElementById('btn-submit-flight');

// =============================================================================
// UTILITY & FEEDBACK VISIVO
// =============================================================================

function showAlert(message, isError = false) {
  if (!alertBox) return;
  alertBox.textContent = message;
  alertBox.className = `mb-6 p-4 rounded-2xl text-xs font-bold leading-relaxed border transition-all duration-300 ${
    isError 
      ? 'bg-red-50 text-red-700 border-red-200' 
      : 'bg-emerald-50 text-emerald-800 border-emerald-200'
  }`;
  alertBox.classList.remove('hidden');
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
    loadPassengersTable()
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
    const voliAttivi = voli.filter(v => v.stato === 'programmato' || v.stato === 'in_volo').length;
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
// 2. CARICAMENTO TABELLA FLOTTA VOLI & STATO CHARTER PRIVATO
// =============================================================================

async function loadFlightsTable() {
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
          <td colspan="7" class="px-6 py-16 text-center">
            <div class="max-w-sm mx-auto flex flex-col items-center">
              <div class="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center text-xl mb-3">
                ✈️
              </div>
              <h4 class="text-sm font-extrabold text-slate-800">Nessun volo registrato nel database</h4>
              <p class="text-xs text-slate-400 mt-1 mb-4">Clicca su "+ Aggiungi Nuovo Volo" per programmare la prima tratta.</p>
              <button onclick="document.getElementById('btn-open-modal-volo')?.click()" class="px-4 py-2 rounded-xl bg-lime-500 hover:bg-lime-400 text-forest-950 font-bold text-xs shadow-sm transition">
                + Schedula Tratta Ora
              </button>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    tableVoliBody.innerHTML = flights.map(v => {
      const isCancellato = v.stato === 'cancellato';

      return `
        <tr class="hover:bg-slate-50/80 transition border-b border-slate-100">
          <td class="px-6 py-4 font-mono font-black text-forest-950 text-sm">
            ${v.codice_volo}
          </td>
          <td class="px-6 py-4">
            <span class="font-extrabold text-slate-900">${v.aeroporto_origine}</span> 
            <span class="text-lime-600 font-bold px-1">➔</span> 
            <span class="font-extrabold text-slate-900">${v.aeroporto_destinazione}</span>
          </td>
          <td class="px-6 py-4 text-xs font-semibold">
            <div class="text-slate-900"><b>Partenza:</b> ${formatDate(v.data_ora_partenza)}</div>
            <div class="text-slate-400"><b>Arrivo:</b> ${formatDate(v.data_ora_arrivo)}</div>
          </td>
          <td class="px-6 py-4 text-center">
            <span class="font-black ${v.posti_disponibili <= 5 ? 'text-red-600' : 'text-slate-800'}">
              ${v.posti_disponibili}
            </span>
            <span class="text-xs text-slate-400 font-bold">/ ${v.posti_totali}</span>
          </td>
          <td class="px-6 py-4 font-black font-mono text-slate-900">
            € ${parseFloat(v.prezzo_base).toFixed(2)}
          </td>
          <td class="px-6 py-4">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="badge-status ${v.stato}">${v.stato}</span>
              ${v.is_private_charter ? `
                <span class="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300">
                  VIP Charter
                </span>
              ` : ''}
            </div>
          </td>
          <td class="px-6 py-4 text-right">
            ${!isCancellato ? `
              <button class="btn-delete-volo text-red-600 hover:text-red-800 text-xs font-bold bg-red-50 hover:bg-red-100 border border-red-200/60 px-3 py-1.5 rounded-xl transition" data-id="${v.id}" data-codice="${v.codice_volo}">
                Cancella Volo
              </button>
            ` : `
              <span class="text-xs text-slate-400 font-semibold italic">Cancellato</span>
            `}
          </td>
        </tr>
      `;
    }).join('');

    // Event listener cancellazione voli su Supabase
    document.querySelectorAll('.btn-delete-volo').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const codice = btn.getAttribute('data-codice');
        if (confirm(`Confermi la cancellazione del volo ${codice}? L'operazione aggiornerà lo stato in 'cancellato'.`)) {
          try {
            const sb = getSupabase();
            const { error } = await sb
              .from('voli')
              .update({ stato: 'cancellato' })
              .eq('id', id);

            if (error) throw error;

            showAlert(`Volo ${codice} contrassegnato come cancellato con successo.`);
            await loadFlightsTable();
            await loadStats();
          } catch (err) {
            showAlert(`Errore cancellazione: ${err.message}`, true);
          }
        }
      });
    });

  } catch (err) {
    tableVoliBody.innerHTML = `
      <tr>
        <td colspan="7" class="px-6 py-10 text-center text-red-600 font-semibold text-xs">
          Errore nel recupero della flotta: ${err.message}
        </td>
      </tr>
    `;
  }
}

// =============================================================================
// 3. CARICAMENTO MANIFEST PASSEGGERI (STATO CHECK-IN & SERVIZI EXTRA)
// =============================================================================

async function loadPassengersTable() {
  if (!tablePasseggeriBody) return;

  try {
    const sb = getSupabase();
    const { data: bookings, error } = await sb
      .from('prenotazioni')
      .select('*, voli(*)')
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!bookings || bookings.length === 0) {
      tablePasseggeriBody.innerHTML = `
        <tr>
          <td colspan="8" class="px-6 py-16 text-center text-slate-400 font-bold">
            Nessun biglietto emesso nel sistema.
          </td>
        </tr>
      `;
      return;
    }

    tablePasseggeriBody.innerHTML = bookings.map(b => {
      const v = b.voli || {};
      const isCheckedIn = b.check_in_status === true;

      // Badge Servizi Extra Reali
      const extras = [];
      if (b.extra_baggage) extras.push('<span class="px-2 py-0.5 bg-blue-50 text-blue-800 rounded border border-blue-200 text-[10px] font-bold">🧳 23kg</span>');
      if (b.fast_track) extras.push('<span class="px-2 py-0.5 bg-lime-50 text-forest-900 rounded border border-lime-300 text-[10px] font-bold">⚡ Fast Track</span>');
      if (b.lounge_access) extras.push('<span class="px-2 py-0.5 bg-amber-50 text-amber-800 rounded border border-amber-300 text-[10px] font-bold">🍸 Lounge</span>');

      return `
        <tr class="hover:bg-slate-50/80 transition border-b border-slate-100 text-xs">
          <td class="px-6 py-4 font-mono font-black text-forest-950 text-sm">
            ${b.codice_prenotazione}
          </td>
          <td class="px-6 py-4 font-bold text-slate-900">
            ${b.nome_passeggero} ${b.cognome_passeggero}
            <span class="block text-[10px] text-slate-400 font-mono uppercase">${b.documento_identita}</span>
          </td>
          <td class="px-6 py-4 font-bold text-slate-800">
            ${v.codice_volo || 'LMB'} (${v.aeroporto_origine || ''} ➔ ${v.aeroporto_destinazione || ''})
          </td>
          <td class="px-6 py-4 text-center">
            <span class="font-black text-xs text-lime-800 bg-lime-100 border border-lime-300 px-2.5 py-1 rounded-lg">
              ${b.posto_assegnato}
            </span>
          </td>
          <td class="px-6 py-4">
            ${isCheckedIn ? `
              <span class="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-300">
                ✓ Check-in Effettuato
              </span>
            ` : `
              <span class="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-rose-100 text-rose-800 border border-rose-200">
                ✕ Non Effettuato
              </span>
            `}
          </td>
          <td class="px-6 py-4">
            <div class="flex items-center gap-1.5 flex-wrap">
              ${extras.length > 0 ? extras.join('') : '<span class="text-slate-400 italic text-[11px]">Nessuno</span>'}
            </div>
          </td>
          <td class="px-6 py-4 font-black font-mono text-slate-900">
            € ${parseFloat(b.prezzo_finale).toFixed(2)}
          </td>
          <td class="px-6 py-4 text-xs text-slate-500 font-semibold">
            ${formatDate(b.created_at)}
          </td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    tablePasseggeriBody.innerHTML = `
      <tr>
        <td colspan="8" class="px-6 py-10 text-center text-red-600 font-semibold text-xs">
          Errore caricamento manifest passeggeri: ${err.message}
        </td>
      </tr>
    `;
  }
}

// =============================================================================
// 4. GESTIONE MODALE & REGISTRAZIONE NUOVO VOLO / CHARTER
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
// 5. SWITCHER TAB & LOGOUT
// =============================================================================

if (tabVoli) {
  tabVoli.addEventListener('click', () => {
    tabVoli.className = 'px-5 py-2.5 rounded-xl bg-forest-900 text-white text-xs font-extrabold shadow-sm transition-all flex items-center space-x-2';
    tabPasseggeri.className = 'px-5 py-2.5 rounded-xl text-slate-600 hover:text-slate-900 text-xs font-bold transition-all flex items-center space-x-2';
    sectionVoli?.classList.remove('hidden');
    sectionPasseggeri?.classList.add('hidden');
  });
}

if (tabPasseggeri) {
  tabPasseggeri.addEventListener('click', () => {
    tabPasseggeri.className = 'px-5 py-2.5 rounded-xl bg-forest-900 text-white text-xs font-extrabold shadow-sm transition-all flex items-center space-x-2';
    tabVoli.className = 'px-5 py-2.5 rounded-xl text-slate-600 hover:text-slate-900 text-xs font-bold transition-all flex items-center space-x-2';
    sectionPasseggeri?.classList.remove('hidden');
    sectionVoli?.classList.add('hidden');
    loadPassengersTable();
  });
}

if (btnLogout) btnLogout.addEventListener('click', logout);

// Avvio automatico
initDashboard();