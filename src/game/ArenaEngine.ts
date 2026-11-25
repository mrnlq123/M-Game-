import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildArenaEnvironment, type BuiltArena } from './arenas';
import { soundSynth } from './audio';
import { animateRunnerRig, createRunnerRig, type RunnerRig } from './characterMesh';
import { createContactShadowTexture } from './textures';
import {
  ARENA_MAPS,
  GAME_MODES,
  type GameModeId,
  type GraphicsQuality,
  type MapId,
  type MatchSnapshot,
  type PlayerInputState,
  type PlayerSnapshot,
  type TeamId,
} from './types';

// Pre-allocated scratch math objects (Zero GC inside render loop)
const _camTarget = new THREE.Vector3();
const _camGoal = new THREE.Vector3();
const _lookAt = new THREE.Vector3();
const _colorTmp = new THREE.Color();

interface ParticleBurstItem {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  life: number;
}

interface PracticeEntity extends PlayerSnapshot {
  vy: number;
  grounded: boolean;
  lastFireAt: number;
}

interface PracticeProjectile {
  id: string;
  ownerId: string;
  team: TeamId;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
}

function resolveCircleVsBox(
  px: number,
  pz: number,
  radius: number,
  box: { x: number; z: number; w: number; d: number },
): { x: number; z: number } {
  const halfW = box.w * 0.5;
  const halfD = box.d * 0.5;
  const closestX = Math.max(box.x - halfW, Math.min(px, box.x + halfW));
  const closestZ = Math.max(box.z - halfD, Math.min(pz, box.z + halfD));
  const dx = px - closestX;
  const dz = pz - closestZ;
  const distSq = dx * dx + dz * dz;
  if (distSq >= radius * radius || distSq === 0) return { x: px, z: pz };
  const dist = Math.sqrt(distSq);
  const overlap = radius - dist;
  return {
    x: px + (dx / dist) * overlap,
    z: pz + (dz / dist) * overlap,
  };
}

export interface EngineCallbacks {
  onSnapshot: (snapshot: MatchSnapshot) => void;
  onPracticeEnded: (snapshot: MatchSnapshot) => void;
  onInputSend?: (input: PlayerInputState) => void;
  onContextLost?: () => void;
}

export class ArenaEngine {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private isSoftwareGl: boolean;
  private shadowTex: THREE.CanvasTexture;
  private builtArena: BuiltArena | null = null;
  private currentMapId: MapId = 'neon_city';
  private quality: GraphicsQuality = 'high';

  private runnerRigs = new Map<string, RunnerRig>();
  private projectileMeshes = new Map<string, THREE.Mesh>();
  private projectileGeo: THREE.SphereGeometry;
  private blueProjMat: THREE.MeshBasicMaterial;
  private redProjMat: THREE.MeshBasicMaterial;
  private particlePool: ParticleBurstItem[] = [];
  private particleGeo: THREE.BoxGeometry;

  private frameId = 0;
  private disposed = false;
  private lastTime = performance.now();
  private elapsed = 0;
  private inputSendAccum = 0;
  private seqCounter = 0;

  // Mode state
  private sceneMode: 'diorama' | 'practice' | 'online' = 'diorama';
  private paused = false;
  private localPlayerId = 'local_player';
  private localName = 'Runner';
  private localCountry = 'US';
  private localAvatarColor = '#06B6D4';
  private spectateIndex = 0;

  // Input state
  private keys = new Set<string>();
  private joystickMove = { x: 0, z: 0 };
  private touchActions = { jump: false, sprint: false, fire: false, interact: false };
  private yaw = Math.PI / 2;
  private pitch = -0.18;
  private cameraShake = 0;
  private sensitivity = 1;
  private invertY = false;

  // Online snapshot buffer
  private latestOnlineSnapshot: MatchSnapshot | null = null;
  private prevHitCount = 0;

