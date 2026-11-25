export type MapId = 'neon_city' | 'sky_island' | 'desert_energy' | 'ice_crystal';

export type GameModeId = 'solo_vs' | 'duo_battle' | 'squad_battle' | 'team_arena' | 'practice';

export type TeamId = 'blue' | 'red';

export type GraphicsQuality = 'low' | 'medium' | 'high';

export type VoiceChannelMode = 'team' | 'party' | 'room';

export type RegionId = 'global-auto' | 'us-east' | 'eu-west' | 'asia-east';

export interface ObstacleBox {
  id: string;
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  kind: 'pillar' | 'barrier' | 'platform' | 'crystal';
}

export interface ArenaObjective {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  radius: number;
}

export interface ArenaMapSpec {
  id: MapId;
  name: string;
  subtitle: string;
  accentHex: string;
  secondaryHex: string;
  skyHex: string;
  fogHex: string;
  fogDensity: number;
  arenaHalfSize: number;
  blueSpawns: Array<{ x: number; y: number; z: number }>;
  redSpawns: Array<{ x: number; y: number; z: number }>;
  objective: ArenaObjective;
  obstacles: ObstacleBox[];
}

export interface GameModeSpec {
  id: GameModeId;
  name: string;
  teamSize: number;
  maxPlayers: number;
  durationSec: number;
  description: string;
  isOffline: boolean;
}

export const GAME_MODES: Record<GameModeId, GameModeSpec> = {
  solo_vs: {
    id: 'solo_vs',
    name: 'Solo VS',
    teamSize: 1,
    maxPlayers: 2,
    durationSec: 120,
    description: '1 vs 1 tactical duel for central core control.',
    isOffline: false,
  },
  duo_battle: {
    id: 'duo_battle',
    name: 'Duo Battle',
    teamSize: 2,
    maxPlayers: 4,
    durationSec: 150,
    description: '2 vs 2 coordinated flank and objective skirmish.',
    isOffline: false,
  },
  squad_battle: {
    id: 'squad_battle',
    name: 'Squad Battle',
    teamSize: 4,
    maxPlayers: 8,
    durationSec: 180,
    description: '4 vs 4 competitive team arena battle.',
    isOffline: false,
  },
  team_arena: {
    id: 'team_arena',
    name: 'Team Arena',
    teamSize: 6,
    maxPlayers: 12,
    durationSec: 210,
    description: '6 vs 6 large-scale multiplayer arena clash.',
    isOffline: false,
  },
  practice: {
    id: 'practice',
    name: 'Practice Mode',
    teamSize: 2,
    maxPlayers: 4,
    durationSec: 150,
    description: 'Offline training arena against adaptive AI runners.',
    isOffline: true,
  },
};

