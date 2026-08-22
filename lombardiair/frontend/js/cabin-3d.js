// =============================================================================
// LOMBARDAIR - MOTORE 3D CABINA PASSEGGERI & SEAT SELECTION (cabin-3d.js)
// Selezione posti con Raycasting Three.js e sincronizzazione Supabase
// =============================================================================

let scene, camera, renderer, animationFrameId;
let seatMeshes = [];
let hoveredSeat = null;
let currentSelectedCode = null;
let onSeatSelectedCallback = null;

// Materiali Condivisi per Alte Prestazioni
let matAvailable, matHover, matSelected, matOccupied, matCushion;

/**
 * Genera la texture canvas per visualizzare il codice del posto (es. "4A") sul sedile 3D
 */
function createSeatLabelTexture(code) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#0F172A';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 54px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(code, canvas.width / 2, canvas.height / 2);

  return new THREE.CanvasTexture(canvas);
}

/**
 * Inizializza la scena 3D della fusoliera e dei sedili
 */
export function initCabin3D(containerId, options = {}) {
  const container = document.getElementById(containerId);
  if (!container || typeof THREE === 'undefined') {
    console.error('Container o Three.js non disponibile.');
    return;
  }

  // Pulizia preventiva
  destroyCabin3D();
  container.innerHTML = '';

  const width = container.clientWidth;
  const height = container.clientHeight;
  const totalCapacity = options.totalCapacity || 60;
  const occupiedSeats = options.occupiedSeats || [];
  currentSelectedCode = options.initialSelectedSeat || null;
  onSeatSelectedCallback = options.onSeatSelected || null;

  // 1. Scena, Camera & Renderer
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x04170E);

  camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
  camera.position.set(0, 9, 13);
  camera.lookAt(0, 0, -2);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  container.appendChild(renderer.domElement);

  // 2. Luci di Scena
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
  scene.add(ambientLight);

  const cabinSpotLight = new THREE.SpotLight(0xffffff, 0.9);
  cabinSpotLight.position.set(0, 15, 5);
  scene.add(cabinSpotLight);

  const limeGlow = new THREE.PointLight(0x84cc16, 1.2, 15);
  limeGlow.position.set(0, 4, 0);
  scene.add(limeGlow);

  // 3. Inizializzazione Materiali
  matAvailable = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.3, metalness: 0.1 });
  matHover = new THREE.MeshStandardMaterial({ color: 0xd9f99d, roughness: 0.2, emissive: 0x65a30d, emissiveIntensity: 0.4 });
  matSelected = new THREE.MeshStandardMaterial({ color: 0x84cc16, roughness: 0.1, emissive: 0x4d7c0f, emissiveIntensity: 0.6 });
  matOccupied = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.8, metalness: 0.2 });
  matCushion = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.5 });

  // 4. Creazione Fusoliera dell'Aereo (Struttura Trasparente Sezionata)
  buildFuselage(totalCapacity);

  // 5. Creazione Griglia Sedili 3D (3+3 A B C | Corridoio | D E F)
  buildSeats(totalCapacity, occupiedSeats);

  // 6. Controlli Mouse Drag / Touch per Rotazione & Zoom
  setupInteraction(container);

  // 7. Loop di Animazione
  function animate() {
    animationFrameId = requestAnimationFrame(animate);

    // Animazione di pulsazione morbida sul sedile selezionato
    if (currentSelectedCode) {
      const selectedMesh = seatMeshes.find(s => s.userData.code === currentSelectedCode);
      if (selectedMesh) {
        selectedMesh.position.y = 0.2 + Math.sin(Date.now() * 0.005) * 0.04;
      }
    }

    renderer.render(scene, camera);
  }

  animate();
}

/**
 * Costruisce il pavimento e la fusoliera della cabina
 */