  // Local practice simulation state
  private practiceMatch: {
    matchId: string;
    mapId: MapId;
    timeRemaining: number;
    blueScore: number;
    redScore: number;
    ownerTeam: TeamId | 'neutral';
    capturingTeam: TeamId | 'contested' | 'none';
    progress: number;
    holdAccum: number;
    players: Map<string, PracticeEntity>;
    projectiles: PracticeProjectile[];
    status: 'active' | 'ended';
    winnerTeam?: TeamId | 'draw';
    lastEvent?: string;
    snapshotEmitAccum: number;
  } | null = null;

  private callbacks: EngineCallbacks;
  private resizeObserver: ResizeObserver;

  constructor(container: HTMLElement, callbacks: EngineCallbacks) {
    this.container = container;
    this.callbacks = callbacks;

    this.isSoftwareGl = (() => {
      const probe = document.createElement('canvas');
      const gl = probe.getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);

    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    this.renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.callbacks.onContextLost?.();
    });

    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(65, w / h, 0.1, 320);

    this.shadowTex = createContactShadowTexture();
    this.projectileGeo = new THREE.SphereGeometry(0.24, 12, 12);
    this.blueProjMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee });
    this.redProjMat = new THREE.MeshBasicMaterial({ color: 0xfb7185 });
    this.particleGeo = new THREE.BoxGeometry(0.16, 0.16, 0.16);

    this.loadArena('neon_city');
    this.spawnDioramaRunner();

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.bindEvents();
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);

    this.lastTime = performance.now();
    this.scheduleNextTick();
  }

  private bindEvents(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onWindowBlur);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    this.keys.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private onWindowBlur = (): void => {
    this.keys.clear();
    this.touchActions.fire = false;
    this.touchActions.jump = false;
    this.touchActions.sprint = false;
  };

  public handleResize(): void {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    if (w <= 0 || h <= 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  public setQuality(quality: GraphicsQuality): void {
    this.quality = quality;
    if (this.isSoftwareGl) {
      this.renderer.setPixelRatio(1);
      this.renderer.shadowMap.enabled = false;
    } else {
      const cap = quality === 'low' ? 1 : quality === 'medium' ? 1.5 : 2;
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, cap));
      this.renderer.shadowMap.enabled = quality !== 'low';
    }
    this.loadArena(this.currentMapId);
  }

  public setControlPreferences(sensitivity: number, invertY: boolean): void {
    this.sensitivity = sensitivity;
    this.invertY = invertY;
  }

  public loadArena(mapId: MapId): void {
    this.currentMapId = mapId;
    if (this.builtArena) {
      this.scene.remove(this.builtArena.group);
      this.builtArena.disposables.forEach((d) => d.dispose());
      this.builtArena = null;
    }
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    const shadows = !this.isSoftwareGl && this.quality !== 'low';
    this.builtArena = buildArenaEnvironment(this.scene, mapId, maxAniso, shadows);
  }

  private clearEntities(): void {
    for (const rig of this.runnerRigs.values()) {
      this.scene.remove(rig.root);
    }
    this.runnerRigs.clear();
    for (const mesh of this.projectileMeshes.values()) {
      this.scene.remove(mesh);
    }
    this.projectileMeshes.clear();
  }

  private spawnDioramaRunner(): void {
    this.clearEntities();
    this.sceneMode = 'diorama';
    const rig = createRunnerRig('blue', this.localAvatarColor, this.shadowTex);
    rig.root.position.set(0, 0, 5);
    this.scene.add(rig.root);
    this.runnerRigs.set('diorama_hero', rig);
  }

  public startDiorama(mapId: MapId, avatarColor: string): void {
    this.localAvatarColor = avatarColor;
    if (this.currentMapId !== mapId) this.loadArena(mapId);
    this.spawnDioramaRunner();
  }

  public startPracticeMatch(opts: {
    mapId: MapId;
    playerName: string;
    country: string;
    avatarColor: string;
  }): void {
    this.clearEntities();
    this.loadArena(opts.mapId);
    this.sceneMode = 'practice';
    this.paused = false;
    this.localPlayerId = 'local_player';
    this.localName = opts.playerName || 'Runner';
    this.localCountry = opts.country || 'US';
    this.localAvatarColor = opts.avatarColor || '#06B6D4';
    this.yaw = Math.PI / 2;
    this.pitch = -0.15;

    const spec = ARENA_MAPS[opts.mapId];
    const players = new Map<string, PracticeEntity>();

    const makeEntity = (
      id: string,
      username: string,
      team: TeamId,
      isBot: boolean,
      spawnIdx: number,
      avatarColor: string,
    ): PracticeEntity => {
      const sp = (team === 'blue' ? spec.blueSpawns : spec.redSpawns)[spawnIdx];
      return {
        id,
        uid: id,
        username,
        country: isBot ? 'AI' : this.localCountry,
        team,
        isBot,
        x: sp.x,
        y: sp.y,
        z: sp.z,
        vx: 0,
        vz: 0,
        yaw: team === 'blue' ? Math.PI / 2 : -Math.PI / 2,
        energy: 100,
        maxEnergy: 100,
        sprinting: false,
        eliminated: false,
        respawnTimer: 0,
        tags: 0,
        taggedCount: 0,
        captures: 0,
        score: 0,
        avatarColor,
        vy: 0,
        grounded: true,
        lastFireAt: 0,
      };
    };

    players.set(
      'local_player',
      makeEntity('local_player', this.localName, 'blue', false, 0, this.localAvatarColor),
    );
    players.set('ally_ai_1', makeEntity('ally_ai_1', 'Vanguard-AI', 'blue', true, 1, '#38BDF8'));
    players.set('enemy_ai_1', makeEntity('enemy_ai_1', 'Spectre-AI', 'red', true, 0, '#F43F5E'));
    players.set('enemy_ai_2', makeEntity('enemy_ai_2', 'Pulse-AI', 'red', true, 1, '#FB7185'));

    this.practiceMatch = {
      matchId: `practice_${Date.now()}`,
      mapId: opts.mapId,
      timeRemaining: GAME_MODES.practice.durationSec,
      blueScore: 0,
      redScore: 0,
      ownerTeam: 'neutral',
      capturingTeam: 'none',
      progress: 0,
      holdAccum: 0,
      players,
      projectiles: [],
      status: 'active',
      snapshotEmitAccum: 0,
    };

    for (const p of players.values()) {
      const rig = createRunnerRig(p.team, p.avatarColor, this.shadowTex);
      rig.root.position.set(p.x, p.y, p.z);
      this.scene.add(rig.root);
      this.runnerRigs.set(p.id, rig);
    }
  }

  public startOnlineMatch(localClientId: string, snapshot: MatchSnapshot): void {
    this.clearEntities();
    this.loadArena(snapshot.mapId);
    this.sceneMode = 'online';
    this.paused = false;
    this.localPlayerId = localClientId;
    this.latestOnlineSnapshot = snapshot;
    this.prevHitCount = 0;

    const me = snapshot.players.find((p) => p.id === localClientId);
    this.yaw = me ? me.yaw : Math.PI / 2;
    this.pitch = -0.15;
    this.syncOnlineMeshes(snapshot);
  }

  public receiveOnlineSnapshot(snapshot: MatchSnapshot): void {
    this.latestOnlineSnapshot = snapshot;
    if (this.sceneMode !== 'online') return;
    const me = snapshot.players.find((p) => p.id === this.localPlayerId);
    if (me && me.tags > this.prevHitCount) {
      this.prevHitCount = me.tags;
      soundSynth.playHitConfirm();
    }
  }

  public setPaused(paused: boolean): void {
    this.paused = paused;
  }

  public setJoystickMove(x: number, z: number): void {
    this.joystickMove.x = Math.max(-1, Math.min(1, x));
    this.joystickMove.z = Math.max(-1, Math.min(1, z));
  }

  public setTouchAction(action: 'jump' | 'sprint' | 'fire' | 'interact', active: boolean): void {
    this.touchActions[action] = active;
  }

  public rotateCamera(dx: number, dy: number): void {
    const sens = 0.0042 * this.sensitivity;
    this.yaw -= dx * sens;
    const ySign = this.invertY ? -1 : 1;
    this.pitch = Math.max(-0.55, Math.min(0.42, this.pitch - dy * sens * ySign));
  }

  public cycleSpectatorTarget(): void {
    this.spectateIndex += 1;
  }

  private getCombinedInput(): PlayerInputState {
    let moveX = this.joystickMove.x;
    let moveZ = this.joystickMove.z;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) moveX -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) moveX += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) moveZ += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) moveZ -= 1;

    const len = Math.hypot(moveX, moveZ);
    if (len > 1) {
      moveX /= len;
      moveZ /= len;
    }

    return {
      moveX,
      moveZ,
      yaw: this.yaw,
      pitch: this.pitch,
      jump: this.keys.has('Space') || this.touchActions.jump,
      sprint: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.touchActions.sprint,
      fire: this.keys.has('KeyF') || this.touchActions.fire,
      interact: this.keys.has('KeyE') || this.touchActions.interact,
      seq: ++this.seqCounter,
    };
  }

  private spawnImpactBurst(x: number, y: number, z: number, colorHex: number): void {
    for (let i = 0; i < 6; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.9 });
      const mesh = new THREE.Mesh(this.particleGeo, mat);
      mesh.position.set(x, y, z);
      this.scene.add(mesh);
      this.particlePool.push({
        mesh,
        vx: (Math.random() - 0.5) * 9,
        vy: Math.random() * 6 + 1,
        vz: (Math.random() - 0.5) * 9,
        life: 0.38,
      });
    }
  }

  private updateParticles(dt: number): void {
    const alive: ParticleBurstItem[] = [];
    for (const p of this.particlePool) {
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        (p.mesh.material as THREE.Material).dispose();
        continue;
      }
      p.vy -= 18 * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      p.mesh.scale.setScalar(p.life * 2.4);
      alive.push(p);
    }
    this.particlePool = alive;
  }

  private stepPracticeSimulation(dt: number, now: number): void {
    const m = this.practiceMatch;
    if (!m || m.status !== 'active' || this.paused) return;

    const spec = ARENA_MAPS[m.mapId];
    m.timeRemaining = Math.max(0, m.timeRemaining - dt);
    const localInput = this.getCombinedInput();

    let blueInZone = 0;
    let redInZone = 0;

    for (const p of m.players.values()) {
      if (p.eliminated) {
        p.respawnTimer -= dt;
        if (p.respawnTimer <= 0) {
          const spList = p.team === 'blue' ? spec.blueSpawns : spec.redSpawns;
          const sp = spList[Math.floor(Math.random() * spList.length)];
          p.x = sp.x;
          p.y = sp.y;
          p.z = sp.z;
          p.vy = 0;
          p.energy = 100;
          p.eliminated = false;
          p.respawnTimer = 0;
        }
        continue;
      }

      let moveX = 0;
      let moveZ = 0;
      let jump = false;
      let sprint = false;
      let fire = false;
      let aimPitch = 0;

      if (!p.isBot) {
        moveX = localInput.moveX;
        moveZ = localInput.moveZ;
        p.yaw = localInput.yaw;
        aimPitch = localInput.pitch;
        jump = localInput.jump;
        sprint = localInput.sprint;
        fire = localInput.fire;
      } else {
        // AI Runner logic
        let nearest: PracticeEntity | null = null;
        let bestDist = Infinity;
        for (const other of m.players.values()) {
          if (other.team !== p.team && !other.eliminated) {
            const d = Math.hypot(other.x - p.x, other.z - p.z);
            if (d < bestDist) {
              bestDist = d;
              nearest = other;
            }
          }
        }
        const tx = nearest && bestDist < 22 ? nearest.x : spec.objective.x;
        const tz = nearest && bestDist < 22 ? nearest.z : spec.objective.z;
        const dx = tx - p.x;
        const dz = tz - p.z;
        const dist = Math.hypot(dx, dz) || 1;
        p.yaw = Math.atan2(dx, dz);
        moveZ = dist > 6 ? 0.85 : 0.1;
        moveX = nearest && bestDist < 15 ? Math.sin(this.elapsed * 2 + p.x) * 0.6 : 0;
        sprint = dist > 14;
        fire = Boolean(nearest && bestDist < 23);
        jump = Math.sin(this.elapsed * 1.9 + p.z) > 0.97;
      }

      const len = Math.hypot(moveX, moveZ);
      p.sprinting = sprint && len > 0.1;
      const speed = p.sprinting ? 12.2 : 8.2;
      const sinY = Math.sin(p.yaw);
      const cosY = Math.cos(p.yaw);
      p.vx = (sinY * moveZ - cosY * moveX) * speed;
      p.vz = (cosY * moveZ + sinY * moveX) * speed;
      p.x += p.vx * dt;
      p.z += p.vz * dt;

      if (jump && p.grounded) {
        p.vy = 9.4;
        p.grounded = false;
        if (!p.isBot) soundSynth.playJump();
      }
      p.vy -= 24 * dt;
      p.y += p.vy * dt;
      if (p.y <= 0) {
        p.y = 0;
        p.vy = 0;
        p.grounded = true;
      }

      const limit = spec.arenaHalfSize - 1.0;
      p.x = Math.max(-limit, Math.min(limit, p.x));
      p.z = Math.max(-limit, Math.min(limit, p.z));
      for (const obs of spec.obstacles) {
        if (p.y < obs.h) {
          const res = resolveCircleVsBox(p.x, p.z, 0.75, obs);
          p.x = res.x;
          p.z = res.z;
        }
      }

      if (fire && now - p.lastFireAt >= 280) {
        p.lastFireAt = now;
        if (!p.isBot) soundSynth.playTagPulse();
        const dirX = Math.sin(p.yaw) * Math.cos(aimPitch);
        const dirY = Math.sin(aimPitch);
        const dirZ = Math.cos(p.yaw) * Math.cos(aimPitch);
        m.projectiles.push({
          id: `lp_${now}_${Math.random().toString(36).slice(2, 6)}`,
          ownerId: p.id,
          team: p.team,
          x: p.x + dirX * 1.1,
          y: p.y + 1.35 + dirY * 0.5,
          z: p.z + dirZ * 1.1,
          vx: dirX * 36,
          vy: dirY * 36,
          vz: dirZ * 36,
          life: 1.4,
        });
      }

      if (Math.hypot(p.x - spec.objective.x, p.z - spec.objective.z) <= spec.objective.radius) {
        if (p.team === 'blue') blueInZone += 1;
        else redInZone += 1;
      }
    }

    if (blueInZone > 0 && redInZone > 0) {
      m.capturingTeam = 'contested';
    } else if (blueInZone > 0 && m.ownerTeam !== 'blue') {
      m.capturingTeam = 'blue';
      m.progress = Math.min(100, m.progress + (18 + blueInZone * 8) * dt);
      if (m.progress >= 100) {
        m.ownerTeam = 'blue';
        m.blueScore += 150;
        m.lastEvent = `Blue Team captured ${spec.objective.name}!`;
        soundSynth.playCaptureChime();
        for (const p of m.players.values()) {
          if (p.team === 'blue' && Math.hypot(p.x, p.z) <= spec.objective.radius + 1) {
            p.captures += 1;
            p.score += 150;
          }
        }
      }
    } else if (redInZone > 0 && m.ownerTeam !== 'red') {
      m.capturingTeam = 'red';
      m.progress = Math.min(100, m.progress + (18 + redInZone * 8) * dt);
      if (m.progress >= 100) {
        m.ownerTeam = 'red';
        m.redScore += 150;
        m.lastEvent = `Red Team captured ${spec.objective.name}!`;
        soundSynth.playCaptureChime();
      }
    } else {
      m.capturingTeam = 'none';
      if (m.ownerTeam === 'neutral' && m.progress > 0) {
        m.progress = Math.max(0, m.progress - 10 * dt);
      }
    }

    m.holdAccum += dt;
    if (m.holdAccum >= 1) {
      m.holdAccum -= 1;
      if (m.ownerTeam === 'blue') m.blueScore += 12;
      else if (m.ownerTeam === 'red') m.redScore += 12;
    }

    const alivePr: PracticeProjectile[] = [];
    for (const pr of m.projectiles) {
      pr.life -= dt;
      if (pr.life <= 0) continue;
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      pr.z += pr.vz * dt;

      if (Math.abs(pr.x) > spec.arenaHalfSize || Math.abs(pr.z) > spec.arenaHalfSize || pr.y < 0 || pr.y > 18) {
        continue;
      }

      let blocked = false;
      for (const obs of spec.obstacles) {
        if (pr.y <= obs.h && Math.abs(pr.x - obs.x) <= obs.w * 0.5 && Math.abs(pr.z - obs.z) <= obs.d * 0.5) {
          blocked = true;
          this.spawnImpactBurst(pr.x, pr.y, pr.z, pr.team === 'blue' ? 0x22d3ee : 0xfb7185);
          break;
        }
      }
      if (blocked) continue;

      let hit = false;
      for (const target of m.players.values()) {
        if (target.team === pr.team || target.eliminated) continue;
        const dx = pr.x - target.x;
        const dy = pr.y - (target.y + 1.15);
        const dz = pr.z - target.z;
        if (dx * dx + dy * dy + dz * dz <= 0.95 * 0.95) {
          hit = true;
          target.energy = Math.max(0, target.energy - 25);
          this.spawnImpactBurst(pr.x, pr.y, pr.z, pr.team === 'blue' ? 0x22d3ee : 0xfb7185);
          if (pr.ownerId === this.localPlayerId) {
            soundSynth.playHitConfirm();
          }
          if (target.id === this.localPlayerId) {
            this.cameraShake = 0.28;
          }
          if (target.energy <= 0) {
            target.eliminated = true;
            target.respawnTimer = 3.5;
            target.taggedCount += 1;
            const shooter = m.players.get(pr.ownerId);
            if (shooter) {
              shooter.tags += 1;
              shooter.score += 100;
              m.lastEvent = `${shooter.username} tagged ${target.username}`;
            }
            if (pr.team === 'blue') m.blueScore += 100;
            else m.redScore += 100;
          }
          break;
        }
      }
      if (!hit) alivePr.push(pr);
    }
    m.projectiles = alivePr;

    // Sync Three.js rigs & projectiles
    for (const p of m.players.values()) {
      const rig = this.runnerRigs.get(p.id);
      if (rig) {
        rig.root.position.set(p.x, p.y, p.z);
        rig.root.rotation.y = p.yaw;
        animateRunnerRig(rig, Math.hypot(p.vx, p.vz), p.sprinting, p.y > 0.08, p.eliminated, this.elapsed, dt);
      }
    }
    this.syncProjectiles(m.projectiles);

    // Emit snapshot at 15Hz for crisp HUD
    m.snapshotEmitAccum += dt;
    if (m.timeRemaining <= 0) {
      m.status = 'ended';
      m.winnerTeam = m.blueScore > m.redScore ? 'blue' : m.redScore > m.blueScore ? 'red' : 'draw';
      const finalSnap = this.buildPracticeSnapshot();
      soundSynth.playMatchEnd(m.winnerTeam === 'blue');
      this.callbacks.onPracticeEnded(finalSnap);
    } else if (m.snapshotEmitAccum >= 0.066) {
      m.snapshotEmitAccum = 0;
      this.callbacks.onSnapshot(this.buildPracticeSnapshot());
    }
  }

  private buildPracticeSnapshot(): MatchSnapshot {
    const m = this.practiceMatch!;
    const spec = ARENA_MAPS[m.mapId];
    return {
      matchId: m.matchId,
      mode: 'practice',
      mapId: m.mapId,
      timeRemaining: Math.max(0, Math.ceil(m.timeRemaining)),
      blueScore: m.blueScore,
      redScore: m.redScore,
      objective: {
        id: spec.objective.id,
        name: spec.objective.name,
        ownerTeam: m.ownerTeam,
        capturingTeam: m.capturingTeam,
        progress: m.progress,
      },
      players: Array.from(m.players.values()),
      projectiles: m.projectiles,
      status: m.status,
      winnerTeam: m.winnerTeam,
      lastEvent: m.lastEvent,
    };
  }

  private syncOnlineMeshes(snap: MatchSnapshot): void {
    const activeIds = new Set<string>();
    for (const p of snap.players) {
      activeIds.add(p.id);
      let rig = this.runnerRigs.get(p.id);
      if (!rig) {
        rig = createRunnerRig(p.team, p.avatarColor, this.shadowTex);
        this.scene.add(rig.root);
        this.runnerRigs.set(p.id, rig);
      }
    }
    for (const [id, rig] of this.runnerRigs.entries()) {
      if (!activeIds.has(id)) {
        this.scene.remove(rig.root);
        this.runnerRigs.delete(id);
      }
    }
    this.syncProjectiles(snap.projectiles);
  }

  private syncProjectiles(list: Array<{ id: string; team: TeamId; x: number; y: number; z: number }>): void {
    const seen = new Set<string>();
    for (const pr of list) {
      seen.add(pr.id);
      let mesh = this.projectileMeshes.get(pr.id);
      if (!mesh) {
        mesh = new THREE.Mesh(this.projectileGeo, pr.team === 'blue' ? this.blueProjMat : this.redProjMat);
        this.scene.add(mesh);
        this.projectileMeshes.set(pr.id, mesh);
      }
      mesh.position.set(pr.x, pr.y, pr.z);
    }
    for (const [id, mesh] of this.projectileMeshes.entries()) {
      if (!seen.has(id)) {
        this.scene.remove(mesh);
        this.projectileMeshes.delete(id);
      }
    }
  }

  private updateCamera(dt: number): void {
    const camDamp = 1 - Math.exp(-12 * dt);
    if (this.sceneMode === 'diorama') {
      const angle = this.elapsed * 0.24;
      _camGoal.set(Math.sin(angle) * 7.2, 2.7, 5 + Math.cos(angle) * 7.2);
      this.camera.position.lerp(_camGoal, camDamp);
      _lookAt.set(0, 1.3, 4.4);
      this.camera.lookAt(_lookAt);
      return;
    }

    let targetPlayer: { x: number; y: number; z: number; yaw: number; sprinting: boolean; eliminated: boolean } | undefined;
    let allPlayers: PlayerSnapshot[] = [];

    if (this.sceneMode === 'practice' && this.practiceMatch) {
      allPlayers = Array.from(this.practiceMatch.players.values());
      targetPlayer = this.practiceMatch.players.get(this.localPlayerId);
    } else if (this.sceneMode === 'online' && this.latestOnlineSnapshot) {
      allPlayers = this.latestOnlineSnapshot.players;
      targetPlayer = allPlayers.find((p) => p.id === this.localPlayerId);
    }

    // Spectator mode fallback when eliminated
    if (targetPlayer && targetPlayer.eliminated && allPlayers.length > 0) {
      const alive = allPlayers.filter((p) => !p.eliminated);
      if (alive.length > 0) {
        const specTarget = alive[this.spectateIndex % alive.length];
        _camGoal.set(
          specTarget.x - Math.sin(specTarget.yaw) * 7.5,
          specTarget.y + 4.4,
          specTarget.z - Math.cos(specTarget.yaw) * 7.5,
        );
        this.camera.position.lerp(_camGoal, camDamp);
        _lookAt.set(specTarget.x, specTarget.y + 1.4, specTarget.z);
        this.camera.lookAt(_lookAt);
        return;
      }
    }

    if (!targetPlayer) return;

    const targetFov = targetPlayer.sprinting ? 74 : 65;
    if (Math.abs(this.camera.fov - targetFov) > 0.1) {
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, 1 - Math.exp(-8 * dt));
      this.camera.updateProjectionMatrix();
    }

    const distBack = 6.2;
    const heightUp = 2.65 - this.pitch * 2.4;
    const shakeX = this.cameraShake > 0.01 ? (Math.random() - 0.5) * this.cameraShake : 0;
    const shakeY = this.cameraShake > 0.01 ? (Math.random() - 0.5) * this.cameraShake : 0;
    this.cameraShake = Math.max(0, this.cameraShake - dt * 1.6);

    _camTarget.set(targetPlayer.x, targetPlayer.y + 1.55, targetPlayer.z);
    _camGoal.set(
      targetPlayer.x - Math.sin(this.yaw) * distBack + shakeX,
      Math.max(1.0, targetPlayer.y + heightUp + shakeY),
      targetPlayer.z - Math.cos(this.yaw) * distBack,
    );

    this.camera.position.lerp(_camGoal, camDamp);
    _lookAt.set(
      _camTarget.x + Math.sin(this.yaw) * 6,
      _camTarget.y + Math.sin(this.pitch) * 4,
      _camTarget.z + Math.cos(this.yaw) * 6,
    );
    this.camera.lookAt(_lookAt);
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (!gl.fenceSync) {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private scheduleNextTick(): void {
    if (this.disposed) return;
    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  }

  private tick = (): void => {
    if (this.disposed) return;
    const now = performance.now();
    const rawDt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    const dt = Math.min(Math.max(rawDt, 0.001), 0.05);
    this.elapsed += dt;

    // Animate objective crystal
    if (this.builtArena) {
      this.builtArena.objectiveCore.rotation.y += dt * 1.4;
      this.builtArena.objectiveCore.position.y = 2.2 + Math.sin(this.elapsed * 2.4) * 0.25;

      const objState =
        this.sceneMode === 'practice' && this.practiceMatch
          ? this.practiceMatch.ownerTeam
          : this.latestOnlineSnapshot?.objective.ownerTeam || 'neutral';
      const targetHex =
        objState === 'blue' ? '#06B6D4' : objState === 'red' ? '#F43F5E' : ARENA_MAPS[this.currentMapId].accentHex;
      _colorTmp.set(targetHex);
      (this.builtArena.objectiveRing.material as THREE.MeshBasicMaterial).color.copy(_colorTmp);
      (this.builtArena.objectiveCore.material as THREE.MeshStandardMaterial).emissive.copy(_colorTmp);
      this.builtArena.objectiveLight.color.copy(_colorTmp);
    }

    if (this.sceneMode === 'diorama') {
      const hero = this.runnerRigs.get('diorama_hero');
      if (hero) {
        animateRunnerRig(hero, 0, false, false, false, this.elapsed, dt);
      }
    } else if (this.sceneMode === 'practice') {
      this.stepPracticeSimulation(dt, now);
    } else if (this.sceneMode === 'online') {
      if (!this.paused) {
        this.inputSendAccum += dt;
        if (this.inputSendAccum >= 0.05) {
          this.inputSendAccum = 0;
          const inp = this.getCombinedInput();
          if (inp.fire) soundSynth.playTagPulse();
          if (inp.jump) soundSynth.playJump();
          this.callbacks.onInputSend?.(inp);
        }
      }
      if (this.latestOnlineSnapshot) {
        this.syncOnlineMeshes(this.latestOnlineSnapshot);
        const lerpK = 1 - Math.exp(-15 * dt);
        for (const p of this.latestOnlineSnapshot.players) {
          const rig = this.runnerRigs.get(p.id);
          if (rig) {
            rig.root.position.x = THREE.MathUtils.lerp(rig.root.position.x, p.x, lerpK);
            rig.root.position.y = THREE.MathUtils.lerp(rig.root.position.y, p.y, lerpK);
            rig.root.position.z = THREE.MathUtils.lerp(rig.root.position.z, p.z, lerpK);
            rig.root.rotation.y = p.yaw;
            animateRunnerRig(
              rig,
              Math.hypot(p.vx, p.vz),
              p.sprinting,
              p.y > 0.08,
              p.eliminated,
              this.elapsed,
              dt,
            );
          }
        }
      }
    }

    this.updateParticles(dt);
    this.updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
    this.scheduleNextTick();
  };

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onWindowBlur);
    this.resizeObserver.disconnect();

    this.clearEntities();
    if (this.builtArena) {
      this.builtArena.disposables.forEach((d) => d.dispose());
    }
    this.shadowTex.dispose();
    this.projectileGeo.dispose();
    this.blueProjMat.dispose();
    this.redProjMat.dispose();
    this.particleGeo.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
