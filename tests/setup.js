import { afterEach } from 'vitest';
import { globalRoomStore } from '../server/models/RoomStore.js';
import { globalBroadcaster } from '../server/sync/Broadcaster.js';

process.env.NODE_ENV = 'test';

afterEach(() => {
  // Clear room store and broadcaster between tests to ensure test isolation
  globalRoomStore.clear();
});