export const ARENA_MAPS: Record<MapId, ArenaMapSpec> = {
  neon_city: {
    id: 'neon_city',
    name: 'Neon City Arena',
    subtitle: 'High-altitude cybernetic skyline deck',
    accentHex: '#06B6D4',
    secondaryHex: '#7C3AED',
    skyHex: '#060B18',
    fogHex: '#070E20',
    fogDensity: 0.011,
    arenaHalfSize: 34,
    blueSpawns: [
      { x: -24, y: 0, z: -8 },
      { x: -24, y: 0, z: 0 },
      { x: -24, y: 0, z: 8 },
      { x: -20, y: 0, z: -14 },
      { x: -20, y: 0, z: 14 },
      { x: -27, y: 0, z: 0 },
    ],
    redSpawns: [
      { x: 24, y: 0, z: -8 },
      { x: 24, y: 0, z: 0 },
      { x: 24, y: 0, z: 8 },
      { x: 20, y: 0, z: -14 },
      { x: 20, y: 0, z: 14 },
      { x: 27, y: 0, z: 0 },
    ],
    objective: { id: 'nexus_core', name: 'Nexus Core', x: 0, y: 0, z: 0, radius: 5.2 },
    obstacles: [
      { id: 'nc_b1', x: -12, y: 0, z: -9, w: 3.2, h: 3.2, d: 6.5, kind: 'barrier' },
      { id: 'nc_b2', x: -12, y: 0, z: 9, w: 3.2, h: 3.2, d: 6.5, kind: 'barrier' },
      { id: 'nc_b3', x: 12, y: 0, z: -9, w: 3.2, h: 3.2, d: 6.5, kind: 'barrier' },
      { id: 'nc_b4', x: 12, y: 0, z: 9, w: 3.2, h: 3.2, d: 6.5, kind: 'barrier' },
      { id: 'nc_p1', x: 0, y: 0, z: -16, w: 5.5, h: 4.5, d: 3.2, kind: 'pillar' },
      { id: 'nc_p2', x: 0, y: 0, z: 16, w: 5.5, h: 4.5, d: 3.2, kind: 'pillar' },
      { id: 'nc_c1', x: -6.5, y: 0, z: 0, w: 2.2, h: 2.0, d: 4.0, kind: 'barrier' },
      { id: 'nc_c2', x: 6.5, y: 0, z: 0, w: 2.2, h: 2.0, d: 4.0, kind: 'barrier' },
    ],
  },
  sky_island: {
    id: 'sky_island',
    name: 'Floating Sky Island',
    subtitle: 'Sunlit cloud-sea citadel and crystal spires',
    accentHex: '#38BDF8',
    secondaryHex: '#F59E0B',
    skyHex: '#0F2544',
    fogHex: '#183760',
    fogDensity: 0.0085,
    arenaHalfSize: 33,
    blueSpawns: [
      { x: -23, y: 0, z: -7 },
      { x: -23, y: 0, z: 7 },
      { x: -25, y: 0, z: 0 },
      { x: -19, y: 0, z: -12 },
      { x: -19, y: 0, z: 12 },
      { x: -26, y: 0, z: 0 },
    ],
    redSpawns: [
      { x: 23, y: 0, z: -7 },
      { x: 23, y: 0, z: 7 },
      { x: 25, y: 0, z: 0 },
      { x: 19, y: 0, z: -12 },
      { x: 19, y: 0, z: 12 },
      { x: 26, y: 0, z: 0 },
    ],
    objective: { id: 'sky_beacon', name: 'Aether Beacon', x: 0, y: 0, z: 0, radius: 5.4 },
    obstacles: [
      { id: 'si_p1', x: -11, y: 0, z: 0, w: 3.4, h: 4.2, d: 3.4, kind: 'pillar' },
      { id: 'si_p2', x: 11, y: 0, z: 0, w: 3.4, h: 4.2, d: 3.4, kind: 'pillar' },
      { id: 'si_b1', x: -5, y: 0, z: -11, w: 6.0, h: 2.2, d: 2.4, kind: 'barrier' },
      { id: 'si_b2', x: 5, y: 0, z: 11, w: 6.0, h: 2.2, d: 2.4, kind: 'barrier' },
      { id: 'si_c1', x: -14, y: 0, z: -14, w: 3.5, h: 5.0, d: 3.5, kind: 'crystal' },
      { id: 'si_c2', x: 14, y: 0, z: 14, w: 3.5, h: 5.0, d: 3.5, kind: 'crystal' },
    ],
  },
  desert_energy: {
    id: 'desert_energy',
    name: 'Desert Energy Arena',
    subtitle: 'Solar collector canyon at dusk',
    accentHex: '#F59E0B',
    secondaryHex: '#06B6D4',
    skyHex: '#1F1412',
    fogHex: '#2C1B16',
    fogDensity: 0.010,
    arenaHalfSize: 34,
    blueSpawns: [
      { x: -24, y: 0, z: -6 },
      { x: -24, y: 0, z: 6 },
      { x: -22, y: 0, z: -13 },
      { x: -22, y: 0, z: 13 },
      { x: -26, y: 0, z: 0 },
      { x: -20, y: 0, z: 0 },
    ],
    redSpawns: [
      { x: 24, y: 0, z: -6 },
      { x: 24, y: 0, z: 6 },
      { x: 22, y: 0, z: -13 },
      { x: 22, y: 0, z: 13 },
      { x: 26, y: 0, z: 0 },
      { x: 20, y: 0, z: 0 },
    ],
    objective: { id: 'solar_reactor', name: 'Solar Reactor', x: 0, y: 0, z: 0, radius: 5.2 },
    obstacles: [
      { id: 'de_b1', x: -13, y: 0, z: -7, w: 4.0, h: 2.8, d: 4.5, kind: 'barrier' },
      { id: 'de_b2', x: -13, y: 0, z: 7, w: 4.0, h: 2.8, d: 4.5, kind: 'barrier' },
      { id: 'de_b3', x: 13, y: 0, z: -7, w: 4.0, h: 2.8, d: 4.5, kind: 'barrier' },
      { id: 'de_b4', x: 13, y: 0, z: 7, w: 4.0, h: 2.8, d: 4.5, kind: 'barrier' },
      { id: 'de_p1', x: 0, y: 0, z: -14, w: 4.5, h: 5.5, d: 4.5, kind: 'pillar' },
      { id: 'de_p2', x: 0, y: 0, z: 14, w: 4.5, h: 5.5, d: 4.5, kind: 'pillar' },
    ],
  },
  ice_crystal: {
    id: 'ice_crystal',
    name: 'Ice Crystal Arena',
    subtitle: 'Glacial research basin under polar aurora',
    accentHex: '#22D3EE',
    secondaryHex: '#A855F7',
    skyHex: '#071826',
    fogHex: '#0C2538',
    fogDensity: 0.010,
    arenaHalfSize: 34,
    blueSpawns: [
      { x: -24, y: 0, z: -8 },
      { x: -24, y: 0, z: 8 },
      { x: -25, y: 0, z: 0 },
      { x: -20, y: 0, z: -14 },
      { x: -20, y: 0, z: 14 },
      { x: -27, y: 0, z: 0 },
    ],
    redSpawns: [
      { x: 24, y: 0, z: -8 },
      { x: 24, y: 0, z: 8 },
      { x: 25, y: 0, z: 0 },
      { x: 20, y: 0, z: -14 },
      { x: 20, y: 0, z: 14 },
      { x: 27, y: 0, z: 0 },
    ],
    objective: { id: 'cryo_core', name: 'Cryo Core', x: 0, y: 0, z: 0, radius: 5.2 },
    obstacles: [
      { id: 'ic_c1', x: -9, y: 0, z: -9, w: 3.4, h: 5.2, d: 3.4, kind: 'crystal' },
      { id: 'ic_c2', x: -9, y: 0, z: 9, w: 3.4, h: 5.2, d: 3.4, kind: 'crystal' },
      { id: 'ic_c3', x: 9, y: 0, z: -9, w: 3.4, h: 5.2, d: 3.4, kind: 'crystal' },
      { id: 'ic_c4', x: 9, y: 0, z: 9, w: 3.4, h: 5.2, d: 3.4, kind: 'crystal' },
      { id: 'ic_b1', x: -16, y: 0, z: 0, w: 2.5, h: 2.4, d: 7.0, kind: 'barrier' },
      { id: 'ic_b2', x: 16, y: 0, z: 0, w: 2.5, h: 2.4, d: 7.0, kind: 'barrier' },
    ],
  },
};

