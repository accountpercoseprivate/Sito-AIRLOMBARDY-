// =============================================================================
// LOMBARDAIR - MOTORE GRAFICO 3D PER CARTA D'IMBARCO (THREE.JS)
// =============================================================================

/**
 * Genera dinamicamente un Canvas 2D ad alta risoluzione con la grafica
 * istituzionale del biglietto da usare come Texture 3D.
 */
function createTicketTexture(ticketData) {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 560;
  const ctx = canvas.getContext('2d');

  // 1. Sfondo Base Biglietto
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 2. Testata Istituzionale (Verde Foresta)
  ctx.fillStyle = '#072e1a';
  ctx.fillRect(0, 0, canvas.width, 110);

  // Dettagli Intestazione
  ctx.fillStyle = '#72db1a';
  ctx.font = 'bold 36px Inter, sans-serif';
  ctx.fillText('LombardiAIR', 40, 68);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '600 16px Inter, sans-serif';
  ctx.fillText('CARTA D\'IMBARCO DIGITALE / BOARDING PASS', 300, 64);

  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 14px Inter, sans-serif';
  ctx.fillText('SERVIZIO REGIONALE', 1000, 64);

  // 3. Linea di perforazione / Strappo (Stub)
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 3;
  ctx.setLineDash([12, 10]);
  ctx.beginPath();
  ctx.moveTo(860, 110);
  ctx.lineTo(860, 560);
  ctx.stroke();
  ctx.setLineDash([]); // Reset linea tratteggiata

  // 4. Sezione Principale: Passeggero e Volo
  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 14px Inter, sans-serif';
  ctx.fillText('PASSEGGERO', 40, 160);
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 26px Inter, sans-serif';
  ctx.fillText(ticketData.passeggero.toUpperCase(), 40, 195);

  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 14px Inter, sans-serif';
  ctx.fillText('DOCUMENTO', 40, 240);
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 20px Inter, sans-serif';
  ctx.fillText(ticketData.documento_identita, 40, 270);

  // Tratta / Aeroporti (Grandi dimensioni)
  ctx.fillStyle = '#072e1a';
  ctx.font = '900 52px Inter, sans-serif';
  ctx.fillText(ticketData.aeroporto_origine, 40, 360);
  
  ctx.fillStyle = '#72db1a';
  ctx.font = 'bold 36px Inter, sans-serif';
  ctx.fillText('➔', 180, 355);

  ctx.fillStyle = '#072e1a';
  ctx.font = '900 52px Inter, sans-serif';
  ctx.fillText(ticketData.aeroporto_destinazione, 240, 360);

  // Dettagli Orari e Volo
  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 14px Inter, sans-serif';
  ctx.fillText('VOLO', 440, 160);
  ctx.fillStyle = '#072e1a';
  ctx.font = 'bold 22px Inter, sans-serif';
  ctx.fillText(ticketData.codice_volo, 440, 195);

  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 14px Inter, sans-serif';
  ctx.fillText('DATA / ORA', 440, 240);
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 20px Inter, sans-serif';
  const dataVolo = new Date(ticketData.data_ora_partenza);
  ctx.fillText(`${dataVolo.toLocaleDateString('it-IT')} ${dataVolo.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`, 440, 270);

  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 14px Inter, sans-serif';
  ctx.fillText('GATE', 440, 320);
  ctx.fillStyle = '#072e1a';
  ctx.font = '900 24px Inter, sans-serif';
  ctx.fillText(ticketData.gate || 'T1 - B04', 440, 355);

  // Box Evidenziato Posto a Sedere
  ctx.fillStyle = '#ecfccb';
  ctx.fillRect(660, 150, 160, 130);
  ctx.strokeStyle = '#72db1a';
  ctx.lineWidth = 2;
  ctx.strokeRect(660, 150, 160, 130);

  ctx.fillStyle = '#072e1a';
  ctx.font = 'bold 14px Inter, sans-serif';
  ctx.fillText('POSTO / SEAT', 680, 185);
  ctx.fillStyle = '#072e1a';
  ctx.font = '900 52px Inter, sans-serif';
  ctx.fillText(ticketData.posto, 695, 250);

  // 5. Sezione Stub (Destra)
  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 12px Inter, sans-serif';
  ctx.fillText('PNR PRENOTAZIONE', 890, 160);
  ctx.fillStyle = '#072e1a';
  ctx.font = '900 24px Inter, sans-serif';
  ctx.fillText(ticketData.codice_prenotazione, 890, 195);

  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 12px Inter, sans-serif';
  ctx.fillText('PASSEGGERO', 890, 240);
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 16px Inter, sans-serif';
  ctx.fillText(ticketData.passeggero.toUpperCase().slice(0, 18), 890, 268);

  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 12px Inter, sans-serif';
  ctx.fillText('POSTO', 890, 310);
  ctx.fillStyle = '#072e1a';
  ctx.font = 'bold 22px Inter, sans-serif';
  ctx.fillText(ticketData.posto, 890, 340);

  // 6. Barcode Simulato
  ctx.fillStyle = '#0f172a';
  for (let x = 40; x < 800; x += Math.floor(Math.random() * 8) + 4) {
    ctx.fillRect(x, 430, Math.floor(Math.random() * 4) + 2, 80);
  }
  for (let x = 890; x < 1140; x += Math.floor(Math.random() * 7) + 4) {
    ctx.fillRect(x, 430, Math.floor(Math.random() * 3) + 2, 80);
  }

  return canvas;
}

