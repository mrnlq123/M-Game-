import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  ADMIN_EMAIL,
  auth,
  db,
  handleFirestoreError,
  OperationType,
} from '../firebase';
import type { GameModeId, MapId, PlayerProfileData, TeamId } from '../game/types';

export interface FriendRecord {
  id: string;
  ownerUid: string;
  targetUid: string;
  targetUsername: string;
  targetPlayerCode?: string;
  status: 'pending' | 'accepted' | 'blocked';
}

export interface LeaderboardRow {
  uid: string;
  username: string;
  country: string;
  rating: number;
  wins: number;
  tagsScored: number;
}

export interface MatchHistoryRow {
  id: string;
  matchId: string;
  uid: string;
  username: string;
  mode: string;
  mapId: string;
  team: TeamId;
  winnerTeam: TeamId | 'draw';
  tags: number;
  taggedCount: number;
  captures: number;
  score: number;
  won: boolean;
  createdAt?: unknown;
}

export interface ReportRecord {
  id: string;
  reporterUid: string;
  reportedUid: string;
  reportedUsername: string;
  reason: 'unsportsmanlike' | 'voice_abuse' | 'fair_play_violation' | 'inappropriate_name' | 'other';
  details: string;
  status: 'open' | 'reviewed' | 'resolved' | 'dismissed';
  reviewedBy?: string;
}

export interface AnnouncementRecord {
  id: string;
  title: string;
  body: string;
  severity: 'info' | 'event' | 'maintenance';
  active: boolean;
  createdBy: string;
}

export interface ArenaConfigRecord {
  enabledMaps: MapId[];
  enabledModes: GameModeId[];
  updatedBy: string;
}

export function generatePlayerCode(uid: string): string {
  const cleaned = uid.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const suffix = (cleaned.slice(0, 6) || 'ARENA1').padEnd(6, 'X');
  return `WA-${suffix}`;
}

