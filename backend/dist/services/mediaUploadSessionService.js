import { randomUUID } from 'node:crypto';
const SESSION_TTL_MS = Number(process.env.MEDIA_UPLOAD_SESSION_TTL_MS ?? '600000');
const MAX_SESSIONS = Number(process.env.MEDIA_UPLOAD_MAX_SESSIONS ?? '1000');
const sessions = new Map();
function normalizeTtl(raw) {
    if (Number.isNaN(raw) || raw < 60_000)
        return 60_000;
    return raw;
}
function purgeExpiredSessions(now) {
    for (const [sessionId, record] of sessions.entries()) {
        if (record.expiresAt <= now)
            sessions.delete(sessionId);
    }
}
function ensureCapacity() {
    if (sessions.size <= MAX_SESSIONS)
        return;
    const sorted = Array.from(sessions.entries()).sort((a, b) => a[1].createdAt - b[1].createdAt);
    const toDelete = sessions.size - MAX_SESSIONS;
    for (let i = 0; i < toDelete; i += 1) {
        const oldest = sorted[i];
        if (oldest) {
            sessions.delete(oldest[0]);
        }
    }
}
export function createUploadSession(agentUserId) {
    const ttlMs = normalizeTtl(SESSION_TTL_MS);
    const now = Date.now();
    purgeExpiredSessions(now);
    ensureCapacity();
    const sessionId = randomUUID();
    sessions.set(sessionId, {
        agentUserId,
        createdAt: now,
        expiresAt: now + ttlMs,
    });
    return sessionId;
}
export function consumeUploadSession(sessionId, agentUserId) {
    const record = sessions.get(sessionId);
    if (!record) {
        return false;
    }
    if (record.agentUserId !== agentUserId) {
        return false;
    }
    const now = Date.now();
    if (record.expiresAt <= now) {
        sessions.delete(sessionId);
        return false;
    }
    sessions.delete(sessionId);
    return true;
}
//# sourceMappingURL=mediaUploadSessionService.js.map