import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { WebSocket, WebSocketServer } from 'ws';
import {
  ARENA_MAPS,
  GAME_MODES,
  type GameModeId,
  type MapId,
  type MatchSnapshot,
  type ObjectiveSnapshot,
  type PlayerInputState,
  type PlayerSnapshot,
  type ProjectileSnapshot,
  type RegionId,
  type RoomMember,
  type RoomState,
  type TeamId,
} from './src/game/types.ts';

const PORT = Number(process.env.PORT || 3000);
const ADMIN_EMAIL = 'mrnlqofficial@gmail.com';
const firebaseConfigPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
const firebaseWebApiKey = fs.existsSync(firebaseConfigPath)
  ? (JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf8')).apiKey as string | undefined)
  : undefined;

const app = express();
app.use(express.json({ limit: '64kb' }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

interface ClientConnection {
  clientId: string;
  ws: WebSocket;
  uid: string;
  username: string;
  country: string;
  avatarColor: string;
  roomId: string | null;
  queueKey: string | null;
  lastPingTs: number;
}

interface ServerPlayerEntity extends PlayerSnapshot {
  clientId: string | null;
  input: PlayerInputState;
  vy: number;
  grounded: boolean;
  lastFireAt: number;
  reconnectToken: string;
  disconnectedAt: number | null;
}

interface ServerProjectile extends ProjectileSnapshot {
  life: number;
}

interface ServerRoom {
  state: RoomState;
  match: {
    matchId: string;
    timeRemaining: number;
    blueScore: number;
    redScore: number;
    objective: ObjectiveSnapshot;
    players: Map<string, ServerPlayerEntity>;
    projectiles: ServerProjectile[];
    status: 'active' | 'ended';
    winnerTeam?: TeamId | 'draw';
    lastEvent?: string;
    holdTickAccum: number;
  } | null;
}

interface QueueTicket {
  clientId: string;
  mode: Exclude<GameModeId, 'practice'>;
  region: RegionId;
  joinedAt: number;
}

const clients = new Map<string, ClientConnection>();
const rooms = new Map<string, ServerRoom>();
const matchmakingQueue = new Map<string, QueueTicket>();
const reconnectIndex = new Map<string, { roomId: string; playerId: string }>();

const serverStats = {
  startedAt: Date.now(),
  totalMatchesStarted: 0,
  totalMatchesCompleted: 0,
  totalTagsValidated: 0,
};

const BANNED_WORDS = ['damn', 'hell', 'idiot', 'stupid', 'noob', 'trash', 'loser', 'cheat'];

function sanitizeChatText(raw: string): string {
  let clean = raw.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 180);
  for (const word of BANNED_WORDS) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    clean = clean.replace(regex, '***');
  }
  return clean;
}

function sendJson(ws: WebSocket, type: string, payload: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, payload }));
  }
}

function broadcastRoom(room: ServerRoom, type: string, payload: unknown, excludeClientId?: string): void {
  for (const member of room.state.members) {
    if (member.isBot || member.id === excludeClientId) continue;
    const client = clients.get(member.id);
    if (client) {
      sendJson(client.ws, type, payload);
    }
  }
}

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += chars[crypto.randomInt(0, chars.length)];
  }
  return out;
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
  if (distSq >= radius * radius || distSq === 0) {
    if (distSq === 0 && Math.abs(px - box.x) < halfW && Math.abs(pz - box.z) < halfD) {
      return { x: px + (px >= box.x ? radius : -radius), z: pz };
    }
    return { x: px, z: pz };
  }
  const dist = Math.sqrt(distSq);
  const overlap = radius - dist;
  return {
    x: px + (dx / dist) * overlap,
    z: pz + (dz / dist) * overlap,
  };
}

function createRoom(
  host: ClientConnection,
  opts: {
    mode: Exclude<GameModeId, 'practice'>;
    mapId: MapId;
    region: RegionId;
    isPrivate: boolean;
  },
): ServerRoom {
  const roomId = `room_${crypto.randomBytes(4).toString('hex')}`;
  const modeSpec = GAME_MODES[opts.mode] ?? GAME_MODES.duo_battle;
  const hostMember: RoomMember = {
    id: host.clientId,
    uid: host.uid,
    username: host.username,
    country: host.country,
    team: 'blue',
    ready: true,
    isHost: true,
    isBot: false,
    avatarColor: host.avatarColor,
  };

  const state: RoomState = {
    roomId,
    roomCode: generateRoomCode(),
    hostId: host.clientId,
    hostUid: host.uid,
    mode: opts.mode,
    mapId: ARENA_MAPS[opts.mapId] ? opts.mapId : 'neon_city',
    region: opts.region || 'global-auto',
    isPrivate: Boolean(opts.isPrivate),
    status: 'waiting',
    maxPlayers: modeSpec.maxPlayers,
    members: [hostMember],
  };

  const room: ServerRoom = { state, match: null };
  rooms.set(roomId, room);
  host.roomId = roomId;
  return room;
}

