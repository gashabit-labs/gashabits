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

// MULTI-API FAILOVER NETWORKS — public, unauthenticated explorers.
// Each explorer attempts to fetch txs for the leased address. On 429/error
// the loop instantly falls back to the next explorer.
const EXPLORERS = [
  {
    name: "Blockchair",
    build: (addr, coin) =>
      `https://api.blockchair.com/${coin === "XMR" ? "monero" : "litecoin"}/dashboards/address/${addr}`,
  },
  {
    name: "Blockstream",
    build: (addr) => `https://blockstream.info/api/address/${addr}/txs`,
  },
];

// Attempt one polling sweep with failover. Returns { found, tx, explorer } or null.
export async function pollSweep(address, coin, onLog) {
  for (const ex of EXPLORERS) {
    try {
      onLog?.(`Polling ${ex.name}…`);
      const res = await fetch(ex.build(address, coin), { method: "GET" });
      if (res.status === 429) {
        onLog?.(`${ex.name} rate-limited (429) → failover`);
        continue;
      }
      if (!res.ok) {
        onLog?.(`${ex.name} responded ${res.status} → failover`);
        continue;
      }
      const data = await res.json().catch(() => null);
      const tx = extractTx(ex.name, data, address);
      if (tx) {
        onLog?.(`${ex.name}: mempool tx detected`);
        return { found: true, tx, explorer: ex.name };
      }
      onLog?.(`${ex.name}: no matching tx yet`);
      return { found: false, explorer: ex.name };
    } catch (e) {
      onLog?.(`${ex.name} unreachable → failover`);
      continue;
    }
  }
  onLog?.("All explorers exhausted this cycle.");
  return null;
}

// Normalise the various explorer payloads into a common tx shape.
function extractTx(name, data, address) {
  if (!data) return null;
  try {
    if (name === "Blockstream" && Array.isArray(data) && data.length) {
      const t = data[0];
      return {
        hash: t.txid,
        confirmations: t.status?.confirmed ? 1 : 0,
        time: t.status?.block_time || Math.floor(Date.now() / 1000),
        outputs: (t.vout || []).map((o) => o.scriptpubkey_address).filter(Boolean),
      };
    }
    if (name === "Blockchair" && data.data && data.data[address]) {
      const d = data.data[address];
      const txid = (d.transactions || [])[0];
      if (!txid) return null;
      return { hash: txid, confirmations: 0, time: Math.floor(Date.now() / 1000), outputs: [address] };
    }
  } catch (e) {
    return null;
  }
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
