// =============================================================================
// LOMBARDAIR - FLUSSO PRENOTAZIONE, CABINA 3D & EXTRA (booking-flow.js)
// =============================================================================

import { apiFetch, getSupabase } from './config.js';
import { getUserProfile, getCurrentUser } from './auth.js';
import { initCabin3D, selectSeatCode, destroyCabin3D } from './cabin-3d.js';

// Parametri URL e stato in memoria
const urlParams = new URLSearchParams(window.location.search);
const voloId = urlParams.get('volo_id');

let currentVolo = null;
let occupiedSeats = [];
let selectedSeat = null;
let seatFee = 0;
let passengerData = {};

// Stato Servizi Extra Selezionati
const selectedServices = {
  extra_baggage: false,
  fast_track: false,
  lounge_access: false,
  in_flight_meal: false,
  priority_boarding: false,
  pet_in_cabin: false
};

const SERVICE_PRICES = {
  extra_baggage: 19.00,
  fast_track: 9.00,
  lounge_access: 25.00,
  in_flight_meal: 14.00,
  priority_boarding: 6.00,
  pet_in_cabin: 29.00,
  seat_premium: 5.00 // Applicato alle prime 3 file
};

// Riferimenti DOM
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
  errorBox.className = 'mb-6 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold shadow-sm';
  errorBox.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function hideError() {
  if (errorBox) errorBox.classList.add('hidden');
}

// =============================================================================
// 1. INIZIALIZZAZIONE DATI DEL VOLO & PROFILO UTENTE
// =============================================================================

async function initBooking() {
  if (!voloId) {
    alert("Nessun volo selezionato. Ritorno alla homepage.");
    window.location.href = 'index.html';
    return;
  }

  try {
    const sb = getSupabase();
    // Recupero dettagli volo direttamente da Supabase o API
    const { data: volo, error } = await sb
      .from('voli')
      .select('*')
      .eq('id', voloId)
      .single();

    if (error || !volo) {
      throw new Error("Volo selezionato non valido o non disponibile.");
    }

    currentVolo = volo;

    // Popola riepilogo testata
    document.getElementById('sum-code').textContent = currentVolo.codice_volo;
    document.getElementById('sum-route').textContent = `${currentVolo.aeroporto_origine} ➔ ${currentVolo.aeroporto_destinazione}`;
    
    const d = new Date(currentVolo.data_ora_partenza);
    document.getElementById('sum-date').textContent = `${d.toLocaleDateString('it-IT')} ore ${d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`;
    document.getElementById('sum-price').textContent = `€ ${parseFloat(currentVolo.prezzo_base).toFixed(2)}`;

    // Pre-compilazione anagrafica se loggato
    const profile = await getUserProfile();
    if (profile) {
      if (document.getElementById('pass-nome')) document.getElementById('pass-nome').value = profile.nome || '';
      if (document.getElementById('pass-cognome')) document.getElementById('pass-cognome').value = profile.cognome || '';
      if (document.getElementById('pass-cf')) document.getElementById('pass-cf').value = profile.codice_fiscale || '';
    }

    setupEvents();

  } catch (err) {
    showError(`Impossibile caricare i dati del volo: ${err.message}`);
  }
}

// =============================================================================
// 2. GENERAZIONE CABINA 3D (THREE.JS) E GRIGLIA 2D SINCRONIZZATA
// =============================================================================

async function loadSeatsAndCabin() {
  try {
    const sb = getSupabase();
    // Recupero posti occupati in tempo reale
    const { data: prenotazioni, error } = await sb
      .from('prenotazioni')
      .select('posto_assegnato')
      .eq('volo_id', voloId)
      .neq('stato', 'annullata');

    if (error) throw error;

    occupiedSeats = (prenotazioni || []).map(p => p.posto_assegnato);

    // 1. Inizializzazione Cabina 3D Three.js
    initCabin3D('cabin-3d-viewport', {
      totalCapacity: currentVolo.posti_totali || 60,
      occupiedSeats: occupiedSeats,
      initialSelectedSeat: selectedSeat,
      onSeatSelected: (code) => {
        onSeatChosen(code);
      }
    });

    // 2. Inizializzazione Griglia 2D di supporto
    render2DSeatGrid();

  } catch (err) {
    showError(`Errore nel caricamento della mappa posti: ${err.message}`);
  }
}

