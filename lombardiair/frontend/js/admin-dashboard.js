// =============================================================================
// LOMBARDAIR - LOGICA CRUSCOTTO AMMINISTRATIVO B2B (admin-dashboard.js)
// =============================================================================

import { apiFetch } from './config.js';
import { requireAuth, logout } from './auth.js';

// Riferimenti DOM
const userNameDisplay = document.getElementById('admin-user-name');
const btnLogout = document.getElementById('btn-admin-logout');
const alertBox = document.getElementById('admin-alert');

// KPI
const kpiTotVoli = document.getElementById('kpi-totale-voli');
const kpiVoliAttivi = document.getElementById('kpi-voli-attivi');
const kpiTotPrenotazioni = document.getElementById('kpi-totale-prenotazioni');
const kpiTotIncassi = document.getElementById('kpi-totale-incassi');

// Tabelle
const tableVoliBody = document.getElementById('table-voli-body');
const tablePasseggeriBody = document.getElementById('table-passeggeri-body');

// Tab Sezioni
const tabVoli = document.getElementById('tab-voli');
const tabPasseggeri = document.getElementById('tab-passeggeri');
const sectionVoli = document.getElementById('section-voli');
const sectionPasseggeri = document.getElementById('section-passeggeri');

// Modal Nuovo Volo
const btnOpenModal = document.getElementById('btn-open-modal-volo');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnCancelModal = document.getElementById('btn-cancel-modal');
const modalVolo = document.getElementById('modal-nuovo-volo');
const formCreateFlight = document.getElementById('form-create-flight');
const btnSubmitFlight = document.getElementById('btn-submit-flight');

// =============================================================================
// UTILITY & FEEDBACK
// =============================================================================

function showAlert(message, isError = false) {
  alertBox.textContent = message;
  alertBox.className = `mb-6 p-4 rounded-xl text-sm font-semibold ${
    isError 
      ? 'bg-red-50 text-red-700 border border-red-200' 
      : 'bg-green-50 text-green-800 border border-green-200'
  }`;
  alertBox.classList.remove('hidden');
  setTimeout(() => alertBox.classList.add('hidden'), 5000);
}

function formatDate(isoStr) {
  if (!isoStr) return '---';
  const d = new Date(isoStr);
  return `${d.toLocaleDateString('it-IT')} ${d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`;
}

// =============================================================================
// INIZIALIZZAZIONE & DATI DASHBOARD
// =============================================================================

async function initDashboard() {
  // Guard di sicurezza: solo utenti con ruolo 'admin'
  const sessionData = await requireAuth('admin');
  if (!sessionData) return;

  const { profile } = sessionData;
  if (userNameDisplay) {
    userNameDisplay.textContent = `Operatore: ${profile?.nome || 'Alessandro'} ${profile?.cognome || 'Di Blasio'} (Admin)`;
  }

  // Carica statistiche e tabelle
  await Promise.all([
    loadStats(),
    loadFlightsTable(),
    loadPassengersTable()
  ]);
}

// Caricamento Indicatori KPI
async function loadStats() {
  try {
    const stats = await apiFetch('/admin/statistiche');
    if (kpiTotVoli) kpiTotVoli.textContent = stats.totale_voli_registrati;
    if (kpiVoliAttivi) kpiVoliAttivi.textContent = stats.voli_programmati;
    if (kpiTotPrenotazioni) kpiTotPrenotazioni.textContent = stats.biglietti_emessi;
    if (kpiTotIncassi) {
      kpiTotIncassi.textContent = `€ ${parseFloat(stats.incasso_complessivo_eur).toLocaleString('it-IT', { minimumFractionDigits: 2 })}`;
    }
  } catch (err) {
    console.error('Errore caricamento KPI:', err);
  }
}