export async function ensureUserAccountAndProfile(
  uid: string,
  email: string,
  displayName: string,
  photoUrl?: string | null,
): Promise<{ profile: PlayerProfileData | null; isNewProfile: boolean; accountStatus: 'active' | 'suspended' }> {
  const userRef = doc(db, 'users', uid);
  const profileRef = doc(db, 'profiles', uid);
  let accountStatus: 'active' | 'suspended' = 'active';

  try {
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
      await setDoc(userRef, {
        uid,
        email: email.slice(0, 254),
        role: 'player',
        accountStatus: 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const data = userSnap.data();
      if (data.accountStatus === 'suspended') {
        accountStatus = 'suspended';
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `users/${uid}`);
  }

  try {
    const profileSnap = await getDoc(profileRef);
    if (profileSnap.exists()) {
      const data = profileSnap.data() as PlayerProfileData;
      await updateDoc(profileRef, {
        onlineStatus: 'online',
        updatedAt: serverTimestamp(),
      });
      return { profile: { ...data, onlineStatus: 'online' }, isNewProfile: false, accountStatus };
    }
    const defaultName = (displayName || 'Runner').replace(/[^a-zA-Z0-9_ -]/g, '').slice(0, 20) || 'Runner';
    const starter: PlayerProfileData = {
      uid,
      playerCode: generatePlayerCode(uid),
      username: defaultName,
      avatarColor: '#06B6D4',
      photoUrl: photoUrl ? photoUrl.slice(0, 512) : '',
      country: 'US',
      onlineStatus: 'online',
      wins: 0,
      matchesPlayed: 0,
      tagsScored: 0,
      rating: 1000,
      privacyVoice: 'everyone',
      privacyInvites: 'everyone',
    };
    return { profile: starter, isNewProfile: true, accountStatus };
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `profiles/${uid}`);
  }
}

export async function savePlayerProfile(profile: PlayerProfileData): Promise<void> {
  const uid = profile.uid;
  const profileRef = doc(db, 'profiles', uid);
  const lbRef = doc(db, 'leaderboards', uid);

  const cleanUsername = profile.username.trim().slice(0, 24) || 'Runner';
  const cleanCountry = profile.country.trim().toUpperCase().slice(0, 4) || 'US';

  try {
    const existing = await getDoc(profileRef);
    const payload = {
      uid,
      playerCode: profile.playerCode.slice(0, 16),
      username: cleanUsername,
      avatarColor: (profile.avatarColor || '#06B6D4').slice(0, 16),
      photoUrl: (profile.photoUrl || '').slice(0, 512),
      country: cleanCountry,
      onlineStatus: profile.onlineStatus,
      wins: Math.max(0, Math.floor(profile.wins)),
      matchesPlayed: Math.max(0, Math.floor(profile.matchesPlayed)),
      tagsScored: Math.max(0, Math.floor(profile.tagsScored)),
      rating: Math.max(0, Math.floor(profile.rating)),
      privacyVoice: profile.privacyVoice,
      privacyInvites: profile.privacyInvites,
      updatedAt: serverTimestamp(),
    };

    if (existing.exists()) {
      await updateDoc(profileRef, payload);
    } else {
      await setDoc(profileRef, payload);
    }

    const lbPayload = {
      uid,
      username: cleanUsername,
      country: cleanCountry,
      rating: payload.rating,
      wins: payload.wins,
      tagsScored: payload.tagsScored,
      updatedAt: serverTimestamp(),
    };
    const lbExisting = await getDoc(lbRef);
    if (lbExisting.exists()) {
      await updateDoc(lbRef, lbPayload);
    } else {
      await setDoc(lbRef, lbPayload);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `profiles/${uid}`);
  }
}

export async function setOnlineStatus(uid: string, onlineStatus: 'online' | 'in_match' | 'offline'): Promise<void> {
  if (!auth.currentUser) return;
  const profileRef = doc(db, 'profiles', uid);
  try {
    const snap = await getDoc(profileRef);
    if (snap.exists()) {
      await updateDoc(profileRef, {
        onlineStatus,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `profiles/${uid}`);
  }
}

export async function recordMatchResultAndStats(
  profile: PlayerProfileData,
  result: {
    matchId: string;
    mode: GameModeId;
    mapId: MapId;
    team: TeamId;
    winnerTeam: TeamId | 'draw';
    tags: number;
    taggedCount: number;
    captures: number;
    score: number;
    won: boolean;
  },
): Promise<PlayerProfileData> {
  const safeMatchId = result.matchId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || `m_${Date.now()}`;
  const docId = `${safeMatchId}_${profile.uid}`.slice(0, 120);
  const resultRef = doc(db, 'match_results', docId);

  try {
    await setDoc(resultRef, {
      matchId: safeMatchId,
      uid: profile.uid,
      username: profile.username.slice(0, 24),
      mode: result.mode,
      mapId: result.mapId,
      team: result.team,
      winnerTeam: result.winnerTeam,
      tags: Math.max(0, Math.floor(result.tags)),
      taggedCount: Math.max(0, Math.floor(result.taggedCount)),
      captures: Math.max(0, Math.floor(result.captures)),
      score: Math.max(0, Math.floor(result.score)),
      won: result.won,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `match_results/${docId}`);
  }

  const ratingDelta = result.won ? 24 : result.winnerTeam === 'draw' ? 4 : -12;
  const updated: PlayerProfileData = {
    ...profile,
    wins: profile.wins + (result.won ? 1 : 0),
    matchesPlayed: profile.matchesPlayed + 1,
    tagsScored: profile.tagsScored + result.tags,
    rating: Math.max(100, profile.rating + ratingDelta),
    onlineStatus: 'online',
  };
  await savePlayerProfile(updated);
  return updated;
}

export async function fetchLeaderboard(countryFilter?: string): Promise<LeaderboardRow[]> {
  try {
    const q = query(collection(db, 'leaderboards'), orderBy('rating', 'desc'), limit(50));
    const snap = await getDocs(q);
    const rows: LeaderboardRow[] = snap.docs.map((d) => d.data() as LeaderboardRow);
    if (countryFilter && countryFilter !== 'ALL') {
      return rows.filter((r) => r.country === countryFilter);
    }
    return rows;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'leaderboards');
  }
}

export async function fetchMatchHistory(uid: string): Promise<MatchHistoryRow[]> {
  try {
    const q = query(
      collection(db, 'match_results'),
      where('uid', '==', uid),
      orderBy('createdAt', 'desc'),
      limit(30),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MatchHistoryRow, 'id'>) }));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'match_results');
  }
}

