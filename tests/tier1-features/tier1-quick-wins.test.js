import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Tier 1: Quick Wins UX Audit Verification Suite', () => {
  const rootDir = path.resolve(__dirname, '../../');

  // Quick Win 1: iOS Safari Viewport Auto-Zoom
  describe('Quick Win 1: Fix iOS Safari Viewport Auto-Zoom (Minimum 16px Font Size)', () => {
    it('enforces font-size: 16px in index.css for all form inputs', () => {
      const cssPath = path.join(rootDir, 'src/index.css');
      const cssContent = fs.readFileSync(cssPath, 'utf8');
      expect(cssContent).toMatch(/\.form-input\s*\{[^}]*font-size:\s*16px/);
    });

    it('ensures all input fields in VipUpgradeModal.jsx have minimum 16px font-size', () => {
      const modalPath = path.join(rootDir, 'src/components/Monetization/VipUpgradeModal.jsx');
      const content = fs.readFileSync(modalPath, 'utf8');
      
      const inputs = content.split('<input').slice(1).map((b) => b.split('/>')[0]);
      expect(inputs.length).toBeGreaterThanOrEqual(5);
      inputs.forEach((input) => {
        expect(input).not.toContain('0.88rem');
        expect(input).toContain("fontSize: '16px'");
      });
    });

    it('ensures inputs in CreateRoom.jsx have explicit 16px font-size', () => {
      const createRoomPath = path.join(rootDir, 'src/components/Lobby/CreateRoom.jsx');
      const content = fs.readFileSync(createRoomPath, 'utf8');
      const inputMatches = content.match(/fontSize:\s*'16px'/g);
      expect(inputMatches).not.toBeNull();
      expect(inputMatches.length).toBeGreaterThanOrEqual(2);
    });
  });

  // Quick Win 2: 1.8s Roulette Winner Celebration Pause
  describe('Quick Win 2: 1.8s Roulette Winner Celebration Pause', () => {
    it('implements 1800ms celebration pause and confetti in RouletteWheel.jsx', () => {
      const roulettePath = path.join(rootDir, 'src/components/Tiebreaker/RouletteWheel.jsx');
      const content = fs.readFileSync(roulettePath, 'utf8');

      // Confetti imported
      expect(content).toContain("import confetti from 'canvas-confetti'");

      // Delay transition to match reveal screen by ~1800ms
      expect(content).toMatch(/setTimeout\([^,]+,\s*1800\)/);

      // Highlights winning wedge
      expect(content).toContain('drawWheel(currentAngleRef.current, winningIdx)');
      expect(content).toContain('isWinnerWedge');
      expect(content).toContain('#FBBF24'); // Gold border highlight
    });
  });

  // Quick Win 3: Responsive Roulette Canvas Scaling
  describe('Quick Win 3: Responsive Roulette Canvas Scaling', () => {
    it('uses responsive sizing rule min(320px, 85vw) for roulette canvas container', () => {
      const roulettePath = path.join(rootDir, 'src/components/Tiebreaker/RouletteWheel.jsx');
      const content = fs.readFileSync(roulettePath, 'utf8');

      expect(content).toContain("width: 'min(320px, 85vw)'");
      expect(content).toContain("height: 'min(320px, 85vw)'");
      expect(content).toContain("maxWidth: '320px'");
      expect(content).toContain("maxHeight: '320px'");
    });

    it('handles responsive coordinate scaling and window resize in RouletteWheel.jsx', () => {
      const roulettePath = path.join(rootDir, 'src/components/Tiebreaker/RouletteWheel.jsx');
      const content = fs.readFileSync(roulettePath, 'utf8');

      expect(content).toContain("window.addEventListener('resize'");
      expect(content).toContain('canvas.clientWidth');
      expect(content).toContain('canvas.clientHeight');
      expect(content).toContain('role="img"');
    });
  });

  // Quick Win 4: Enlarge Lobby Action Touch Targets
  describe('Quick Win 4: Enlarge Lobby Action Touch Targets', () => {
    it('enlarges touch targets to >= 36-44px for Nudge and Remove buttons in RoomLobby.jsx', () => {
      const lobbyPath = path.join(rootDir, 'src/components/Lobby/RoomLobby.jsx');
      const content = fs.readFileSync(lobbyPath, 'utf8');

      // Check minHeight and padding for Nudge and Remove buttons
      expect(content).toContain("minHeight: '38px'");
      expect(content).toContain("minWidth: '38px'");
      expect(content).toContain("padding: '6px 12px'");
      expect(content).toContain('aria-label={`Nudge ${p.name}`}');
      expect(content).toContain('aria-label={`Remove ${p.name}`}');
    });
  });

  // Quick Win 5: Modal Accessibility & Escape Key Handling
  describe('Quick Win 5: Modal Accessibility & Escape Key Handling', () => {
    it('adds Escape key listener and ARIA modal attributes to VipUpgradeModal.jsx', () => {
      const modalPath = path.join(rootDir, 'src/components/Monetization/VipUpgradeModal.jsx');
      const content = fs.readFileSync(modalPath, 'utf8');

      // Escape listener
      expect(content).toContain("e.key === 'Escape'");
      expect(content).toContain("window.addEventListener('keydown'");
      expect(content).toContain("window.removeEventListener('keydown'");

      // ARIA dialog attributes
      expect(content).toContain('role="dialog"');
      expect(content).toContain('aria-modal="true"');
      expect(content).toContain('aria-labelledby="vip-modal-title"');
      expect(content).toContain('id="vip-modal-title"');
      expect(content).toContain('aria-label="Close VIP modal"');
      expect(content).toContain("minHeight: '40px'");
    });

    it('adds Escape key listener and ARIA modal attributes to CustomVenueModal.jsx', () => {
      const modalPath = path.join(rootDir, 'src/components/Monetization/CustomVenueModal.jsx');
      const content = fs.readFileSync(modalPath, 'utf8');

      // Escape listener
      expect(content).toContain("e.key === 'Escape'");
      expect(content).toContain("window.addEventListener('keydown'");
      expect(content).toContain("window.removeEventListener('keydown'");

      // ARIA dialog attributes
      expect(content).toContain('role="dialog"');
      expect(content).toContain('aria-modal="true"');
      expect(content).toContain('aria-labelledby="custom-venue-modal-title"');
      expect(content).toContain('id="custom-venue-modal-title"');
      expect(content).toContain('aria-label="Close dialog"');
      expect(content).toContain("minHeight: '40px'");
    });
  });

  // Quick Win 6: Accessible Chip State (aria-pressed)
  describe('Quick Win 6: Accessible Chip State (aria-pressed)', () => {
    it('adds aria-pressed to all selection chip buttons in CreateRoom.jsx', () => {
      const createRoomPath = path.join(rootDir, 'src/components/Lobby/CreateRoom.jsx');
      const content = fs.readFileSync(createRoomPath, 'utf8');

      expect(content).toContain('aria-pressed={hostAvatar === emoji}');
      expect(content).toContain('aria-pressed={groupType === type.id}');
      expect(content).toContain('aria-pressed={activityCategory === cat.id}');
      expect(content).toContain('aria-pressed={locationName === city}');
      expect(content).toContain('aria-pressed={distance === dist.id}');
      expect(content).toContain('aria-pressed={deckSize === opt.id}');
      expect(content).toContain('aria-pressed={isActive}');
    });

    it('adds aria-pressed to all selection chip buttons in RoomLobby.jsx', () => {
      const lobbyPath = path.join(rootDir, 'src/components/Lobby/RoomLobby.jsx');
      const content = fs.readFileSync(lobbyPath, 'utf8');

      expect(content).toContain('aria-pressed={editDeckSize === opt.id}');
      expect(content).toContain('aria-pressed={editDistance === dist.id}');
      expect(content).toContain('aria-pressed={isActive}');
    });
  });
});
