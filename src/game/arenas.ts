import * as THREE from 'three';
import { createArenaFloorTextures } from './textures';
import { ARENA_MAPS, type MapId } from './types';

export interface BuiltArena {
  group: THREE.Group;
  objectiveRing: THREE.Mesh;
  objectiveCore: THREE.Mesh;
  objectiveLight: THREE.PointLight;
  disposables: Array<{ dispose: () => void }>;
}

export function buildArenaEnvironment(
  scene: THREE.Scene,
  mapId: MapId,
  maxAnisotropy: number,
  enableShadows: boolean,
): BuiltArena {
  const spec = ARENA_MAPS[mapId];
  const group = new THREE.Group();
  const disposables: Array<{ dispose: () => void }> = [];

  scene.background = new THREE.Color(spec.skyHex);
  scene.fog = new THREE.FogExp2(spec.fogHex, spec.fogDensity);

  // Warm key + cool Hemisphere fill + Rim light rig (<= 3 shadow casters)
  const hemi = new THREE.HemisphereLight(
    mapId === 'sky_island' ? 0xbbe6ff : 0x5b8def,
    mapId === 'desert_energy' ? 0x5c341f : 0x0b1020,
    mapId === 'sky_island' ? 0.95 : 0.72,
  );
  group.add(hemi);

  const keyLight = new THREE.DirectionalLight(
    mapId === 'desert_energy' ? 0xffdfb0 : 0xfff4e0,
    mapId === 'sky_island' ? 1.65 : 1.35,
  );
  keyLight.position.set(28, 42, 22);
  keyLight.castShadow = enableShadows;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.camera.near = 5;
  keyLight.shadow.camera.far = 110;
  const d = 40;
  keyLight.shadow.camera.left = -d;
  keyLight.shadow.camera.right = d;
  keyLight.shadow.camera.top = d;
  keyLight.shadow.camera.bottom = -d;
  keyLight.shadow.bias = -0.0005;
  keyLight.shadow.normalBias = 0.02;
  group.add(keyLight);

  const rimLight = new THREE.DirectionalLight(new THREE.Color(spec.secondaryHex), 0.75);
  rimLight.position.set(-28, 20, -26);
  group.add(rimLight);

  // Extended Outer Ground / Horizon Plane (no floating rectangular box void)
  const { colorMap, roughnessMap } = createArenaFloorTextures(mapId, maxAnisotropy);
  disposables.push(colorMap, roughnessMap);

  const outerGeo = new THREE.CircleGeometry(220, 48);
  const outerMat = new THREE.MeshStandardMaterial({
    color: mapId === 'sky_island' ? 0x16385e : mapId === 'desert_energy' ? 0x3b2318 : 0x080e1c,
    roughness: 0.92,
    metalness: 0.1,
  });
  const outerFloor = new THREE.Mesh(outerGeo, outerMat);
  outerFloor.rotation.x = -Math.PI / 2;
  outerFloor.position.y = -0.6;
  group.add(outerFloor);
  disposables.push(outerGeo, outerMat);

  // Playable Arena Deck
  const deckSize = spec.arenaHalfSize * 2;
  const deckGeo = new THREE.BoxGeometry(deckSize, 0.6, deckSize);
  const deckMat = new THREE.MeshStandardMaterial({
    map: colorMap,
    roughnessMap,
    roughness: 0.58,
    metalness: mapId === 'neon_city' || mapId === 'ice_crystal' ? 0.42 : 0.18,
  });
  const deck = new THREE.Mesh(deckGeo, deckMat);
  deck.position.y = -0.3;
  deck.receiveShadow = enableShadows;
  group.add(deck);
  disposables.push(deckGeo, deckMat);

  // Perimeter Boundary Guard Rails & Corner Pylons
  const railMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.35,
    metalness: 0.8,
  });
  const glowTrimMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(spec.accentHex),
    emissive: new THREE.Color(spec.accentHex),
    emissiveIntensity: 1.25,
    roughness: 0.2,
    metalness: 0.5,
  });
  disposables.push(railMat, glowTrimMat);

  const hs = spec.arenaHalfSize;
  const railHorizGeo = new THREE.BoxGeometry(deckSize + 1.2, 1.3, 0.7);
  const railVertGeo = new THREE.BoxGeometry(0.7, 1.3, deckSize + 1.2);
  disposables.push(railHorizGeo, railVertGeo);

  const northRail = new THREE.Mesh(railHorizGeo, railMat);
  northRail.position.set(0, 0.65, -hs - 0.35);
  const southRail = new THREE.Mesh(railHorizGeo, railMat);
  southRail.position.set(0, 0.65, hs + 0.35);
  const westRail = new THREE.Mesh(railVertGeo, railMat);
  westRail.position.set(-hs - 0.35, 0.65, 0);
  const eastRail = new THREE.Mesh(railVertGeo, railMat);
  eastRail.position.set(hs + 0.35, 0.65, 0);
  group.add(northRail, southRail, westRail, eastRail);

  // Team Spawn Pads
  const padGeo = new THREE.CylinderGeometry(2.6, 2.9, 0.12, 24);
  const bluePadMat = new THREE.MeshStandardMaterial({
    color: 0x06b6d4,
    emissive: 0x06b6d4,
    emissiveIntensity: 0.45,
    roughness: 0.3,
    metalness: 0.6,
  });
  const redPadMat = new THREE.MeshStandardMaterial({
    color: 0xf43f5e,
    emissive: 0xf43f5e,
    emissiveIntensity: 0.45,
    roughness: 0.3,
    metalness: 0.6,
  });
  disposables.push(padGeo, bluePadMat, redPadMat);

  const bluePad = new THREE.Mesh(padGeo, bluePadMat);
  bluePad.position.set(-24, 0.06, 0);
  const redPad = new THREE.Mesh(padGeo, redPadMat);
  redPad.position.set(24, 0.06, 0);
  group.add(bluePad, redPad);

  // Obstacles (matching exact collision specs from types.ts)
  const obstacleMat = new THREE.MeshStandardMaterial({
    color: mapId === 'desert_energy' ? 0x8f5b3c : mapId === 'sky_island' ? 0xdbe6f2 : 0x1b2945,
    roughness: mapId === 'ice_crystal' ? 0.18 : 0.45,
    metalness: mapId === 'ice_crystal' ? 0.3 : 0.65,
  });
  const crystalMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(spec.accentHex),
    emissive: new THREE.Color(spec.accentHex),
    emissiveIntensity: 0.3,
    roughness: 0.12,
    metalness: 0.1,
    clearcoat: 1.0,
  });
  disposables.push(obstacleMat, crystalMat);

  for (const obs of spec.obstacles) {
    const obsGroup = new THREE.Group();
    obsGroup.position.set(obs.x, 0, obs.z);

    if (obs.kind === 'crystal') {
      const crystalGeo = new THREE.ConeGeometry(Math.min(obs.w, obs.d) * 0.56, obs.h, 6);
      const mesh = new THREE.Mesh(crystalGeo, crystalMat);
      mesh.position.y = obs.h * 0.5;
      mesh.castShadow = enableShadows;
      mesh.receiveShadow = enableShadows;
      obsGroup.add(mesh);

      const baseGeo = new THREE.CylinderGeometry(obs.w * 0.55, obs.w * 0.62, 0.5, 6);
      const baseMesh = new THREE.Mesh(baseGeo, railMat);
      baseMesh.position.y = 0.25;
      obsGroup.add(baseMesh);
      disposables.push(crystalGeo, baseGeo);
    } else {
      const boxGeo = new THREE.BoxGeometry(obs.w, obs.h, obs.d);
      const mesh = new THREE.Mesh(boxGeo, obstacleMat);
      mesh.position.y = obs.h * 0.5;
      mesh.castShadow = enableShadows;
      mesh.receiveShadow = enableShadows;
      obsGroup.add(mesh);

      const trimGeo = new THREE.BoxGeometry(obs.w + 0.08, 0.14, obs.d + 0.08);
      const trim = new THREE.Mesh(trimGeo, glowTrimMat);
      trim.position.y = obs.h - 0.16;
      obsGroup.add(trim);
      disposables.push(boxGeo, trimGeo);
    }

    group.add(obsGroup);
  }

  // Natural / Environmental Extended Perimeter via InstancedMesh (>24 background structures)
  const bgCount = 36;
  const bgGeo =
    mapId === 'neon_city'
      ? new THREE.BoxGeometry(6, 26, 6)
      : mapId === 'ice_crystal'
        ? new THREE.ConeGeometry(4.5, 22, 6)
        : mapId === 'desert_energy'
          ? new THREE.CylinderGeometry(3.2, 6.5, 16, 7)
          : new THREE.DodecahedronGeometry(5.5, 0);

  const bgMat = new THREE.MeshStandardMaterial({
    color:
      mapId === 'neon_city'
        ? 0x0f1a33
        : mapId === 'ice_crystal'
          ? 0x1e5c78
          : mapId === 'desert_energy'
            ? 0x5c3624
            : 0x365b80,
    roughness: 0.62,
    metalness: mapId === 'neon_city' ? 0.72 : 0.2,
  });
  const bgInstanced = new THREE.InstancedMesh(bgGeo, bgMat, bgCount);
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();

  for (let i = 0; i < bgCount; i++) {
    const angle = (i / bgCount) * Math.PI * 2;
    const radius = 56 + (i % 4) * 14;
    const scaleY = 0.65 + ((i * 17) % 10) * 0.11;
    const scaleXZ = 0.85 + ((i * 7) % 5) * 0.12;
    dummy.position.set(
      Math.cos(angle) * radius,
      mapId === 'sky_island' ? Math.sin(i * 1.3) * 6 - 3 : 6 * scaleY,
      Math.sin(angle) * radius,
    );
    dummy.rotation.y = angle + i * 0.4;
    dummy.scale.set(scaleXZ, scaleY, scaleXZ);
    dummy.updateMatrix();
    bgInstanced.setMatrixAt(i, dummy.matrix);
    tint.set(bgMat.color).offsetHSL(0, 0, ((i % 5) - 2) * 0.03);
    bgInstanced.setColorAt(i, tint);
  }
  bgInstanced.instanceMatrix.needsUpdate = true;
  if (bgInstanced.instanceColor) bgInstanced.instanceColor.needsUpdate = true;
  bgInstanced.computeBoundingSphere();
  group.add(bgInstanced);
  disposables.push(bgGeo, bgMat);

  // Central Arena Objective Beacon
  const ringGeo = new THREE.RingGeometry(spec.objective.radius - 0.35, spec.objective.radius, 48);
  const ringMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(spec.accentHex),
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.85,
  });
  const objectiveRing = new THREE.Mesh(ringGeo, ringMat);
  objectiveRing.rotation.x = -Math.PI / 2;
  objectiveRing.position.set(spec.objective.x, 0.05, spec.objective.z);
  group.add(objectiveRing);

  const coreGeo = new THREE.OctahedronGeometry(0.85, 0);
  const coreMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(spec.accentHex),
    emissive: new THREE.Color(spec.accentHex),
    emissiveIntensity: 1.5,
    roughness: 0.15,
    metalness: 0.85,
  });
  const objectiveCore = new THREE.Mesh(coreGeo, coreMat);
  objectiveCore.position.set(spec.objective.x, 2.2, spec.objective.z);
  group.add(objectiveCore);

  const objectiveLight = new THREE.PointLight(new THREE.Color(spec.accentHex), 3.2, 16, 2);
  objectiveLight.position.set(spec.objective.x, 2.4, spec.objective.z);
  group.add(objectiveLight);

  disposables.push(ringGeo, ringMat, coreGeo, coreMat);

  scene.add(group);
  return { group, objectiveRing, objectiveCore, objectiveLight, disposables };
}
