import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { createApp } from '../../server/index.js';
import { RoomStore } from '../../server/models/RoomStore.js';
import { Broadcaster } from '../../server/sync/Broadcaster.js';

describe('Tier 2: High-Impact Milestones Verification Suite', () => {
  const rootDir = path.resolve(__dirname, '../../');
  let app;
  let roomStore;
  let broadcaster;

  beforeEach(() => {
    broadcaster = new Broadcaster();
    roomStore = new RoomStore(broadcaster);
    app = createApp({ roomStore, broadcaster });
  });

  // =========================================================================
  // Feature 1: In-Lobby QR Code & 1-Tap Express Join (Rec #8)
  // =========================================================================
  describe('Feature 1: In-Lobby QR Code & 1-Tap Express Join (Rec #8)', () => {
    it('verifies RoomLobby.jsx imports qrcode.react and renders QR code with deep link', () => {
      const lobbyPath = path.join(rootDir, 'src/components/Lobby/RoomLobby.jsx');
      const content = fs.readFileSync(lobbyPath, 'utf8');

      // Uses qrcode.react
      expect(content).toContain("import { QRCodeSVG } from 'qrcode.react'");
      expect(content).toContain('<QRCodeSVG');
      expect(content).toContain("showQrCode");
      expect(content).toContain("Show QR Code");
      expect(content).toContain("Hide QR");
      // Deep link with ref=qr
      expect(content).toContain('?room=${room.code}&ref=qr');
    });

    it('verifies JoinRoom.jsx provides 1-tap express join button for returning users', () => {
      const joinPath = path.join(rootDir, 'src/components/Lobby/JoinRoom.jsx');
      const content = fs.readFileSync(joinPath, 'utf8');

      expect(content).toContain('express-join-btn');
      expect(content).toContain('⚡ Join Room as');
      expect(content).toContain('hasExpressOption');
      expect(content).toContain('effectiveCode');
      expect(content).toContain('existingName');
    });
  });

  // =========================================================================
  // Feature 2: Swipe Deck Undo / Rewind Action (Rec #7)
  // =========================================================================
  describe('Feature 2: Swipe Deck Undo / Rewind Action (Rec #7)', () => {
    it('verifies ActionControls.jsx contains 4 circular buttons including Rewind ↺', () => {
      const controlsPath = path.join(rootDir, 'src/components/Swiper/ActionControls.jsx');
      const content = fs.readFileSync(controlsPath, 'utf8');

      expect(content).toContain('ctrl-rewind');
      expect(content).toContain('RotateCcw');
      expect(content).toContain('onUndo');
      expect(content).toContain('canUndo');
      expect(content).toContain('ctrl-pass');
      expect(content).toContain('ctrl-superlike');
      expect(content).toContain('ctrl-like');
    });

    it('verifies SwipeDeck.jsx integrates undo / rewind logic and keyboard hotkeys', () => {
      const deckPath = path.join(rootDir, 'src/components/Swiper/SwipeDeck.jsx');
      const content = fs.readFileSync(deckPath, 'utf8');

      expect(content).toContain('handleUndo');
      expect(content).toContain('undoVote');
      expect(content).toContain('canUndo');
      expect(content).toContain("e.key === 'z' || e.key === 'Z' || e.key === 'Backspace'");
    });

    it('verifies server RoomStore.undoVote removes previous vote and updates distinct count', async () => {
      const hostRes = await request(app)
        .post('/api/rooms')
        .send({ hostName: 'UndoHost' });

      const code = hostRes.body.room.code;
      const hostToken = hostRes.body.sessionToken;
      const hostId = hostRes.body.participant.id;

      // Start voting
      const startRes = await request(app)
        .post(`/api/rooms/${code}/start`)
        .set('x-session-token', hostToken)
        .set('x-host-key', hostRes.body.hostKey);

      const deck = startRes.body.deck;
      const venue1 = deck[0];

      // Cast a vote
      const voteRes = await request(app)
        .post(`/api/rooms/${code}/vote`)
        .set('x-session-token', hostToken)
        .send({ participantId: hostId, venueId: venue1.id, vote: 'like' });

      expect(voteRes.status).toBe(200);
      const roomAfterVote = roomStore.getRoom(code);
      expect(roomAfterVote.votes[venue1.id][hostId]).toBe('like');
      expect(roomAfterVote.participants[hostId].swipedCount).toBe(1);

      // Undo the vote
      const undoRes = await request(app)
        .post(`/api/rooms/${code}/undo`)
        .set('x-session-token', hostToken)
        .send({ participantId: hostId, venueId: venue1.id });

      expect(undoRes.status).toBe(200);
      expect(undoRes.body.success).toBe(true);
      expect(undoRes.body.swipedCount).toBe(0);

      const roomAfterUndo = roomStore.getRoom(code);
      expect(roomAfterUndo.votes[venue1.id]?.[hostId]).toBeUndefined();
      expect(roomAfterUndo.participants[hostId].swipedCount).toBe(0);
    });
  });

  // =========================================================================
  // Feature 3: Expandable Venue Details Bottom Sheet (Rec #10)
  // =========================================================================
  describe('Feature 3: Expandable Venue Details Bottom Sheet (Rec #10)', () => {
    it('verifies SwipeCard.jsx contains Info badge and bottom sheet modal', () => {
      const cardPath = path.join(rootDir, 'src/components/Swiper/SwipeCard.jsx');
      const content = fs.readFileSync(cardPath, 'utf8');

      expect(content).toContain('venue-info-badge');
      expect(content).toContain('showDetails');
      expect(content).toContain('venue-details-sheet');
      expect(content).toContain('venue-details-overlay');
      expect(content).toContain('role="dialog"');
      expect(content).toContain('aria-modal="true"');
      expect(content).toContain('Hours of Operation');
      expect(content).toContain('Highlights & Atmosphere');
      expect(content).toContain("e.key === 'Escape'");
      expect(content).toContain('Back to Swiping');
    });
  });

  // =========================================================================
  // Feature 4: Progressive Disclosure in Room Creation (Rec #11)
  // =========================================================================
  describe('Feature 4: Progressive Disclosure in Room Creation (Rec #11)', () => {
    it('verifies CreateRoom.jsx divides initial view into Quick Setup with collapsible Adjust Preferences drawer', () => {
      const createPath = path.join(rootDir, 'src/components/Lobby/CreateRoom.jsx');
      const content = fs.readFileSync(createPath, 'utf8');

      expect(content).toContain('showPreferencesDrawer');
      expect(content).toContain('progressive-drawer-toggle');
      expect(content).toContain('progressive-drawer-content');
      expect(content).toContain('Adjust Preferences');
      expect(content).toContain('aria-expanded={showPreferencesDrawer}');

      // Advanced filters are inside drawer
      expect(content).toContain('Food & Cuisine (Optional)');
      expect(content).toContain('Price Tier');
      expect(content).toContain('Places to Swipe');
    });
  });

  // =========================================================================
  // Feature 5: Interactive Lobby Engagement & Banter (Rec #9)
  // =========================================================================
  describe('Feature 5: Interactive Lobby Engagement & Banter (Rec #9)', () => {
    it('verifies RoomLobby.jsx renders emoji reaction bar with 4 distinct emojis', () => {
      const lobbyPath = path.join(rootDir, 'src/components/Lobby/RoomLobby.jsx');
      const content = fs.readFileSync(lobbyPath, 'utf8');

      expect(content).toContain('lobby-reaction-bar');
      expect(content).toContain('lobby-reaction-btn');
      expect(content).toContain('🍻');
      expect(content).toContain('🌮');
      expect(content).toContain('🎉');
      expect(content).toContain('⏰');
      expect(content).toContain('handleSendEmoji');
      expect(content).toContain('floatingEmojis');
    });

    it('verifies POST /api/rooms/:code/reactions broadcasts live lobby reaction', async () => {
      const hostRes = await request(app)
        .post('/api/rooms')
        .send({ hostName: 'ReactionHost' });

      const code = hostRes.body.room.code;
      const hostToken = hostRes.body.sessionToken;
      const hostId = hostRes.body.participant.id;

      // Broadcast reaction
      const reactRes = await request(app)
        .post(`/api/rooms/${code}/reactions`)
        .set('x-session-token', hostToken)
        .send({
          emoji: '🍻',
          participantId: hostId,
          senderName: 'ReactionHost',
        });

      expect(reactRes.status).toBe(200);
      expect(reactRes.body.success).toBe(true);
      expect(reactRes.body.emoji).toBe('🍻');
    });
  });
});
