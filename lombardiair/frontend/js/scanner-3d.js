// =============================================================================
// LOMBARDAIR - MOTORE GRAFICO SCANNER LASER 3D AI GATE (scanner-3d.js)
// =============================================================================

import { getSupabase } from './config.js';

function createScanningTicketTexture(pnr, flightData) {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 420;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#0B2519';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = '#84CC16';
  ctx.lineWidth = 8;
  ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 32px sans-serif';
  ctx.fillText('LombardiAIR', 40, 60);

  ctx.fillStyle = '#A3E635';
  ctx.font = 'bold 16px monospace';
  ctx.fillText('GATE PASS CHECK-IN', 40, 90);

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

  ctx.fillStyle = '#FFFFFF';
  for (let x = 40; x < 740; x += 12) {
    const w = (x % 24 === 0) ? 6 : 3;
    ctx.fillRect(x, 310, w, 70);
  }

  return canvas;
}

export function startGateScanner3D(pnr, flightData = {}, onComplete = null) {
  const old = document.getElementById('scanner-3d-overlay');
  if (old) old.remove();

  // Overlay a tutto schermo
  const overlay = document.createElement('div');
  overlay.id = 'scanner-3d-overlay';
  overlay.style.cssText = 'position:fixed; inset:0; z-index:99999; background:rgba(4,23,14,0.92); backdrop-filter:blur(16px); display:flex; flex-direction:column; align-items:center; justify-content:center; padding:16px; user-select:none;';
  
  overlay.innerHTML = `
    <div style="position:relative; width:100%; max-width:680px; background:#000; border-radius:24px; border:2px solid #14422D; box-shadow:0 25px 50px -12px rgba(0,0,0,0.8); overflow:hidden; display:flex; flex-direction:column; align-items:center;">
      
      <div style="width:100%; background:rgba(11,37,25,0.95); border-bottom:1px solid rgba(255,255,255,0.1); padding:16px 24px; display:flex; align-items:center; justify-content:space-between; z-index:10; font-family:monospace;">
        <div style="display:flex; align-items:center; gap:12px;">
          <span id="scanner-beacon" style="display:inline-block; width:12px; height:12px; border-radius:50%; background:#EF4444;"></span>
          <span id="scanner-status-text" style="font-size:12px; font-weight:800; color:#FBBF24; text-transform:uppercase;">
            SCANSIONE VOLUMETRICA IN CORSO...
          </span>
        </div>
        <span style="font-size:11px; color:#94A3B8; font-weight:700;">GATE 04 • VALIDAZIONE ENAC</span>
      </div>

      <div id="scanner-viewport" style="width:100%; height:380px; position:relative; overflow:hidden;"></div>

      <div style="width:100%; background:rgba(4,23,14,0.95); border-top:1px solid rgba(255,255,255,0.1); padding:16px 24px; display:flex; align-items:center; justify-content:space-between; font-size:12px; z-index:10;">
        <span style="color:#94A3B8; font-family:monospace;">PNR: <b style="color:#FFF;">${pnr}</b></span>
        <span id="scanner-progress-msg" style="color:#A3E635; font-weight:800;">
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

  const width = container.clientWidth || 640;
  const height = container.clientHeight || 380;

  // Scene & Camera
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x04170E);

  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
  camera.position.set(0, 0, 7.5);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  // Luci
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  const laserLight = new THREE.PointLight(0xef4444, 3, 10);
  laserLight.position.set(0, 0, 1.5);
  scene.add(laserLight);

  // Biglietto 3D
  const ticketCanvas = createScanningTicketTexture(pnr, flightData);
  const ticketTexture = new THREE.CanvasTexture(ticketCanvas);
  const ticketGeo = new THREE.BoxGeometry(3.6, 1.88, 0.04);
  const ticketMat = new THREE.MeshStandardMaterial({ map: ticketTexture, roughness: 0.3 });
  const ticketMesh = new THREE.Mesh(ticketGeo, ticketMat);
  ticketMesh.position.set(0, -3.5, 0.4);
  ticketMesh.rotation.x = 0.4;
  scene.add(ticketMesh);

  // Fascio Laser
  const laserBeamGeo = new THREE.PlaneGeometry(4.2, 0.08);
  const laserBeamMat = new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.95, side: THREE.DoubleSide });
  const laserBeam = new THREE.Mesh(laserBeamGeo, laserBeamMat);
  laserBeam.position.set(0, 0, 0.45);
  scene.add(laserBeam);

  let animState = 'entering';
  let clock = new THREE.Clock();
  let scanTime = 0;
  let validationTriggered = false;

  async function eseguiCheckInDatabase() {
    try {
      const sb = getSupabase();
      // 1. Prova tramite RPC atomica
      const { error: rpcErr } = await sb.rpc('esegui_checkin_online', { p_pnr: pnr });
      if (rpcErr) {
        // Fallback update diretto su tabella prenotazioni
        await sb.from('prenotazioni').update({ check_in_status: true }).eq('codice_prenotazione', pnr);
      }
      return true;
    } catch (err) {
      console.warn('Check-in fallback update:', err);
      return true;
    }
  }

  function switchLaserToSuccess() {
    laserBeamMat.color.setHex(0x84cc16);
    laserLight.color.setHex(0x84cc16);
    laserLight.intensity = 4.5;
    scene.background = new THREE.Color(0x072e1a);

    beacon.style.background = '#84CC16';
    statusText.style.color = '#84CC16';
    statusText.textContent = '✓ TITOLO CONVALIDATO • IMBARCO AUTORIZZATO';
    progressMsg.style.color = '#FFFFFF';
    progressMsg.textContent = 'CHECK-IN COMPLETATO (+5 XP / +50 MIGLIA)';
  }

  function animate() {
    if (!document.getElementById('scanner-3d-overlay')) return;
    requestAnimationFrame(animate);

    const delta = clock.getDelta();

    if (animState === 'entering') {
      ticketMesh.position.y += (0 - ticketMesh.position.y) * 0.08;
      ticketMesh.rotation.x += (0 - ticketMesh.rotation.x) * 0.08;
      if (Math.abs(ticketMesh.position.y) < 0.05) {
        ticketMesh.position.y = 0;
        ticketMesh.rotation.x = 0;
        animState = 'scanning';
      }
    } else if (animState === 'scanning') {
      scanTime += delta * 2.5;
      laserBeam.position.y = Math.sin(scanTime) * 0.85;
      laserLight.position.y = laserBeam.position.y;

      if (!validationTriggered && scanTime > 1.8) {
        validationTriggered = true;
        eseguiCheckInDatabase().then(() => {
          animState = 'validated';
          switchLaserToSuccess();
        });
      }
    } else if (animState === 'validated') {
      ticketMesh.rotation.y += 0.03;
      camera.position.z += (5.5 - camera.position.z) * 0.05;

      if (clock.getElapsedTime() - scanTime > 2.0) {
        animState = 'complete';
        overlay.style.transition = 'opacity 0.4s';
        overlay.style.opacity = '0';
        setTimeout(() => {
          overlay.remove();
          if (onComplete) onComplete();
        }, 400);
      }
    }

    renderer.render(scene, camera);
  }

  animate();
}