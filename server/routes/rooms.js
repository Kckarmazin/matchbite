import { Router } from 'express';
import { globalRoomStore } from '../models/RoomStore.js';
import { globalBroadcaster } from '../sync/Broadcaster.js';
import { normalizeRoomCode, isValidRoomCode } from '../models/RoomCode.js';
import { globalPlacesService } from '../services/PlacesService.js';

export function extractAuthTokens(req) {
  const headerToken =
    req.headers['x-session-token'] ||
    req.headers['x-participant-secret'] ||
    (req.headers['authorization']?.startsWith('Bearer ')
      ? req.headers['authorization'].slice(7).trim()
      : null);

  const headerHostKey =
    req.headers['x-host-key'] ||
    req.headers['x-host-secret'];

  const sessionToken =
    headerToken ||
    req.body?.sessionToken ||
    req.body?.participantSecret ||
    req.query?.sessionToken ||
    req.query?.participantSecret ||
    null;

  const hostKey =
    headerHostKey ||
    req.body?.hostKey ||
    req.body?.hostSecret ||
    null;

  const participantId =
    req.body?.participantId ||
    req.query?.participantId ||
    null;

  return { sessionToken, hostKey, participantId };
}

export function createRoomsRouter(roomStore = globalRoomStore, broadcaster = globalBroadcaster) {
  const router = Router();

  /**
   * POST /api/rooms
   * Creates a new decision session.
   */
  router.post('/', async (req, res) => {
    try {
      const {
        hostName,
        hostAvatar,
        hostId,
        groupType,
        activityCategory,
        cuisinePreferences,
        priceRange,
        distance,
        deckSize,
        dietaryFilters,
        tieBreakerType,
        locationName,
        lat,
        lng,
      } = req.body || {};

      if (!hostName || typeof hostName !== 'string' || !hostName.trim()) {
        return res.status(400).json({
          success: false,
          error: 'hostName is required',
        });
      }

      let finalLat = lat != null ? Number(lat) : null;
      let finalLng = lng != null ? Number(lng) : null;

      if ((finalLat == null || finalLng == null) && locationName && globalPlacesService) {
        try {
          const resolved = await globalPlacesService.resolveLocationCoordinatesAsync(locationName);
          if (resolved) {
            finalLat = resolved.lat;
            finalLng = resolved.lng;
          }
        } catch {
          // ignore
        }
      }

      const { room, participant, sessionToken, hostKey } = roomStore.createRoom({
        hostName,
        hostAvatar,
        hostId,
        groupType,
        activityCategory,
        cuisinePreferences,
        priceRange,
        distance,
        deckSize,
        dietaryFilters,
        tieBreakerType,
        locationName,
        lat: finalLat,
        lng: finalLng,
      });

      const protocol = req.protocol || 'http';
      const host = req.get('host') || 'localhost:3000';
      const joinUrl = `${protocol}://${host}/?room=${room.code}`;

      return res.status(201).json({
        success: true,
        room: roomStore.getPublicRoom(room.code),
        participant: {
          id: participant.id,
          name: participant.name,
          avatar: participant.avatar,
          isHost: true,
        },
        sessionToken,
        hostKey,
        joinUrl,
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({
        success: false,
        error: err.message || 'Internal Server Error',
      });
    }
  });

  /**
   * GET /api/rooms/:code
   * Retrieves public room state and participant roster.
   */
  router.get('/:code', (req, res) => {
    const rawCode = req.params.code;
    const code = normalizeRoomCode(rawCode);

    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Invalid room code format',
      });
    }

    const room = roomStore.getPublicRoom(code);
    if (!room) {
      return res.status(404).json({
        success: false,
        error: `Room ${code} not found or has expired`,
      });
    }

    return res.status(200).json({
      success: true,
      room,
    });
  });

  /**
   * POST /api/rooms/:code/join
   * Joins an existing room with name & avatar.
   */
  router.post('/:code/join', (req, res) => {
    const rawCode = req.params.code;
    const code = normalizeRoomCode(rawCode);
    const { sessionToken } = extractAuthTokens(req);
    const { participantId, name, avatar } = req.body || {};

    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Invalid room code format',
      });
    }

    try {
      const { room, participant, sessionToken: returnedToken, isNew } = roomStore.joinRoom(code, {
        participantId,
        sessionToken,
        name,
        avatar,
      });

      const publicRoom = roomStore.getPublicRoom(code);

      // Notify other participants via SSE if newly joined
      if (isNew) {
        broadcaster.broadcast(code, 'participant:joined', {
          participant: {
            id: participant.id,
            name: participant.name,
            avatar: participant.avatar,
            isHost: participant.isHost,
            status: participant.status,
            swipedCount: participant.swipedCount,
            totalCards: participant.totalCards,
          },
          totalParticipants: publicRoom.participantCount,
        });
      }

      return res.status(200).json({
        success: true,
        room: publicRoom,
        participant: {
          id: participant.id,
          name: participant.name,
          avatar: participant.avatar,
          isHost: participant.isHost,
        },
        sessionToken: returnedToken,
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({
        success: false,
        error: err.message || 'Failed to join room',
      });
    }
  });

  /**
   * PATCH /api/rooms/:code/settings
   * Updates activity settings (Host only).
   */
  router.patch('/:code/settings', async (req, res) => {
    const rawCode = req.params.code;
    const code = normalizeRoomCode(rawCode);
    const { sessionToken, hostKey, participantId } = extractAuthTokens(req);
    const { settings } = req.body || {};

    if (!participantId && !hostKey && !sessionToken) {
      return res.status(400).json({
        success: false,
        error: 'participantId is required to verify host permissions',
      });
    }

    try {
      if (settings && settings.locationName && (settings.lat == null || settings.lng == null)) {
        if (globalPlacesService && typeof globalPlacesService.resolveLocationCoordinatesAsync === 'function') {
          try {
            const coords = await globalPlacesService.resolveLocationCoordinatesAsync(settings.locationName);
            if (coords) {
              settings.lat = coords.lat;
              settings.lng = coords.lng;
            }
          } catch {
            // async geocoding failure ignored
          }
        }
      }

      const updatedSettings = roomStore.updateSettings(
        code,
        { participantId, sessionToken, hostKey },
        settings
      );

      const room = roomStore.getRoom(code);
      const deck = room ? room.deck : [];

      // Broadcast settings update and deck update to all room participants
      broadcaster.broadcast(code, 'settings:updated', {
        settings: updatedSettings,
      });

      broadcaster.broadcast(code, 'deck:updated', {
        deck,
        settings: updatedSettings,
      });

      return res.status(200).json({
        success: true,
        settings: updatedSettings,
        deck,
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({
        success: false,
        error: err.message || 'Failed to update settings',
      });
    }
  });

  /**
   * POST /api/rooms/:code/leave
   * Leaves a room gracefully.
   */
  router.post('/:code/leave', (req, res) => {
    const rawCode = req.params.code;
    const code = normalizeRoomCode(rawCode);
    const { sessionToken, hostKey, participantId } = extractAuthTokens(req);

    if (!code || !participantId) {
      return res.status(400).json({
        success: false,
        error: 'code and participantId are required',
      });
    }

    try {
      const success = roomStore.leaveRoom(code, { participantId, sessionToken, hostKey });
      if (success) {
        const publicRoom = roomStore.getPublicRoom(code);
        broadcaster.broadcast(code, 'participant:left', {
          participantId,
          totalParticipants: publicRoom ? publicRoom.participantCount : 0,
        });
      }

      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(err.statusCode || 500).json({
        success: false,
        error: err.message || 'Failed to leave room',
      });
    }
  });

  /**
   * POST /api/rooms/:code/kick
   * Evicts an inactive or disruptive participant (Host only).
   */
  router.post('/:code/kick', (req, res) => {
    const rawCode = req.params.code;
    const code = normalizeRoomCode(rawCode);
    const { sessionToken, hostKey, participantId } = extractAuthTokens(req);
    const { targetParticipantId } = req.body || {};

    if (!code || !targetParticipantId) {
      return res.status(400).json({
        success: false,
        error: 'room code and targetParticipantId are required',
      });
    }

    try {
      const result = roomStore.kickParticipant(code, targetParticipantId, {
        participantId,
        sessionToken,
        hostKey,
      });

      return res.status(200).json({
        success: true,
        ...result,
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({
        success: false,
        error: err.message || 'Failed to kick participant',
      });
    }
  });

  /**
   * POST /api/rooms/:code/nudge
   * Alerts an inactive participant that their group is waiting (Host only).
   */
  router.post('/:code/nudge', (req, res) => {
    const rawCode = req.params.code;
    const code = normalizeRoomCode(rawCode);
    const { sessionToken, hostKey, participantId } = extractAuthTokens(req);
    const { targetParticipantId } = req.body || {};

    if (!code || !targetParticipantId) {
      return res.status(400).json({
        success: false,
        error: 'room code and targetParticipantId are required',
      });
    }

    try {
      const result = roomStore.nudgeParticipant(code, targetParticipantId, {
        participantId,
        sessionToken,
        hostKey,
      });

      return res.status(200).json({
        success: true,
        ...result,
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({
        success: false,
        error: err.message || 'Failed to nudge participant',
      });
    }
  });

  /**
   * GET /api/rooms/:code/stream
   * Establishes real-time Server-Sent Events (SSE) stream.
   */
  router.get('/:code/stream', (req, res) => {
    const rawCode = req.params.code;
    const code = normalizeRoomCode(rawCode);
    const { participantId } = extractAuthTokens(req);

    if (!code) {
      return res.status(400).json({ success: false, error: 'Invalid room code' });
    }

    const room = roomStore.getPublicRoom(code);
    if (!room) {
      return res.status(404).json({
        success: false,
        error: `Room ${code} not found or expired`,
      });
    }

    // Register client in Broadcaster
    broadcaster.addClient(code, participantId, req, res);

    // Send initial room snapshot
    const initialPayload = `event: room:init\ndata: ${JSON.stringify({
      room,
      participantId,
      timestamp: new Date().toISOString(),
    })}\n\n`;
    res.write(initialPayload);
  });

  return router;
}

export const roomsRouter = createRoomsRouter();