export interface PlayerSnapshot {
  id: string;
  uid: string;
  username: string;
  country: string;
  team: TeamId;
  isBot: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  energy: number;
  maxEnergy: number;
  sprinting: boolean;
  eliminated: boolean;
  respawnTimer: number;
  tags: number;
  taggedCount: number;
  captures: number;
  score: number;
  avatarColor: string;
}

export interface ProjectileSnapshot {
  id: string;
  ownerId: string;
  team: TeamId;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

export interface ObjectiveSnapshot {
  id: string;
  name: string;
  ownerTeam: TeamId | 'neutral';
  capturingTeam: TeamId | 'contested' | 'none';
  progress: number; // 0..100
}

export interface MatchSnapshot {
  matchId: string;
  mode: GameModeId;
  mapId: MapId;
  timeRemaining: number;
  blueScore: number;
  redScore: number;
  objective: ObjectiveSnapshot;
  players: PlayerSnapshot[];
  projectiles: ProjectileSnapshot[];
  status: 'active' | 'ended';
  winnerTeam?: TeamId | 'draw';
  lastEvent?: string;
}

export interface RoomMember {
  id: string;
  uid: string;
  username: string;
  country: string;
  team: TeamId;
  ready: boolean;
  isHost: boolean;
  isBot: boolean;
  avatarColor: string;
}

export interface RoomState {
  roomId: string;
  roomCode: string;
  hostId: string;
  hostUid: string;
  mode: GameModeId;
  mapId: MapId;
  region: RegionId;
  isPrivate: boolean;
  status: 'waiting' | 'in_progress' | 'closed';
  maxPlayers: number;
  members: RoomMember[];
}

export interface PlayerInputState {
  moveX: number; // -1..1 strafe
  moveZ: number; // -1..1 forward/back
  yaw: number;
  pitch: number;
  jump: boolean;
  sprint: boolean;
  fire: boolean;
  interact: boolean;
  seq: number;
}

export interface UserSettings {
  graphicsQuality: GraphicsQuality;
  targetFps: 30 | 60 | 120;
  masterVolume: number;
  sfxEnabled: boolean;
  joystickScale: number;
  cameraSensitivity: number;
  invertY: boolean;
  pushToTalk: boolean;
  textFilterEnabled: boolean;
}

export const DEFAULT_SETTINGS: UserSettings = {
  graphicsQuality: 'high',
  targetFps: 60,
  masterVolume: 0.7,
  sfxEnabled: true,
  joystickScale: 1,
  cameraSensitivity: 1,
  invertY: false,
  pushToTalk: false,
  textFilterEnabled: true,
};

export interface PlayerProfileData {
  uid: string;
  playerCode: string;
  username: string;
  avatarColor: string;
  photoUrl?: string;
  country: string;
  onlineStatus: 'online' | 'in_match' | 'offline';
  wins: number;
  matchesPlayed: number;
  tagsScored: number;
  rating: number;
  privacyVoice: 'everyone' | 'team_friends' | 'friends_only' | 'muted';
  privacyInvites: 'everyone' | 'friends_only' | 'none';
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  team: TeamId;
  text: string;
  timestamp: number;
}