function leaveCurrentRoom(client: ClientConnection): void {
  if (!client.roomId) return;
  const room = rooms.get(client.roomId);
  client.roomId = null;
  if (!room) return;

  if (room.match && room.match.status === 'active') {
    const entity = room.match.players.get(client.clientId);
    if (entity) {
      entity.disconnectedAt = Date.now();
      entity.clientId = null;
    }
  }

  room.state.members = room.state.members.filter((m) => m.id !== client.clientId);
  const humanMembers = room.state.members.filter((m) => !m.isBot);

  if (humanMembers.length === 0) {
    rooms.delete(room.state.roomId);
    return;
  }

  if (room.state.hostId === client.clientId) {
    const nextHost = humanMembers[0];
    room.state.hostId = nextHost.id;
    room.state.hostUid = nextHost.uid;
    nextHost.isHost = true;
  }

  broadcastRoom(room, 'room:updated', room.state);
}

function startMatchInRoom(room: ServerRoom): void {
  const modeSpec = GAME_MODES[room.state.mode];
  const mapSpec = ARENA_MAPS[room.state.mapId];
  const matchId = `m_${crypto.randomBytes(5).toString('hex')}`;
  const players = new Map<string, ServerPlayerEntity>();

  let blueIdx = 0;
  let redIdx = 0;

  for (const m of room.state.members) {
    const spawnList = m.team === 'blue' ? mapSpec.blueSpawns : mapSpec.redSpawns;
    const idx = m.team === 'blue' ? blueIdx++ : redIdx++;
    const spawn = spawnList[idx % spawnList.length];
    const reconnectToken = crypto.randomBytes(8).toString('hex');

    const entity: ServerPlayerEntity = {
      id: m.id,
      uid: m.uid,
      username: m.username,
      country: m.country,
      team: m.team,
      isBot: m.isBot,
      x: spawn.x,
      y: spawn.y,
      z: spawn.z,
      vx: 0,
      vz: 0,
      yaw: m.team === 'blue' ? Math.PI / 2 : -Math.PI / 2,
      energy: 100,
      maxEnergy: 100,
      sprinting: false,
      eliminated: false,
      respawnTimer: 0,
      tags: 0,
      taggedCount: 0,
      captures: 0,
      score: 0,
      avatarColor: m.avatarColor,
      clientId: m.isBot ? null : m.id,
      vy: 0,
      grounded: true,
      lastFireAt: 0,
      reconnectToken,
      disconnectedAt: null,
      input: {
        moveX: 0,
        moveZ: 0,
        yaw: m.team === 'blue' ? Math.PI / 2 : -Math.PI / 2,
        pitch: 0,
        jump: false,
        sprint: false,
        fire: false,
        interact: false,
        seq: 0,
      },
    };

    players.set(m.id, entity);
    if (!m.isBot) {
      reconnectIndex.set(reconnectToken, { roomId: room.state.roomId, playerId: m.id });
    }
  }

  room.state.status = 'in_progress';
  room.match = {
    matchId,
    timeRemaining: modeSpec.durationSec,
    blueScore: 0,
    redScore: 0,
    objective: {
      id: mapSpec.objective.id,
      name: mapSpec.objective.name,
      ownerTeam: 'neutral',
      capturingTeam: 'none',
      progress: 0,
    },
    players,
    projectiles: [],
    status: 'active',
    holdTickAccum: 0,
  };

  serverStats.totalMatchesStarted += 1;

  for (const m of room.state.members) {
    if (m.isBot) continue;
    const client = clients.get(m.id);
    const entity = players.get(m.id);
    if (client && entity) {
      sendJson(client.ws, 'match:started', {
        roomState: room.state,
        reconnectToken: entity.reconnectToken,
        snapshot: buildSnapshot(room),
      });
    }
  }
}

