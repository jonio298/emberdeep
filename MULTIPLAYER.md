# Emberdeep — two-player cave co-op

This update adds a multiplayer lobby, public room browser, six-character private invite codes, two-player movement, host-controlled enemy state, shared cave generation, chat, XP notifications, item pickup requests, and voluntary single-item transfers. Solo mode and its saved game remain separate.

## Vercel deployment

1. Import the GitHub repository jonio298/emberdeep into Vercel, select framework preset Other, and use the repository root.
2. Enable Fluid Compute in the Vercel project for native WebSocket support.
3. Provision a Redis instance from a provider with TCP Redis access (for example Upstash). Set REDIS_URL in Vercel project environment variables. Use a redis:// or rediss:// URL, not the REST URL.
4. Redeploy so the api/ws.js function receives REDIS_URL.
5. Visit the deployed Emberdeep website on both phones. On the title screen choose Multiplayer, enter a display name and hero, and create or join a room.
6. During play use CHAT to message each other, or TRADE to offer an inventory item. The other player must accept before it transfers.

## Local verification

Node.js 20 or later is required. Install dependencies with npm install, then run npm run check.

## How co-op works

The host phone simulates the dungeon, enemy AI, monster HP, and loot. The guest phone handles its own movement and spell inputs while receiving frequent world snapshots. Both clients use the same seeded cave. When enemies die, the guest also receives an XP event. Public rooms list games with an empty guest slot; private rooms are available by six-character code.

Sessions use reconnect tokens kept in browser sessionStorage, and rooms expire after up to four hours. Vercel Functions can close WebSocket connections at their maximum duration: the client automatically reconnects. Redis is required for reliable room communication across Vercel instances.

## Current release limitations

* This initial multiplayer game mode covers cave co-op, not synchronized town and forest quests, cross-region NPC interactions, or PvP.
* The online experience uses display names and invite codes rather than email/password accounts.
* Multiplayer hero inventories and world state are not durable saves when the entire room closes. The normal solo save is unaffected. Keep the tabs open while playing.
* Trading is a consensual one-item transfer, not a simultaneous two-party escrow swap or tamper-resistant economy.
* The server is designed for two trusted players, not competitive anti-cheat. A public deployment needs further rate limiting and hardening before untrusted users are invited.
* Actual phone-to-phone gameplay must be tested after deployment. Syntax and simulated protocol tests alone are insufficient.

## Phone test checklist

1. Create an open room on phone A and verify it appears in the room browser on phone B.
2. Join as two different heroes, walk, and verify both characters render on each phone.
3. Attack the same enemy and confirm that monster health and death agree.
4. Verify both players gain XP, and test loot collection.
5. Send messages both ways and complete a confirmed item transfer.
6. Toggle Wi-Fi and observe reconnection.
7. Return to solo play and confirm its prior save still exists.

See https://vercel.com/docs/functions/websockets for current Vercel configuration requirements.