function buildFuselage(totalCapacity) {
  const rows = Math.max(10, Math.ceil(totalCapacity / 6));
  const cabinLength = rows * 1.6 + 4;

  // Pavimentazione Cabina
  const floorGeo = new THREE.BoxGeometry(7.2, 0.2, cabinLength);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x0b2519, roughness: 0.7 });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.position.set(0, -0.1, -cabinLength / 2 + 2);
  scene.add(floor);

  // Moquette Corridoio Centrale
  const aisleGeo = new THREE.PlaneGeometry(1.2, cabinLength);
  const aisleMat = new THREE.MeshBasicMaterial({ color: 0x14422d, side: THREE.DoubleSide });
  const aisle = new THREE.Mesh(aisleGeo, aisleMat);
  aisle.rotation.x = -Math.PI / 2;
  aisle.position.set(0, 0.01, -cabinLength / 2 + 2);
  scene.add(aisle);

  // Pareti e Finestrini Stylized
  const wallGeo = new THREE.BoxGeometry(0.2, 3.2, cabinLength);
  const wallMat = new THREE.MeshPhysicalMaterial({ color: 0x0b2519, transmission: 0.4, opacity: 0.5, transparent: true });
  
  const leftWall = new THREE.Mesh(wallGeo, wallMat);
  leftWall.position.set(-3.5, 1.5, -cabinLength / 2 + 2);
  scene.add(leftWall);

  const rightWall = new THREE.Mesh(wallGeo, wallMat);
  rightWall.position.set(3.5, 1.5, -cabinLength / 2 + 2);
  scene.add(rightWall);
}

/**
 * Costruisce i singoli sedili 3D (file da 6 posti con lettere A-F)
 */
function buildSeats(totalCapacity, occupiedSeats) {
  seatMeshes = [];
  const rows = Math.max(10, Math.ceil(totalCapacity / 6));
  const colOffsets = {
    'A': -2.6, 'B': -1.9, 'C': -1.2, // Sinistra
    'D': 1.2, 'E': 1.9, 'F': 2.6     // Destra
  };

  const seatBaseGeo = new THREE.BoxGeometry(0.55, 0.15, 0.55);
  const seatBackGeo = new THREE.BoxGeometry(0.55, 0.75, 0.12);

  for (let r = 1; r <= rows; r++) {
    const zPos = -(r - 1) * 1.5;

    for (const [col, xPos] of Object.entries(colOffsets)) {
      const code = `${r}${col}`;
      const isOccupied = occupiedSeats.includes(code);
      const isSelected = (code === currentSelectedCode);

      const seatGroup = new THREE.Group();
      seatGroup.position.set(xPos, 0.2, zPos);

      // Cuscino Sedile
      let currentMat = matAvailable;
      if (isOccupied) currentMat = matOccupied;
      else if (isSelected) currentMat = matSelected;

      const baseMesh = new THREE.Mesh(seatBaseGeo, currentMat);
      baseMesh.position.y = 0.1;
      seatGroup.add(baseMesh);

      // Schienale
      const backMesh = new THREE.Mesh(seatBackGeo, currentMat);
      backMesh.position.set(0, 0.5, -0.2);
      backMesh.rotation.x = -0.1;
      seatGroup.add(backMesh);

      // Targhetta Codice Posto
      const labelGeo = new THREE.PlaneGeometry(0.3, 0.3);
      const labelMat = new THREE.MeshBasicMaterial({ map: createSeatLabelTexture(code), transparent: true });
      const labelMesh = new THREE.Mesh(labelGeo, labelMat);
      labelMesh.position.set(0, 0.55, -0.13);
      seatGroup.add(labelMesh);

      // Metadati per Raycasting
      seatGroup.userData = {
        code: code,
        isOccupied: isOccupied,
        baseMesh: baseMesh,
        backMesh: backMesh
      };

      scene.add(seatGroup);
      seatMeshes.push(seatGroup);
    }
  }
}

/**
 * Configura il Raycaster per cliccare e selezionare i sedili con rotazione 3D
 */
