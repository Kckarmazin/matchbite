import { createApp } from '../../../server/index.js';
import { RoomStore } from '../../../server/models/RoomStore.js';
import { Broadcaster } from '../../../server/sync/Broadcaster.js';
import http from 'node:http';

async function runAuditorProbe() {
  console.log('--- FORENSIC AUDITOR INDEPENDENT ADVERSARIAL PROBES ---');
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  [AUDIT PASS] ${message}`);
      passed++;
    } else {
      console.error(`  [AUDIT FAIL] ${message}`);
      failed++;
    }
  }

  const broadcaster = new Broadcaster();
  const roomStore = new RoomStore(broadcaster);
  const app = createApp({ roomStore, broadcaster });
  const server = http.createServer(app);

  await new Promise(resolve => server.listen(0, resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    // 1. Cross-Room Token Replay Attack
    // Create Room A and Room B. Host A tries to use their token to mutate Room B.
    const roomA = await fetch(`${baseUrl}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hostName: 'HostA' })
    }).then(r => r.json());

    const roomB = await fetch(`${baseUrl}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hostName: 'HostB' })
    }).then(r => r.json());

    const crossReplayRes = await fetch(`${baseUrl}/api/rooms/${roomB.room.code}/settings`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-session-token': roomA.sessionToken
      },
      body: JSON.stringify({
        participantId: roomB.participant.id,
        settings: { activityCategory: 'hijacked' }
      })
    });
    assert(crossReplayRes.status === 403, 'Cross-room token replay attack rejected with 403');

    // 2. HostKey of Room A used on Room B
    const crossHostKeyRes = await fetch(`${baseUrl}/api/rooms/${roomB.room.code}/settings`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-host-key': roomA.hostKey
      },
      body: JSON.stringify({
        settings: { activityCategory: 'hijacked' }
      })
    });
    assert(crossHostKeyRes.status === 403, 'Cross-room hostKey replay attack rejected with 403');

    // 3. Prefix-only token spoofing ('st-')
    const prefixSpoofRes = await fetch(`${baseUrl}/api/rooms/${roomB.room.code}/settings`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-session-token': 'st-'
      },
      body: JSON.stringify({
        participantId: roomB.participant.id,
        settings: { activityCategory: 'hijacked' }
      })
    });
    assert(prefixSpoofRes.status === 403, 'Prefix-only token spoofing rejected with 403');

    // 4. Invalidation of Host capability after host departs with guests remaining
    const guestJoin = await fetch(`${baseUrl}/api/rooms/${roomA.room.code}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'GuestA' })
    }).then(r => r.json());

    // Host A leaves legitimately
    const hostLeaveRes = await fetch(`${baseUrl}/api/rooms/${roomA.room.code}/leave`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-token': roomA.sessionToken
      },
      body: JSON.stringify({ participantId: roomA.participant.id })
    });
    assert(hostLeaveRes.status === 200, 'Host A leaves room successfully');

    // Host A tries to update settings using old sessionToken
    const postDepartureUpdate = await fetch(`${baseUrl}/api/rooms/${roomA.room.code}/settings`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-session-token': roomA.sessionToken
      },
      body: JSON.stringify({
        participantId: roomA.participant.id,
        settings: { activityCategory: 'hijacked' }
      })
    });
    assert(postDepartureUpdate.status === 403, 'Departed host cannot mutate settings with old sessionToken (403)');

    // Host A tries to update settings using old hostKey
    const postDepartureHostKey = await fetch(`${baseUrl}/api/rooms/${roomA.room.code}/settings`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-host-key': roomA.hostKey
      },
      body: JSON.stringify({
        settings: { activityCategory: 'hijacked' }
      })
    });
    assert(postDepartureHostKey.status === 403, 'Departed host cannot mutate settings with old hostKey (403)');

    // 5. Successor guest (now host) CAN update settings
    const successorUpdate = await fetch(`${baseUrl}/api/rooms/${roomA.room.code}/settings`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-session-token': guestJoin.sessionToken
      },
      body: JSON.stringify({
        participantId: guestJoin.participant.id,
        settings: { activityCategory: 'entertainment' }
      })
    });
    assert(successorUpdate.status === 200, 'Promoted guest can update settings using their sessionToken (200)');

    // 6. Test public endpoint does not leak any capability
    const publicRoomCheck = await fetch(`${baseUrl}/api/rooms/${roomA.room.code}`).then(r => r.json());
    assert(publicRoomCheck.room.hostKey === undefined, 'Public room does not contain hostKey');
    assert(publicRoomCheck.room.sessionToken === undefined, 'Public room does not contain sessionToken');
    for (const p of publicRoomCheck.room.participants) {
      assert(p.sessionToken === undefined, `Participant ${p.id} does not expose sessionToken`);
      assert(p.hostKey === undefined, `Participant ${p.id} does not expose hostKey`);
    }

  } finally {
    server.close();
  }

  console.log(`\nAudit Probes Completed: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

runAuditorProbe().catch(err => {
  console.error('Audit probe failure:', err);
  process.exit(1);
});