function render2DSeatGrid() {
  const grid = document.getElementById('seat-map-grid');
  if (!grid) return;
  grid.innerHTML = '';

  const cols = ['A', 'B', 'C', 'AISLE', 'D', 'E', 'F'];
  const capienzaTotale = currentVolo?.posti_totali || 60;
  const totalRows = Math.max(10, Math.ceil(capienzaTotale / 6));

  for (let r = 1; r <= totalRows; r++) {
    cols.forEach(col => {
      if (col === 'AISLE') {
        const aisle = document.createElement('div');
        aisle.className = 'seat-aisle font-mono text-slate-400 font-bold text-xs flex items-center justify-center';
        aisle.textContent = r;
        grid.appendChild(aisle);
      } else {
        const seatCode = `${r}${col}`;
        const isOccupied = occupiedSeats.includes(seatCode);
        const isSelected = (selectedSeat === seatCode);

        const seatBtn = document.createElement('button');
        seatBtn.type = 'button';
        seatBtn.className = `seat ${isOccupied ? 'occupied' : 'available'} ${isSelected ? 'selected' : ''}`;
        seatBtn.textContent = col;
        seatBtn.title = isOccupied ? `Posto ${seatCode} (Occupato)` : `Posto ${seatCode}`;

        if (isOccupied) {
          seatBtn.disabled = true;
        } else {
          seatBtn.addEventListener('click', () => {
            selectSeatCode(seatCode); // Sincronizza il 3D
            onSeatChosen(seatCode);
          });
        }
        grid.appendChild(seatBtn);
      }
    });
  }
}

function onSeatChosen(code) {
  selectedSeat = code;
  const row = parseInt(code);

  // Sovrapprezzo per prime file (1-3)
  seatFee = (row <= 3) ? SERVICE_PRICES.seat_premium : 0.00;

  const display = document.getElementById('selected-seat-display');
  const btnStep3 = document.getElementById('btn-to-step3');

  if (display) {
    display.innerHTML = `${code} ${seatFee > 0 ? '<span class="text-xs text-lime-600 font-bold block">+€5.00 Premium</span>' : ''}`;
  }
  if (btnStep3) btnStep3.disabled = false;

  render2DSeatGrid();
  updateLiveTotal();
}

// =============================================================================
// 3. CALCOLO DINAMICO DEL TOTALE CON NUOVI SERVIZI ACCESSORI
// =============================================================================

function updateLiveTotal() {
  const basePrice = parseFloat(currentVolo?.prezzo_base || 0);
  let extraTotal = seatFee;

  for (const [key, isSelected] of Object.entries(selectedServices)) {
    if (isSelected && SERVICE_PRICES[key]) {
      extraTotal += SERVICE_PRICES[key];
    }
  }

  const grandTotal = basePrice + extraTotal;

  const totalDisplays = document.querySelectorAll('.dynamic-total-price');
  totalDisplays.forEach(el => {
    el.textContent = `€ ${grandTotal.toFixed(2)}`;
  });

  return grandTotal;
}

