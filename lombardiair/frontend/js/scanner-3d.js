// =============================================================================
// LOMBARDAIR - MOTORE GRAFICO SCANNER LASER 3D AI GATE (scanner-3d.js)
// Animazione volumetrica per il check-in biometrico Three.js
// =============================================================================

import { getSupabase } from './config.js';

/**
 * Crea la texture canvas 2D del biglietto da scansionare nel modello 3D
 */
function createScanningTicketTexture(pnr, flightData) {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 420;
  const ctx = canvas.getContext('2d');

  // Sfondo Biglietto
  ctx.fillStyle = '#0B2519';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Bordo Verde Lime
  ctx.strokeStyle = '#84CC16';
  ctx.lineWidth = 8;
  ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);

  // Testata Brand
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 32px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('LombardiAIR', 40, 60);

  ctx.fillStyle = '#A3E635';
  ctx.font = 'bold 16px monospace';
  ctx.fillText('GATE PASS CHECK-IN', 40, 90);

  // Dati Volo & PNR
  ctx.fillStyle = '#94A3B8';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText('CODICE PNR', 40, 150);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '900 36px monospace';
  ctx.fillText(pnr.toUpperCase(), 40, 190);

  ctx.fillStyle = '#94A3B8';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText('TRATTA REGIONALE', 40, 240);
  ctx.fillStyle = '#A3E635';
  ctx.font = 'bold 24px sans-serif';
  ctx.fillText(`${flightData.origine || 'LIN'} ➔ ${flightData.destinazione || 'MNZ'}`, 40, 270);

  // Barcode Digitale
  ctx.fillStyle = '#FFFFFF';
  for (let x = 40; x < 740; x += 12) {
    const w = (x % 24 === 0) ? 6 : 3;
    ctx.fillRect(x, 310, w, 70);
  }

  return canvas;
}

/**
 * Avvia l'esperienza di scansione 3D a schermo intero con convalida Supabase
 * @param {string} pnr - Codice di prenotazione
 * @param {object} flightData - Dati tratta e passeggero
 * @param {function} onComplete - Callback eseguita al termine della convalida
 */
