# WORLD ARENA Firestore Security Spec (Phase 0)

## 1. Data Invariants
1. `users/{userId}` contains PII (`email`) and RBAC/moderation fields (`role`, `accountStatus`, `suspendedUntil`). Only the account owner (`request.auth.uid == userId`) or a verified Admin may read `users/{userId}`. Non-admins cannot self-assign `role: "admin"` or clear `accountStatus: "suspended"`.
2. `profiles/{userId}` and `leaderboards/{userId}` never store email or private credentials. Only the owner or an Admin may create/update their profile, with strict string length bounds and immutable `uid`.
3. `friends/{friendshipId}` records are strictly scoped to `ownerUid == request.auth.uid` or `targetUid == request.auth.uid`.
4. `rooms/{roomId}` can only be created with `hostUid == request.auth.uid`, and closed/terminal rooms (`status == "closed"`) cannot be re-opened by non-admins.
5. `matchmaking/{ticketId}` is strictly owned by `uid == request.auth.uid`.
6. `matches/{matchId}` and `match_results/{resultId}` cannot be forged for another user; `match_results` enforces `uid == request.auth.uid` and `matches` enforces `hostUid == request.auth.uid` and terminal lock once `status == "completed"`.
7. `reports/{reportId}` can be created by a verified signed-in user with `reporterUid == request.auth.uid` and initial `status == "open"`, and only Admins may read the full report queue or update review status.
8. `announcements/{announcementId}` and `game_config/{configId}` are readable by signed-in users and writable ONLY by verified Admins.

## 2. The "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)
1. **Privilege Escalation on Create (`users`)**: `{ "uid": "u1", "email": "u1@x.com", "role": "admin", "accountStatus": "active", "createdAt": "<ts>", "updatedAt": "<ts>" }` -> Denied (non-admin cannot create `role: "admin"`).
2. **Suspension Bypass Update (`users`)**: `{ "accountStatus": "active" }` by suspended non-admin -> Denied (`accountStatus` immutable to non-admins).
3. **Shadow Ghost Field (`profiles`)**: `{ ..., "isVerified": true }` -> Denied (`keys().hasOnly(...)` rejects unknown fields).
4. **PII Blanket Read (`users`)**: User B calls `get(/users/userA)` -> Denied (non-owner, non-admin).
5. **Email Spoofing Admin Bypass**: Token with `email: "mrnlqofficial@gmail.com"` and `email_verified: false` -> Denied (`email_verified == true` required).
6. **ID Poisoning (`profiles`)**: Document ID of 200 chars or containing `$` / `.` -> Denied (`isValidId()` rejects).
7. **Resource Exhaustion String (`reports`)**: `details` string of 5000 chars -> Denied (`details.size() <= 500`).
8. **Identity Spoofing (`matchmaking`)**: User A creates ticket with `uid: "userB"` -> Denied (`incoming().uid == request.auth.uid`).
9. **Terminal State Mutation (`matches`)**: Update `blueScore` after `status == "completed"` -> Denied (terminal lock).
10. **Unauthorized Report Snooping (`reports`)**: Non-admin calls `list(/reports)` -> Denied (only reporter's own or admin).
11. **Timestamp Forgery (`users`)**: `createdAt: "2020-01-01T00:00:00Z"` -> Denied (`incoming().createdAt == request.time`).
12. **Non-Admin Announcement Write (`announcements`)**: Player creates/updates global announcement -> Denied (`isAdmin()` required).
