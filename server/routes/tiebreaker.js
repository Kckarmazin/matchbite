import { Router } from 'express';
import { globalRoomStore } from '../models/RoomStore.js';
import { globalBroadcaster } from '../sync/Broadcaster.js';
import { normalizeRoomCode } from '../models/RoomCode.js';
import { extractAuthTokens } from './rooms.js';

export function createTiebreakerRouter(roomStore = globalRoomStore, broadcaster = globalBroadcaster) {
  const router = Router();

  /**
   * GET /api/rooms/:code/tiebreaker/candidates
   * Retrieves top contender venues for tie-breaker resolution.
   */
  router.get('/:code/tiebreaker/candidates', (req, res) => {
    const rawCode = req.params.code;
    const code = normalizeRoomCode(rawCode);

    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Invalid room code format',
      });
    }

    try {
      const limit = parseInt(req.query.limit, 10) || 6;
      const result = roomStore.getTiebreakerCandidates(code, limit);
      return res.status(200).json({
        success: true,
        ...result,
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({
        success: false,
        error: err.message || 'Failed to retrieve tie-breaker candidates',
      });
    }
  });

  /**
   * POST /api/rooms/:code/tiebreaker/spin
   * Executes synchronized roulette wheel spin and declares the winner (Host only).
   */
  router.post('/:code/tiebreaker/spin', (req, res) => {
    const rawCode = req.params.code;
    const code = normalizeRoomCode(rawCode);
    const auth = extractAuthTokens(req);

    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Invalid room code format',
      });
    }

    try {
      const result = roomStore.spinTiebreaker(code, auth, req.body || {});
      return res.status(200).json({
        success: true,
        ...result,
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({
        success: false,
        error: err.message || 'Failed to execute tie-breaker spin',
      });
    }
  });

  /**
   * POST /api/rooms/:code/tiebreaker/select
   * Host manually selects a top contender from the leaderboard as the winner.
   */
  router.post('/:code/tiebreaker/select', (req, res) => {
    const rawCode = req.params.code;
    const code = normalizeRoomCode(rawCode);
    const auth = extractAuthTokens(req);
    const { venueId } = req.body || {};

    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Invalid room code format',
      });
    }

    try {
      const result = roomStore.selectTiebreakerWinner(code, auth, venueId);
      return res.status(200).json({
        success: true,
        ...result,
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({
        success: false,
        error: err.message || 'Failed to select tie-breaker winner',
      });
    }
  });

  /**
   * POST /api/rooms/:code/restart
   * Restarts the room voting session (Host only).
   */
  router.post('/:code/restart', async (req, res) => {
    const rawCode = req.params.code;
    const code = normalizeRoomCode(rawCode);
    const auth = extractAuthTokens(req);

    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Invalid room code format',
      });
    }

    try {
      const result = await roomStore.restartRoom(code, auth, req.body || {});
      return res.status(200).json({
        success: true,
        ...result,
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({
        success: false,
        error: err.message || 'Failed to restart room session',
      });
    }
  });

  return router;
}