function setupInteraction(container) {
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  let isDragging = false;
  let prevX = 0, prevY = 0;
  let targetRotY = 0;
  let targetRotX = 0.35;
  let targetCamZ = 13;

  // Hover & Click con Raycaster
  function onPointerMove(e) {
    const rect = container.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / container.clientWidth) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / container.clientHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(seatMeshes, true);

    if (intersects.length > 0) {
      let group = intersects[0].object.parent;
      if (group && group.userData && group.userData.code) {
        if (!group.userData.isOccupied) {
          container.style.cursor = 'pointer';
          if (hoveredSeat && hoveredSeat !== group && hoveredSeat.userData.code !== currentSelectedCode) {
            setSeatMaterial(hoveredSeat, matAvailable);
          }
          if (group.userData.code !== currentSelectedCode) {
            setSeatMaterial(group, matHover);
          }
          hoveredSeat = group;
          return;
        }
      }
    }

    container.style.cursor = 'default';
    if (hoveredSeat && hoveredSeat.userData.code !== currentSelectedCode) {
      setSeatMaterial(hoveredSeat, matAvailable);
      hoveredSeat = null;
    }
  }

  function onPointerClick(e) {
    if (isDragging) return;
    const rect = container.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / container.clientWidth) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / container.clientHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(seatMeshes, true);

    if (intersects.length > 0) {
      let group = intersects[0].object.parent;
      if (group && group.userData && group.userData.code && !group.userData.isOccupied) {
        selectSeatCode(group.userData.code);
      }
    }
  }

  function setSeatMaterial(group, mat) {
    if (group.userData.baseMesh) group.userData.baseMesh.material = mat;
    if (group.userData.backMesh) group.userData.backMesh.material = mat;
  }

  // Rotazione Libera Cabina 3D
  container.addEventListener('mousedown', (e) => {
    isDragging = false;
    prevX = e.clientX;
    prevY = e.clientY;
  });

  container.addEventListener('mousemove', (e) => {
    onPointerMove(e);
    if (e.buttons === 1) {
      const deltaX = e.clientX - prevX;
      const deltaY = e.clientY - prevY;
      if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) isDragging = true;

      targetRotY += deltaX * 0.005;
      targetRotX = Math.max(0.1, Math.min(0.9, targetRotX + deltaY * 0.005));

      camera.position.x = Math.sin(targetRotY) * 12;
      camera.position.z = Math.cos(targetRotY) * targetCamZ;
      camera.position.y = targetRotX * 16;
      camera.lookAt(0, 0, -5);

      prevX = e.clientX;
      prevY = e.clientY;
    }
  });

  container.addEventListener('click', onPointerClick);

  // Zoom / Scorrimento Lungo la Cabina con Rotellina
  container.addEventListener('wheel', (e) => {
    e.preventDefault();
    targetCamZ = Math.max(5, Math.min(25, targetCamZ + e.deltaY * 0.02));
    camera.position.z = Math.cos(targetRotY) * targetCamZ;
  }, { passive: false });

  // Supporto Touch Mobile
  container.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      prevX = e.touches[0].clientX;
      prevY = e.touches[0].clientY;
      isDragging = false;
    }
  });

  container.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1) {
      const deltaX = e.touches[0].clientX - prevX;
      const deltaY = e.touches[0].clientY - prevY;
      if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) isDragging = true;

      targetRotY += deltaX * 0.006;
      targetRotX = Math.max(0.1, Math.min(0.9, targetRotX + deltaY * 0.006));

      camera.position.x = Math.sin(targetRotY) * 12;
      camera.position.z = Math.cos(targetRotY) * targetCamZ;
      camera.position.y = targetRotX * 16;
      camera.lookAt(0, 0, -5);

      prevX = e.touches[0].clientX;
      prevY = e.touches[0].clientY;
    }
  });

  container.addEventListener('touchend', (e) => {
    if (!isDragging && e.changedTouches.length === 1) {
      const touch = e.changedTouches[0];
      onPointerClick(touch);
    }
  });
}

/**
 * Seleziona un posto specifico aggiornando la grafica e notificando l'app
 */
export function selectSeatCode(code) {
  currentSelectedCode = code;

  seatMeshes.forEach(s => {
    if (s.userData.isOccupied) return;
    if (s.userData.code === code) {
      s.userData.baseMesh.material = matSelected;
      s.userData.backMesh.material = matSelected;
    } else {
      s.userData.baseMesh.material = matAvailable;
      s.userData.backMesh.material = matAvailable;
      s.position.y = 0.2;
    }
  });

  if (onSeatSelectedCallback) {
    onSeatSelectedCallback(code);
  }
}

/**
 * Pulizia della memoria e distruzione scena Three.js
 */
export function destroyCabin3D() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }
  if (renderer && renderer.domElement) {
    renderer.domElement.remove();
  }
  seatMeshes = [];
  hoveredSeat = null;
}