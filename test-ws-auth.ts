import WebSocket from 'ws';

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function testGuestQuarantine(): Promise<void> {
  console.log('\n[Test 1] Testing unauthenticated WebSocket identity quarantine...');
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://127.0.0.1:3000/ws');
    const timeout = setTimeout(() => {
      ws.terminate();
      reject(new Error('Timeout waiting for auth-ok'));
    }, 4000);

    ws.on('open', () => {
      ws.send(JSON.stringify({
        type: 'auth',
        userId: 'vitima_sem_token',
        userName: 'Atacante 1',
      }));
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'auth-ok') {
          clearTimeout(timeout);
          if (msg.userId !== 'guest-vitima_sem_token' || msg.isVerified !== false) {
            ws.close();
            return reject(new Error(`Failed guest quarantine: got ${JSON.stringify(msg)}`));
          }
          console.log('✓ Pass: Guest identity without token quarantined to "guest-vitima_sem_token" (isVerified: false)');
          ws.close();
          resolve();
        }
      } catch (e) {
        ws.close();
        reject(e);
      }
    });

    ws.on('error', reject);
  });
}

async function testForgedTokenRejection(): Promise<void> {
  console.log('\n[Test 2] Testing forged JWT token rejection (immediate connection close)...');
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://127.0.0.1:3000/ws');
    const timeout = setTimeout(() => {
      ws.terminate();
      reject(new Error('Timeout waiting for forged token rejection'));
    }, 4000);

    ws.on('open', () => {
      ws.send(JSON.stringify({
        type: 'auth',
        token: 'eyJhGciOiJSUzI1NiJ9.forged.signature',
        userId: 'admin_vitima',
        userName: 'Atacante Forged Token',
      }));
    });

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'auth-ok') {
        clearTimeout(timeout);
        ws.close();
        return reject(new Error('CRITICAL VULNERABILITY: Forged token received auth-ok!'));
      }
    });

    ws.on('close', (code, reason) => {
      clearTimeout(timeout);
      console.log(`✓ Pass: Forged token was immediately rejected and closed (code: ${code}, reason: "${reason.toString()}")`);
      resolve();
    });

    ws.on('error', (err) => {
      // Expected if socket closed abruptly
    });
  });
}

async function testInviteSenderSpoofing(): Promise<void> {
  console.log('\n[Test 3] Testing server-invite sender spoofing prevention...');
  return new Promise((resolve, reject) => {
    const victimWs = new WebSocket('ws://127.0.0.1:3000/ws');
    const attackerWs = new WebSocket('ws://127.0.0.1:3000/ws');

    let victimReady = false;
    let attackerReady = false;

    const cleanup = () => {
      victimWs.close();
      attackerWs.close();
    };

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Timeout waiting for server-invite test'));
    }, 5000);

    victimWs.on('open', () => {
      victimWs.send(JSON.stringify({
        type: 'auth',
        userId: 'target_recipient',
        userName: 'Recipient',
      }));
    });

    victimWs.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'auth-ok') {
        victimReady = true;
        checkSendInvite();
      } else if (msg.type === 'room-invite-received') {
        clearTimeout(timeout);
        // Sender MUST be the attacker's quarantined ID (guest-attacker_conn), NOT spoofed_ceo
        if (msg.senderUserId === 'spoofed_ceo') {
          cleanup();
          return reject(new Error('CRITICAL VULNERABILITY: msg.senderUserId allowed spoofing to "spoofed_ceo"!'));
        }
        if (msg.senderUserId === 'guest-attacker_conn') {
          console.log('✓ Pass: server-invite enforced authenticated client identity "guest-attacker_conn", spoofed value rejected.');
          cleanup();
          resolve();
        } else {
          cleanup();
          return reject(new Error(`Unexpected senderUserId: ${msg.senderUserId}`));
        }
      }
    });

    attackerWs.on('open', () => {
      attackerWs.send(JSON.stringify({
        type: 'auth',
        userId: 'attacker_conn',
        userName: 'Attacker',
      }));
    });

    attackerWs.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'auth-ok') {
        attackerReady = true;
        checkSendInvite();
      }
    });

    function checkSendInvite() {
      if (victimReady && attackerReady) {
        // Attacker attempts to spoof senderUserId as 'spoofed_ceo'
        attackerWs.send(JSON.stringify({
          type: 'server-invite',
          targetUserId: 'guest-target_recipient',
          senderUserId: 'spoofed_ceo',
          senderName: 'CEO Impersonator',
          serverName: 'Fake Server',
          serverId: 'fake-srv-1',
          channelId: 'chan-1',
          channelName: 'Geral',
        }));
      }
    }
  });
}

async function runAll() {
  try {
    await testGuestQuarantine();
    await testForgedTokenRejection();
    await testInviteSenderSpoofing();
    console.log('\n=============================================');
    console.log('🎉 ALL 3 SECURITY INTEGRATION TESTS PASSED!');
    console.log('=============================================\n');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ TEST FAILED:', err);
    process.exit(1);
  }
}

runAll();
