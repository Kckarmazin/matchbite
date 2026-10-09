/**
 * Server-Sent Events (SSE) Connection Hub
 * Manages real-time event streaming per room with auto-cleanup and heartbeat support.
 */
export class Broadcaster {
  constructor() {
    // Map of roomCode -> Set of { participantId, res, createdAt }
    this.rooms = new Map();
  }

  /**
   * Registers a new SSE client for a room.
   * @param {string} roomCode - Normalized room code
   * @param {string} participantId - Unique participant identifier
   * @param {object} req - Express request object
   * @param {object} res - Express response object
   */
  addClient(roomCode, participantId, req, res) {
    const code = roomCode.toUpperCase();

    // Set SSE HTTP response headers
    if (typeof res.writeHead === 'function') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
    }

    // Send initial keep-alive comment safely
    try {
      if (typeof res.write === 'function') {
        res.write(`: connected at ${new Date().toISOString()}\n\n`);
      }
    } catch {
      // Ignore initial write failure on pre-closed socket
    }

    if (!this.rooms.has(code)) {
      this.rooms.set(code, new Set());
    }

    const client = {
      participantId,
      res,
      createdAt: Date.now(),
    };

    this.rooms.get(code).add(client);

    // Clean up when client disconnects
    const cleanup = () => {
      const clients = this.rooms.get(code);
      if (clients) {
        clients.delete(client);
        if (clients.size === 0) {
          this.rooms.delete(code);
        }
      }
    };

    if (req && typeof req.on === 'function') {
      req.on('close', cleanup);
    }
    if (res && typeof res.on === 'function') {
      res.on('close', cleanup);
      res.on('finish', cleanup);
    }

    return client;
  }

  /**
   * Sends an SSE event to all connected clients in a room.
   * @param {string} roomCode - Room code
   * @param {string} eventName - Name of the event (e.g. 'participant:joined')
   * @param {object} data - Payload data
   */
  broadcast(roomCode, eventName, data) {
    const code = roomCode.toUpperCase();
    const clients = this.rooms.get(code);
    if (!clients || clients.size === 0) return 0;

    const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
    let delivered = 0;

    for (const client of clients) {
      try {
        client.res.write(payload);
        delivered++;
      } catch (err) {
        // Client write failed; remove stale connection
        clients.delete(client);
      }
    }

    return delivered;
  }

  /**
   * Sends a targeted SSE event to a specific participant in a room.
   */
  sendTo(roomCode, participantId, eventName, data) {
    const code = roomCode.toUpperCase();
    const clients = this.rooms.get(code);
    if (!clients) return false;

    const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of clients) {
      if (client.participantId === participantId) {
        try {
          client.res.write(payload);
          return true;
        } catch {
          clients.delete(client);
          return false;
        }
      }
    }
    return false;
  }

  /**
   * Sends a heartbeat ping comment to keep mobile connections alive.
   */
  sendHeartbeat(roomCode) {
    const code = roomCode.toUpperCase();
    const clients = this.rooms.get(code);
    if (!clients) return;

    const comment = `: heartbeat ${new Date().toISOString()}\n\n`;
    for (const client of clients) {
      try {
        client.res.write(comment);
      } catch {
        clients.delete(client);
      }
    }
  }

  /**
   * Returns count of active SSE connections for a room.
   */
  getClientCount(roomCode) {
    const clients = this.rooms.get(roomCode.toUpperCase());
    return clients ? clients.size : 0;
  }

  /**
   * Closes all active connections for a room (e.g. upon room closure/deletion).
   */
  closeRoom(roomCode) {
    const code = roomCode.toUpperCase();
    const clients = this.rooms.get(code);
    if (clients) {
      for (const client of clients) {
        try {
          client.res.write(`event: room:closed\ndata: {}\n\n`);
          client.res.end();
        } catch {
          // ignore error on close
        }
      }
      this.rooms.delete(code);
    }
  }
}

export const globalBroadcaster = new Broadcaster();
