import React, { useEffect, useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import JSZip from "jszip";
import { Copy, Check, Download, ShieldCheck, Loader2, Coins, Package } from "lucide-react";
import { drawSpriteToCanvas } from "./spriteEngine";
import { fetchUsdRate } from "./blockchain";

const PULL_PRICE = 0.15;
// 5-for-4 bundle discount: five pulls cost the price of four.
const bundlePriceUsd = (n) => (n === 5 ? 4 : n) * PULL_PRICE;

const COIN_META = {
  LTC: { label: "Insert LTC", sub: "Single Turn", price: "$0.15", priceUsd: 0.15, uri: "litecoin", icon: Coins, tint: "#b8b8b8" },
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

const SpriteThumb = ({ sprite, active, onClick, index }) => {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) drawSpriteToCanvas(ref.current, sprite, 3);
  }, [sprite]);
  return (
    <button
      type="button"
      className={`inv-thumb ${active ? "is-active" : ""}`}
      data-testid={`sprite-thumb-${index}`}
      onClick={onClick}
      title={`${sprite.label} · ${sprite.rarity.name}`}
      style={{ borderColor: sprite.rarity.color }}
    >
      <canvas ref={ref} />
      <span className="inv-thumb-rarity" style={{ background: sprite.rarity.color }} />
    </button>
  );
};

