import * as THREE from 'three';
import type { TeamId } from './types';

export interface RunnerRig {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  headGroup: THREE.Group;
  thrusterFlameL: THREE.Mesh;
  thrusterFlameR: THREE.Mesh;
  visorMat: THREE.MeshStandardMaterial;
  armorMat: THREE.MeshStandardMaterial;
  shieldRing: THREE.Mesh;
}

export function createRunnerRig(
  team: TeamId,
  accentHex: string,
  shadowTex: THREE.Texture,
): RunnerRig {
  const root = new THREE.Group();
  const teamColor = team === 'blue' ? 0x06b6d4 : 0xf43f5e;
  const trimColor = new THREE.Color(accentHex || (team === 'blue' ? '#06B6D4' : '#F43F5E'));

  // Soft radial contact shadow flush at ground (y = 0.02)
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
  });
  const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7), shadowMat);
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = 0.02;
  root.add(shadowPlane);

  // Materials with varied roughness/metalness across parts
  const armorMat = new THREE.MeshStandardMaterial({
    color: team === 'blue' ? 0x162442 : 0x3b1526,
    roughness: 0.34,
    metalness: 0.78,
  });
  const underSuitMat = new THREE.MeshStandardMaterial({
    color: 0x0b101d,
    roughness: 0.82,
    metalness: 0.18,
  });
  const pauldronMat = new THREE.MeshStandardMaterial({
    color: 0x263554,
    roughness: 0.24,
    metalness: 0.88,
  });
  const visorMat = new THREE.MeshStandardMaterial({
    color: teamColor,
    emissive: teamColor,
    emissiveIntensity: 1.65,
    roughness: 0.15,
    metalness: 0.2,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: trimColor,
    emissive: trimColor,
    emissiveIntensity: 0.85,
    roughness: 0.28,
    metalness: 0.65,
  });

  const bodyGroup = new THREE.Group();
  bodyGroup.position.y = 0.92;
  root.add(bodyGroup);

  // 1. Beveled ExtrudeGeometry Chest Chassis (Primary silhouette)
  const chestShape = new THREE.Shape();
  chestShape.moveTo(-0.34, -0.32);
  chestShape.lineTo(0.34, -0.32);
  chestShape.lineTo(0.42, 0.22);
  chestShape.lineTo(0.24, 0.4);
  chestShape.lineTo(-0.24, 0.4);
  chestShape.lineTo(-0.42, 0.22);
  chestShape.closePath();

  const chestGeo = new THREE.ExtrudeGeometry(chestShape, {
    depth: 0.38,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.04,
    bevelSegments: 2,
  });
  chestGeo.center();
  const torsoMesh = new THREE.Mesh(chestGeo, armorMat);
  torsoMesh.position.y = 0.28;
  torsoMesh.castShadow = true;
  torsoMesh.receiveShadow = true;
  bodyGroup.add(torsoMesh);

  // Core chest reactor emblem
  const coreDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.06, 16), visorMat);
  coreDisc.rotation.x = Math.PI / 2;
  coreDisc.position.set(0, 0.32, 0.24);
  bodyGroup.add(coreDisc);

  // 2. Pelvis / Waist collar
  const pelvis = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.22, 0.22, 12), underSuitMat);
  pelvis.position.y = -0.1;
  pelvis.castShadow = true;
  bodyGroup.add(pelvis);

  // 3. Twin Shoulder Pauldrons
  const pauldronGeo = new THREE.BoxGeometry(0.28, 0.22, 0.34);
  const leftPauldron = new THREE.Mesh(pauldronGeo, pauldronMat);
  leftPauldron.position.set(-0.52, 0.52, 0);
  leftPauldron.rotation.z = 0.22;
  leftPauldron.castShadow = true;
  bodyGroup.add(leftPauldron);

  const rightPauldron = new THREE.Mesh(pauldronGeo, pauldronMat);
  rightPauldron.position.set(0.52, 0.52, 0);
  rightPauldron.rotation.z = -0.22;
  rightPauldron.castShadow = true;
  bodyGroup.add(rightPauldron);

  // 4. Helmet & Curved Visor
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.82, 0);
  bodyGroup.add(headGroup);

  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.23, 18, 16), armorMat);
  helmet.scale.set(0.95, 1.05, 1.08);
  helmet.castShadow = true;
  headGroup.add(helmet);

  const visor = new THREE.Mesh(
    new THREE.CylinderGeometry(0.21, 0.2, 0.12, 16, 1, false, -Math.PI * 0.35, Math.PI * 0.7),
    visorMat,
  );
  visor.position.set(0, 0.02, 0.05);
  headGroup.add(visor);

  const crest = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.32), accentMat);
  crest.position.set(0, 0.22, -0.02);
  headGroup.add(crest);

  // 5. Articulated Legs (Left & Right)
  const buildLeg = (side: -1 | 1): THREE.Group => {
    const legGroup = new THREE.Group();
    legGroup.position.set(side * 0.2, 0.78, 0);
    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.4, 10), underSuitMat);
    thigh.position.y = -0.2;
    thigh.castShadow = true;
    legGroup.add(thigh);

    const shin = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.42, 0.24), armorMat);
    shin.position.y = -0.56;
    shin.castShadow = true;
    legGroup.add(shin);

    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 0.34), pauldronMat);
    boot.position.set(0, -0.74, 0.05);
    boot.castShadow = true;
    legGroup.add(boot);
    return legGroup;
  };
  const leftLeg = buildLeg(-1);
  const rightLeg = buildLeg(1);
  root.add(leftLeg);
  root.add(rightLeg);

  // 6. Articulated Arms + Right Energy-Tag Emitter Gauntlet
  const buildArm = (side: -1 | 1): THREE.Group => {
    const armGroup = new THREE.Group();
    armGroup.position.set(side * 0.5, 0.44, 0);
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.34, 10), underSuitMat);
    upper.position.y = -0.16;
    upper.castShadow = true;
    armGroup.add(upper);

    const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.34, 0.2), armorMat);
    forearm.position.y = -0.44;
    forearm.castShadow = true;
    armGroup.add(forearm);

    if (side === 1) {
      // Energy-tag pulse emitter barrel
      const emitter = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.38, 12), pauldronMat);
      emitter.rotation.x = Math.PI / 2;
      emitter.position.set(0, -0.52, 0.22);
      armGroup.add(emitter);

      const muzzle = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.02, 8, 16), visorMat);
      muzzle.position.set(0, -0.52, 0.42);
      armGroup.add(muzzle);
    }
    return armGroup;
  };
  const leftArm = buildArm(-1);
  const rightArm = buildArm(1);
  bodyGroup.add(leftArm);
  bodyGroup.add(rightArm);

  // 7. Back Thruster Pack + Dual Jet Nozzles
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.46, 0.22), pauldronMat);
  pack.position.set(0, 0.34, -0.3);
  pack.castShadow = true;
  bodyGroup.add(pack);

  const flameMat = new THREE.MeshBasicMaterial({
    color: teamColor,
    transparent: true,
    opacity: 0.85,
  });
  const flameGeo = new THREE.ConeGeometry(0.08, 0.38, 10);
  flameGeo.rotateX(Math.PI);

  const thrusterFlameL = new THREE.Mesh(flameGeo, flameMat);
  thrusterFlameL.position.set(-0.13, 0.04, -0.34);
  bodyGroup.add(thrusterFlameL);

  const thrusterFlameR = new THREE.Mesh(flameGeo, flameMat);
  thrusterFlameR.position.set(0.13, 0.04, -0.34);
  bodyGroup.add(thrusterFlameR);

  // 8. Ground team ring
  const shieldRing = new THREE.Mesh(
    new THREE.RingGeometry(0.68, 0.78, 28),
    new THREE.MeshBasicMaterial({
      color: teamColor,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.6,
    }),
  );
  shieldRing.rotation.x = -Math.PI / 2;
  shieldRing.position.y = 0.03;
  root.add(shieldRing);

  return {
    root,
    bodyGroup,
    leftLeg,
    rightLeg,
    leftArm,
    rightArm,
    headGroup,
    thrusterFlameL,
    thrusterFlameR,
    visorMat,
    armorMat,
    shieldRing,
  };
}

