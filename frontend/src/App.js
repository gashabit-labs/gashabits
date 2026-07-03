import React, { useCallback, useEffect, useRef, useState } from "react";
import "@/App.css";
import GashaponMachine from "@/gashapon/GashaponMachine";
import InvoicePanel from "@/gashapon/InvoicePanel";
import { generateSprite } from "@/gashapon/spriteEngine";
import {
  leaseAddress,
  pollSweep,
  validateTransaction,
  buildSimulatedTx,
} from "@/gashapon/blockchain";

const SESSION_KEY = "gasha_session_v1";

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
  const [sprite, setSprite] = useState(
    restored?.hash ? generateSprite(restored.hash) : null
  );

  const pollRef = useRef(null);
  const dispenseRef = useRef(false);
  const armedRef = useRef(false);
  const addLog = useCallback((line) => {
    setLogs((prev) => [...prev.slice(-8), `${new Date().toLocaleTimeString()} — ${line}`]);
  }, []);

  // TRACELESS EXIT — persist only to sessionStorage; tab close flushes memory.
  useEffect(() => {
    const snapshot = { machineState, coin, address, hash: sprite?.hash || null };
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(snapshot));
    } catch { /* ignore */ }
  }, [machineState, coin, address, sprite]);

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
    addLog("Listening to live LTC mempool (5s interval)…");
    const sweep = async () => {
      const result = await pollSweep(address, coin, addLog);
      if (cancelled || !result) return;
      if (result.found) {
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
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machineState, address, coin]);

  const resetAll = () => {
    stopPolling();
    dispenseRef.current = false;
    armedRef.current = false;
    setMachineState("IDLE");
    setCoin(null);
    setAddress(null);
    setSprite(null);
    setLogs([]);
    setError("");
    sessionStorage.removeItem(SESSION_KEY);
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

  // Move to processing (only reachable from INVOICE)
  const beginProcessing = () => {
    setMachineState("PROCESSING");
    addLog("Broadcast window open — starting multi-explorer polling");
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
    const check = validateTransaction(tx, address);
    if (!check.ok) {
      setError(check.message);
      addLog(check.message);
      return;
    }
    armedRef.current = true;
    stopPolling();
    dispenseRef.current = false;
    addLog(`VERIFIED ${tx.hash.slice(0, 16)}… — seeding art engine`);
    setSprite(generateSprite(tx.hash)); // generated but hidden until the capsule is opened
    setMachineState("VERIFIED");
    setError("");
    // Verification event strictly triggers the drop; the lever can also be pulled early.
    setTimeout(triggerDispense, 1000);
  };

  // DEMO simulate — from INVOICE we first flash processing, then verify.
  const handleSimulate = () => {
    setError("");
    if (machineState === "INVOICE") {
      beginProcessing();
      const tx = buildSimulatedTx(address);
      setTimeout(() => verifyAndArm(tx), 1600);
    } else {
      const tx = buildSimulatedTx(address);
      verifyAndArm(tx);
    }
  };

  // STATE 3 — the crank accepts touch + mouse; pulling early triggers the same dispense.
  const handleLever = () => {
    if (machineState === "VERIFIED") triggerDispense();
  };

  // STATE 4 — click the dropped capsule to open + reveal.
  const handleCapsule = () => {
    if (machineState !== "DROPPED") return;
    setMachineState("REVEALED");
  };

  const leverActive = machineState === "VERIFIED";
  const leverTurned = ["DISPENSING", "DROPPED", "REVEALED"].includes(machineState);
  const shaking = machineState === "DISPENSING";
  const capsuleVisible = ["DROPPED", "REVEALED"].includes(machineState);
  const capsuleOpened = machineState === "REVEALED";

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
            capsuleVisible={capsuleVisible}
            capsuleOpened={capsuleOpened}
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
            sprite={sprite}
            onInsert={handleInsert}
            onSimulate={handleSimulate}
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
