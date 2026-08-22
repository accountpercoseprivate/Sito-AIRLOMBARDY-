// =============================================================================
// LOMBARDAIR - FLUSSO PRENOTAZIONE VOLI & GESTIONE POSTI
// =============================================================================

import { apiFetch } from './config.js';
import { getUserProfile, getCurrentUser } from './auth.js';

// Parametri URL e stato
const urlParams = new URLSearchParams(window.location.search);
const voloId = urlParams.get('volo_id');

let currentVolo = null;
let occupiedSeats = [];
let selectedSeat = null;
let passengerData = {};

// Elementi UI DOM
const errorBox = document.getElementById('booking-error');
const step1 = document.getElementById('step-1-container');
const step2 = document.getElementById('step-2-container');
const step3 = document.getElementById('step-3-container');

const tab1 = document.getElementById('step-tab-1');
const tab2 = document.getElementById('step-tab-2');
const tab3 = document.getElementById('step-tab-3');

// Utility gestione errori
function showError(msg) {
  if (!errorBox) return;
  errorBox.textContent = msg;
  errorBox.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function hideError() {
  if (errorBox) errorBox.classList.add('hidden');
}

// 1. Inizializzazione dati del volo
async function initBooking() {
  if (!voloId) {
    alert("Nessun volo selezionato.");
    window.location.href = 'index.html';
    return;
  }

  try {
    currentVolo = await apiFetch(`/voli/${voloId}`);
    
    // Popola card di riepilogo in alto
    document.getElementById('sum-code').textContent = currentVolo.codice_volo;
    document.getElementById('sum-route').textContent = `${currentVolo.aeroporto_origine} → ${currentVolo.aeroporto_destinazione}`;
    
    const d = new Date(currentVolo.data_ora_partenza);
    document.getElementById('sum-date').textContent = `${d.toLocaleDateString('it-IT')} ore ${d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`;
    document.getElementById('sum-price').textContent = `€ ${parseFloat(currentVolo.prezzo_base).toFixed(2)}`;

    // Se l'utente è loggato, pre-compila i dati anagrafici
    const profile = await getUserProfile();
    if (profile) {
      if (document.getElementById('pass-nome')) document.getElementById('pass-nome').value = profile.nome || '';
      if (document.getElementById('pass-cognome')) document.getElementById('pass-cognome').value = profile.cognome || '';
      if (document.getElementById('pass-cf')) document.getElementById('pass-cf').value = profile.codice_fiscale || '';
    }

    setupEvents();

  } catch (err) {
    showError(`Impossibile caricare il volo: ${err.message}`);
  }
}

// 2. Genera Matrice Sedili Fusoliera in modo Dinamico
async function loadSeatMap() {
  try {
    occupiedSeats = await apiFetch(`/voli/${voloId}/posti-occupati`);
    const grid = document.getElementById('seat-map-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const cols = ['A', 'B', 'C', 'AISLE', 'D', 'E', 'F'];
    
    // Calcolo dinamico delle file in base alla capienza del volo (6 sedili per fila)
    const capienzaTotale = currentVolo?.posti_totali || 60;
    const totalRows = Math.max(1, Math.ceil(capienzaTotale / 6));

    for (let r = 1; r <= totalRows; r++) {
      cols.forEach(col => {
        if (col === 'AISLE') {
          const aisle = document.createElement('div');
          aisle.className = 'seat-aisle';
          aisle.textContent = r;
          grid.appendChild(aisle);
        } else {
          const seatCode = `${r}${col}`;
          const isOccupied = occupiedSeats.includes(seatCode);
          const isSelected = selectedSeat === seatCode;

          const seatBtn = document.createElement('button');
          seatBtn.type = 'button';
          seatBtn.className = `seat ${isOccupied ? 'occupied' : 'available'} ${isSelected ? 'selected' : ''}`;
          seatBtn.textContent = col;
          seatBtn.title = isOccupied ? `Posto ${seatCode} (Occupato)` : `Posto ${seatCode}`;

          if (isOccupied) {
            seatBtn.disabled = true;
          } else {
            seatBtn.addEventListener('click', () => selectSeat(seatCode));
          }
          grid.appendChild(seatBtn);
        }
      });
    }
  } catch (err) {
    showError(`Errore nel caricamento della mappa posti: ${err.message}`);
  }
}

function selectSeat(code) {
  selectedSeat = code;
  const display = document.getElementById('selected-seat-display');
  const btnStep3 = document.getElementById('btn-to-step3');

  if (display) display.textContent = code;
  if (btnStep3) btnStep3.disabled = false;
  loadSeatMap();
}

// 3. Gestione Navigazione tra Step e Invio
function setupEvents() {
  // Step 1 -> Step 2
  const formPass = document.getElementById('form-passenger');
  if (formPass) {
    formPass.addEventListener('submit', (e) => {
      e.preventDefault();
      hideError();
      passengerData = {
        nome: document.getElementById('pass-nome').value.trim(),
        cognome: document.getElementById('pass-cognome').value.trim(),
        documento: document.getElementById('pass-documento').value.trim().toUpperCase(),
        cf: document.getElementById('pass-cf')?.value.trim().toUpperCase() || ''
      };

      step1.classList.add('hidden');
      step2.classList.remove('hidden');
      tab1.className = 'flex items-center space-x-2 text-slate-400 font-bold text-sm';
      tab2.className = 'flex items-center space-x-2 text-forest-900 font-bold text-sm';
      loadSeatMap();
    });
  }

  // Step 2 -> Step 1 (Indietro)
  document.getElementById('btn-back-to-step1')?.addEventListener('click', () => {
    step2.classList.add('hidden');
    step1.classList.remove('hidden');
    tab2.className = 'flex items-center space-x-2 text-slate-400 font-bold text-sm';
    tab1.className = 'flex items-center space-x-2 text-forest-900 font-bold text-sm';
  });

  // Step 2 -> Step 3 (Avanti)
  document.getElementById('btn-to-step3')?.addEventListener('click', () => {
    if (!selectedSeat) {
      showError("Seleziona un posto a bordo per continuare.");
      return;
    }
    hideError();

    // Popola Riepilogo Finale
    document.getElementById('summary-passenger').textContent = `${passengerData.nome} ${passengerData.cognome}`;
    document.getElementById('summary-doc').textContent = passengerData.documento;
    document.getElementById('summary-flight-time').textContent = `${currentVolo.codice_volo} (${currentVolo.aeroporto_origine} → ${currentVolo.aeroporto_destinazione})`;
    document.getElementById('summary-seat').textContent = selectedSeat;
    document.getElementById('summary-total').textContent = `€ ${parseFloat(currentVolo.prezzo_base).toFixed(2)}`;

    step2.classList.add('hidden');
    step3.classList.remove('hidden');
    tab2.className = 'flex items-center space-x-2 text-slate-400 font-bold text-sm';
    tab3.className = 'flex items-center space-x-2 text-forest-900 font-bold text-sm';
  });

  // Step 3 -> Step 2 (Indietro)
  document.getElementById('btn-back-to-step2')?.addEventListener('click', () => {
    step3.classList.add('hidden');
    step2.classList.remove('hidden');
    tab3.className = 'flex items-center space-x-2 text-slate-400 font-bold text-sm';
    tab2.className = 'flex items-center space-x-2 text-forest-900 font-bold text-sm';
  });

  // Invio Prenotazione Finale
  document.getElementById('btn-confirm-booking')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-confirm-booking');
    try {
      btn.disabled = true;
      btn.textContent = 'Emissione Titolo in corso...';
      hideError();

      const user = await getCurrentUser();

      const payload = {
        volo_id: voloId,
        utente_id: user ? user.id : null,
        nome_passeggero: passengerData.nome,
        cognome_passeggero: passengerData.cognome,
        documento_identita: passengerData.documento,
        posto_assegnato: selectedSeat
      };

      const res = await apiFetch('/prenotazioni/', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      // Reindirizzamento alla Carta d'Imbarco 3D
      window.location.href = `boarding-pass.html?pnr=${encodeURIComponent(res.codice_prenotazione)}`;

    } catch (err) {
      showError(`Errore durante l'emissione: ${err.message}`);
      btn.disabled = false;
      btn.textContent = 'Conferma ed Emetti Biglietto';
    }
  });
}

// Avvio automatico al caricamento della pagina
document.addEventListener('DOMContentLoaded', initBooking);