function buildSnapshot(room: ServerRoom): MatchSnapshot {
  const m = room.match!;
  return {
    matchId: m.matchId,
    mode: room.state.mode,
    mapId: room.state.mapId,
    timeRemaining: Math.max(0, Math.ceil(m.timeRemaining)),
    blueScore: m.blueScore,
    redScore: m.redScore,
    objective: { ...m.objective },
    players: Array.from(m.players.values()).map((p) => ({
      id: p.id,
      uid: p.uid,
      username: p.username,
      country: p.country,
      team: p.team,
      isBot: p.isBot,
      x: Number(p.x.toFixed(3)),
      y: Number(p.y.toFixed(3)),
      z: Number(p.z.toFixed(3)),
      vx: Number(p.vx.toFixed(2)),
      vz: Number(p.vz.toFixed(2)),
      yaw: Number(p.yaw.toFixed(3)),
      energy: p.energy,
      maxEnergy: p.maxEnergy,
      sprinting: p.sprinting,
      eliminated: p.eliminated,
      respawnTimer: Number(p.respawnTimer.toFixed(1)),
      tags: p.tags,
      taggedCount: p.taggedCount,
      captures: p.captures,
      score: p.score,
      avatarColor: p.avatarColor,
    })),
    projectiles: m.projectiles.map((pr) => ({
      id: pr.id,
      ownerId: pr.ownerId,
      team: pr.team,
      x: Number(pr.x.toFixed(2)),
      y: Number(pr.y.toFixed(2)),
      z: Number(pr.z.toFixed(2)),
      vx: pr.vx,
      vy: pr.vy,
      vz: pr.vz,
    })),
    status: m.status,
    winnerTeam: m.winnerTeam,
    lastEvent: m.lastEvent,
  };
}

function updateBotAi(bot: ServerPlayerEntity, room: ServerRoom, now: number): void {
  const match = room.match!;
  const mapSpec = ARENA_MAPS[room.state.mapId];
  let nearestEnemy: ServerPlayerEntity | null = null;
  let nearestDist = Infinity;

  for (const other of match.players.values()) {
    if (other.team !== bot.team && !other.eliminated) {
      const dx = other.x - bot.x;
      const dz = other.z - bot.z;
      const d = Math.hypot(dx, dz);
      if (d < nearestDist) {
        nearestDist = d;
        nearestEnemy = other;
      }
    }
  }

  const targetX = nearestEnemy && nearestDist < 22 ? nearestEnemy.x : mapSpec.objective.x;
  const targetZ = nearestEnemy && nearestDist < 22 ? nearestEnemy.z : mapSpec.objective.z;
  const dx = targetX - bot.x;
  const dz = targetZ - bot.z;
  const dist = Math.hypot(dx, dz) || 1;
  const desiredYaw = Math.atan2(dx, dz);
  bot.input.yaw = desiredYaw;

  const strafeSign = Math.sin(now * 0.002 + bot.x) > 0 ? 1 : -1;
  bot.input.moveZ = dist > 6 ? 0.9 : 0.1;
  bot.input.moveX = nearestEnemy && nearestDist < 16 ? strafeSign * 0.55 : 0;
  bot.input.sprint = dist > 14;
  bot.input.jump = Math.sin(now * 0.003 + bot.z) > 0.96;
  bot.input.fire = Boolean(nearestEnemy && nearestDist < 24);
  bot.input.interact = Math.hypot(bot.x - mapSpec.objective.x, bot.z - mapSpec.objective.z) < mapSpec.objective.radius;
}

function tryMatchmakingPair(): void {
  const byBucket = new Map<string, QueueTicket[]>();
  for (const ticket of matchmakingQueue.values()) {
    const key = `${ticket.mode}:${ticket.region === 'global-auto' ? 'global' : ticket.region}`;
    const list = byBucket.get(key) || [];
    list.push(ticket);
    byBucket.set(key, list);
  }

  for (const list of byBucket.values()) {
    const modeSpec = GAME_MODES[list[0].mode];
    // For global online responsiveness, pair as soon as min 2 real players are ready in Solo VS, or full team size / 2+ players after 8s wait
    const oldestWaitMs = Date.now() - Math.min(...list.map((t) => t.joinedAt));
    const readyThreshold = list[0].mode === 'solo_vs' ? 2 : oldestWaitMs > 8000 ? 2 : modeSpec.maxPlayers;

    if (list.length >= readyThreshold) {
      const batch = list.slice(0, modeSpec.maxPlayers);
      const firstClient = clients.get(batch[0].clientId);
      if (!firstClient) continue;

      const room = createRoom(firstClient, {
        mode: batch[0].mode,
        mapId: (['neon_city', 'sky_island', 'desert_energy', 'ice_crystal'] as MapId[])[
          crypto.randomInt(0, 4)
        ],
        region: batch[0].region,
        isPrivate: false,
      });

      matchmakingQueue.delete(batch[0].clientId);
      firstClient.queueKey = null;

      for (let i = 1; i < batch.length; i++) {
        const c = clients.get(batch[i].clientId);
        if (!c) continue;
        matchmakingQueue.delete(c.clientId);
        c.queueKey = null;
        c.roomId = room.state.roomId;
        room.state.members.push({
          id: c.clientId,
          uid: c.uid,
          username: c.username,
          country: c.country,
          team: i % 2 === 1 ? 'red' : 'blue',
          ready: true,
          isHost: false,
          isBot: false,
          avatarColor: c.avatarColor,
        });
      }

      startMatchInRoom(room);
    }
  }
}

