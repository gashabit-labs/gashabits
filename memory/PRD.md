# PRD — Capsule Crypt (Zero-Server Gashapon Crypto Art Vending Machine)

## Original Problem Statement
Build a zero-server, privacy-focused digital art vending machine styled as a retro red glossy arcade Gashapon/Capsule Machine. 100% client-side, NO backend/database, NO accounts (cypherpunk privacy model). Responsive (desktop 2-col, mobile stacked). Client-side crypto invoice + multi-API failover polling + strict anti-cheat gates. Hash-seeded pixel-sprite art engine (no AI/ONNX/WebGPU). Blob PNG download. Traceless sessionStorage-only state.

## User Choices
- Payment flow: real polling code + DEMO/Simulate button to drive success
- Style: classic retro red glossy arcade (vaporwave accents)
- Sprite categories: all 4 (Game Characters, Cute Cats, Colorful Flowers, RPG Items)
- Fonts: pixel/retro (Press Start 2P + VT323)

## Architecture
- 100% frontend React (CRA/craco). No backend, no DB, no auth, no integrations.
- `src/App.js` — state machine: IDLE → INVOICE → PROCESSING → VERIFIED → DISPENSING → DROPPED → REVEALED; sessionStorage key `gasha_session_v1`.
- `src/gashapon/blockchain.js` — SECURE_ADDRESS_POOL (static dummy LTC/XMR), leaseAddress, pollSweep (Blockchair→Blockstream failover), validateTransaction (3 gates), buildSimulatedTx.
- `src/gashapon/spriteEngine.js` — hardcoded component dictionary + palettes; hash-seeded deterministic 32x32 symmetric sprite generation; pixelated canvas render.
- `src/gashapon/GashaponMachine.jsx` — red cabinet, glass globe, coin slot, touch+mouse crank lever, prize tray, capsule.
- `src/gashapon/InvoicePanel.jsx` — coin buttons, QR (qrcode.react), address copy, marquee, explorer log, verified gates, reveal canvas, blob download.

## Implemented (2026-06)
- Responsive 2-col desktop / stacked mobile layout, retro red arcade cabinet with animated ball globe.
- Coin invoices (LTC £0.10 / XMR £1.00) with client-side QR + random leased address from static pool.
- Real multi-explorer failover polling (Blockchair → Blockstream) with live log; DEMO simulate button.
- Anti-cheat gatekeeper: Rule1 (0 conf), Rule2 (<180s replay window), Rule3 (destination match).
- 1.2s machine shake + 180° lever rotation (touch+mouse) + capsule drop + click-to-open reveal.
- Hash-seeded pixel sprite engine (4 categories, 5 palettes) rendered crisp on canvas; PNG blob download.
- Traceless sessionStorage persistence; play-again reset clears session.
- Verified end-to-end by testing agent: 100% frontend pass.

## Backlog
- P1: Category/rarity odds display; sprite history gallery within the session.
- P2: Sound FX (coin drop, crank, capsule pop); animated ball settling physics; shareable sprite card image.
- P2: Per-state unique testids; optional silencing of expected explorer CORS console noise.

## Next Tasks
- Await user feedback; consider sound design and a session gallery.