export function animateRunnerRig(
  rig: RunnerRig,
  speed: number,
  sprinting: boolean,
  airborne: boolean,
  eliminated: boolean,
  time: number,
  dt: number,
): void {
  rig.root.visible = !eliminated;
  if (eliminated) return;

  const rate = sprinting ? 14 : 9.5;
  const strideAmp = airborne ? 0.25 : Math.min(0.85, speed * 0.1);
  const phase = time * rate;

  const targetL = strideAmp * Math.sin(phase);
  const targetR = -targetL;
  const k = 1 - Math.exp(-16 * dt);

  rig.leftLeg.rotation.x = THREE.MathUtils.lerp(rig.leftLeg.rotation.x, targetL, k);
  rig.rightLeg.rotation.x = THREE.MathUtils.lerp(rig.rightLeg.rotation.x, targetR, k);
  rig.leftArm.rotation.x = THREE.MathUtils.lerp(rig.leftArm.rotation.x, -targetL * 0.7, k);
  // Right arm holds emitter forward slightly
  rig.rightArm.rotation.x = THREE.MathUtils.lerp(rig.rightArm.rotation.x, -0.75 + targetR * 0.25, k);

  const bob = airborne ? 0.08 : Math.abs(Math.sin(phase)) * strideAmp * 0.08;
  rig.bodyGroup.position.y = THREE.MathUtils.lerp(rig.bodyGroup.position.y, 0.92 + bob, k);
  rig.bodyGroup.rotation.x = THREE.MathUtils.lerp(
    rig.bodyGroup.rotation.x,
    sprinting ? 0.16 : speed > 0.5 ? 0.06 : 0,
    k,
  );

  const flameScale = sprinting || airborne ? 1.15 + Math.sin(time * 35) * 0.2 : 0.25;
  rig.thrusterFlameL.scale.set(1, flameScale, 1);
  rig.thrusterFlameR.scale.set(1, flameScale, 1);
}