// Authoritative 20Hz simulation tick
const TICK_RATE = 20;
const DT = 1 / TICK_RATE;

setInterval(() => {
  const now = Date.now();

  for (const room of rooms.values()) {
    const match = room.match;
    if (!match || match.status !== 'active') continue;

    const mapSpec = ARENA_MAPS[room.state.mapId];
    match.timeRemaining = Math.max(0, match.timeRemaining - DT);

    let blueInZone = 0;
    let redInZone = 0;

    for (const p of match.players.values()) {
      // Remove stale disconnected human slots after 30s
      if (p.disconnectedAt && now - p.disconnectedAt > 30000) {
        p.eliminated = true;
        continue;
      }

      if (p.eliminated) {
        p.respawnTimer -= DT;
        if (p.respawnTimer <= 0) {
          const spawns = p.team === 'blue' ? mapSpec.blueSpawns : mapSpec.redSpawns;
          const sp = spawns[crypto.randomInt(0, spawns.length)];
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

      if (p.isBot) {
        updateBotAi(p, room, now);
      }

      // Clamp inputs server-side (anti-cheat)
      const moveX = Math.max(-1, Math.min(1, p.input.moveX || 0));
      const moveZ = Math.max(-1, Math.min(1, p.input.moveZ || 0));
      const len = Math.hypot(moveX, moveZ);
      const normX = len > 1 ? moveX / len : moveX;
      const normZ = len > 1 ? moveZ / len : moveZ;

      p.yaw = Number.isFinite(p.input.yaw) ? p.input.yaw : p.yaw;
      p.sprinting = Boolean(p.input.sprint && len > 0.1);
      const speed = p.sprinting ? 12.2 : 8.2;

      const sinY = Math.sin(p.yaw);
      const cosY = Math.cos(p.yaw);
      // Forward = (sinY, cosY), Right = (-cosY, sinY)
      const worldVx = (sinY * normZ - cosY * normX) * speed;
      const worldVz = (cosY * normZ + sinY * normX) * speed;

      p.vx = worldVx;
      p.vz = worldVz;
      p.x += worldVx * DT;
      p.z += worldVz * DT;

      // Jump & gravity
      if (p.input.jump && p.grounded) {
        p.vy = 9.4;
        p.grounded = false;
      }
      p.vy -= 24 * DT;
      p.y += p.vy * DT;
      if (p.y <= 0) {
        p.y = 0;
        p.vy = 0;
        p.grounded = true;
      }

      // Bounds & obstacle collision
      const limit = mapSpec.arenaHalfSize - 1.0;
      p.x = Math.max(-limit, Math.min(limit, p.x));
      p.z = Math.max(-limit, Math.min(limit, p.z));
      for (const obs of mapSpec.obstacles) {
        if (p.y < obs.h) {
          const resolved = resolveCircleVsBox(p.x, p.z, 0.75, obs);
          p.x = resolved.x;
          p.z = resolved.z;
        }
      }

      // Energy-tag fire rate validation (280ms min cooldown)
      if (p.input.fire && now - p.lastFireAt >= 280) {
        p.lastFireAt = now;
        const pitch = Math.max(-0.6, Math.min(0.6, p.input.pitch || 0));
        const dirX = Math.sin(p.yaw) * Math.cos(pitch);
        const dirY = Math.sin(pitch);
        const dirZ = Math.cos(p.yaw) * Math.cos(pitch);

        match.projectiles.push({
          id: `pr_${crypto.randomBytes(3).toString('hex')}`,
          ownerId: p.id,
          team: p.team,
          x: p.x + dirX * 1.1,
          y: p.y + 1.35 + dirY * 0.6,
          z: p.z + dirZ * 1.1,
          vx: dirX * 36,
          vy: dirY * 36,
          vz: dirZ * 36,
          life: 1.4,
        });
      }

      // Objective zone check
      const distObj = Math.hypot(p.x - mapSpec.objective.x, p.z - mapSpec.objective.z);
      if (distObj <= mapSpec.objective.radius) {
        if (p.team === 'blue') blueInZone += 1;
        else redInZone += 1;
      }
    }

    // Objective progress update
    if (blueInZone > 0 && redInZone > 0) {
      match.objective.capturingTeam = 'contested';
    } else if (blueInZone > 0 && match.objective.ownerTeam !== 'blue') {
      match.objective.capturingTeam = 'blue';
      match.objective.progress = Math.min(100, match.objective.progress + (18 + blueInZone * 8) * DT);
      if (match.objective.progress >= 100) {
        match.objective.ownerTeam = 'blue';
        match.blueScore += 150;
        match.lastEvent = `Blue Team captured ${mapSpec.objective.name}!`;
        for (const p of match.players.values()) {
          if (p.team === 'blue' && Math.hypot(p.x, p.z) <= mapSpec.objective.radius + 1) {
            p.captures += 1;
            p.score += 150;
          }
        }
      }
    } else if (redInZone > 0 && match.objective.ownerTeam !== 'red') {
      match.objective.capturingTeam = 'red';
      match.objective.progress = Math.min(100, match.objective.progress + (18 + redInZone * 8) * DT);
      if (match.objective.progress >= 100) {
        match.objective.ownerTeam = 'red';
        match.redScore += 150;
        match.lastEvent = `Red Team captured ${mapSpec.objective.name}!`;
        for (const p of match.players.values()) {
          if (p.team === 'red' && Math.hypot(p.x, p.z) <= mapSpec.objective.radius + 1) {
            p.captures += 1;
            p.score += 150;
          }
        }
      }
    } else {
      match.objective.capturingTeam = 'none';
      if (match.objective.ownerTeam === 'neutral' && match.objective.progress > 0) {
        match.objective.progress = Math.max(0, match.objective.progress - 10 * DT);
      }
    }

    match.holdTickAccum += DT;
    if (match.holdTickAccum >= 1.0) {
      match.holdTickAccum -= 1.0;
      if (match.objective.ownerTeam === 'blue') match.blueScore += 12;
      else if (match.objective.ownerTeam === 'red') match.redScore += 12;
    }

    // Projectile simulation & authoritative hit detection
    const survivingProjectiles: ServerProjectile[] = [];
    for (const pr of match.projectiles) {
      pr.life -= DT;
      if (pr.life <= 0) continue;
      pr.x += pr.vx * DT;
      pr.y += pr.vy * DT;
      pr.z += pr.vz * DT;

      if (
        Math.abs(pr.x) > mapSpec.arenaHalfSize ||
        Math.abs(pr.z) > mapSpec.arenaHalfSize ||
        pr.y < 0 ||
        pr.y > 18
      ) {
        continue;
      }

      let hitObstacle = false;
      for (const obs of mapSpec.obstacles) {
        if (
          pr.y <= obs.h &&
          Math.abs(pr.x - obs.x) <= obs.w * 0.5 &&
          Math.abs(pr.z - obs.z) <= obs.d * 0.5
        ) {
          hitObstacle = true;
          break;
        }
      }
      if (hitObstacle) continue;

      let hitPlayer = false;
      for (const target of match.players.values()) {
        if (target.team === pr.team || target.eliminated) continue;
        const dx = pr.x - target.x;
        const dy = pr.y - (target.y + 1.15);
        const dz = pr.z - target.z;
        if (dx * dx + dy * dy + dz * dz <= 0.95 * 0.95) {
          hitPlayer = true;
          target.energy = Math.max(0, target.energy - 25);
          serverStats.totalTagsValidated += 1;

          if (target.energy <= 0) {
            target.eliminated = true;
            target.respawnTimer = 3.5;
            target.taggedCount += 1;
            const shooter = match.players.get(pr.ownerId);
            if (shooter) {
              shooter.tags += 1;
              shooter.score += 100;
              match.lastEvent = `${shooter.username} tagged ${target.username}`;
            }
            if (pr.team === 'blue') match.blueScore += 100;
            else match.redScore += 100;
          }
          break;
        }
      }

      if (!hitPlayer) {
        survivingProjectiles.push(pr);
      }
    }
    match.projectiles = survivingProjectiles;

    // Match end condition
    if (match.timeRemaining <= 0) {
      match.status = 'ended';
      match.winnerTeam =
        match.blueScore > match.redScore
          ? 'blue'
          : match.redScore > match.blueScore
            ? 'red'
            : 'draw';
      room.state.status = 'waiting';
      serverStats.totalMatchesCompleted += 1;
      broadcastRoom(room, 'match:ended', buildSnapshot(room));
      continue;
    }

    broadcastRoom(room, 'match:snapshot', buildSnapshot(room));
  }
}, 1000 / TICK_RATE);

// WebSocket Connection Handler
wss.on('connection', (ws) => {
  const clientId = `c_${crypto.randomBytes(6).toString('hex')}`;
  const client: ClientConnection = {
    clientId,
    ws,
    uid: `guest_${clientId}`,
    username: 'Runner',
    country: 'US',
    avatarColor: '#06B6D4',
    roomId: null,
    queueKey: null,
    lastPingTs: Date.now(),
  };
  clients.set(clientId, client);

  sendJson(ws, 'session:welcome', { clientId });

  ws.on('message', (raw) => {
    let msg: { type?: string; payload?: Record<string, unknown> };
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    const type = msg.type;
    const payload = msg.payload || {};

    switch (type) {
      case 'auth:identify': {
        client.uid = String(payload.uid || client.uid).slice(0, 128);
        client.username = String(payload.username || 'Runner').slice(0, 24);
        client.country = String(payload.country || 'US').slice(0, 4);
        client.avatarColor = String(payload.avatarColor || '#06B6D4').slice(0, 16);
        sendJson(ws, 'auth:identified', { clientId: client.clientId, uid: client.uid });
        break;
      }

      case 'ping': {
        sendJson(ws, 'pong', { ts: payload.ts || Date.now() });
        break;
      }

      case 'queue:join': {
        const rawMode = String(payload.mode || 'duo_battle') as GameModeId;
        if (!(rawMode in GAME_MODES) || rawMode === 'practice') return;
        const mode = rawMode as Exclude<GameModeId, 'practice'>;
        const region = String(payload.region || 'global-auto') as RegionId;
        leaveCurrentRoom(client);
        matchmakingQueue.set(client.clientId, {
          clientId: client.clientId,
          mode,
          region,
          joinedAt: Date.now(),
        });
        client.queueKey = `${mode}:${region}`;
        sendJson(ws, 'queue:status', {
          inQueue: true,
          mode,
          region,
          queueSize: Array.from(matchmakingQueue.values()).filter((q) => q.mode === mode).length,
        });
        tryMatchmakingPair();
        break;
      }

      case 'queue:leave': {
        matchmakingQueue.delete(client.clientId);
        client.queueKey = null;
        sendJson(ws, 'queue:status', { inQueue: false });
        break;
      }

      case 'room:create': {
        matchmakingQueue.delete(client.clientId);
        leaveCurrentRoom(client);
        const rawMode = String(payload.mode || 'duo_battle') as GameModeId;
        const mode: Exclude<GameModeId, 'practice'> =
          rawMode in GAME_MODES && rawMode !== 'practice'
            ? (rawMode as Exclude<GameModeId, 'practice'>)
            : 'duo_battle';
        const mapId = String(payload.mapId || 'neon_city') as MapId;
        const region = String(payload.region || 'global-auto') as RegionId;
        const isPrivate = Boolean(payload.isPrivate);
        const room = createRoom(client, {
          mode,
          mapId: ARENA_MAPS[mapId] ? mapId : 'neon_city',
          region,
          isPrivate,
        });
        sendJson(ws, 'room:joined', room.state);
        break;
      }

      case 'room:join': {
        const codeOrId = String(payload.codeOrId || '').trim().toUpperCase();
        const targetRoom = Array.from(rooms.values()).find(
          (r) => r.state.roomCode === codeOrId || r.state.roomId.toUpperCase() === codeOrId,
        );
        if (!targetRoom) {
          sendJson(ws, 'room:error', { message: 'Room not found or closed.' });
          return;
        }
        if (targetRoom.state.members.length >= targetRoom.state.maxPlayers) {
          sendJson(ws, 'room:error', { message: 'Room is already full.' });
          return;
        }
        if (targetRoom.state.status === 'in_progress') {
          sendJson(ws, 'room:error', { message: 'Match already in progress in that room.' });
          return;
        }
        matchmakingQueue.delete(client.clientId);
        leaveCurrentRoom(client);

        const blueCount = targetRoom.state.members.filter((m) => m.team === 'blue').length;
        const redCount = targetRoom.state.members.filter((m) => m.team === 'red').length;
        const team: TeamId = blueCount <= redCount ? 'blue' : 'red';

        targetRoom.state.members.push({
          id: client.clientId,
          uid: client.uid,
          username: client.username,
          country: client.country,
          team,
          ready: false,
          isHost: false,
          isBot: false,
          avatarColor: client.avatarColor,
        });
        client.roomId = targetRoom.state.roomId;
        sendJson(ws, 'room:joined', targetRoom.state);
        broadcastRoom(targetRoom, 'room:updated', targetRoom.state, client.clientId);
        break;
      }

      case 'room:leave': {
        leaveCurrentRoom(client);
        sendJson(ws, 'room:left', {});
        break;
      }

      case 'room:toggleReady': {
        if (!client.roomId) return;
        const room = rooms.get(client.roomId);
        if (!room) return;
        const m = room.state.members.find((x) => x.id === client.clientId);
        if (m) {
          m.ready = !m.ready;
          broadcastRoom(room, 'room:updated', room.state);
        }
        break;
      }

      case 'room:switchTeam': {
        if (!client.roomId) return;
        const room = rooms.get(client.roomId);
        if (!room || room.state.status !== 'waiting') return;
        const m = room.state.members.find((x) => x.id === client.clientId);
        if (m) {
          m.team = m.team === 'blue' ? 'red' : 'blue';
          broadcastRoom(room, 'room:updated', room.state);
        }
        break;
      }

      case 'room:updateConfig': {
        if (!client.roomId) return;
        const room = rooms.get(client.roomId);
        if (!room || room.state.hostId !== client.clientId || room.state.status !== 'waiting') return;
        const mapId = String(payload.mapId || room.state.mapId) as MapId;
        const rawMode = String(payload.mode || room.state.mode) as GameModeId;
        if (ARENA_MAPS[mapId]) room.state.mapId = mapId;
        if (rawMode in GAME_MODES && rawMode !== 'practice') {
          const nextMode = rawMode as Exclude<GameModeId, 'practice'>;
          room.state.mode = nextMode;
          room.state.maxPlayers = GAME_MODES[nextMode].maxPlayers;
        }
        broadcastRoom(room, 'room:updated', room.state);
        break;
      }

      case 'room:addBot': {
        // Explicit Practice Bot addition allowed ONLY in private custom rooms (clearly marked isBot: true)
        if (!client.roomId) return;
        const room = rooms.get(client.roomId);
        if (!room || !room.state.isPrivate || room.state.hostId !== client.clientId) return;
        if (room.state.members.length >= room.state.maxPlayers) return;
        const blueCount = room.state.members.filter((m) => m.team === 'blue').length;
        const redCount = room.state.members.filter((m) => m.team === 'red').length;
        const team: TeamId = redCount <= blueCount ? 'red' : 'blue';
        const botId = `bot_${crypto.randomBytes(3).toString('hex')}`;
        room.state.members.push({
          id: botId,
          uid: botId,
          username: `TrainingUnit-${room.state.members.length + 1}`,
          country: 'AI',
          team,
          ready: true,
          isHost: false,
          isBot: true,
          avatarColor: team === 'blue' ? '#06B6D4' : '#F43F5E',
        });
        broadcastRoom(room, 'room:updated', room.state);
        break;
      }

      case 'room:startMatch': {
        if (!client.roomId) return;
        const room = rooms.get(client.roomId);
        if (!room || room.state.hostId !== client.clientId) return;
        if (room.state.members.length < 2) {
          sendJson(ws, 'room:error', { message: 'Need at least 2 participants to launch arena match.' });
          return;
        }
        startMatchInRoom(room);
        break;
      }

      case 'match:input': {
        if (!client.roomId) return;
        const room = rooms.get(client.roomId);
        if (!room || !room.match || room.match.status !== 'active') return;
        const p = room.match.players.get(client.clientId);
        if (!p) return;
        p.input = {
          moveX: Number(payload.moveX || 0),
          moveZ: Number(payload.moveZ || 0),
          yaw: Number(payload.yaw ?? p.yaw),
          pitch: Number(payload.pitch || 0),
          jump: Boolean(payload.jump),
          sprint: Boolean(payload.sprint),
          fire: Boolean(payload.fire),
          interact: Boolean(payload.interact),
          seq: Number(payload.seq || 0),
        };
        break;
      }

      case 'match:reconnect': {
        const token = String(payload.reconnectToken || '');
        const entry = reconnectIndex.get(token);
        if (!entry) {
          sendJson(ws, 'room:error', { message: 'Reconnection window expired.' });
          return;
        }
        const room = rooms.get(entry.roomId);
        if (!room || !room.match || room.match.status !== 'active') return;
        const entity = room.match.players.get(entry.playerId);
        if (!entity) return;

        // Rebind entity to new socket clientId
        room.match.players.delete(entry.playerId);
        entity.id = client.clientId;
        entity.clientId = client.clientId;
        entity.disconnectedAt = null;
        room.match.players.set(client.clientId, entity);
        entry.playerId = client.clientId;
        client.roomId = room.state.roomId;

        room.state.members.push({
          id: client.clientId,
          uid: entity.uid,
          username: entity.username,
          country: entity.country,
          team: entity.team,
          ready: true,
          isHost: room.state.hostUid === entity.uid,
          isBot: false,
          avatarColor: entity.avatarColor,
        });

        sendJson(ws, 'match:started', {
          roomState: room.state,
          reconnectToken: token,
          snapshot: buildSnapshot(room),
        });
        break;
      }

      case 'chat:send': {
        if (!client.roomId) return;
        const room = rooms.get(client.roomId);
        if (!room) return;
        const rawText = String(payload.text || '');
        const cleanText = sanitizeChatText(rawText);
        if (!cleanText) return;
        const member = room.state.members.find((m) => m.id === client.clientId);
        broadcastRoom(room, 'chat:message', {
          id: `msg_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`,
          senderId: client.clientId,
          senderName: client.username,
          team: member?.team || 'blue',
          text: cleanText,
          timestamp: Date.now(),
        });
        break;
      }

      // WebRTC Voice Chat Signaling
      case 'rtc:join': {
        if (!client.roomId) return;
        const room = rooms.get(client.roomId);
        if (!room) return;
        const channel = String(payload.channel || 'room');
        const sender = room.state.members.find((m) => m.id === client.clientId);
        for (const m of room.state.members) {
          if (m.isBot || m.id === client.clientId) continue;
          if (channel === 'team' && sender && m.team !== sender.team) continue;
          const peer = clients.get(m.id);
          if (peer) {
            sendJson(peer.ws, 'rtc:peerJoined', {
              peerId: client.clientId,
              username: client.username,
              team: sender?.team || 'blue',
            });
          }
        }
        break;
      }

      case 'rtc:signal': {
        const targetId = String(payload.targetId || '');
        const target = clients.get(targetId);
        if (!target || !client.roomId || target.roomId !== client.roomId) return;
        sendJson(target.ws, 'rtc:signal', {
          fromId: client.clientId,
          fromName: client.username,
          signal: payload.signal,
        });
        break;
      }

      case 'rtc:speaking': {
        if (!client.roomId) return;
        const room = rooms.get(client.roomId);
        if (!room) return;
        broadcastRoom(
          room,
          'rtc:speaking',
          { peerId: client.clientId, speaking: Boolean(payload.speaking), muted: Boolean(payload.muted) },
          client.clientId,
        );
        break;
      }
    }
  });

  ws.on('close', () => {
    matchmakingQueue.delete(clientId);
    leaveCurrentRoom(client);
    clients.delete(clientId);
  });
});

// REST Endpoints
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'healthy',
    uptimeSec: Math.floor((Date.now() - serverStats.startedAt) / 1000),
    connectedPlayers: clients.size,
    activeRooms: rooms.size,
    activeMatches: Array.from(rooms.values()).filter((r) => r.match?.status === 'active').length,
    queueDepth: matchmakingQueue.size,
    totalMatchesStarted: serverStats.totalMatchesStarted,
    totalMatchesCompleted: serverStats.totalMatchesCompleted,
    totalTagsValidated: serverStats.totalTagsValidated,
    tickRateHz: TICK_RATE,
  });
});

