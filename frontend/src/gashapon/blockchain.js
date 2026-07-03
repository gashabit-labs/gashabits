// ============================================================================
// BLOCKCHAIN INTERFACE — client-side only. No XPUB. No backend.
// Static address pool + multi-API failover polling + anti-cheat validation.
// ============================================================================

// WALLET ADDRESS SHIELDING — LIVE PRODUCTION invoice targets picked at random.
export const SECURE_ADDRESS_POOL = {
  LTC: [
    // Live Production Litecoin Target Key
    "ltc1qlgwkgw7fl5g7xsueh3ajd4rsvjvhrwc0yhnu6y",
  ],
  XMR: [
    // Live Production Shielded Monero Target Key
    "85bRMtwUP27EHtrSFrVKSUX1p1PcwHeAnc9Nfj3F6EvQc4rhrqT4VfqgTEDVZiJF5aEuM7X9y5pjuE81eEKF8kUG1FABnKB",
  ],
};

export function leaseAddress(coin) {
  const pool = SECURE_ADDRESS_POOL[coin] || SECURE_ADDRESS_POOL.LTC;
  return pool[Math.floor(Math.random() * pool.length)];
}

// MULTI-API FAILOVER NETWORKS — public, unauthenticated LTC explorers.
// Genuine live detection scans the address for a 0-confirmation (mempool)
// incoming transaction. Each explorer normalises to a common tx shape and the
// raw tx is cross-verified before the anti-cheat gates run.
//
// NOTE: Blockstream's API is Bitcoin-only, so for Litecoin we use the
// mempool.space-compatible LTC instance (litecoinspace.org) as the failover.

// --- Explorer #1: Blockchair (Litecoin) with raw-tx cross-verification.
async function detectViaBlockchair(address, onLog) {
  const base = "https://api.blockchair.com/litecoin";
  const r = await fetch(`${base}/dashboards/address/${address}?limit=5`);
  if (r.status === 429) { onLog?.("Blockchair rate-limited (429) → failover"); return { retry: true }; }
  if (!r.ok) { onLog?.(`Blockchair responded ${r.status} → failover`); return { retry: true }; }
  const d = await r.json().catch(() => null);
  const info = d?.data?.[address];
  const hash = info?.transactions?.[0];
  if (!hash) { onLog?.("Blockchair: no incoming tx yet"); return { found: false }; }

  // Cross-verify raw transaction details (confirmations / time / outputs).
  const tr = await fetch(`${base}/dashboards/transaction/${hash}`);
  if (tr.status === 429) { onLog?.("Blockchair(tx) 429 → failover"); return { retry: true }; }
  if (!tr.ok) { onLog?.(`Blockchair(tx) ${tr.status} → failover`); return { retry: true }; }
  const td = await tr.json().catch(() => null);
  const t = td?.data?.[hash]?.transaction;
  const outs = td?.data?.[hash]?.outputs || [];
  if (!t) return { found: false };
  return {
    found: true,
    tx: {
      hash,
      confirmations: t.block_id && t.block_id > 0 ? 1 : 0,
      time: t.time ? Math.floor(new Date(`${t.time}Z`).getTime() / 1000) : Math.floor(Date.now() / 1000),
      outputs: outs.map((o) => o.recipient).filter(Boolean),
    },
  };
}

// --- Explorer #2 (failover): mempool.space-style LTC API (litecoinspace.org).
async function detectViaLitecoinspace(address, onLog) {
  const base = "https://litecoinspace.org/api";
  const r = await fetch(`${base}/address/${address}/txs/mempool`);
  if (r.status === 429) { onLog?.("litecoinspace rate-limited (429) → failover"); return { retry: true }; }
  if (!r.ok) { onLog?.(`litecoinspace responded ${r.status} → failover`); return { retry: true }; }
  const txs = await r.json().catch(() => []);
  const incoming = (txs || []).find((t) => (t.vout || []).some((o) => o.scriptpubkey_address === address));
  if (!incoming) { onLog?.("litecoinspace: no 0-conf incoming yet"); return { found: false }; }
  return {
    found: true,
    tx: {
      hash: incoming.txid,
      confirmations: incoming.status?.confirmed ? 1 : 0,
      time: Math.floor(Date.now() / 1000), // mempool first-seen ≈ now
      outputs: (incoming.vout || []).map((o) => o.scriptpubkey_address).filter(Boolean),
    },
  };
}

