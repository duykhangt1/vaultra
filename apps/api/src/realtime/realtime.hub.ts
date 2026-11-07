import { Injectable, Logger } from '@nestjs/common';
import type { Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { config } from '../common/config';
import { hmac, safeEqual, unref } from '../common/util';

/**
 * Realtime hub (spec §8.4.5, FR-X08). Locally a ws server on /v1/realtime; in production the same
 * protocol is served by a Durable Object per facility/user. Clients authenticate with a 60-second
 * ticket from POST /v1/auth/realtime-ticket. Payloads carry only ids + status (spec §18.6).
 */
@Injectable()
export class RealtimeHub {
  private readonly logger = new Logger('Realtime');
  private users = new Map<string, Set<WebSocket>>();
  private facilities = new Map<string, Set<WebSocket>>();

  issueTicket(userPublicId: string, facilityPublicIds: string[]) {
    const payload = Buffer.from(JSON.stringify({ u: userPublicId, f: facilityPublicIds, exp: Date.now() + 60000 })).toString('base64url');
    return `${payload}.${hmac(config.serviceTokenSecret + ':rt', payload)}`;
  }

  /** Returns the ticket's user/facilities when the signature is valid and the ticket is not older than 60 s, else null. */
  verifyTicket(ticket: string): { u: string; f: string[] } | null {
    const [payload, sig] = String(ticket ?? '').split('.');
    if (!payload || !sig || !safeEqual(sig, hmac(config.serviceTokenSecret + ':rt', payload))) return null;
    try {
      const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { u: string; f: string[]; exp: number };
      return data.exp >= Date.now() ? { u: data.u, f: data.f } : null;
    } catch {
      return null;
    }
  }

  attach(server: Server) {
    const wss = new WebSocketServer({ noServer: true });
    server.on('upgrade', (req, socket, head) => {
      const url = new URL(req.url ?? '', 'http://x');
      if (url.pathname !== '/v1/realtime') return;
      const ticket = url.searchParams.get('ticket') ?? '';
      const [payload, sig] = ticket.split('.');
      if (!payload || !sig || !safeEqual(sig, hmac(config.serviceTokenSecret + ':rt', payload))) {
        socket.destroy();
        return;
      }
      const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { u: string; f: string[]; exp: number };
      if (data.exp < Date.now()) {
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        this.join(this.users, data.u, ws);
        for (const f of data.f) this.join(this.facilities, f, ws);
        ws.on('close', () => {
          this.leave(this.users, data.u, ws);
          for (const f of data.f) this.leave(this.facilities, f, ws);
        });
        ws.send(JSON.stringify({ type: 'hello', at: new Date().toISOString() }));
      });
    });
    unref(setInterval(() => {
      for (const set of this.users.values()) for (const ws of set) if (ws.readyState === ws.OPEN) ws.ping();
    }, 30000));
    this.logger.log('WebSocket hub ready at /v1/realtime');
  }

  toUser(userPublicId: string, event: object) {
    this.send(this.users.get(userPublicId), event);
  }
  toFacility(facilityPublicId: string, event: object) {
    this.send(this.facilities.get(facilityPublicId), event);
  }
  /** Force-logout open tabs when a session/role is revoked (spec §5.1, §12.6). */
  revokeUser(userPublicId: string) {
    this.send(this.users.get(userPublicId), { type: 'session.revoked' });
  }

  /** Broadcasts an event to all connected WebSocket clients across all users/computers. */
  broadcastAll(event: object) {
    const msg = JSON.stringify(event);
    for (const set of this.users.values()) {
      for (const ws of set) {
        if (ws.readyState === ws.OPEN) ws.send(msg);
      }
    }
  }

  private send(set: Set<WebSocket> | undefined, event: object) {
    if (!set) return;
    const msg = JSON.stringify(event);
    for (const ws of set) if (ws.readyState === ws.OPEN) ws.send(msg);
  }
  private join(map: Map<string, Set<WebSocket>>, key: string, ws: WebSocket) {
    if (!map.has(key)) map.set(key, new Set());
    map.get(key)!.add(ws);
  }
  private leave(map: Map<string, Set<WebSocket>>, key: string, ws: WebSocket) {
    map.get(key)?.delete(ws);
  }
}