app.get('/api/rooms', (_req, res) => {
  const publicRooms = Array.from(rooms.values())
    .filter((r) => !r.state.isPrivate && r.state.status === 'waiting')
    .map((r) => ({
      roomId: r.state.roomId,
      roomCode: r.state.roomCode,
      mode: r.state.mode,
      mapId: r.state.mapId,
      region: r.state.region,
      playerCount: r.state.members.length,
      maxPlayers: r.state.maxPlayers,
      hostName: r.state.members.find((m) => m.isHost)?.username || 'Host',
    }));
  res.json({ rooms: publicRooms });
});

// Verified Admin server-side action (verifies Firebase ID token via Google Identity Toolkit)
app.post('/api/admin/close-room', async (req, res) => {
  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!idToken || !firebaseWebApiKey) {
    res.status(401).json({ error: 'Missing admin credentials' });
    return;
  }

  try {
    const verifyRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseWebApiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      },
    );
    if (!verifyRes.ok) {
      res.status(403).json({ error: 'Token verification failed' });
      return;
    }
    const data = (await verifyRes.json()) as {
      users?: Array<{ email?: string; emailVerified?: boolean }>;
    };
    const user = data.users?.[0];
    if (!user || !user.emailVerified || user.email !== ADMIN_EMAIL) {
      res.status(403).json({ error: 'Admin privileges required' });
      return;
    }

    const roomId = String(req.body?.roomId || '');
    const room = rooms.get(roomId);
    if (room) {
      broadcastRoom(room, 'room:error', { message: 'Room closed by moderator.' });
      rooms.delete(roomId);
    }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Verification request failed' });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`WORLD ARENA authoritative server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