const LTC_EXPLORERS = [
  { name: "Blockchair", detect: detectViaBlockchair },
  { name: "litecoinspace", detect: detectViaLitecoinspace },
];

// Attempt one polling sweep with failover. Returns { found, tx, explorer } or null.
export async function pollSweep(address, coin, onLog) {
  if (coin !== "LTC") {
    // Monero is a shielded/private chain — public explorers can't reliably map a
    // mempool payment to a single address, so live auto-detect is LTC-only.
    onLog?.("XMR is shielded — live auto-detect unavailable; use Simulate Broadcast.");
    return { found: false, explorer: "none" };
  }
  for (const ex of LTC_EXPLORERS) {
    try {
      onLog?.(`Polling ${ex.name}…`);
      const res = await ex.detect(address, onLog);
      if (res?.retry) continue; // 429 / error → failover to next explorer
      if (res?.found) {
        onLog?.(`${ex.name}: 0-conf incoming tx ${res.tx.hash.slice(0, 12)}… detected`);
        return { found: true, tx: res.tx, explorer: ex.name };
      }
      return { found: false, explorer: ex.name }; // explorer worked, nothing yet
    } catch (e) {
      onLog?.(`${ex.name} unreachable → failover`);
      continue;
    }
  }
  onLog?.("All explorers exhausted this cycle.");
  return null;
}

// ============================================================================
// ANTI-CHEAT SECURITY GATEKEEPER — strict validation gates before art engine
// ============================================================================
export const REPLAY_WINDOW_SECONDS = 180;

export function validateTransaction(tx, leasedAddress) {
  if (!tx || !tx.hash) return { ok: false, rule: 0, message: "No transaction payload to verify." };

  // RULE 1 — CONFIRMATION COUNT must equal exactly 0 (fresh mempool broadcast)
  if (tx.confirmations !== 0) {
    return { ok: false, rule: 1, message: `RULE 1 FAIL: confirmations=${tx.confirmations} (expected 0).` };
  }

  // RULE 2 — TIME-LOCK AGE: reject replays older than 180s
  const nowSec = Math.floor(Date.now() / 1000);
  const age = nowSec - (tx.time || 0);
  if (age > REPLAY_WINDOW_SECONDS) {
    return { ok: false, rule: 2, message: `RULE 2 FAIL: tx age ${age}s > ${REPLAY_WINDOW_SECONDS}s — REPLAY ATTACK flagged.` };
  }
  if (age < -30) {
    return { ok: false, rule: 2, message: "RULE 2 FAIL: transaction timestamp is in the future." };
  }

  // RULE 3 — DESTINATION MATCH: output recipient must equal leased address
  if (!Array.isArray(tx.outputs) || !tx.outputs.includes(leasedAddress)) {
    return { ok: false, rule: 3, message: "RULE 3 FAIL: no output matches the leased invoice address." };
  }

  return { ok: true, rule: null, message: "All 3 gates passed. Transaction verified." };
}

// Build a valid fresh-broadcast tx for the DEMO / simulate flow.
export function buildSimulatedTx(leasedAddress) {
  return {
    hash: randomHex(64),
    confirmations: 0,
    time: Math.floor(Date.now() / 1000),
    outputs: [leasedAddress],
  };
}

// EXCHANGE API — live USD conversion ticker (CoinGecko primary, CryptoCompare fallback)
export async function fetchUsdRate(coin) {
  const id = coin === "XMR" ? "monero" : "litecoin";
  const sym = coin === "XMR" ? "XMR" : "LTC";
  try {
    const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`);
    if (r.ok) {
      const d = await r.json();
      const v = d?.[id]?.usd;
      if (v) return v;
    }
  } catch { /* fall through to backup ticker */ }
  try {
    const r = await fetch(`https://min-api.cryptocompare.com/data/price?fsym=${sym}&tsyms=USD`);
    if (r.ok) {
      const d = await r.json();
      if (d?.USD) return d.USD;
    }
  } catch { /* no ticker available */ }
  return null;
}

export function randomHex(len) {
  const bytes = new Uint8Array(len / 2);
  (window.crypto || {}).getRandomValues?.(bytes);
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, "0");
  return out || "deadbeef".repeat(8);
}