// Caricamento Tabella Flotta Voli
async function loadFlightsTable() {
  try {
    const flights = await apiFetch('/voli');
    if (!flights || flights.length === 0) {
      tableVoliBody.innerHTML = `
        <tr>
          <td colspan="7" class="px-6 py-8 text-center text-slate-400">Nessun volo registrato al momento. Clicca su "+ Aggiungi Nuovo Volo" per iniziare.</td>
        </tr>
      `;
      return;
    }

    tableVoliBody.innerHTML = flights.map(v => `
      <tr class="hover:bg-slate-50 transition">
        <td class="px-6 py-4 font-black text-green-950">${v.codice_volo}</td>
        <td class="px-6 py-4">
          <span class="font-bold">${v.aeroporto_origine}</span> 
          <span class="text-lime-600">➔</span> 
          <span class="font-bold">${v.aeroporto_destinazione}</span>
        </td>
        <td class="px-6 py-4 text-xs">
          <div><b>Partenza:</b> ${formatDate(v.data_ora_partenza)}</div>
          <div class="text-slate-400"><b>Arrivo:</b> ${formatDate(v.data_ora_arrivo)}</div>
        </td>
        <td class="px-6 py-4 text-center">
          <span class="font-bold ${v.posti_disponibili <= 5 ? 'text-red-600' : 'text-slate-700'}">
            ${v.posti_disponibili}
          </span>
          <span class="text-xs text-slate-400">/ ${v.posti_totali}</span>
        </td>
        <td class="px-6 py-4 font-bold text-slate-900">€ ${parseFloat(v.prezzo_base).toFixed(2)}</td>
        <td class="px-6 py-4">
          <span class="badge-status ${v.stato}">${v.stato}</span>
        </td>
        <td class="px-6 py-4 text-right">
          ${v.stato !== 'cancellato' ? `
            <button class="btn-delete-volo text-red-600 hover:text-red-800 text-xs font-bold bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded transition" data-id="${v.id}" data-codice="${v.codice_volo}">
              Cancella Volo
            </button>
          ` : '<span class="text-xs text-slate-400 italic">Cancellato</span>'}
        </td>
      </tr>
    `).join('');

    // Event listeners per la cancellazione volo
    document.querySelectorAll('.btn-delete-volo').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const codice = btn.getAttribute('data-codice');
        if (confirm(`Confermi la cancellazione del volo ${codice}? L'azione aggiornerà lo stato in 'cancellato'.`)) {
          try {
            await apiFetch(`/admin/voli/${id}`, { method: 'DELETE' });
            showAlert(`Volo ${codice} cancellato con successo.`);
            await loadFlightsTable();
            await loadStats();
          } catch (err) {
            showAlert(`Impossibile cancellare il volo: ${err.message}`, true);
          }
        }
      });
    });

  } catch (err) {
    tableVoliBody.innerHTML = `
      <tr>
        <td colspan="7" class="px-6 py-6 text-center text-red-600">Errore caricamento voli: ${err.message}</td>
      </tr>
    `;
  }
}

