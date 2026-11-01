# NeonCart — cumulative module snapshot

This archive contains the complete NeonCart app at the module number shown in
the portal. Later modules include the earlier code plus the newly released
challenge. The facilitator releases each module to all players at once.

## Run it

```bash
node server.js
# open http://localhost:3307
```

No npm install needed: the agents used zero dependencies.

## Your player seed

The portal shows your personal seed after you sign in. Use that seed when you
run this shared stage archive:

```bash
PLAYER_SEED=your_seed_here node server.js
```

Replace `your_seed_here` with the seed from your portal account, or paste the
seed into `config/player-license.json` in place of the placeholder.
The app derives your flag from this seed at runtime. Keep the seed private.
