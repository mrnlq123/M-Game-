import React, { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Globe,
  History,
  Lock,
  Play,
  Plus,
  Search,
  Settings as SettingsIcon,
  Shield,
  ShieldAlert,
  Trophy,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  ARENA_MAPS,
  GAME_MODES,
  type GameModeId,
  type MapId,
  type MatchSnapshot,
  type PlayerProfileData,
  type RegionId,
  type RoomState,
  type UserSettings,
} from '../game/types';
import type {
  FriendRecord,
  LeaderboardRow,
  MatchHistoryRow,
  ReportRecord,
} from '../services/firestoreService';

export interface PublicRoomSummary {
  roomId: string;
  roomCode: string;
  mode: Exclude<GameModeId, 'practice'>;
  mapId: MapId;
  region: RegionId;
  playerCount: number;
  maxPlayers: number;
  hostName: string;
}

const ModalShell: React.FC<{
  title: string;
  subtitle?: string;
  onClose: () => void;
  maxWidth?: string;
  children: React.ReactNode;
}> = ({ title, subtitle, onClose, maxWidth = 'max-w-3xl', children }) => (
  <div className="fixed inset-0 z-30 bg-black/75 flex items-center justify-center p-4">
    <div
      className={`w-full ${maxWidth} max-h-[88vh] bg-[#0D1526] border border-slate-700/90 rounded-2xl flex flex-col overflow-hidden shadow-2xl`}
    >
      <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between gap-4 shrink-0">
        <div>
          <h2 className="font-display text-xl font-bold text-white">{title}</h2>
          {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 hover:text-white"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="p-6 overflow-y-auto space-y-5">{children}</div>
    </div>
  </div>
);

/* Screen 5: Game Mode & Arena Map Selection */
export const GameModeModal: React.FC<{
  selectedMode: GameModeId;
  selectedMap: MapId;
  selectedRegion: RegionId;
  enabledMaps: MapId[];
  enabledModes: GameModeId[];
  isAuthenticated: boolean;
  onSelectMode: (m: GameModeId) => void;
  onSelectMap: (m: MapId) => void;
  onSelectRegion: (r: RegionId) => void;
  onLaunchPractice: () => void;
  onStartQueue: () => void;
  onCreateRoom: (isPrivate: boolean) => void;
  onJoinByCode: (code: string) => void;
  onClose: () => void;
}> = ({
  selectedMode,
  selectedMap,
  selectedRegion,
  enabledMaps,
  enabledModes,
  isAuthenticated,
  onSelectMode,
  onSelectMap,
  onSelectRegion,
  onLaunchPractice,
  onStartQueue,
  onCreateRoom,
  onJoinByCode,
  onClose,
}) => {
  const [joinCode, setJoinCode] = useState('');
  const [publicRooms, setPublicRooms] = useState<PublicRoomSummary[]>([]);

  useEffect(() => {
    fetch('/api/rooms')
      .then((r) => r.json())
      .then((d) => setPublicRooms(d.rooms || []))
      .catch(() => {});
  }, []);

  return (
    <ModalShell
      title="Select Battle Mode & Arena"
      subtitle="Choose competitive online matchmaking, custom rooms, or offline AI practice"
      onClose={onClose}
      maxWidth="max-w-4xl"
    >
      <div className="space-y-3">
        <div className="text-xs font-semibold text-slate-300">Game Modes</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {(Object.keys(GAME_MODES) as GameModeId[]).map((id) => {
            const spec = GAME_MODES[id];
            const disabled = !enabledModes.includes(id);
            const active = selectedMode === id;
            return (
              <button
                key={id}
                disabled={disabled}
                onClick={() => onSelectMode(id)}
                className={`text-left p-4 rounded-xl border transition-colors ${
                  disabled
                    ? 'opacity-45 cursor-not-allowed bg-slate-900/40 border-slate-800'
                    : active
                      ? 'bg-cyan-950/60 border-cyan-400 text-white'
                      : 'bg-slate-900/70 border-slate-800 hover:border-slate-600 text-slate-200'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display font-bold text-sm">{spec.name}</span>
                  <span className="text-[11px] font-mono-tabular text-cyan-400">
                    {spec.isOffline ? 'Offline AI' : `${spec.teamSize}v${spec.teamSize}`}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">{spec.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        <div className="text-xs font-semibold text-slate-300">3D Arena Maps</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(Object.keys(ARENA_MAPS) as MapId[]).map((id) => {
            const map = ARENA_MAPS[id];
            const disabled = !enabledMaps.includes(id);
            const active = selectedMap === id;
            return (
              <button
                key={id}
                disabled={disabled}
                onClick={() => onSelectMap(id)}
                className={`text-left p-3.5 rounded-xl border transition-colors flex items-center justify-between gap-3 ${
                  disabled
                    ? 'opacity-45 cursor-not-allowed bg-slate-900/40 border-slate-800'
                    : active
                      ? 'bg-purple-950/50 border-purple-400 text-white'
                      : 'bg-slate-900/70 border-slate-800 hover:border-slate-600 text-slate-200'
                }`}
              >
                <div>
                  <div className="font-display font-semibold text-sm">{map.name}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{map.subtitle}</div>
                </div>
                <span
                  className="w-3.5 h-3.5 rounded-sm shrink-0"
                  style={{ backgroundColor: map.accentHex }}
                />
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-800">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-cyan-400" />
          <span className="text-xs text-slate-300">Region</span>
          <select
            value={selectedRegion}
            onChange={(e) => onSelectRegion(e.target.value as RegionId)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
          >
            <option value="global-auto">Global Auto</option>
            <option value="us-east">North America (US-East)</option>
            <option value="eu-west">Europe (EU-West)</option>
            <option value="asia-east">Asia Pacific (Asia-East)</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {selectedMode === 'practice' ? (
            <button
              onClick={onLaunchPractice}
              className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold rounded-xl flex items-center gap-2"
            >
              <Play className="w-4 h-4" />
              Start Practice Match
            </button>
          ) : (
            <>
              <button
                onClick={() => onCreateRoom(true)}
                disabled={!isAuthenticated}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-45 border border-slate-600 text-slate-100 text-xs font-semibold rounded-xl flex items-center gap-1.5"
              >
                <Lock className="w-3.5 h-3.5 text-purple-400" />
                Private Room
              </button>
              <button
                onClick={() => onCreateRoom(false)}
                disabled={!isAuthenticated}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-45 border border-slate-600 text-slate-100 text-xs font-semibold rounded-xl flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5 text-cyan-400" />
                Host Public Room
              </button>
              <button
                onClick={onStartQueue}
                disabled={!isAuthenticated}
                className="px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-500 hover:to-purple-500 disabled:opacity-45 text-white text-sm font-semibold rounded-xl"
              >
                Find Global Match
              </button>
            </>
          )}
        </div>
      </div>

      {!isAuthenticated && selectedMode !== 'practice' && (
        <p className="text-xs text-amber-300">
          Sign in with Google from the lobby to join real online multiplayer rooms and ranked matchmaking.
        </p>
      )}

      {/* Join Room by Code + Public Room List */}
      <div className="pt-3 border-t border-slate-800 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs font-semibold text-slate-300">Join Room by Code</div>
          <div className="flex items-center gap-2">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="Enter 6-char room code"
              maxLength={12}
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-mono-tabular text-white uppercase"
            />
            <button
              onClick={() => joinCode.trim() && onJoinByCode(joinCode.trim())}
              disabled={!isAuthenticated || !joinCode.trim()}
              className="px-3.5 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-45 text-white text-xs font-semibold rounded-lg"
            >
              Join
            </button>
          </div>
        </div>

        {publicRooms.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-xs text-slate-400">Active Public Rooms</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {publicRooms.map((r) => (
                <button
                  key={r.roomId}
                  onClick={() => onJoinByCode(r.roomCode)}
                  disabled={!isAuthenticated}
                  className="p-3 bg-slate-900/75 hover:bg-slate-800 border border-slate-800 rounded-xl flex items-center justify-between text-left"
                >
                  <div>
                    <div className="text-xs font-semibold text-white">
                      {r.hostName}&apos;s Room · {ARENA_MAPS[r.mapId]?.name}
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono-tabular mt-0.5">
                      {GAME_MODES[r.mode]?.name} · {r.region} · {r.roomCode}
                    </div>
                  </div>
                  <span className="font-mono-tabular text-xs font-semibold text-cyan-400">
                    {r.playerCount}/{r.maxPlayers}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
};

/* Screen 6: Matchmaking Screen */
export const MatchmakingModal: React.FC<{
  mode: GameModeId;
  region: RegionId;
  queueSize: number;
  elapsedSec: number;
  onCancel: () => void;
}> = ({ mode, region, queueSize, elapsedSec, onCancel }) => (
  <ModalShell
    title="Global Matchmaking"
    subtitle="Searching for live opponent connections on the authoritative server"
    onClose={onCancel}
    maxWidth="max-w-md"
  >
    <div className="py-4 text-center space-y-4">
      <div className="w-16 h-16 mx-auto rounded-2xl bg-cyan-950/80 border border-cyan-500/50 flex items-center justify-center">
        <Globe className="w-8 h-8 text-cyan-400" />
      </div>
      <div>
        <div className="font-display text-lg font-bold text-white">{GAME_MODES[mode].name}</div>
        <div className="text-xs text-slate-400 mt-1">
          Region {region} · Real players in queue: <span className="font-mono-tabular text-cyan-300">{queueSize}</span>
        </div>
      </div>
      <div className="font-mono-tabular text-3xl font-bold text-cyan-400">
        {Math.floor(elapsedSec / 60)}:{String(elapsedSec % 60).padStart(2, '0')}
      </div>
      <p className="text-xs text-slate-400 leading-relaxed">
        WORLD ARENA pairs only real connected players in global matchmaking. To invite friends directly or train immediately, host a Private Room or launch Practice Mode.
      </p>
      <button
        onClick={onCancel}
        className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white text-sm font-semibold rounded-xl"
      >
        Cancel Queue
      </button>
    </div>
  </ModalShell>
);

/* Screen 7: Room Lobby */
export const RoomLobbyModal: React.FC<{
  room: RoomState;
  localClientId: string;
  friends: FriendRecord[];
  roomError: string | null;
  onToggleReady: () => void;
  onSwitchTeam: () => void;
  onUpdateConfig: (mode: Exclude<GameModeId, 'practice'>, mapId: MapId) => void;
  onAddBot: () => void;
  onStartMatch: () => void;
  onLeaveRoom: () => void;
}> = ({
  room,
  localClientId,
  friends,
  roomError,
  onToggleReady,
  onSwitchTeam,
  onUpdateConfig,
  onAddBot,
  onStartMatch,
  onLeaveRoom,
}) => {
  const [copied, setCopied] = useState(false);
  const [invitedFriend, setInvitedFriend] = useState<string | null>(null);
  const isHost = room.hostId === localClientId;
  const me = room.members.find((m) => m.id === localClientId);

  const copyCode = () => {
    navigator.clipboard?.writeText(room.roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <ModalShell
      title={room.isPrivate ? 'Private Arena Room' : 'Public Arena Room'}
      subtitle={`${GAME_MODES[room.mode].name} · ${ARENA_MAPS[room.mapId].name} · ${room.region}`}
      onClose={onLeaveRoom}
      maxWidth="max-w-3xl"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-slate-900/80 border border-slate-800 rounded-xl">
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">Room Code</span>
          <span className="font-mono-tabular text-lg font-bold text-cyan-400 tracking-wider">
            {room.roomCode}
          </span>
          <button
            onClick={copyCode}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs text-slate-200 flex items-center gap-1"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-cyan-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>

        {isHost && (
          <div className="flex items-center gap-2">
            <select
              value={room.mode}
              onChange={(e) => onUpdateConfig(e.target.value as Exclude<GameModeId, 'practice'>, room.mapId)}
              className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
            >
              <option value="solo_vs">Solo VS (1v1)</option>
              <option value="duo_battle">Duo Battle (2v2)</option>
              <option value="squad_battle">Squad Battle (4v4)</option>
              <option value="team_arena">Team Arena (6v6)</option>
            </select>
            <select
              value={room.mapId}
              onChange={(e) =>
                onUpdateConfig(room.mode as Exclude<GameModeId, 'practice'>, e.target.value as MapId)
              }
              className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
            >
              {(Object.keys(ARENA_MAPS) as MapId[]).map((m) => (
                <option key={m} value={m}>
                  {ARENA_MAPS[m].name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {roomError && (
        <div className="p-3 bg-rose-950/70 border border-rose-500/40 rounded-xl text-xs text-rose-200">
          {roomError}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(['blue', 'red'] as const).map((team) => {
          const teamMembers = room.members.filter((m) => m.team === team);
          return (
            <div key={team} className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl space-y-2.5">
              <div className="flex items-center justify-between">
                <span className={`font-display text-sm font-bold ${team === 'blue' ? 'text-cyan-400' : 'text-rose-400'}`}>
                  {team === 'blue' ? 'Blue Team' : 'Red Team'}
                </span>
                <span className="font-mono-tabular text-xs text-slate-400">
                  {teamMembers.length}/{room.maxPlayers / 2}
                </span>
              </div>
              {teamMembers.length === 0 ? (
                <div className="text-xs text-slate-500 py-3">Waiting for players...</div>
              ) : (
                teamMembers.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between px-3 py-2 bg-[#0A101E] border border-slate-800 rounded-lg text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-sm shrink-0"
                        style={{ backgroundColor: m.avatarColor }}
                      />
                      <span className="text-white font-medium truncate">{m.username}</span>
                      <span className="text-slate-400 font-mono-tabular">{m.country}</span>
                      {m.isHost && <span className="text-amber-400 text-[11px]">Host</span>}
                      {m.isBot && <span className="text-purple-400 text-[11px]">[AI Bot]</span>}
                    </div>
                    <span className={m.ready ? 'text-cyan-400 font-medium' : 'text-slate-500'}>
                      {m.ready ? 'Ready' : 'Waiting'}
                    </span>
                  </div>
                ))
              )}
            </div>
          );
        })}
      </div>

      {/* Invite Friends Quick Bar */}
      {friends.filter((f) => f.status === 'accepted').length > 0 && (
        <div className="space-y-2 pt-2 border-t border-slate-800">
          <div className="text-xs font-semibold text-slate-300">Invite Friends</div>
          <div className="flex flex-wrap gap-2">
            {friends
              .filter((f) => f.status === 'accepted')
              .map((f) => (
                <button
                  key={f.id}
                  onClick={() => {
                    navigator.clipboard?.writeText(room.roomCode);
                    setInvitedFriend(f.targetUsername);
                  }}
                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 flex items-center gap-1.5"
                >
                  <UserPlus className="w-3.5 h-3.5 text-cyan-400" />
                  Invite {f.targetUsername}
                </button>
              ))}
          </div>
          {invitedFriend && (
            <div className="text-xs text-cyan-300">
              Room code {room.roomCode} copied — share with {invitedFriend} to join directly.
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800">
        <div className="flex items-center gap-2">
          <button
            onClick={onSwitchTeam}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs font-semibold text-slate-200 rounded-xl"
          >
            Switch Team
          </button>
          <button
            onClick={onToggleReady}
            className={`px-3.5 py-2 text-xs font-semibold rounded-xl border ${
              me?.ready
                ? 'bg-cyan-950 border-cyan-500 text-cyan-200'
                : 'bg-slate-800 border-slate-600 text-slate-200'
            }`}
          >
            {me?.ready ? 'Ready' : 'Mark Ready'}
          </button>
          {isHost && room.isPrivate && room.members.length < room.maxPlayers && (
            <button
              onClick={onAddBot}
              className="px-3.5 py-2 bg-purple-950/70 hover:bg-purple-900/80 border border-purple-500/50 text-purple-200 text-xs font-semibold rounded-xl"
            >
              + Training Bot
            </button>
          )}
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={onLeaveRoom}
            className="px-4 py-2 bg-rose-950/70 hover:bg-rose-900 border border-rose-700/60 text-rose-100 text-xs font-semibold rounded-xl"
          >
            Leave Room
          </button>
          {isHost && (
            <button
              onClick={onStartMatch}
              className="px-5 py-2 bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-500 hover:to-purple-500 text-white text-sm font-semibold rounded-xl"
            >
              Launch Match
            </button>
          )}
        </div>
      </div>
    </ModalShell>
  );
};

/* Screen 10: Match Results */
export const MatchResultsModal: React.FC<{
  snapshot: MatchSnapshot;
  localPlayerId: string;
  onPlayAgain: () => void;
  onReturnLobby: () => void;
}> = ({ snapshot, localPlayerId, onPlayAgain, onReturnLobby }) => {
  const me = snapshot.players.find((p) => p.id === localPlayerId);
  const myTeam = me?.team || 'blue';
  const won = snapshot.winnerTeam === myTeam;
  const draw = snapshot.winnerTeam === 'draw';
  const sorted = [...snapshot.players].sort((a, b) => b.score - a.score);

  return (
    <ModalShell
      title={draw ? 'Match Draw' : won ? 'Victory Verified' : 'Match Complete'}
      subtitle={`${GAME_MODES[snapshot.mode].name} · ${ARENA_MAPS[snapshot.mapId].name}`}
      onClose={onReturnLobby}
      maxWidth="max-w-2xl"
    >
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="p-4 bg-slate-900/80 border border-cyan-500/40 rounded-xl">
          <div className="text-xs text-cyan-400 font-semibold">Blue Team</div>
          <div className="font-mono-tabular text-3xl font-bold text-white mt-1">
            {snapshot.blueScore}
          </div>
        </div>
        <div className="p-4 bg-slate-900/80 border border-slate-700 rounded-xl flex flex-col justify-center">
          <div className="text-xs text-slate-400">Your Score</div>
          <div className="font-mono-tabular text-2xl font-bold text-amber-300 mt-1">
            {me?.score ?? 0}
          </div>
        </div>
        <div className="p-4 bg-slate-900/80 border border-rose-500/40 rounded-xl">
          <div className="text-xs text-rose-400 font-semibold">Red Team</div>
          <div className="font-mono-tabular text-3xl font-bold text-white mt-1">
            {snapshot.redScore}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400">
              <th className="py-2 pr-3">Runner</th>
              <th className="py-2 px-2">Team</th>
              <th className="py-2 px-2 text-right">Tags</th>
              <th className="py-2 px-2 text-right">Tagged</th>
              <th className="py-2 px-2 text-right">Core</th>
              <th className="py-2 pl-2 text-right">Score</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <tr key={p.id} className="border-b border-slate-800/60 text-slate-200">
                <td className="py-2.5 pr-3 font-medium">
                  {p.username} {p.id === localPlayerId && <span className="text-cyan-400">(You)</span>}
                </td>
                <td className={`py-2.5 px-2 capitalize ${p.team === 'blue' ? 'text-cyan-400' : 'text-rose-400'}`}>
                  {p.team}
                </td>
                <td className="py-2.5 px-2 text-right font-mono-tabular">{p.tags}</td>
                <td className="py-2.5 px-2 text-right font-mono-tabular">{p.taggedCount}</td>
                <td className="py-2.5 px-2 text-right font-mono-tabular">{p.captures}</td>
                <td className="py-2.5 pl-2 text-right font-mono-tabular font-bold text-white">{p.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button
          onClick={onReturnLobby}
          className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 text-sm font-semibold rounded-xl"
        >
          Return to Lobby
        </button>
        <button
          onClick={onPlayAgain}
          className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold rounded-xl"
        >
          Play Again
        </button>
      </div>
    </ModalShell>
  );
};

/* Screen 11: Friends */
export const FriendsModal: React.FC<{
  uid: string;
  friends: FriendRecord[];
  onSearchPlayers: (q: string) => Promise<PlayerProfileData[]>;
  onSendFriendRequest: (target: PlayerProfileData) => Promise<void>;
  onAcceptRequest: (friendshipId: string) => Promise<void>;
  onRemoveFriend: (friendshipId: string) => Promise<void>;
  onBlockUser: (uid: string, username: string) => Promise<void>;
  onClose: () => void;
}> = ({
  uid,
  friends,
  onSearchPlayers,
  onSendFriendRequest,
  onAcceptRequest,
  onRemoveFriend,
  onBlockUser,
  onClose,
}) => {
  const [queryText, setQueryText] = useState('');
  const [results, setResults] = useState<PlayerProfileData[]>([]);
  const [searching, setSearching] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setSearching(true);
    try {
      const res = await onSearchPlayers(queryText);
      setResults(res.filter((r) => r.uid !== uid));
    } finally {
      setSearching(false);
    }
  };

  const accepted = friends.filter((f) => f.status === 'accepted');
  const pending = friends.filter((f) => f.status === 'pending');

  return (
    <ModalShell title="Friends & Squad" subtitle="Connect with runners by Player ID or username" onClose={onClose}>
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
            placeholder="Search username or WA-XXXXXX..."
            className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-sm text-white"
          />
        </div>
        <button
          type="submit"
          disabled={searching}
          className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold rounded-xl"
        >
          {searching ? 'Searching...' : 'Find'}
        </button>
      </form>

      {results.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-slate-300">Search Results</div>
          {results.map((p) => (
            <div key={p.uid} className="p-3 bg-slate-900/70 border border-slate-800 rounded-xl flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-white">
                  {p.username} · <span className="font-mono-tabular text-xs text-cyan-400">{p.playerCode}</span>
                </div>
                <div className="text-xs text-slate-400">
                  {p.country} · Rating {p.rating} · {p.onlineStatus}
                </div>
              </div>
              <button
                onClick={() => onSendFriendRequest(p)}
                className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1"
              >
                <UserPlus className="w-3.5 h-3.5" />
                Add
              </button>
            </div>
          ))}
        </div>
      )}

      {pending.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-slate-300">Pending Requests</div>
          {pending.map((f) => (
            <div key={f.id} className="p-3 bg-slate-900/70 border border-slate-800 rounded-xl flex items-center justify-between">
              <div className="text-sm text-slate-200">
                {f.targetUsername}{' '}
                <span className="text-xs text-slate-400">
                  {f.ownerUid === uid ? '(Sent)' : '(Incoming)'}
                </span>
              </div>
              <div className="flex gap-2">
                {f.targetUid === uid && (
                  <button
                    onClick={() => onAcceptRequest(f.id)}
                    className="px-3 py-1.5 bg-cyan-600 text-white text-xs font-semibold rounded-lg"
                  >
                    Accept
                  </button>
                )}
                <button
                  onClick={() => onRemoveFriend(f.id)}
                  className="px-3 py-1.5 bg-slate-800 text-slate-300 text-xs rounded-lg"
                >
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <div className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5 text-cyan-400" />
          Friends ({accepted.length})
        </div>
        {accepted.length === 0 ? (
          <div className="text-xs text-slate-500 py-3">No friends added yet. Search by Player ID above.</div>
        ) : (
          accepted.map((f) => {
            const otherUid = f.ownerUid === uid ? f.targetUid : f.ownerUid;
            return (
              <div key={f.id} className="p-3 bg-slate-900/70 border border-slate-800 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-white">
                  <UserCheck className="w-4 h-4 text-cyan-400" />
                  <span>{f.targetUsername}</span>
                  {f.targetPlayerCode && (
                    <span className="font-mono-tabular text-xs text-slate-400">{f.targetPlayerCode}</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => onBlockUser(otherUid, f.targetUsername)}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs rounded-lg"
                  >
                    Block
                  </button>
                  <button
                    onClick={() => onRemoveFriend(f.id)}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg"
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </ModalShell>
  );
};

/* Screen 12: Global Leaderboard */
export const LeaderboardModal: React.FC<{
  rows: LeaderboardRow[];
  loading: boolean;
  onRefresh: (country: string) => void;
  onClose: () => void;
}> = ({ rows, loading, onRefresh, onClose }) => {
  const [country, setCountry] = useState('ALL');
  return (
    <ModalShell title="Global Leaderboard" subtitle="Verified seasonal competitive standings" onClose={onClose}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-amber-400" />
          <span className="text-xs text-slate-300">Filter by Country</span>
        </div>
        <select
          value={country}
          onChange={(e) => {
            setCountry(e.target.value);
            onRefresh(e.target.value);
          }}
          className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
        >
          <option value="ALL">All Countries</option>
          <option value="US">US</option>
          <option value="GB">GB</option>
          <option value="DE">DE</option>
          <option value="JP">JP</option>
          <option value="KR">KR</option>
          <option value="BR">BR</option>
          <option value="IN">IN</option>
        </select>
      </div>

      {loading ? (
        <div className="py-8 text-center text-xs text-slate-400">Loading rankings...</div>
      ) : rows.length === 0 ? (
        <div className="py-8 text-center text-xs text-slate-500">No ranked matches recorded yet.</div>
      ) : (
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400">
              <th className="py-2 pr-2">#</th>
              <th className="py-2 px-2">Player</th>
              <th className="py-2 px-2">Country</th>
              <th className="py-2 px-2 text-right">Wins</th>
              <th className="py-2 px-2 text-right">Tags</th>
              <th className="py-2 pl-2 text-right">Rating</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.uid} className="border-b border-slate-800/60 text-slate-200">
                <td className="py-2.5 pr-2 font-mono-tabular text-slate-400">{i + 1}</td>
                <td className="py-2.5 px-2 font-semibold text-white">{r.username}</td>
                <td className="py-2.5 px-2 font-mono-tabular">{r.country}</td>
                <td className="py-2.5 px-2 text-right font-mono-tabular">{r.wins}</td>
                <td className="py-2.5 px-2 text-right font-mono-tabular">{r.tagsScored}</td>
                <td className="py-2.5 pl-2 text-right font-mono-tabular font-bold text-cyan-400">{r.rating}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </ModalShell>
  );
};

/* Screen 13: Match History */
export const HistoryModal: React.FC<{
  rows: MatchHistoryRow[];
  loading: boolean;
  onClose: () => void;
}> = ({ rows, loading, onClose }) => (
  <ModalShell title="Match History" subtitle="Your recorded arena combat log" onClose={onClose}>
    {loading ? (
      <div className="py-8 text-center text-xs text-slate-400">Loading match log...</div>
    ) : rows.length === 0 ? (
      <div className="py-8 text-center text-xs text-slate-500 flex flex-col items-center gap-2">
        <History className="w-6 h-6 text-slate-600" />
        <span>Complete a match while signed in to view your history.</span>
      </div>
    ) : (
      <div className="space-y-2">
        {rows.map((r) => (
          <div
            key={r.id}
            className="p-3.5 bg-slate-900/70 border border-slate-800 rounded-xl flex items-center justify-between gap-3"
          >
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <span className={r.won ? 'text-cyan-400' : r.winnerTeam === 'draw' ? 'text-amber-300' : 'text-rose-400'}>
                  {r.won ? 'Victory' : r.winnerTeam === 'draw' ? 'Draw' : 'Defeat'}
                </span>
                <span className="text-slate-500">·</span>
                <span className="text-white">{GAME_MODES[r.mode as GameModeId]?.name || r.mode}</span>
                <span className="text-slate-500">·</span>
                <span className="text-slate-300 text-xs">{ARENA_MAPS[r.mapId as MapId]?.name || r.mapId}</span>
              </div>
              <div className="text-xs text-slate-400 font-mono-tabular mt-1">
                Tags {r.tags} · Tagged {r.taggedCount} · Core Captures {r.captures}
              </div>
            </div>
            <div className="font-mono-tabular text-base font-bold text-white">{r.score} pts</div>
          </div>
        ))}
      </div>
    )}
  </ModalShell>
);

/* Screen 14: Settings */
export const SettingsModal: React.FC<{
  settings: UserSettings;
  onChange: (next: UserSettings) => void;
  onEditProfile: () => void;
  onClose: () => void;
}> = ({ settings, onChange, onEditProfile, onClose }) => (
  <ModalShell title="Settings" subtitle="Graphics quality, frame pacing, audio, and touch controls" onClose={onClose}>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="p-4 bg-slate-900/70 border border-slate-800 rounded-xl space-y-3">
        <div className="text-xs font-semibold text-cyan-400 flex items-center gap-1.5">
          <SettingsIcon className="w-3.5 h-3.5" />
          3D Graphics & Performance
        </div>
        <div className="space-y-1">
          <label className="text-xs text-slate-300">Graphics Quality</label>
          <select
            value={settings.graphicsQuality}
            onChange={(e) => onChange({ ...settings, graphicsQuality: e.target.value as UserSettings['graphicsQuality'] })}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
          >
            <option value="low">Low (Battery Saver / Mid-Range)</option>
            <option value="medium">Medium (Balanced)</option>
            <option value="high">High (Full Shadows & Reflections)</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-slate-300">Target Frame Rate</label>
          <select
            value={settings.targetFps}
            onChange={(e) => onChange({ ...settings, targetFps: Number(e.target.value) as 30 | 60 | 120 })}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
          >
            <option value={30}>30 FPS (Thermal Saver)</option>
            <option value={60}>60 FPS (Standard)</option>
            <option value={120}>120 FPS (High Refresh)</option>
          </select>
        </div>
        <label className="flex items-center justify-between text-xs text-slate-200 pt-1">
          <span>Master SFX Enabled</span>
          <input
            type="checkbox"
            checked={settings.sfxEnabled}
            onChange={(e) => onChange({ ...settings, sfxEnabled: e.target.checked })}
            className="accent-cyan-500 w-4 h-4"
          />
        </label>
      </div>

      <div className="p-4 bg-slate-900/70 border border-slate-800 rounded-xl space-y-3">
        <div className="text-xs font-semibold text-purple-400">Controls & Voice</div>
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-slate-300">
            <span>Camera Sensitivity</span>
            <span className="font-mono-tabular">{settings.cameraSensitivity.toFixed(1)}x</span>
          </div>
          <input
            type="range"
            min={0.4}
            max={2.0}
            step={0.1}
            value={settings.cameraSensitivity}
            onChange={(e) => onChange({ ...settings, cameraSensitivity: Number(e.target.value) })}
            className="w-full accent-cyan-500"
          />
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-slate-300">
            <span>Virtual Joystick Size</span>
            <span className="font-mono-tabular">{Math.round(settings.joystickScale * 100)}%</span>
          </div>
          <input
            type="range"
            min={0.8}
            max={1.4}
            step={0.05}
            value={settings.joystickScale}
            onChange={(e) => onChange({ ...settings, joystickScale: Number(e.target.value) })}
            className="w-full accent-cyan-500"
          />
        </div>
        <label className="flex items-center justify-between text-xs text-slate-200">
          <span>Invert Camera Y-Axis</span>
          <input
            type="checkbox"
            checked={settings.invertY}
            onChange={(e) => onChange({ ...settings, invertY: e.target.checked })}
            className="accent-cyan-500 w-4 h-4"
          />
        </label>
        <label className="flex items-center justify-between text-xs text-slate-200">
          <span>Push-to-Talk Mode (Hold V or PTT)</span>
          <input
            type="checkbox"
            checked={settings.pushToTalk}
            onChange={(e) => onChange({ ...settings, pushToTalk: e.target.checked })}
            className="accent-cyan-500 w-4 h-4"
          />
        </label>
      </div>
    </div>

    <div className="flex justify-between items-center pt-2 border-t border-slate-800">
      <button
        onClick={onEditProfile}
        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs font-semibold text-slate-100 rounded-xl"
      >
        Edit Player Profile
      </button>
      <button
        onClick={onClose}
        className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold rounded-xl"
      >
        Done
      </button>
    </div>
  </ModalShell>
);

/* Screen 15: Privacy and Safety */
export const PrivacySafetyModal: React.FC<{
  profile: PlayerProfileData | null;
  blockedFriends: FriendRecord[];
  prefillReportTarget?: { uid: string; username: string } | null;
  onUpdatePrivacy: (voice: PlayerProfileData['privacyVoice'], invites: PlayerProfileData['privacyInvites']) => Promise<void>;
  onUnblock: (friendshipId: string) => Promise<void>;
  onSubmitReport: (input: {
    reportedUid: string;
    reportedUsername: string;
    reason: ReportRecord['reason'];
    details: string;
  }) => Promise<void>;
  onClose: () => void;
}> = ({
  profile,
  blockedFriends,
  prefillReportTarget,
  onUpdatePrivacy,
  onUnblock,
  onSubmitReport,
  onClose,
}) => {
  const [voicePriv, setVoicePriv] = useState<PlayerProfileData['privacyVoice']>(
    profile?.privacyVoice || 'everyone',
  );
  const [invitePriv, setInvitePriv] = useState<PlayerProfileData['privacyInvites']>(
    profile?.privacyInvites || 'everyone',
  );
  const [repUid, setRepUid] = useState(prefillReportTarget?.uid || '');
  const [repName, setRepName] = useState(prefillReportTarget?.username || '');
  const [repReason, setRepReason] = useState<ReportRecord['reason']>('unsportsmanlike');
  const [repDetails, setRepDetails] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const handleSavePrivacy = async () => {
    await onUpdatePrivacy(voicePriv, invitePriv);
    setNotice('Privacy preferences saved.');
  };

  const handleReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repName.trim() || !repUid.trim()) return;
    await onSubmitReport({
      reportedUid: repUid.trim(),
      reportedUsername: repName.trim(),
      reason: repReason,
      details: repDetails.trim(),
    });
    setRepDetails('');
    setNotice('Report submitted to WORLD ARENA moderators.');
  };

  return (
    <ModalShell title="Privacy & Fair Play Safety" subtitle="Voice privacy, blocked accounts, and player reporting" onClose={onClose}>
      {notice && (
        <div className="p-3 bg-cyan-950/70 border border-cyan-500/40 rounded-xl text-xs text-cyan-200">
          {notice}
        </div>
      )}

      {profile && (
        <div className="p-4 bg-slate-900/70 border border-slate-800 rounded-xl space-y-3">
          <div className="text-xs font-semibold text-cyan-400 flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5" />
            Communication Privacy
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-300 block mb-1">Who can hear/speak in Voice</label>
              <select
                value={voicePriv}
                onChange={(e) => setVoicePriv(e.target.value as PlayerProfileData['privacyVoice'])}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
              >
                <option value="everyone">Everyone in Match Room</option>
                <option value="team_friends">Team & Friends Only</option>
                <option value="friends_only">Friends Only</option>
                <option value="muted">Voice Disabled</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-300 block mb-1">Room Invitations</label>
              <select
                value={invitePriv}
                onChange={(e) => setInvitePriv(e.target.value as PlayerProfileData['privacyInvites'])}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
              >
                <option value="everyone">Anyone</option>
                <option value="friends_only">Friends Only</option>
                <option value="none">Block All Invites</option>
              </select>
            </div>
          </div>
          <button
            onClick={handleSavePrivacy}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold rounded-lg"
          >
            Save Privacy Settings
          </button>
        </div>
      )}

      <div className="p-4 bg-slate-900/70 border border-slate-800 rounded-xl space-y-2.5">
        <div className="text-xs font-semibold text-slate-200">
          Blocked Players ({blockedFriends.length})
        </div>
        {blockedFriends.length === 0 ? (
          <div className="text-xs text-slate-500">No blocked accounts.</div>
        ) : (
          blockedFriends.map((b) => (
            <div key={b.id} className="flex items-center justify-between text-xs py-1.5 px-2.5 bg-slate-950 rounded-lg">
              <span className="text-slate-200">{b.targetUsername}</span>
              <button
                onClick={() => onUnblock(b.id)}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded"
              >
                Unblock
              </button>
            </div>
          ))
        )}
      </div>

      <form onSubmit={handleReport} className="p-4 bg-slate-900/70 border border-slate-800 rounded-xl space-y-3">
        <div className="text-xs font-semibold text-rose-400 flex items-center gap-1.5">
          <ShieldAlert className="w-3.5 h-3.5" />
          Report Fair-Play or Safety Violation
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            value={repName}
            onChange={(e) => setRepName(e.target.value)}
            placeholder="Player username"
            required
            className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
          />
          <input
            value={repUid}
            onChange={(e) => setRepUid(e.target.value)}
            placeholder="Player UID or ID"
            required
            className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
          />
        </div>
        <select
          value={repReason}
          onChange={(e) => setRepReason(e.target.value as ReportRecord['reason'])}
          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
        >
          <option value="unsportsmanlike">Unsportsmanlike Conduct</option>
          <option value="voice_abuse">Voice or Text Chat Abuse</option>
          <option value="fair_play_violation">Suspected Fair-Play Violation</option>
          <option value="inappropriate_name">Inappropriate Username</option>
          <option value="other">Other</option>
        </select>
        <textarea
          value={repDetails}
          onChange={(e) => setRepDetails(e.target.value)}
          placeholder="Describe what happened..."
          maxLength={500}
          rows={2}
          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
        />
        <button
          type="submit"
          className="px-4 py-2 bg-rose-700 hover:bg-rose-600 text-white text-xs font-semibold rounded-lg"
        >
          Submit Report
        </button>
      </form>
    </ModalShell>
  );
};
