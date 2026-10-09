import { Router } from 'express';
import { globalRoomStore } from '../models/RoomStore.js';
import { globalBroadcaster } from '../sync/Broadcaster.js';
import { normalizeRoomCode } from '../models/RoomCode.js';
import { extractAuthTokens } from './rooms.js';
import { globalPlacesService } from '../services/PlacesService.js';

export function createVotesRouter(roomStore = globalRoomStore, broadcaster = globalBroadcaster) {
  const router = Router();

  /**
   * POST /api/rooms/:code/start
   * Starts a voting round for the room (Host only).
   */
  router.post('/:code/start', async (req, res) => {
    const rawCode = req.params.code;
    const code = normalizeRoomCode(rawCode);
    const { sessionToken, hostKey, participantId } = extractAuthTokens(req);

    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Invalid room code format',
      });
    }

    try {
      if (process.env.NODE_ENV !== 'test' && globalPlacesService) {
        const currentRoom = roomStore.getRoom(code);
        if (currentRoom && (currentRoom.settings.lat != null || currentRoom.settings.locationName)) {
          await globalPlacesService.ensureLiveVenues(currentRoom.settings, 6000);
        }
      }

      const { room, deck } = await roomStore.startVoting(code, {
        participantId,
        sessionToken,
        hostKey,
      });

      return res.status(200).json({
        success: true,
        status: 'voting',
        deck,
        room,
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({
        success: false,
        error: err.message || 'Failed to start voting',
      });
    }
  });

  /**
   * POST /api/rooms/:code/sudden-death
   * Starts a sudden-death showdown with top 3 contenders (Host only).
   */
  router.post('/:code/sudden-death', (req, res) => {
    const rawCode = req.params.code;
    const code = normalizeRoomCode(rawCode);
    const { sessionToken, hostKey, participantId } = extractAuthTokens(req);
    const { limit } = req.body || {};

    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Invalid room code format',
      });
    }

    try {
      const result = roomStore.startSuddenDeath(
        code,
        { participantId, sessionToken, hostKey },
        limit ? Number(limit) : 3
      );

      return res.status(200).json({
        success: true,
        ...result,
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({
        success: false,
        error: err.message || 'Failed to start sudden death',
      });
    }
  });

  /**
   * POST /api/rooms/:code/vote
   * Records an authenticated swipe vote on a venue and checks consensus.
   */
  router.post('/:code/vote', (req, res) => {
    const rawCode = req.params.code;
    const code = normalizeRoomCode(rawCode);
    const { sessionToken } = extractAuthTokens(req);
    const { participantId, venueId, vote } = req.body || {};

    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Invalid room code format',
      });
    }

    if (!participantId) {
      return res.status(400).json({
        success: false,
        error: 'participantId is required',
      });
    }

    if (!venueId || typeof venueId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'venueId is required',
      });
    }

    const FORBIDDEN_KEYS = ['__proto__', 'constructor', 'prototype'];
    if (FORBIDDEN_KEYS.includes(venueId.trim().toLowerCase())) {
      return res.status(400).json({
        success: false,
        error: `Invalid venueId: '${venueId}' is a reserved property name`,
      });
    }

    if (FORBIDDEN_KEYS.includes(String(participantId).trim().toLowerCase())) {
      return res.status(400).json({
        success: false,
        error: `Invalid participantId: '${participantId}' is a reserved property name`,
      });
    }

    const room = roomStore.getRoom(code);
    if (room && room.status === 'voting' && Array.isArray(room.deck) && !room.deck.some(v => v && v.id === venueId)) {
      return res.status(400).json({
        success: false,
        error: 'venueId is not in the room deck',
      });
    }

    if (!vote || !['like', 'pass', 'superlike'].includes(vote)) {
      return res.status(400).json({
        success: false,
        error: "vote must be 'like', 'pass', or 'superlike'",
      });
    }

    if (!sessionToken) {
      return res.status(403).json({
        success: false,
        error: 'Authentication session token is required to cast a vote',
      });
    }

    try {
      const result = roomStore.recordVote(code, {
        participantId,
        sessionToken,
        venueId,
        vote,
      });

      return res.status(200).json({
        success: true,
        isMatch: result.isMatch,
        matchedVenue: result.matchedVenue,
        match: result.match || null,
        progress: result.progress,
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({
        success: false,
        error: err.message || 'Failed to record vote',
      });
    }
  });

  /**
   * GET /api/rooms/:code/results
   * Retrieves current room consensus state and results leaderboard.
   */
  router.get('/:code/results', (req, res) => {
    const rawCode = req.params.code;
    const code = normalizeRoomCode(rawCode);

    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Invalid room code format',
      });
    }

    try {
      const results = roomStore.getRoomResults(code);

      return res.status(200).json({
        success: true,
        ...results,
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({
        success: false,
        error: err.message || 'Failed to retrieve results',
      });
    }
  });

  /**
   * GET /api/rooms/:code/deck
   * Retrieves the current venue deck for this room.
   */
  router.get('/:code/deck', (req, res) => {
    const rawCode = req.params.code;
    const code = normalizeRoomCode(rawCode);

    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Invalid room code format',
      });
    }

    const room = roomStore.getRoom(code);
    if (!room) {
      return res.status(404).json({
        success: false,
        error: `Room ${code} not found or expired`,
      });
    }

    const deck = room.deck && room.deck.length > 0 ? room.deck : roomStore.getDeckForRoom(room.settings);

    return res.status(200).json({
      success: true,
      deck,
    });
  });

  return router;
}

export const votesRouter = createVotesRouter();