// Caricamento Tabella Manifest Passeggeri
async function loadPassengersTable() {
  try {
    const bookings = await apiFetch('/admin/prenotazioni');
    if (!bookings || bookings.length === 0) {
      tablePasseggeriBody.innerHTML = `
        <tr>
          <td colspan="8" class="px-6 py-8 text-center text-slate-400">Nessun biglietto emesso finora.</td>
        </tr>
      `;
      return;
    }

    tablePasseggeriBody.innerHTML = bookings.map(b => `
      <tr class="hover:bg-slate-50 transition">
        <td class="px-6 py-4 font-mono font-black text-green-950">${b.codice_prenotazione}</td>
        <td class="px-6 py-4 font-bold text-slate-900">${b.nome_passeggero} ${b.cognome_passeggero}</td>
        <td class="px-6 py-4 uppercase text-xs text-slate-600">${b.documento_identita}</td>
        <td class="px-6 py-4 font-black text-xs text-slate-800">
          ${b.volo ? b.volo.codice_volo : 'N/D'} (${b.volo ? b.volo.aeroporto_origine : ''} ➔ ${b.volo ? b.volo.aeroporto_destinazione : ''})
        </td>
        <td class="px-6 py-4 font-black text-lime-700 bg-lime-50 rounded">${b.posto_assegnato}</td>
        <td class="px-6 py-4 font-bold text-slate-900">€ ${parseFloat(b.prezzo_finale).toFixed(2)}</td>
        <td class="px-6 py-4 text-xs text-slate-500">${formatDate(b.created_at)}</td>
        <td class="px-6 py-4">
          <span class="badge-status ${b.stato}">${b.stato}</span>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tablePasseggeriBody.innerHTML = `
      <tr>
        <td colspan="8" class="px-6 py-6 text-center text-red-600">Errore: ${err.message}</td>
      </tr>
    `;
  }
}

// =============================================================================
// GESTIONE MODAL & CREAZIONE VOLO
// =============================================================================

function toggleModal(show) {
  if (show) {
    modalVolo.classList.remove('hidden');
  } else {
    modalVolo.classList.add('hidden');
    formCreateFlight.reset();
  }
}

if (btnOpenModal) btnOpenModal.addEventListener('click', () => toggleModal(true));
if (btnCloseModal) btnCloseModal.addEventListener('click', () => toggleModal(false));
if (btnCancelModal) btnCancelModal.addEventListener('click', () => toggleModal(false));

if (formCreateFlight) {
  formCreateFlight.addEventListener('submit', async (e) => {
    e.preventDefault();
    btnSubmitFlight.disabled = true;
    btnSubmitFlight.textContent = 'Registrazione in corso...';

    try {
      const payload = {
        codice_volo: document.getElementById('nuovo-codice').value.trim().toUpperCase(),
        aeroporto_origine: document.getElementById('nuovo-origine').value,
        aeroporto_destinazione: document.getElementById('nuovo-destinazione').value.trim().toUpperCase(),
        data_ora_partenza: new Date(document.getElementById('nuovo-partenza').value).toISOString(),
        data_ora_arrivo: new Date(document.getElementById('nuovo-arrivo').value).toISOString(),
        posti_totali: parseInt(document.getElementById('nuovo-posti').value, 10),
        prezzo_base: parseFloat(document.getElementById('nuovo-prezzo').value)
      };

      await apiFetch('/admin/voli', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      toggleModal(false);
      showAlert(`Nuovo volo ${payload.codice_volo} aggiunto correttamente al tabellone.`);
      await loadFlightsTable();
      await loadStats();
    } catch (err) {
      alert(`Errore nella creazione del volo: ${err.message}`);
    } finally {
      btnSubmitFlight.disabled = false;
      btnSubmitFlight.textContent = 'Registra Volo';
    }
  });
}

// =============================================================================
// GESTIONE TAB SEZIONI & LOGOUT
// =============================================================================

if (tabVoli) {
  tabVoli.addEventListener('click', () => {
    tabVoli.className = 'pb-3 text-sm font-black text-green-900 border-b-2 border-lime-500 transition';
    tabPasseggeri.className = 'pb-3 text-sm font-bold text-slate-400 hover:text-slate-700 transition';
    sectionVoli.classList.remove('hidden');
    sectionPasseggeri.classList.add('hidden');
  });
}

if (tabPasseggeri) {
  tabPasseggeri.addEventListener('click', () => {
    tabPasseggeri.className = 'pb-3 text-sm font-black text-green-900 border-b-2 border-lime-500 transition';
    tabVoli.className = 'pb-3 text-sm font-bold text-slate-400 hover:text-slate-700 transition';
    sectionPasseggeri.classList.remove('hidden');
    sectionVoli.classList.add('hidden');
    loadPassengersTable();
  });
}

if (btnLogout) btnLogout.addEventListener('click', logout);

// Avvio applicazione
initDashboard();