export function startGateScanner3D(pnr, flightData = {}, onComplete = null) {
  // 1. Creazione Overlay Modale a Schermo Intero
  const overlay = document.createElement('div');
  overlay.id = 'scanner-3d-overlay';
  overlay.className = 'fixed inset-0 z-50 bg-forest-950/90 backdrop-blur-xl flex flex-col items-center justify-center p-4 select-none';
  overlay.innerHTML = `
    <div class="relative w-full max-w-2xl bg-black rounded-3xl border-2 border-forest-800 shadow-2xl overflow-hidden flex flex-col items-center">
      
      <!-- Topbar Scanner Status -->
      <div class="w-full bg-forest-900/90 border-b border-white/10 px-6 py-4 flex items-center justify-between z-10 font-mono">
        <div class="flex items-center space-x-3">
          <span id="scanner-beacon" class="w-3 h-3 rounded-full bg-red-500 animate-ping"></span>
          <span id="scanner-status-text" class="text-xs font-black tracking-wider text-amber-400 uppercase">
            SCANSIONE VOLUMETRICA IN CORSO...
          </span>
        </div>
        <span class="text-[11px] text-slate-400 font-bold">GATE 04 • LINATE / MONZA</span>
      </div>

      <!-- Canvas 3D Viewport -->
      <div id="scanner-viewport" class="w-full h-[440px] relative"></div>

      <!-- Footer Info -->
      <div class="w-full bg-slate-950/90 border-t border-slate-800 px-6 py-4 flex items-center justify-between text-xs z-10">
        <span class="text-slate-400 font-mono">PNR: <b class="text-white">${pnr}</b></span>
        <span id="scanner-progress-msg" class="text-lime-400 font-black animate-pulse">
          ALLINEAMENTO LASER AL BIGLIETTO...
        </span>
      </div>

    </div>
  `;

  document.body.appendChild(overlay);

  const container = document.getElementById('scanner-viewport');
  const statusText = document.getElementById('scanner-status-text');
  const beacon = document.getElementById('scanner-beacon');
  const progressMsg = document.getElementById('scanner-progress-msg');

  const width = container.clientWidth;
  const height = container.clientHeight;

  // 2. Inizializzazione Scena, Camera & Renderer Three.js
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x04170E);

  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
  camera.position.set(0, 0, 7.5);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  container.appendChild(renderer.domElement);

  // 3. Luci di Scena
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);

  const spotLight = new THREE.SpotLight(0xffffff, 0.8);
  spotLight.position.set(0, 8, 4);
  scene.add(spotLight);

  // Fascio Luce Laser (Inizialmente Rosso)
  const laserLight = new THREE.PointLight(0xef4444, 2.5, 8);
  laserLight.position.set(0, 0, 1.5);
  scene.add(laserLight);

  // 4. Mesh dello Scanner Chassis
  const chassisGeo = new THREE.BoxGeometry(5.2, 3.2, 0.4);
  const chassisMat = new THREE.MeshStandardMaterial({
    color: 0x0b2519,
    metalness: 0.8,
    roughness: 0.2,
    wireframe: false
  });
  const chassis = new THREE.Mesh(chassisGeo, chassisMat);
  chassis.position.set(0, 0, -0.6);
  scene.add(chassis);

  // Apertura Vetro Scanner
  const glassGeo = new THREE.PlaneGeometry(4.4, 2.6);
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x000000,
    transmission: 0.6,
    opacity: 0.8,
    transparent: true,
    roughness: 0.1
  });
  const glass = new THREE.Mesh(glassGeo, glassMat);
  glass.position.set(0, 0, -0.38);
  scene.add(glass);

  // 5. Mesh del Biglietto Olografico da Scansionare
  const ticketCanvas = createScanningTicketTexture(pnr, flightData);
  const ticketTexture = new THREE.CanvasTexture(ticketCanvas);
  const ticketGeo = new THREE.BoxGeometry(3.6, 1.88, 0.04);
  const ticketMat = new THREE.MeshStandardMaterial({
    map: ticketTexture,
    roughness: 0.3,
    metalness: 0.1
  });
  const ticketMesh = new THREE.Mesh(ticketGeo, ticketMat);
  ticketMesh.position.set(0, -3.5, 0.4); // Inizia dal basso
  ticketMesh.rotation.x = 0.4;
  scene.add(ticketMesh);

  // 6. Lama Laser Volumetrica
  const laserBeamGeo = new THREE.PlaneGeometry(4.2, 0.08);
  const laserBeamMat = new THREE.MeshBasicMaterial({
    color: 0xef4444,
    transparent: true,
    opacity: 0.95,
    side: THREE.DoubleSide
  });
  const laserBeam = new THREE.Mesh(laserBeamGeo, laserBeamMat);
  laserBeam.position.set(0, 0, 0.45);
  scene.add(laserBeam);

  // 7. Timeline e Macchina a Stati Animazione
  let animState = 'entering'; // entering -> scanning -> validated -> complete
  let clock = new THREE.Clock();
  let scanTime = 0;
  let validationTriggered = false;

  // Esegue la chiamata RPC reale a Supabase durante la scansione
  async function eseguiCheckInBackend() {
    try {
      const sb = getSupabase();
      const { data, error } = await sb.rpc('esegui_checkin_online', { p_pnr: pnr });
      if (error) throw error;
      return true;
    } catch (err) {
      console.error('Errore validazione check-in:', err);
      return false;
    }
  }

  function switchLaserToSuccess() {
    // Viraggio Colore al Verde Lime
    laserBeamMat.color.setHex(0x84cc16);
    laserLight.color.setHex(0x84cc16);
    laserLight.intensity = 4.0;
    scene.background = new THREE.Color(0x072e1a);

    beacon.className = 'w-3 h-3 rounded-full bg-lime-400';
    statusText.className = 'text-xs font-black tracking-wider text-lime-400 uppercase';
    statusText.textContent = '✓ TITOLO CONVALIDATO • IMBARCO AUTORIZZATO';
    progressMsg.textContent = 'GENERAZIONE CARTA D\'IMBARCO 3D... (+5 XP ACCREDITATI)';
    progressMsg.className = 'text-white font-black';
  }

  function animate() {
    if (!document.getElementById('scanner-3d-overlay')) return;
    requestAnimationFrame(animate);

    const delta = clock.getDelta();
    const elapsedTime = clock.getElapsedTime();

    // FASE 1: Ingresso Biglietto nella Fessura
    if (animState === 'entering') {
      ticketMesh.position.y += (0 - ticketMesh.position.y) * 0.08;
      ticketMesh.rotation.x += (0 - ticketMesh.rotation.x) * 0.08;

      if (Math.abs(ticketMesh.position.y) < 0.05) {
        ticketMesh.position.y = 0;
        ticketMesh.rotation.x = 0;
        animState = 'scanning';
      }
    }

    // FASE 2: Scansione Laser (Rosso)
    else if (animState === 'scanning') {
      scanTime += delta * 2.5;
      laserBeam.position.y = Math.sin(scanTime) * 0.85;
      laserLight.position.y = laserBeam.position.y;

      // Innesca la chiamata Supabase a metà animazione
      if (!validationTriggered && scanTime > 2.0) {
        validationTriggered = true;
        eseguiCheckInBackend().then((success) => {
          animState = 'validated';
          switchLaserToSuccess();
        });
      }
    }

    // FASE 3: Convalida e Uscita Verso la Carta d'Imbarco
    else if (animState === 'validated') {
      ticketMesh.rotation.y += 0.03;
      camera.position.z += (5.5 - camera.position.z) * 0.05;

      if (clock.getElapsedTime() - scanTime > 2.2) {
        animState = 'complete';
        setTimeout(() => {
          overlay.classList.add('opacity-0', 'transition-opacity', 'duration-500');
          setTimeout(() => {
            overlay.remove();
            if (onComplete) onComplete();
            else window.location.href = `boarding-pass.html?pnr=${encodeURIComponent(pnr)}`;
          }, 500);
        }, 800);
      }
    }

    renderer.render(scene, camera);
  }

  animate();

  // Responsive Resize
  window.addEventListener('resize', () => {
    if (!container) return;
    const newWidth = container.clientWidth;
    const newHeight = container.clientHeight;
    camera.aspect = newWidth / newHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(newWidth, newHeight);
  });
}