/**
 * Texture per il retro del biglietto (Verde Istituzionale con Marchio Olografico)
 */
function createTicketBackTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 560;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#072e1a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = '#145a36';
  ctx.lineWidth = 4;
  ctx.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);

  ctx.fillStyle = '#72db1a';
  ctx.font = '900 64px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('LombardiAIR', canvas.width / 2, canvas.height / 2 - 20);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '500 18px Inter, sans-serif';
  ctx.fillText('Biglietto Ufficiale di Trasporto Aereo Regionale', canvas.width / 2, canvas.height / 2 + 30);
  ctx.fillText('Conserva il presente documento per i controlli di sicurezza aeroportuali', canvas.width / 2, canvas.height / 2 + 60);

  return canvas;
}

/**
 * Inizializza la scena Three.js, luci, mesh 3D e controller di rotazione.
 */
export function renderBoardingPass3D(containerId, ticketData) {
  const container = document.getElementById(containerId);
  if (!container || typeof THREE === 'undefined') {
    console.error('Container o Three.js non disponibile.');
    return;
  }

  container.innerHTML = ''; // Reset container

  const width = container.clientWidth;
  const height = container.clientHeight;

  // 1. Scena, Camera e Renderer
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
  camera.position.set(0, 0, 7.5);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  container.appendChild(renderer.domElement);

  // 2. Luci di scena (Illuminazione olografica)
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(5, 8, 5);
  scene.add(dirLight);

  const limePointLight = new THREE.PointLight(0x72db1a, 1.2, 12);
  limePointLight.position.set(-4, -2, 4);
  scene.add(limePointLight);

  // 3. Creazione Geometria e Materiali per il Biglietto 3D
  const frontCanvas = createTicketTexture(ticketData);
  const backCanvas = createTicketBackTexture();

  const frontTexture = new THREE.CanvasTexture(frontCanvas);
  const backTexture = new THREE.CanvasTexture(backCanvas);

  const edgeMaterial = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.5 });
  const frontMaterial = new THREE.MeshStandardMaterial({ map: frontTexture, roughness: 0.25, metalness: 0.05 });
  const backMaterial = new THREE.MeshStandardMaterial({ map: backTexture, roughness: 0.3, metalness: 0.1 });

  // [Right, Left, Top, Bottom, Front, Back]
  const materials = [
    edgeMaterial, edgeMaterial, edgeMaterial, edgeMaterial,
    frontMaterial, backMaterial
  ];

  const geometry = new THREE.BoxGeometry(4.8, 2.24, 0.035);
  const ticketMesh = new THREE.Mesh(geometry, materials);
  scene.add(ticketMesh);

  // 4. Interazione Mouse / Touch Drag per Rotazione Libera
  let isDragging = false;
  let previousMousePosition = { x: 0, y: 0 };
  let targetRotationY = -0.15;
  let targetRotationX = 0.1;

  container.addEventListener('mousedown', (e) => {
    isDragging = true;
    previousMousePosition = { x: e.clientX, y: e.clientY };
  });

  window.addEventListener('mouseup', () => { isDragging = false; });

  container.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const deltaX = e.clientX - previousMousePosition.x;
    const deltaY = e.clientY - previousMousePosition.y;

    targetRotationY += deltaX * 0.008;
    targetRotationX += deltaY * 0.008;

    // Limiti di inclinazione verticale
    targetRotationX = Math.max(-0.6, Math.min(0.6, targetRotationX));

    previousMousePosition = { x: e.clientX, y: e.clientY };
  });

  // Touch Support
  container.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      isDragging = true;
      previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  });

  container.addEventListener('touchmove', (e) => {
    if (!isDragging || e.touches.length !== 1) return;
    const deltaX = e.touches[0].clientX - previousMousePosition.x;
    const deltaY = e.touches[0].clientY - previousMousePosition.y;

    targetRotationY += deltaX * 0.008;
    targetRotationX += deltaY * 0.008;
    targetRotationX = Math.max(-0.6, Math.min(0.6, targetRotationX));

    previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  });

  window.addEventListener('touchend', () => { isDragging = false; });

  // 5. Loop di Rendering e Animazione Fluttuante (Idle Hover)
  let clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);
    const elapsedTime = clock.getElapsedTime();

    // Movimento armonico fluttuante
    if (!isDragging) {
      ticketMesh.position.y = Math.sin(elapsedTime * 1.5) * 0.08;
    }

    // Interpolazione fluida della rotazione
    ticketMesh.rotation.y += (targetRotationY - ticketMesh.rotation.y) * 0.1;
    ticketMesh.rotation.x += (targetRotationX - ticketMesh.rotation.x) * 0.1;

    renderer.render(scene, camera);
  }

  animate();

  // 6. Responsive Resize
  window.addEventListener('resize', () => {
    const newWidth = container.clientWidth;
    const newHeight = container.clientHeight;
    camera.aspect = newWidth / newHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(newWidth, newHeight);
  });
}