// =============================================================================
// 4. NAVIGAZIONE TRA STEP & CHECKOUT
// =============================================================================

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
      tab1.className = 'flex items-center space-x-2 text-slate-400 font-bold text-xs';
      tab2.className = 'flex items-center space-x-2 text-forest-900 font-black text-xs';
      
      loadSeatsAndCabin();
      updateLiveTotal();
    });
  }

  // Step 2 -> Step 1 (Indietro)
  document.getElementById('btn-back-to-step1')?.addEventListener('click', () => {
    step2.classList.add('hidden');
    step1.classList.remove('hidden');
    tab2.className = 'flex items-center space-x-2 text-slate-400 font-bold text-xs';
    tab1.className = 'flex items-center space-x-2 text-forest-900 font-black text-xs';
  });

  // Checkbox Servizi Extra in Step 2 / Step 3
  const serviceCheckboxes = [
    { id: 'extra-baggage', key: 'extra_baggage' },
    { id: 'extra-fast-track', key: 'fast_track' },
    { id: 'extra-lounge', key: 'lounge_access' },
    { id: 'extra-meal', key: 'in_flight_meal' },
    { id: 'extra-priority', key: 'priority_boarding' },
    { id: 'extra-pet', key: 'pet_in_cabin' }
  ];

  serviceCheckboxes.forEach(svc => {
    const el = document.getElementById(svc.id);
    if (el) {
      el.addEventListener('change', (e) => {
        selectedServices[svc.key] = e.target.checked;
        updateLiveTotal();
      });
    }
  });

  // Step 2 -> Step 3 (Avanti)
  document.getElementById('btn-to-step3')?.addEventListener('click', () => {
    if (!selectedSeat) {
      showError("Seleziona un posto sulla mappa 3D o sulla fusoliera per proseguire.");
      return;
    }
    hideError();

    // Popola Riepilogo Finale
    document.getElementById('summary-passenger').textContent = `${passengerData.nome} ${passengerData.cognome}`;
    document.getElementById('summary-doc').textContent = passengerData.documento;
    document.getElementById('summary-flight-time').textContent = `${currentVolo.codice_volo} (${currentVolo.aeroporto_origine} ➔ ${currentVolo.aeroporto_destinazione})`;
    document.getElementById('summary-seat').textContent = `${selectedSeat} ${seatFee > 0 ? '(Premium)' : ''}`;

    // Elenco Extra nel Riepilogo
    const extrasSummary = document.getElementById('summary-extras-list');
    if (extrasSummary) {
      const activeExtras = [];
      if (selectedServices.in_flight_meal) activeExtras.push('🍽️ Pasto a Bordo Catering (+€14.00)');
      if (selectedServices.priority_boarding) activeExtras.push('🚀 Imbarco Prioritario Gruppo 1 (+€6.00)');
      if (selectedServices.pet_in_cabin) activeExtras.push('🐾 Animale Domestico in Cabina (+€29.00)');
      if (selectedServices.extra_baggage) activeExtras.push('🧳 Bagaglio da Stiva 23kg (+€19.00)');
      if (selectedServices.fast_track) activeExtras.push('⚡ Fast Track Biometrico (+€9.00)');
      if (selectedServices.lounge_access) activeExtras.push('🍸 Accesso Lounge VIP (+€25.00)');
      if (seatFee > 0) activeExtras.push('⭐ Scelta Posto Premium Prime File (+€5.00)');

      extrasSummary.innerHTML = activeExtras.length > 0
        ? activeExtras.map(ex => `<div class="text-xs text-slate-600 font-semibold">• ${ex}</div>`).join('')
        : '<div class="text-xs text-slate-400 italic">Nessun servizio accessorio selezionato</div>';
    }

    const finalTotal = updateLiveTotal();
    document.getElementById('summary-total').textContent = `€ ${finalTotal.toFixed(2)}`;

    step2.classList.add('hidden');
    step3.classList.remove('hidden');
    tab2.className = 'flex items-center space-x-2 text-slate-400 font-bold text-xs';
    tab3.className = 'flex items-center space-x-2 text-forest-900 font-black text-xs';
  });

  // Step 3 -> Step 2 (Indietro)
  document.getElementById('btn-back-to-step2')?.addEventListener('click', () => {
    step3.classList.add('hidden');
    step2.classList.remove('hidden');
    tab3.className = 'flex items-center space-x-2 text-slate-400 font-bold text-xs';
    tab2.className = 'flex items-center space-x-2 text-forest-900 font-black text-xs';
  });

  // ===========================================================================
  // 5. EMISSIONE FINALE PRENOTAZIONE ATOMICA
  // ===========================================================================
  document.getElementById('btn-confirm-booking')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-confirm-booking');
    try {
      btn.disabled = true;
      btn.textContent = 'Emissione Titolo & Blocco Sedile...';
      hideError();

      const user = await getCurrentUser();
      const sb = getSupabase();

      // Generazione PNR univoco LM-XXXXX
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let randomCode = '';
      for (let i = 0; i < 5; i++) {
        randomCode += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      const pnr = `LM-${randomCode}`;

      // Chiamata alla RPC atomica Supabase V3
      const rpcPayload = {
        p_volo_id: voloId,
        p_utente_id: user ? user.id : null,
        p_nome: passengerData.nome,
        p_cognome: passengerData.cognome,
        p_documento: passengerData.documento,
        p_posto: selectedSeat,
        p_pnr: pnr,
        p_extra_baggage: selectedServices.extra_baggage,
        p_fast_track: selectedServices.fast_track,
        p_lounge_access: selectedServices.lounge_access,
        p_in_flight_meal: selectedServices.in_flight_meal,
        p_priority_boarding: selectedServices.priority_boarding,
        p_pet_in_cabin: selectedServices.pet_in_cabin,
        p_seat_fee: seatFee
      };

      const { data: prenotazione, error } = await sb.rpc('crea_prenotazione_atomica', rpcPayload);

      if (error) {
        throw new Error(error.message);
      }

      // Reindirizzamento all'Area Passeggero per il check-in o alla carta d'imbarco
      window.location.href = `passenger-dashboard.html?pnr_created=${encodeURIComponent(pnr)}`;

    } catch (err) {
      showError(`Impossibile completare la prenotazione: ${err.message}`);
      btn.disabled = false;
      btn.textContent = 'Conferma ed Emetti Biglietto';
    }
  });
}

// Avvio automatico al caricamento della pagina
document.addEventListener('DOMContentLoaded', initBooking);