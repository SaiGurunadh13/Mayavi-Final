/* Homepage VR entry:
   1. FRONT-FACING HEADSET (Camera stationary, front of headset centered)
   2. TURN LEFT TO BACK (Headset rotates 180° from 0 to -π; Camera 100% stationary)
   3. HOLD ON BACKSIDE (Camera stationary, backside eye sockets clearly aligned)
   4. ZOOM INTO EYE SOCKET FROM BACKSIDE (Straight camera push forward along Z, headset frozen)
   5. PENETRATE INTO DARK INTERIOR (Camera enters inside, view transitions to pure black)
   6. CINEMATIC 3D WORMHOLE TRAVELING (Wormhole activates, camera travels forward down tunnel of neon rings & vortex particles)
   7. EXIT PORTAL & HOMEPAGE REVEAL (Exit burst flash dissolves into index.html, restored scrolling, hero entrance)
*/
(() => {
  'use strict';
  const intro  = document.getElementById('vr-intro');
  const canvas = document.getElementById('vr-canvas');
  const skip   = document.getElementById('vr-skip');
  if (!intro || !canvas) return;

  const reduced        = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mobile         = matchMedia('(max-width: 700px)').matches;
  const status         = document.getElementById('vr-status');
  const loader         = document.getElementById('vr-loader');
  const progressText   = document.getElementById('vr-progress');
  const progressBar    = document.getElementById('vr-progress-bar');
  const vrCopy         = intro.querySelector('.vr-copy');
  const vrHuds         = intro.querySelectorAll('.vr-hud');
  const flashOverlay   = document.getElementById('vr-flash-overlay');

  let state            = 'INITIAL_VIEW';
  let modelReady       = false;
  let raf              = 0;
  let scrollTriggerInstance = null;
  let wormholeActive   = false;
  let wormholeTravel   = 0; // 0 to 1 progress through wormhole
  let clock            = null;

  /* ── Lock body while intro is active ── */
  document.body.classList.add('intro-active');

  /* ── Enter the main website (index.html) ── */
  const enterSite = () => {
    if (state === 'WEBSITE') return;
    state = 'WEBSITE';

    // Flash light-burst dissolve into homepage
    if (flashOverlay) {
      flashOverlay.style.opacity = '1';
      setTimeout(() => {
        flashOverlay.style.opacity = '0';
      }, 400);
    }

    // Dismantle ScrollTrigger pin cleanly
    if (scrollTriggerInstance) {
      scrollTriggerInstance.kill(true);
      scrollTriggerInstance = null;
    }

    // Unlock body scrolling and hide intro section
    document.body.classList.remove('intro-active');
    document.body.style.overflow = '';
    intro.classList.add('is-finished');
    intro.style.display = 'none';

    // Reset document scroll to top
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    // Force visibility and interactions on all website elements
    ['header', 'nav', '.rail', 'main', 'footer'].forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        el.style.visibility = 'visible';
        el.style.opacity = '1';
        el.style.pointerEvents = 'auto';
      });
    });

    // Refresh ScrollTriggers for main.js sections
    if (window.ScrollTrigger) {
      ScrollTrigger.refresh(true);
      setTimeout(() => ScrollTrigger.refresh(true), 150);
      setTimeout(() => ScrollTrigger.refresh(true), 450);
    }

    // Dispatch event so main.js executes hero animations
    window.dispatchEvent(new CustomEvent('intro-complete'));

    // Stop render loop
    setTimeout(() => {
      cancelAnimationFrame(raf);
    }, 600);
  };

  skip?.addEventListener('click', enterSite);

  /* ── Early exit if Three.js is unavailable ── */
  if (!window.THREE || !THREE.GLTFLoader) {
    if (status) status.textContent = '3D ENGINE UNAVAILABLE — ENTERING';
    enterSite();
    return;
  }

  clock = new THREE.Clock();

  /* ── Three.js WebGL Setup ── */
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: !mobile,
    powerPreference: 'high-performance'
  });
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  const scene  = new THREE.Scene();
  scene.fog    = new THREE.FogExp2(0x030308, 0.012);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.001, 350);

  // Group for the physical VR Headset
  const modelRoot = new THREE.Group();
  scene.add(modelRoot);

  // Group for the 3D Wormhole
  const wormholeGroup = new THREE.Group();
  scene.add(wormholeGroup);
  wormholeGroup.visible = false;

  /* ── Lighting for Headset ── */
  scene.add(new THREE.HemisphereLight(0x9d5cff, 0x050512, 1.8));

  const keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
  keyLight.position.set(4, 5.5, 5);
  scene.add(keyLight);

  const cyanRim = new THREE.PointLight(0x00f0ff, 12, 16);
  cyanRim.position.set(3, -0.5, 2.5);
  scene.add(cyanRim);

  const violetRim = new THREE.PointLight(0xa855f7, 14, 18);
  violetRim.position.set(-3.5, 1.2, 2.8);
  scene.add(violetRim);

  const backGlow = new THREE.DirectionalLight(0x00d9ff, 2.2);
  backGlow.position.set(0, -2, -4);
  scene.add(backGlow);

  /* ── Resize handler ── */
  const resize = () => {
    const width  = canvas.clientWidth  || innerWidth;
    const height = canvas.clientHeight || innerHeight;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.25 : 1.75));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  addEventListener('resize', resize, { passive: true });
  resize();

  /* ── Utilities ── */
  const clamp  = v => Math.max(0, Math.min(1, v));
  const smooth = v => v * v * (3 - 2 * v);
  const lerp   = (a, b, t) => a + (b - a) * t;
  const setProgress = v => {
    if (progressText) progressText.textContent = Math.round(v * 100) + '%';
    if (progressBar)  progressBar.style.transform = `scaleX(${v})`;
  };

  /* ── Transition overlay (darkness for interior entry) ── */
  const transitionOverlay = document.createElement('div');
  transitionOverlay.id = 'vr-transition-overlay';
  transitionOverlay.style.cssText = 'position:absolute;inset:0;z-index:4;pointer-events:none;opacity:0;background:#030308;transition:opacity 0.08s linear;';
  intro.querySelector('.vr-stage').appendChild(transitionOverlay);

  /* ── Generate procedural glowing particle texture ── */
  const createGlowTexture = () => {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const ctx = c.getContext('2d');
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    grad.addColorStop(0.22, 'rgba(0, 240, 255, 0.9)');
    grad.addColorStop(0.55, 'rgba(168, 85, 247, 0.45)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  };
  const glowTexture = createGlowTexture();

  /* ── Build Procedural 3D Wormhole System ── */
  const ringCount = 28;
  const rings = [];
  const ringGroup = new THREE.Group();
  wormholeGroup.add(ringGroup);

  for (let i = 0; i < ringCount; i++) {
    const isCyan = i % 2 === 0;
    const zPos = 6 - (i * 2.8); // spans from z = 6 down to z = -69.6
    const ringRadius = 1.5 + Math.sin(i * 0.35) * 0.25;
    const torusGeo = new THREE.TorusGeometry(ringRadius, 0.045, 16, 48);
    const torusMat = new THREE.MeshBasicMaterial({
      color: isCyan ? 0x00f0ff : 0xc084fc,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    const ringMesh = new THREE.Mesh(torusGeo, torusMat);
    ringMesh.position.set(0, 0, zPos);
    ringMesh.rotation.z = (Math.PI / ringCount) * i;
    ringMesh.userData = {
      rotSpeed: (isCyan ? 1 : -1) * (1.2 + (i % 3) * 0.4),
      baseZ: zPos
    };
    ringGroup.add(ringMesh);
    rings.push(ringMesh);
  }

  // 3,600 Spiral Vortex Particles
  const particleCount = 3600;
  const particleGeo = new THREE.BufferGeometry();
  const particlePositions = new Float32Array(particleCount * 3);
  const particleColors = new Float32Array(particleCount * 3);
  const particleAngles = new Float32Array(particleCount);
  const particleRadii  = new Float32Array(particleCount);
  const particleSpeeds = new Float32Array(particleCount);

  const colorPalette = [
    new THREE.Color(0x00f0ff),
    new THREE.Color(0xa855f7),
    new THREE.Color(0xe879f9),
    new THREE.Color(0xffffff)
  ];

  for (let i = 0; i < particleCount; i++) {
    const theta = (i * 0.12) + (Math.random() * 0.4);
    const radius = 0.50 + Math.random() * 2.2;
    const z = 10 - Math.random() * 88;

    particleAngles[i] = theta;
    particleRadii[i]  = radius;
    particleSpeeds[i] = 1.8 + Math.random() * 3.2;

    particlePositions[i * 3]     = Math.cos(theta) * radius;
    particlePositions[i * 3 + 1] = Math.sin(theta) * radius;
    particlePositions[i * 3 + 2] = z;

    const col = colorPalette[Math.floor(Math.random() * colorPalette.length)];
    particleColors[i * 3]     = col.r;
    particleColors[i * 3 + 1] = col.g;
    particleColors[i * 3 + 2] = col.b;
  }

  particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
  particleGeo.setAttribute('color', new THREE.BufferAttribute(particleColors, 3));

  const particleMat = new THREE.PointsMaterial({
    size: mobile ? 0.24 : 0.18,
    map: glowTexture,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    vertexColors: true
  });
  const warpParticles = new THREE.Points(particleGeo, particleMat);
  wormholeGroup.add(warpParticles);

  // Hyper-speed Star Streaks (800 fast particles)
  const streakCount = 800;
  const streakGeo = new THREE.BufferGeometry();
  const streakPositions = new Float32Array(streakCount * 3);
  const streakSpeeds = new Float32Array(streakCount);

  for (let i = 0; i < streakCount; i++) {
    streakPositions[i * 3]     = (Math.random() - 0.5) * 4.0;
    streakPositions[i * 3 + 1] = (Math.random() - 0.5) * 4.0;
    streakPositions[i * 3 + 2] = 10 - Math.random() * 88;
    streakSpeeds[i] = 4.0 + Math.random() * 6.0;
  }
  streakGeo.setAttribute('position', new THREE.BufferAttribute(streakPositions, 3));
  const streakMat = new THREE.PointsMaterial({
    size: mobile ? 0.32 : 0.22,
    map: glowTexture,
    color: 0x00f0ff,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const starStreaks = new THREE.Points(streakGeo, streakMat);
  wormholeGroup.add(starStreaks);

  // Wireframe Outer Tunnel Cylinder
  const tunnelCylinderGeo = new THREE.CylinderGeometry(2.35, 2.35, 90, 24, 40, true);
  tunnelCylinderGeo.rotateX(Math.PI / 2);
  const tunnelCylinderMat = new THREE.MeshBasicMaterial({
    color: 0x581c87,
    wireframe: true,
    transparent: true,
    opacity: 0.25,
    blending: THREE.AdditiveBlending
  });
  const tunnelCylinder = new THREE.Mesh(tunnelCylinderGeo, tunnelCylinderMat);
  tunnelCylinder.position.set(0, 0, -36);
  wormholeGroup.add(tunnelCylinder);

  // Glowing Exit Portal at end of Wormhole
  const exitPortalGroup = new THREE.Group();
  exitPortalGroup.position.set(0, 0, -72);
  wormholeGroup.add(exitPortalGroup);

  const exitCoreGeo = new THREE.CircleGeometry(2.8, 36);
  const exitCoreMat = new THREE.MeshBasicMaterial({
    map: glowTexture,
    color: 0xffffff,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide
  });
  const exitCoreMesh = new THREE.Mesh(exitCoreGeo, exitCoreMat);
  exitPortalGroup.add(exitCoreMesh);

  const exitRingGeo = new THREE.TorusGeometry(2.9, 0.08, 16, 48);
  const exitRingMat = new THREE.MeshBasicMaterial({
    color: 0x00f0ff,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending
  });
  const exitRingMesh = new THREE.Mesh(exitRingGeo, exitRingMat);
  exitPortalGroup.add(exitRingMesh);

  const portalLight = new THREE.PointLight(0x00f0ff, 15, 35);
  exitPortalGroup.add(portalLight);

  /* ── Camera Journey Waypoints ── */
  // Left eye socket in world space when model is rotated -Math.PI (180° left):
  // Local lens center: x = +0.298, y = -0.321, z = -0.824
  // World lens center: x = -0.298, y = -0.321, z = +0.824
  const lensTargetX = -0.298;
  const lensTargetY = -0.321;
  const lensTargetZ = 0.824;

  const camStart   = new THREE.Vector3(0, 0.08, 4.60);
  const camSocket  = new THREE.Vector3(lensTargetX, lensTargetY, 1.15);
  const camInside  = new THREE.Vector3(lensTargetX, lensTargetY, 0.40);
  const lookStart  = new THREE.Vector3(0, 0.04, 0);
  const lookSocket = new THREE.Vector3(lensTargetX, lensTargetY, -2.0);

  // Model orientation targets:
  // Initial: FRONT (0)
  // End of Phase 2: BACK (-180° / -Math.PI, turned to the LEFT)
  const modelRotYStart = 0;
  const modelRotYEnd   = -Math.PI;

  /* ── Master Coordinated Journey Timeline (progress 0 → 1) ── */
  const applyJourney = (progress) => {
    if (!modelReady) return;
    if (state === 'WEBSITE') return;

    const camPos = new THREE.Vector3();

    // ══════════════════════════════════════════════════════════════
    // PHASE 1: FRONT-FACING INITIAL VIEW (0% – 10%)
    // ══════════════════════════════════════════════════════════════
    if (progress <= 0.10) {
      modelRoot.visible = true;
      wormholeGroup.visible = false;
      wormholeActive = false;
      wormholeTravel = 0;

      // Model at FRONT (eye sockets directly face camera)
      modelRoot.rotation.set(0, modelRotYStart, 0);

      // Camera 100% stationary
      camera.position.copy(camStart);
      camera.lookAt(lookStart);
      camera.fov = 32;
      camera.near = 0.001;
      camera.rotation.z = 0;
      camera.updateProjectionMatrix();

      if (vrCopy) vrCopy.style.opacity = 1;
      vrHuds.forEach(h => h.style.opacity = 1);
      transitionOverlay.style.opacity = 0;

      if (status) status.textContent = 'HEADSET ONLINE // FRONT VIEW';
      state = 'FRONT_VIEW';
    }

    // ══════════════════════════════════════════════════════════════
    // PHASE 2: ROTATE FROM FRONT TO BACK — TURN LEFT 180° (10% – 42%)
    // (Camera remains completely stationary during entire rotation!)
    // ══════════════════════════════════════════════════════════════
    else if (progress <= 0.42) {
      modelRoot.visible = true;
      wormholeGroup.visible = false;
      wormholeActive = false;
      wormholeTravel = 0;

      const rotT = smooth((progress - 0.10) / 0.32); // 0 to 1 over [0.10, 0.42]

      // Rotate model 180° to the LEFT (FRONT → SIDE → BACK)
      modelRoot.rotation.y = lerp(modelRotYStart, modelRotYEnd, rotT);
      modelRoot.rotation.x = 0;

      // Camera remains 100% stationary!
      camera.position.copy(camStart);
      camera.lookAt(lookStart);
      camera.fov = 32;
      camera.near = 0.001;
      camera.rotation.z = 0;
      camera.updateProjectionMatrix();

      if (vrCopy) vrCopy.style.opacity = 1;
      vrHuds.forEach(h => h.style.opacity = 1);
      transitionOverlay.style.opacity = 0;

      if (status) status.textContent = 'TURNING TO BACK (CALIBRATING OPTICS)';
      state = 'ROTATING_LEFT';
    }

    // ══════════════════════════════════════════════════════════════
    // PHASE 3: FINISH ROTATION AND HOLD (42% – 48%)
    // (Headset locked at backside; camera still stationary)
    // ══════════════════════════════════════════════════════════════
    else if (progress <= 0.48) {
      modelRoot.visible = true;
      wormholeGroup.visible = false;
      wormholeActive = false;
      wormholeTravel = 0;

      modelRoot.rotation.set(0, modelRotYEnd, 0);

      // Camera remains stationary
      camera.position.copy(camStart);
      camera.lookAt(lookStart);
      camera.fov = 32;
      camera.near = 0.001;
      camera.rotation.z = 0;
      camera.updateProjectionMatrix();

      const hudFade = 1 - smooth((progress - 0.42) / 0.06) * 0.3;
      if (vrCopy) vrCopy.style.opacity = hudFade;
      vrHuds.forEach(h => h.style.opacity = hudFade);
      transitionOverlay.style.opacity = 0;

      if (status) status.textContent = 'LENSES ALIGNED // APPROACHING';
      state = 'HOLD_BACK';
    }

    // ══════════════════════════════════════════════════════════════
    // PHASE 4: ZOOM INTO EYE SOCKETS FROM BACKSIDE (48% – 72%)
    // (Headset locked at -π; camera zooms straight forward)
    // ══════════════════════════════════════════════════════════════
    else if (progress <= 0.72) {
      modelRoot.visible = true;
      wormholeGroup.visible = false;
      wormholeActive = false;
      wormholeTravel = 0;

      // Headset strictly frozen at -π; NO ROTATION!
      modelRoot.rotation.set(0, modelRotYEnd, 0);

      const approachT = smooth((progress - 0.48) / 0.24);

      // Camera zooms straight forward from the backside into the eye sockets
      camPos.lerpVectors(camStart, camSocket, approachT);
      camera.position.copy(camPos);
      const currentLook = new THREE.Vector3().lerpVectors(lookStart, new THREE.Vector3(lensTargetX, lensTargetY, lensTargetZ), approachT);
      camera.lookAt(currentLook);

      camera.fov = 32;
      camera.near = 0.001;
      camera.rotation.z = 0;
      camera.updateProjectionMatrix();

      // Fade out HUD completely
      const hudFade = Math.max(0, 1 - approachT * 1.5);
      if (vrCopy) vrCopy.style.opacity = hudFade;
      vrHuds.forEach(h => h.style.opacity = hudFade);
      transitionOverlay.style.opacity = 0;

      if (status) status.textContent = 'ZOOMING INTO EYE SOCKET';
      state = 'ZOOM_SOCKET';
    }

    // ══════════════════════════════════════════════════════════════
    // PHASE 5: PENETRATE INTO DARK INTERIOR (72% – 78%)
    // (Camera enters inside; screen transitions to black)
    // ══════════════════════════════════════════════════════════════
    else if (progress <= 0.78) {
      modelRoot.visible = true;
      wormholeGroup.visible = false;
      wormholeActive = false;
      wormholeTravel = 0;

      modelRoot.rotation.set(0, modelRotYEnd, 0);

      const enterT = smooth((progress - 0.72) / 0.06);

      // Pass through into the interior
      camPos.lerpVectors(camSocket, camInside, enterT);
      camera.position.copy(camPos);
      camera.lookAt(lookSocket);

      camera.fov = lerp(32, 45, enterT);
      camera.near = lerp(0.001, 0.0001, enterT);
      camera.rotation.z = 0;
      camera.updateProjectionMatrix();

      if (vrCopy) vrCopy.style.opacity = 0;
      vrHuds.forEach(h => h.style.opacity = 0);

      // Transition overlay smoothly envelopes the screen in blackness
      transitionOverlay.style.opacity = enterT;

      if (enterT >= 0.90) {
        modelRoot.visible = false;
      }

      if (status) status.textContent = 'ENTERING VIRTUAL REALITY';
      state = 'ENTERING_DARKNESS';
    }

    // ══════════════════════════════════════════════════════════════
    // PHASE 6: CINEMATIC 3D WORMHOLE TRAVELING (78% – 100%)
    // (Pure 3D WebGL Hyperspace Tunnel Journey — NO 2D loading screen!)
    // ══════════════════════════════════════════════════════════════
    else {
      // Physical headset is completely hidden
      modelRoot.visible = false;

      // Wormhole is active & fully visible
      wormholeGroup.visible = true;
      wormholeActive = true;
      transitionOverlay.style.opacity = 0;

      if (vrCopy) vrCopy.style.opacity = 0;
      vrHuds.forEach(h => h.style.opacity = 0);

      state = 'WORMHOLE_TRAVEL';
      if (status) status.textContent = 'WARP DRIVE ENGAGED // HYPERSPACE';

      // Map scroll progress (0.78 to 0.98) to wormhole travel progress (0 to 1)
      const scrollW = clamp((progress - 0.78) / 0.20);
      wormholeTravel = Math.max(wormholeTravel, scrollW);

      if (progress >= 0.99 || wormholeTravel >= 1.0) {
        enterSite();
      }
    }

    intro.style.setProperty('--vr-p', progress.toFixed(3));
  };

  /* ── Load Headset GLB Model ── */
  const gltfLoader = new THREE.GLTFLoader();
  gltfLoader.load(
    'Meshy_AI_Neon_Visionary_0926093923_texture.glb',
    (gltf) => {
      const model = gltf.scene;

      // Center and normalize model
      const bounds = new THREE.Box3().setFromObject(model);
      const center = bounds.getCenter(new THREE.Vector3());
      const modelSize = bounds.getSize(new THREE.Vector3());
      model.position.sub(center);
      const normalizedScale = 2.5 / Math.max(modelSize.x, modelSize.y, modelSize.z);
      model.scale.setScalar(normalizedScale);

      modelRoot.add(model);

      // Enable DoubleSide on all meshes for interior visibility
      model.traverse(child => {
        if (child.isMesh && child.material) {
          child.material.side = THREE.DoubleSide;
          child.material.depthWrite = true;
        }
      });

      // Start facing FRONT directly
      modelRoot.rotation.set(0, modelRotYStart, 0);
      camera.position.copy(camStart);
      camera.lookAt(lookStart);

      modelReady = true;
      if (status) status.textContent = 'HEADSET ONLINE';
      if (loader) loader.classList.add('is-ready');

      // Initialize ScrollTrigger pinned master animation
      setupScrollAnimation();
    },
    (event) => {
      if (event.total) setProgress(event.loaded / event.total);
    },
    (error) => {
      console.warn('[VR-Intro] 3D Model load error:', error);
      if (status) status.textContent = '3D BYPASS // ENTERING DIRECTLY';
      enterSite();
    }
  );

  /* ── Master ScrollTrigger Setup ── */
  const setupScrollAnimation = () => {
    if (!window.gsap || !window.ScrollTrigger) {
      // Fallback scroll listener
      const onScroll = () => {
        if (state === 'WEBSITE') return;
        const rect = intro.getBoundingClientRect();
        const travel = Math.max(1, intro.offsetHeight - innerHeight);
        const progress = clamp(-rect.top / travel);
        applyJourney(progress);
      };
      addEventListener('scroll', onScroll, { passive: true });
      onScroll();
      return;
    }

    gsap.registerPlugin(ScrollTrigger);

    scrollTriggerInstance = ScrollTrigger.create({
      trigger: intro,
      start: 'top top',
      end: 'bottom bottom',
      pin: intro.querySelector('.vr-stage'),
      scrub: 0.5,
      anticipatePin: 1,
      onUpdate: (self) => {
        if (state === 'WEBSITE') return;
        applyJourney(self.progress);
      },
      onLeave: () => {
        if (state !== 'WEBSITE') {
          enterSite();
        }
      },
      onLeaveBack: () => {
        if (state !== 'WEBSITE') {
          applyJourney(0);
        }
      }
    });

    // Initial state
    applyJourney(0);
  };

  /* ── Continuous 60fps WebGL Animation Loop ── */
  const render = () => {
    const delta = clock ? Math.min(clock.getDelta(), 0.1) : 0.016;
    const elapsed = clock ? clock.getElapsedTime() : 0;

    // Headset subtle ambient breathing when in initial view
    if (modelReady && state === 'FRONT_VIEW') {
      modelRoot.position.y = Math.sin(elapsed * 1.5) * 0.015;
    } else if (modelReady) {
      modelRoot.position.y = 0;
    }

    // ══════════════════════════════════════════════════════════════
    // DYNAMIC 3D WORMHOLE CRUISE & FORWARD TRAVEL
    // ══════════════════════════════════════════════════════════════
    if (wormholeActive && state !== 'WEBSITE') {
      // Smooth auto-cruise velocity ensures constant forward motion through tunnel
      // even if user pauses scrolling! Takes ~3.5 seconds to complete.
      const cruiseRate = reduced ? 0.35 : 0.28;
      wormholeTravel = Math.min(1.0, wormholeTravel + delta * cruiseRate);

      // Rotate concentric energy rings
      rings.forEach(ring => {
        ring.rotation.z += ring.userData.rotSpeed * delta * 1.2;
      });

      // Swirl vortex particles along tunnel
      const positions = warpParticles.geometry.attributes.position.array;
      for (let i = 0; i < particleCount; i++) {
        particleAngles[i] += delta * 2.2;
        const theta = particleAngles[i];
        const r     = particleRadii[i];

        positions[i * 3]     = Math.cos(theta) * r;
        positions[i * 3 + 1] = Math.sin(theta) * r;

        // Stream backward past camera to create speed sensation
        positions[i * 3 + 2] += delta * particleSpeeds[i] * 14.0;
        if (positions[i * 3 + 2] > camera.position.z + 8) {
          positions[i * 3 + 2] = camera.position.z - 75;
        }
      }
      warpParticles.geometry.attributes.position.needsUpdate = true;

      // Stream hyper-speed star streaks
      const streakPos = starStreaks.geometry.attributes.position.array;
      for (let i = 0; i < streakCount; i++) {
        streakPos[i * 3 + 2] += delta * streakSpeeds[i] * 22.0;
        if (streakPos[i * 3 + 2] > camera.position.z + 6) {
          streakPos[i * 3 + 2] = camera.position.z - 75;
          streakPos[i * 3]     = (Math.random() - 0.5) * 3.8;
          streakPos[i * 3 + 1] = (Math.random() - 0.5) * 3.8;
        }
      }
      starStreaks.geometry.attributes.position.needsUpdate = true;

      // Rotate outer wireframe cylinder
      tunnelCylinder.rotation.z += delta * 0.22;

      // Camera forward travel through wormhole: Z goes from 6 down to -70
      const wSmooth = smooth(wormholeTravel);
      camera.position.z = lerp(6.0, -70.0, wSmooth);
      camera.position.x = Math.sin(wormholeTravel * 6 * Math.PI) * 0.14;
      camera.position.y = Math.cos(wormholeTravel * 4 * Math.PI) * 0.10;
      camera.lookAt(0, 0, camera.position.z - 30.0);

      // Dynamic optical FOV stretch (warp perspective effect)
      camera.fov = lerp(45, 68, Math.sin(wormholeTravel * Math.PI));
      camera.rotation.z = Math.sin(wormholeTravel * 3 * Math.PI) * 0.10;
      camera.near = 0.01;
      camera.updateProjectionMatrix();

      // Exit portal flaring as camera reaches end of wormhole
      if (wormholeTravel >= 0.85) {
        const exitT = (wormholeTravel - 0.85) / 0.15; // 0 to 1
        const exitScale = 1.0 + Math.pow(exitT, 2.5) * 14.0;
        exitPortalGroup.scale.setScalar(exitScale);
        portalLight.intensity = 15 + exitT * 40;
      }

      // Flash burst right before exiting wormhole
      if (wormholeTravel >= 0.96 && flashOverlay) {
        flashOverlay.style.opacity = '1';
      }

      // Exit wormhole and reveal homepage!
      if (wormholeTravel >= 1.0) {
        enterSite();
      }
    }

    renderer.render(scene, camera);
    raf = requestAnimationFrame(render);
  };
  render();

  addEventListener('pagehide', () => cancelAnimationFrame(raf), { once: true });
})();
