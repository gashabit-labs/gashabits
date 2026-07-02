import React, { useEffect, useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { Copy, Check, Download, ShieldCheck, Loader2, Bitcoin, Coins, Zap } from "lucide-react";
import { drawSpriteToCanvas } from "./spriteEngine";

const COIN_META = {
  LTC: { label: "Insert LTC", sub: "Single Turn", price: "£0.10", uri: "litecoin", icon: Coins, tint: "#b8b8b8" },
  XMR: { label: "Insert XMR", sub: "Multi-Token Roll", price: "£1.00", uri: "monero", icon: Bitcoin, tint: "#ff7b00" },
};

const CopyRow = ({ value }) => {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="inv-copy"
      data-testid="copy-address-button"
      onClick={() => {
        navigator.clipboard?.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      }}
    >
      <span className="inv-copy-text" data-testid="invoice-address">{value}</span>
      {copied ? <Check size={16} /> : <Copy size={16} />}
    </button>
  );
};

export const InvoicePanel = ({
  machineState,
  coin,
  address,
  logs,
  error,
  sprite,
  onInsert,
  onSimulate,
  onReset,
}) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (machineState === "REVEALED" && sprite && canvasRef.current) {
      drawSpriteToCanvas(canvasRef.current, sprite, 12);
    }
  }, [machineState, sprite]);

  const handleDownload = () => {
    if (!sprite) return;
    // CLEAN BLOB EXPORT: render the sprite onto a fresh offscreen canvas so the
    // saved PNG is free of the on-screen watermark grid / UNMINTED overlay.
    const clean = document.createElement("canvas");
    drawSpriteToCanvas(clean, sprite, 16);
    clean.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `gashabits-${sprite?.category?.replace(/\s+/g, "-").toLowerCase() || "sprite"}-${(sprite?.hash || "").slice(0, 8)}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "image/png");
  };

  return (
    <section className="inv-panel" data-testid="invoice-panel">
      <header className="inv-head">
        <h2 className="inv-title" data-testid="panel-title">PAYMENT&nbsp;/&nbsp;INVOICE</h2>
        <span className="inv-status-dot" data-state={machineState} />
      </header>

      {/* STATE 1 — IDLE: coin buttons */}
      {machineState === "IDLE" && (
        <div className="inv-body" data-testid="state-idle">
          <p className="inv-lead">Drop a coin to spin the vault. Zero accounts. Zero server. Pure client-side loot.</p>
          <div className="inv-coins">
            {Object.entries(COIN_META).map(([key, m]) => {
              const Icon = m.icon;
              return (
                <button
                  key={key}
                  type="button"
                  className={`inv-coin-btn coin-${key.toLowerCase()}`}
                  data-testid={`insert-${key.toLowerCase()}-button`}
                  onClick={() => onInsert(key)}
                >
                  <span className="inv-coin-top">
                    <Icon size={20} />
                    <b>{m.label}</b>
                  </span>
                  <span className="inv-coin-sub">{m.sub}</span>
                  <span className="inv-coin-price">{m.price}</span>
                </button>
              );
            })}
          </div>
          <div className="inv-privacy">
            <ShieldCheck size={14} /> Traceless session — everything flushes when you close this tab.
          </div>
        </div>
      )}

      {/* STATE 1b — INVOICE: QR + address */}
      {machineState === "INVOICE" && (
        <div className="inv-body" data-testid="state-invoice">
          <p className="inv-lead">
            Scan to pay <b>{COIN_META[coin]?.price}</b> in <b>{coin}</b>. A random leased address was pulled from the shielded pool.
          </p>
          <div className="inv-qr-wrap" data-testid="invoice-qr">
            <QRCodeCanvas
              value={`${COIN_META[coin]?.uri}:${address}`}
              size={168}
              bgColor="#0e0512"
              fgColor="#ff6ac1"
              level="M"
              includeMargin
            />
          </div>
          <span className="inv-field-label">Leased {coin} address</span>
          <CopyRow value={address} />
          <button type="button" className="inv-sim-btn" data-testid="simulate-payment-button" onClick={onSimulate}>
            <Zap size={16} /> DEMO: Simulate Broadcast
          </button>
          <button type="button" className="inv-ghost" data-testid="cancel-invoice-button" onClick={onReset}>
            Cancel
          </button>
        </div>
      )}

      {/* STATE 2 — PROCESSING: glowing marquee */}
      {machineState === "PROCESSING" && (
        <div className="inv-body" data-testid="state-processing">
          <div className="inv-marquee" data-testid="processing-marquee">
            <span>Coin Inserted! Waiting for Blockchain Broadcast&nbsp;•&nbsp;Coin Inserted! Waiting for Blockchain Broadcast&nbsp;•&nbsp;</span>
          </div>
          <div className="inv-spinner"><Loader2 className="inv-spin" size={30} /></div>
          <div className="inv-log" data-testid="explorer-log">
            {logs.map((l, i) => (
              <div key={i} className="inv-log-line">&gt; {l}</div>
            ))}
          </div>
          <button type="button" className="inv-sim-btn" data-testid="force-verify-button" onClick={onSimulate}>
            <Zap size={16} /> DEMO: Force Verified Broadcast
          </button>
        </div>
      )}

      {/* STATE 2c — VERIFIED / DISPENSING */}
      {(machineState === "VERIFIED" || machineState === "DISPENSING" || machineState === "DROPPED") && (
        <div className="inv-body" data-testid="state-verified">
          <div className="inv-verified" data-testid="verified-banner">
            <ShieldCheck size={20} /> Anti-cheat gates passed
          </div>
          <ul className="inv-gates">
            <li><Check size={14} /> Rule 1 — 0 confirmations (fresh mempool)</li>
            <li><Check size={14} /> Rule 2 — within 180s replay window</li>
            <li><Check size={14} /> Rule 3 — destination address matched</li>
          </ul>
          <p className="inv-lead">
            {machineState === "VERIFIED" && "Verified! The machine is cranking — or pull the lever yourself →"}
            {machineState === "DISPENSING" && "Dispensing your capsule…"}
            {machineState === "DROPPED" && "A capsule dropped into the tray — tap it to crack it open!"}
          </p>
        </div>
      )}

      {/* STATE 4 — REVEAL */}
      {machineState === "REVEALED" && sprite && (
        <div className="inv-body" data-testid="state-revealed">
          <div className="inv-reveal-tags">
            <span className="inv-tag" data-testid="sprite-category">{sprite.category}</span>
            <span className="inv-tag inv-tag-alt" data-testid="sprite-palette">{sprite.paletteName}</span>
          </div>
          <h3 className="inv-reveal-name" data-testid="sprite-label">{sprite.label}</h3>
          <div className="inv-canvas-wrap">
            {/* ANTI-SCREENSHOT: watermark grid + UNMINTED text are DOM overlays only,
                never painted onto the canvas — so the downloaded blob stays clean. */}
            <div className="canvas-guard" data-testid="canvas-guard">
              <canvas ref={canvasRef} className="inv-canvas" data-testid="sprite-canvas" />
              <div className="wm-grid" data-testid="watermark-grid" aria-hidden />
              <div className="wm-text" data-testid="watermark-text" aria-hidden>
                <span>UNMINTED</span>
              </div>
            </div>
          </div>
          <div className="inv-seed" data-testid="sprite-seed">seed: {sprite.hash.slice(0, 24)}…</div>
          <button type="button" className="inv-download" data-testid="download-sprite-button" onClick={handleDownload}>
            <Download size={18} /> Download Sprite
          </button>
          <button type="button" className="inv-ghost" data-testid="play-again-button" onClick={onReset}>
            Insert another coin
          </button>
        </div>
      )}

      {error && <div className="inv-error" data-testid="invoice-error">{error}</div>}
    </section>
  );
};

export default InvoicePanel;
