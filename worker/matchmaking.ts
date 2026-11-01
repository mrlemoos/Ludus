import { DurableObject } from 'cloudflare:workers';
import type { Control } from '../shared/game';
import { RATED_ENABLED } from '../shared/human-game';
import { canAcceptAI, matchingOpponent, type Assignment, type QueueEntry, type QueueState } from '../shared/matchmaking';
type Invite = { owner: string; control: Control; expiresAt: number; redeemedBy?: string; match?: Assignment };
type Colour = 'w' | 'b' | 'random';
export class Matchmaking extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) { super(ctx, env); ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS players (user_id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS invites (token TEXT PRIMARY KEY, data TEXT NOT NULL)'); }
  private state(user: string): QueueState { const row = this.ctx.storage.sql.exec<{ data: string }>('SELECT data FROM players WHERE user_id=?', user).toArray()[0]; return row ? JSON.parse(row.data) : { status: 'idle' }; }
  private save(user: string, state: QueueState) { this.ctx.storage.sql.exec('INSERT INTO players VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data', user, JSON.stringify(state)); }
  private push(user: string, state: QueueState) { const payload = JSON.stringify(state); for (const socket of this.ctx.getWebSockets(user)) { try { socket.send(payload); } catch { socket.close(1011, 'Reconnect'); } } }
  private inviteRow(token: string) { return this.ctx.storage.sql.exec<{ data: string }>('SELECT data FROM invites WHERE token=?', token).toArray()[0]; }
  private pushAssigned(state: Extract<QueueState, { status: 'assigned' }>) { this.push(state.match.players.w, state); this.push(state.match.players.b, state); }
  private async ensure(match: Assignment) { await this.env.HUMAN_MATCHES.getByName(match.id).initialise(match); return { status: 'assigned' as const, match }; }
  async status(user: string) {
    const state = this.state(user);
    if (state.status === 'assigned') return this.ensure(state.match);
    if (state.status === 'invited' && (state.expiresAt <= Date.now() || !this.inviteRow(state.token))) { const idle = { status: 'idle' as const }; this.save(user, idle); this.push(user, idle); return idle; }
    if (state.status === 'queued') { const next = await this.place(user, state.entry.control, state.entry.rated, state.entry.rating); if (next.status === 'assigned') this.pushAssigned(next); return next; }
    return state;
  }
  async join(user: string, control: Control, rated: boolean, rating: number) {
    const next = await this.place(user, control, rated, rating);
    if (next.status === 'assigned') this.pushAssigned(next); else this.push(user, next);
    return next;
  }
  private async place(user: string, control: Control, rated: boolean, rating: number): Promise<QueueState> {
    if (!['5+3', '10+5'].includes(control) || typeof rated !== 'boolean' || !Number.isFinite(rating)) throw new Error('invalid_queue');
    if (rated && !RATED_ENABLED) throw new Error('rated_unavailable');
    const state = this.state(user), now = Date.now();
    if (state.status === 'assigned') return this.ensure(state.match);
    if (state.status === 'computer') throw new Error('computer_active');
    if (state.status === 'invited' && state.expiresAt > now) throw new Error('invite_active');
    const entry: QueueEntry = state.status === 'queued' ? state.entry : { user, control, rated, rating, joinedAt: now, token: crypto.randomUUID() };
    const entries = this.ctx.storage.sql.exec<{ data: string }>('SELECT data FROM players').toArray().map((row) => JSON.parse(row.data) as QueueState).flatMap((row) => row.status === 'queued' ? [row.entry] : []);
    const opponent = matchingOpponent(entry, entries, now);
    if (!opponent) { const next = { status: 'queued' as const, entry }; this.save(user, next); return next; }
    const match: Assignment = { id: crypto.randomUUID(), players: { w: opponent.user, b: user }, control: entry.control, rated: entry.rated, createdAt: now };
    const assigned = { status: 'assigned' as const, match };
    // Reserve both players before external RPC. Retried status repairs interrupted initialisation.
    this.save(user, assigned); this.save(opponent.user, assigned);
    return this.ensure(match);
  }
  async cancel(user: string, token: string, ai = false) {
    const state = this.state(user);
    if (state.status === 'assigned') { const ready = await this.ensure(state.match); this.pushAssigned(ready); return ready; }
    if (state.status !== 'queued' || state.entry.token !== token) throw new Error('stale_queue');
    if (ai && !canAcceptAI(state.entry, token, Date.now())) throw new Error('too_early');
    const idle = { status: 'idle' as const }; this.save(user, idle); this.push(user, idle); return { ...idle, aiAccepted: ai };
  }
  async createInvite(user: string, control: Control) {
    if (!['5+3', '10+5'].includes(control)) throw new Error('invalid_invite');
    const state = this.state(user);
    if (state.status === 'assigned' || state.status === 'queued' || state.status === 'computer') throw new Error('busy');
    if (state.status === 'invited' && state.expiresAt > Date.now() && this.inviteRow(state.token)) { this.push(user, state); return { token: state.token, expiresAt: state.expiresAt }; }
    const token = crypto.randomUUID(), expiresAt = Date.now() + 86_400_000, invite: Invite = { owner: user, control, expiresAt };
    this.ctx.storage.sql.exec('INSERT INTO invites VALUES (?,?)', token, JSON.stringify(invite));
    const next = { status: 'invited' as const, token, expiresAt }; this.save(user, next); this.push(user, next); return { token, expiresAt };
  }
  async revokeInvite(user: string, token: string) {
    const state = this.state(user); if (state.status !== 'invited' || state.token !== token) throw new Error('stale_invite');
    this.ctx.storage.sql.exec('DELETE FROM invites WHERE token=?', token);
    const idle = { status: 'idle' as const }; this.save(user, idle); this.push(user, idle); return idle;
  }
  async redeem(user: string, token: string, colour: Colour) {
    const row = this.ctx.storage.sql.exec<{ data: string }>('SELECT data FROM invites WHERE token=?', token).toArray()[0];
    if (!row) throw new Error('not_found');
    const invite: Invite = JSON.parse(row.data);
    if (invite.match) { if (![invite.owner, invite.redeemedBy].includes(user)) throw new Error('redeemed'); const ready = await this.ensure(invite.match); this.pushAssigned(ready); return ready; }
    if (!['w', 'b', 'random'].includes(colour) || invite.expiresAt <= Date.now() || invite.owner === user) throw new Error('invalid_invite');
    const ownerState = this.state(invite.owner), joinerState = this.state(user);
    if (ownerState.status !== 'invited' || ownerState.token !== token || joinerState.status === 'computer' || joinerState.status === 'assigned' || joinerState.status === 'queued' || joinerState.status === 'invited') throw new Error('busy');
    const guestWhite = colour === 'w' || (colour === 'random' && crypto.getRandomValues(new Uint8Array(1))[0] < 128);
    const match: Assignment = { id: crypto.randomUUID(), players: guestWhite ? { w: user, b: invite.owner } : { w: invite.owner, b: user }, control: invite.control, rated: false, createdAt: Date.now() };
    invite.match = match; invite.redeemedBy = user;
    this.ctx.storage.sql.exec('UPDATE invites SET data=? WHERE token=?', JSON.stringify(invite), token);
    const assigned = { status: 'assigned' as const, match }; this.save(user, assigned); this.save(invite.owner, assigned);
    const ready = await this.ensure(match); this.pushAssigned(ready); return ready;
  }
  async release(matchId: string, users: string[]) { for (const user of users) { const state = this.state(user); if (state.status === 'assigned' && state.match.id === matchId) { const idle = { status: 'idle' as const }; this.save(user, idle); this.push(user, idle); } } }
  async reserveComputer(user: string, id: string) {
    const state = this.state(user);
    if (state.status === 'computer' && state.id === id) { this.push(user, state); return { reserved: true }; }
    if (state.status !== 'idle' && !(state.status === 'invited' && state.expiresAt <= Date.now())) throw new Error('busy');
    const next = { status: 'computer' as const, id }; this.save(user, next); this.push(user, next); return { reserved: true };
  }
  async releaseComputer(user: string, id: string) { const state = this.state(user); if (state.status === 'computer' && state.id === id) { const idle = { status: 'idle' as const }; this.save(user, idle); this.push(user, idle); } }
  async removeUser(user: string) { const current = this.state(user); if (current.status === 'assigned') await this.release(current.match.id, Object.values(current.match.players)); this.ctx.storage.sql.exec('DELETE FROM players WHERE user_id=?', user); const rows = this.ctx.storage.sql.exec<{ token: string; data: string }>('SELECT token,data FROM invites').toArray(); for (const row of rows) { const invite: Invite = JSON.parse(row.data); if (invite.owner === user || invite.redeemedBy === user) this.ctx.storage.sql.exec('DELETE FROM invites WHERE token=?', row.token); } }
  async webSocketClose() {}
  async webSocketError() {}
  async fetch(request: Request) {
    const user = request.headers.get('X-Player');
    if (!user) return new Response(null, { status: 404 });
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response(null, { status: 426 });
    const state = await this.status(user);
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1], [user]); pair[1].serializeAttachment({ user });
    try { pair[1].send(JSON.stringify(state)); } catch { pair[1].close(1011, 'Reconnect'); }
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
}