export async function findPlayerByCodeOrUsername(search: string): Promise<PlayerProfileData[]> {
  const term = search.trim();
  if (!term) return [];
  try {
    const snap = await getDocs(query(collection(db, 'profiles'), limit(50)));
    const lower = term.toLowerCase();
    return snap.docs
      .map((d) => d.data() as PlayerProfileData)
      .filter(
        (p) =>
          p.playerCode.toLowerCase() === lower ||
          p.username.toLowerCase().includes(lower),
      )
      .slice(0, 10);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'profiles');
  }
}

export function subscribeToFriends(
  uid: string,
  onChange: (records: FriendRecord[]) => void,
): Unsubscribe {
  const q1 = query(collection(db, 'friends'), where('ownerUid', '==', uid));
  const q2 = query(collection(db, 'friends'), where('targetUid', '==', uid));
  let own: FriendRecord[] = [];
  let incoming: FriendRecord[] = [];

  const emit = () => {
    const merged = new Map<string, FriendRecord>();
    [...own, ...incoming].forEach((r) => merged.set(r.id, r));
    onChange(Array.from(merged.values()));
  };

  const u1 = onSnapshot(
    q1,
    (snap) => {
      own = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FriendRecord, 'id'>) }));
      emit();
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'friends'),
  );
  const u2 = onSnapshot(
    q2,
    (snap) => {
      incoming = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FriendRecord, 'id'>) }));
      emit();
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'friends'),
  );
  return () => {
    u1();
    u2();
  };
}

export async function sendFriendOrBlockAction(
  ownerUid: string,
  target: { uid: string; username: string; playerCode?: string },
  status: 'pending' | 'blocked',
): Promise<void> {
  const friendshipId = `${ownerUid}_${target.uid}`.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 120);
  const ref = doc(db, 'friends', friendshipId);
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, {
        status,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        ownerUid,
        targetUid: target.uid,
        targetUsername: target.username.slice(0, 24),
        targetPlayerCode: (target.playerCode || '').slice(0, 16),
        status,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `friends/${friendshipId}`);
  }
}

export async function updateFriendshipStatus(
  friendshipId: string,
  status: 'accepted' | 'blocked',
): Promise<void> {
  try {
    await updateDoc(doc(db, 'friends', friendshipId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `friends/${friendshipId}`);
  }
}

export async function removeFriendship(friendshipId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'friends', friendshipId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `friends/${friendshipId}`);
  }
}

export async function submitPlayerReport(input: {
  reporterUid: string;
  reportedUid: string;
  reportedUsername: string;
  reason: ReportRecord['reason'];
  details: string;
}): Promise<void> {
  const reportId = `rep_${Date.now()}_${input.reporterUid.slice(0, 8)}`.replace(/[^a-zA-Z0-9_-]/g, '');
  try {
    await setDoc(doc(db, 'reports', reportId), {
      reporterUid: input.reporterUid,
      reportedUid: input.reportedUid,
      reportedUsername: input.reportedUsername.slice(0, 24),
      reason: input.reason,
      details: input.details.slice(0, 500),
      status: 'open',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `reports/${reportId}`);
  }
}

export async function syncRoomMetadata(room: {
  roomId: string;
  roomCode: string;
  hostUid: string;
  hostName: string;
  mode: 'solo_vs' | 'duo_battle' | 'squad_battle' | 'team_arena';
  mapId: MapId;
  region: string;
  isPrivate: boolean;
  status: 'waiting' | 'in_progress' | 'closed';
  playerCount: number;
  maxPlayers: number;
}): Promise<void> {
  if (!auth.currentUser || auth.currentUser.uid !== room.hostUid) return;
  const safeId = room.roomId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  const ref = doc(db, 'rooms', safeId);
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, {
        mode: room.mode,
        mapId: room.mapId,
        status: room.status,
        playerCount: room.playerCount,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        roomId: safeId,
        roomCode: room.roomCode.slice(0, 12),
        hostUid: room.hostUid,
        hostName: room.hostName.slice(0, 24),
        mode: room.mode,
        mapId: room.mapId,
        region: room.region.slice(0, 24),
        isPrivate: room.isPrivate,
        status: room.status,
        playerCount: room.playerCount,
        maxPlayers: room.maxPlayers,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `rooms/${safeId}`);
  }
}