export const InvoicePanel = ({
  machineState,
  coin,
  address,
  logs,
  error,
  sprites = [],
  activeIdx = 0,
  openedIdx = [],
  quantity = 1,
  onInsert,
  onQuantity,
  onSelectSprite,
  onReset,
}) => {
  const canvasRef = useRef(null);
  const activeSprite = sprites[activeIdx] || null;
  const [rate, setRate] = useState(null); // live USD ticker (CoinGecko → CryptoCompare)
  const [cryptoAmount, setCryptoAmount] = useState(null);
  const totalUsd = bundlePriceUsd(quantity || 1);

  // EXCHANGE API — fetch the live USD conversion ticker to price the QR invoice.
  useEffect(() => {
    if (machineState !== "INVOICE" || !coin) {
      setRate(null);
      setCryptoAmount(null);
      return;
    }
    const controller = new AbortController();
    (async () => {
      const usd = await fetchUsdRate(coin, controller.signal); // LTC/USD
      if (controller.signal.aborted) return;
      setRate(usd);
      const priceUsd = bundlePriceUsd(quantity || 1);
      if (usd && priceUsd) setCryptoAmount((priceUsd / usd).toFixed(8));
    })();
    return () => controller.abort(); // kill the ticker fetch on reset/unmount
  }, [machineState, coin, quantity]);

  const qrValue = `${COIN_META[coin]?.uri}:${address}${cryptoAmount ? `?amount=${cryptoAmount}` : ""}`;

  useEffect(() => {
    if (machineState === "REVEALED" && activeSprite && canvasRef.current) {
      drawSpriteToCanvas(canvasRef.current, activeSprite, 12);
    }
  }, [machineState, activeSprite]);

  const handleDownload = () => {
    if (!activeSprite) return;
    // CLEAN BLOB EXPORT: render onto a fresh offscreen canvas so the saved PNG
    // is free of the on-screen watermark grid / UNMINTED overlay.
    const clean = document.createElement("canvas");
    drawSpriteToCanvas(clean, activeSprite, 16);
    clean.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `gashabits-${activeSprite?.category?.replace(/\s+/g, "-").toLowerCase() || "sprite"}-${(activeSprite?.hash || "").slice(0, 8)}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "image/png");
  };

  // Zip every won sprite in the bundle into a single clean download.
  const handleDownloadAll = async () => {
    if (!sprites.length) return;
    const zip = new JSZip();
    sprites.forEach((s, i) => {
      const c = document.createElement("canvas");
      drawSpriteToCanvas(c, s, 16);
      const b64 = c.toDataURL("image/png").split(",")[1];
      const name = `${String(i + 1).padStart(2, "0")}-${s.rarity.name.toLowerCase()}-${s.category.replace(/\s+/g, "-").toLowerCase()}-${s.hash.slice(0, 8)}.png`;
      zip.file(name, b64, { base64: true });
    });
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gashabits-bundle-${sprites.length}-pulls.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <section className="inv-panel" data-testid="invoice-panel">
      <header className="inv-head">
        <h2 className="inv-title" data-testid="panel-title">PAYMENT&nbsp;/&nbsp;INVOICE</h2>
        <span className="inv-status-dot" data-state={machineState} />
      </header>

      {/* STATE 1 — IDLE: LTC bundle selector */}
      {machineState === "IDLE" && (
        <div className="inv-body" data-testid="state-idle">
          <p className="inv-lead">Pick your bundle and drop LTC to spin the vault. Zero accounts. Zero server. Pure client-side loot.</p>
          <div className="inv-coin-btn coin-ltc inv-bundle-card">
            <span className="inv-coin-top">
              <Coins size={20} /> <b>Litecoin Pulls</b>
            </span>
            <span className="inv-coin-sub">$0.15 per capsule turn</span>
          </div>
          <span className="inv-field-label">Choose package quantity</span>
          <div className="inv-qty" data-testid="qty-selector">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                className={`inv-qty-btn ${quantity === n ? "is-active" : ""}`}
                data-testid={`qty-${n}`}
                onClick={() => onQuantity?.(n)}
              >
                {n}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="inv-download inv-insert-btn"
            data-testid="insert-ltc-button"
            onClick={() => onInsert("LTC")}
          >
            <Coins size={18} /> Insert LTC — ${bundlePriceUsd(quantity).toFixed(2)} ({quantity} pull{quantity > 1 ? "s" : ""})
          </button>
          {quantity === 5 && (
            <div className="inv-deal" data-testid="bundle-deal">🎉 Bundle deal — 5 pulls for the price of 4!</div>
          )}
          <div className="inv-privacy">
            <ShieldCheck size={14} /> Traceless session — everything flushes when you close this tab.
          </div>
        </div>
      )}

      {/* STATE 1b — INVOICE: QR + address */}
      {machineState === "INVOICE" && (
        <div className="inv-body" data-testid="state-invoice">
          <p className="inv-lead">
            Scan to pay <b>${totalUsd.toFixed(2)}</b> in <b>LTC</b> for <b>{quantity} pull{quantity > 1 ? "s" : ""}</b>. Address leased from the shielded pool.
          </p>
          <div className="inv-qr-wrap" data-testid="invoice-qr">
            <QRCodeCanvas
              value={qrValue}
              size={168}
              bgColor="#0e0512"
              fgColor="#ff6ac1"
              level="M"
              includeMargin
            />
          </div>
          <div className="inv-rate" data-testid="invoice-amount">
            {cryptoAmount
              ? <>≈ <b>{cryptoAmount} {coin}</b> @ ${rate?.toLocaleString()} / {coin}</>
              : "Fetching live USD ticker…"}
          </div>
          <span className="inv-field-label">Leased {coin} address</span>
          <CopyRow value={address} />
          {coin === "LTC" ? (
            <div className="inv-live" data-testid="live-listener">
              <span className="inv-live-dot" /> LIVE — scanning the LTC mempool every 5s for your payment
              <div className="inv-log inv-log-mini" data-testid="live-log">
                {logs.slice(-4).map((l, i) => (
                  <div key={i} className="inv-log-line">&gt; {l}</div>
                ))}
              </div>
            </div>
          ) : (
            <div className="inv-live inv-live-muted" data-testid="live-listener">
              XMR is shielded — live auto-detect isn't possible on public explorers.
            </div>
          )}
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
            {machineState === "VERIFIED" && `Verified! ${quantity} capsule${quantity > 1 ? "s" : ""} incoming — crank the lever →`}
            {machineState === "DISPENSING" && `Dispensing your capsule${quantity > 1 ? "s" : ""}…`}
            {machineState === "DROPPED" && `Your capsule${quantity > 1 ? "s" : ""} dropped — tap ${quantity > 1 ? "each one" : "it"} in the tray to pop ${quantity > 1 ? "them" : "it"} open!`}
          </p>
        </div>
      )}

      {/* STATE 4 — REVEAL (supports multi-pull bundles) */}
      {machineState === "REVEALED" && activeSprite && (
        <div className="inv-body" data-testid="state-revealed">
          <div className="inv-reveal-counter" data-testid="reveal-counter">
            Opened {openedIdx.length} / {quantity}
          </div>
          <div className="inv-reveal-tags">
            <span className="inv-tag" data-testid="sprite-rarity" style={{ background: activeSprite.rarity.color, color: "#05020a" }}>
              {activeSprite.rarity.name}
            </span>
            <span className="inv-tag" data-testid="sprite-category">{activeSprite.category}</span>
            <span className="inv-tag inv-tag-alt" data-testid="sprite-palette">{activeSprite.paletteName}</span>
          </div>
          <h3 className="inv-reveal-name" data-testid="sprite-label">{activeSprite.label}</h3>
          <div className="inv-canvas-wrap" style={{ borderColor: activeSprite.rarity.color, boxShadow: `0 0 28px ${activeSprite.rarity.color}` }}>
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
          <div className="inv-seed" data-testid="sprite-seed">seed: {activeSprite.hash.slice(0, 24)}…</div>
          <button type="button" className="inv-download" data-testid="download-sprite-button" onClick={handleDownload}>
            <Download size={18} /> Download Sprite
          </button>
          {sprites.length > 1 && (
            <button type="button" className="inv-sim-btn inv-download-all" data-testid="download-all-button" onClick={handleDownloadAll}>
              <Package size={16} /> Download All ({sprites.length}) as ZIP
            </button>
          )}
          {openedIdx.length > 0 && (
            <div className="inv-thumbs" data-testid="opened-thumbs">
              {openedIdx.map((i) => (
                <SpriteThumb
                  key={i}
                  index={i}
                  sprite={sprites[i]}
                  active={i === activeIdx}
                  onClick={() => onSelectSprite?.(i)}
                />
              ))}
            </div>
          )}
          {openedIdx.length < quantity && (
            <p className="inv-lead" data-testid="remaining-note">
              {quantity - openedIdx.length} capsule{quantity - openedIdx.length > 1 ? "s" : ""} still in the tray — pop {quantity - openedIdx.length > 1 ? "them" : "it"} open!
            </p>
          )}
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
