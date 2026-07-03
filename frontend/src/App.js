import React, { useCallback, useEffect, useRef, useState } from "react";
import "@/App.css";
import GashaponMachine from "@/gashapon/GashaponMachine";
import InvoicePanel from "@/gashapon/InvoicePanel";
import { generateSprite } from "@/gashapon/spriteEngine";
import {
  leaseAddress,
  pollSweep,
  validateTransaction,
} from "@/gashapon/blockchain";

const SESSION_KEY = "gasha_session_v1";

// Rotate the hash so each pull in a bundle seeds a distinct (but deterministic) sprite.
const rotateHex = (h, n) => {
  const c = (h || "").replace(/^0x/, "");
  if (!c) return c;
  const k = ((n % c.length) + c.length) % c.length;
  return c.slice(k) + c.slice(0, k);
};
const genPulls = (hash, count) =>
  Array.from({ length: Math.max(1, count) }, (_, i) => generateSprite(rotateHex(hash, i * 11)));

function loadSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function App() {
  const restored = loadSession();
  const [machineState, setMachineState] = useState(restored?.machineState || "IDLE");
  const [coin, setCoin] = useState(restored?.coin || null);
  const [address, setAddress] = useState(restored?.address || null);
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState("");
  const [quantity, setQuantity] = useState(restored?.quantity || 1);
  const [sprites, setSprites] = useState(
    restored?.hash ? genPulls(restored.hash, restored?.quantity || 1) : []
  );
  const [openedIdx, setOpenedIdx] = useState([]);
  const [activeIdx, setActiveIdx] = useState(0);

  const pollRef = useRef(null);
  const dispenseRef = useRef(false);
  const armedRef = useRef(false);
  const consumedRef = useRef(new Set()); // tx hashes already redeemed this session
  const abortRef = useRef(null);         // kills in-flight explorer fetches on reset
  const addLog = useCallback((line) => {
    setLogs((prev) => [...prev.slice(-8), `${new Date().toLocaleTimeString()} — ${line}`]);
  }, []);

  // TRACELESS EXIT — persist only to sessionStorage; tab close flushes memory.
  useEffect(() => {
    if (machineState === "IDLE") {
      // Fresh/idle session holds no transaction — keep the cache fully wiped.
      sessionStorage.removeItem(SESSION_KEY);
      return;
    }
    const snapshot = { machineState, coin, address, hash: sprites[0]?.hash || null, quantity };
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(snapshot));
    } catch { /* ignore */ }
  }, [machineState, coin, address, sprites, quantity]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // LIVE MEMPOOL POLLING — the primary trigger. As soon as the LTC invoice is
  // shown we poll the failover explorer pool every 5s for a 0-conf incoming tx.
  useEffect(() => {
    const live = (machineState === "INVOICE" || machineState === "PROCESSING") && coin === "LTC";
    if (!live || !address) return;
    let cancelled = false;
    const controller = new AbortController();
    abortRef.current = controller;
    addLog("Listening to live LTC mempool (5s interval)…");
    const sweep = async () => {
      const result = await pollSweep(address, coin, addLog, controller.signal);
      if (cancelled || controller.signal.aborted || !result) return;
      if (result.found) {
        // STRICT UNIQUENESS: never redeem a hash that was already consumed.
        if (consumedRef.current.has(result.tx.hash)) {
          addLog(`Ignoring already-redeemed tx ${result.tx.hash.slice(0, 12)}… — awaiting a fresh broadcast.`);
          return;
        }
        const check = validateTransaction(result.tx, address);
        if (check.ok) {
          verifyAndArm(result.tx);
        } else {
          addLog(check.message);
        }
      }
    };
    sweep();
    pollRef.current = setInterval(sweep, 5000);
    return () => {
      cancelled = true;
      controller.abort(); // explicitly kill any in-flight fetch on state change/reset
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machineState, address, coin]);

  const resetAll = () => {
    stopPolling();
    abortRef.current?.abort(); // kill active async fetch routines
    abortRef.current = null;
    dispenseRef.current = false;
    armedRef.current = false;
    setMachineState("IDLE");
    setCoin(null);
    setAddress(null);
    setSprites([]);    // clears the cached tx hash + all pulls from memory
    setQuantity(1);
    setOpenedIdx([]);
    setActiveIdx(0);
    setLogs([]);
    setError("");
    sessionStorage.removeItem(SESSION_KEY); // wipe the session cache entirely
  };

  const handleInsert = (which) => {
    setError("");
    armedRef.current = false;
    dispenseRef.current = false;
    const leased = leaseAddress(which);
    setCoin(which);
    setAddress(leased);
    setMachineState("INVOICE");
    addLog(`Leased ${which} address ${leased.slice(0, 10)}… from shielded pool`);
  };

  // STATE 3 — dispense: 1.2s shake + lever rotates 180° + capsule drops into tray.
  const triggerDispense = () => {
    if (dispenseRef.current) return;
    dispenseRef.current = true;
    setMachineState("DISPENSING");
    setTimeout(() => setMachineState("DROPPED"), 1250);
  };

  // ANTI-CHEAT gatekeeper passed → seed engine (result stays HIDDEN) then dispense.
  const verifyAndArm = (tx) => {
    if (armedRef.current) return; // ignore duplicate live/simulate triggers
    // STRICT UNIQUENESS: a hash redeemed earlier this session can never pay again.
    if (consumedRef.current.has(tx.hash)) {
      addLog(`Duplicate tx ${tx.hash.slice(0, 12)}… rejected — a unique broadcast is required.`);
      return;
    }
    const check = validateTransaction(tx, address);
    if (!check.ok) {
      setError(check.message);
      addLog(check.message);
      return;
    }
    armedRef.current = true;
    consumedRef.current.add(tx.hash); // burn this hash so it can never redeem again
    stopPolling();
    abortRef.current?.abort();
    dispenseRef.current = false;
    addLog(`VERIFIED ${tx.hash.slice(0, 16)}… — seeding art engine`);
    setSprites(genPulls(tx.hash, quantity)); // N deterministic pulls, hidden until popped
    setOpenedIdx([]);
    setActiveIdx(0);
    setMachineState("VERIFIED");
    setError("");
    // Verification event strictly triggers the drop; the lever can also be pulled early.
    setTimeout(triggerDispense, 1000);
  };

  // STATE 3 — the crank accepts touch + mouse; pulling early triggers the same dispense.
  const handleLever = () => {
    if (machineState === "VERIFIED") triggerDispense();
  };

  // STATE 4 — click a dropped capsule to pop it open + reveal its sprite.
  const handleCapsule = (index) => {
    if (machineState !== "DROPPED" && machineState !== "REVEALED") return;
    if (index == null || index < 0 || index >= sprites.length) return;
    setOpenedIdx((prev) => (prev.includes(index) ? prev : [...prev, index]));
    setActiveIdx(index);
    setMachineState("REVEALED");
  };

  const leverActive = machineState === "VERIFIED";
  const leverTurned = ["DISPENSING", "DROPPED", "REVEALED"].includes(machineState);
  const shaking = machineState === "DISPENSING";
  const capsules = ["DROPPED", "REVEALED"].includes(machineState)
    ? sprites.map((s, i) => ({ index: i, opened: openedIdx.includes(i) }))
    : [];

  return (
    <div className="gasha-app" data-testid="gasha-app">
      <div className="gasha-scanlines" aria-hidden />
      <header className="gasha-header">
        <h1 className="gasha-h1" data-testid="app-title">GASHABITS</h1>
        <p className="gasha-tag">The Traceless 8-Bit Vending Machine</p>
      </header>

      <main className="gasha-main" data-testid="gasha-layout">
        <div className="gasha-col-machine">
          <GashaponMachine
            leverActive={leverActive}
            leverTurned={leverTurned}
            shaking={shaking}
            capsules={capsules}
            onLever={handleLever}
            onCapsule={handleCapsule}
          />
        </div>
        <div className="gasha-col-panel">
          <InvoicePanel
            machineState={machineState}
            coin={coin}
            address={address}
            logs={logs}
            error={error}
            sprites={sprites}
            activeIdx={activeIdx}
            openedIdx={openedIdx}
            quantity={quantity}
            onInsert={handleInsert}
            onQuantity={setQuantity}
            onSelectSprite={setActiveIdx}
            onReset={resetAll}
          />
        </div>
      </main>

      <footer className="gasha-footer" data-testid="app-footer">
        GashaBits secure session - everything flushes when you close this tab.
      </footer>
    </div>
  );
}

export default App;