export function subscribeToAnnouncements(onChange: (items: AnnouncementRecord[]) => void): Unsubscribe {
  const q = query(collection(db, 'announcements'), where('active', '==', true), limit(10));
  return onSnapshot(
    q,
    (snap) => {
      onChange(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AnnouncementRecord, 'id'>) })));
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'announcements'),
  );
}

export async function fetchArenaConfig(): Promise<ArenaConfigRecord | null> {
  try {
    const snap = await getDoc(doc(db, 'game_config', 'global'));
    if (!snap.exists()) return null;
    return snap.data() as ArenaConfigRecord;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, 'game_config/global');
  }
}

// --- Admin Operations (verified by Firestore rules against mrnlqofficial@gmail.com / admins collection) ---
export function isCurrentUserAdmin(): boolean {
  const u = auth.currentUser;
  return Boolean(u && u.emailVerified && u.email === ADMIN_EMAIL);
}

export async function adminFetchReports(): Promise<ReportRecord[]> {
  try {
    const snap = await getDocs(query(collection(db, 'reports'), orderBy('createdAt', 'desc'), limit(50)));
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ReportRecord, 'id'>) }));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'reports');
  }
}

export async function adminUpdateReportStatus(
  reportId: string,
  status: ReportRecord['status'],
  reviewerUid: string,
): Promise<void> {
  try {
    await updateDoc(doc(db, 'reports', reportId), {
      status,
      reviewedBy: reviewerUid,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `reports/${reportId}`);
  }
}

export async function adminSuspendUser(
  targetUid: string,
  suspend: boolean,
  reason: string,
): Promise<void> {
  try {
    await updateDoc(doc(db, 'users', targetUid), {
      accountStatus: suspend ? 'suspended' : 'active',
      suspendedUntil: suspend ? Date.now() + 7 * 24 * 60 * 60 * 1000 : 0,
      suspensionReason: reason.slice(0, 300),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${targetUid}`);
  }
}

export async function adminPublishAnnouncement(input: {
  title: string;
  body: string;
  severity: AnnouncementRecord['severity'];
  createdBy: string;
}): Promise<void> {
  const id = `ann_${Date.now()}`;
  try {
    await setDoc(doc(db, 'announcements', id), {
      title: input.title.slice(0, 80),
      body: input.body.slice(0, 400),
      severity: input.severity,
      active: true,
      createdBy: input.createdBy,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `announcements/${id}`);
  }
}

export async function adminToggleAnnouncement(id: string, active: boolean): Promise<void> {
  try {
    await updateDoc(doc(db, 'announcements', id), {
      active,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `announcements/${id}`);
  }
}

export async function adminSaveArenaConfig(config: ArenaConfigRecord): Promise<void> {
  try {
    await setDoc(doc(db, 'game_config', 'global'), {
      enabledMaps: config.enabledMaps,
      enabledModes: config.enabledModes,
      updatedBy: config.updatedBy,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'game_config/global');
  }
}

export async function adminFetchProfiles(): Promise<PlayerProfileData[]> {
  try {
    const snap = await getDocs(query(collection(db, 'profiles'), limit(50)));
    return snap.docs.map((d) => d.data() as PlayerProfileData);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'profiles');
  }
}
