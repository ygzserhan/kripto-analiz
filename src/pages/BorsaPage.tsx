import { BistData } from "../hooks/useBistData";
import { formatTry } from "../utils";

function BorsaAlarmPaneli({ data }: { data: BistData }) {
  return (
    <div className="card" style={{ marginTop: "1.25rem" }}>
      <h2 className="card-title">Fiyat Alarmı Ekle</h2>

      <div className="card-toolbar">
        <select value={data.alertSymbol} onChange={(e) => data.setAlertSymbol(e.target.value)} className="select">
          {data.watchedSymbols.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <button
          onClick={() => data.setAlertDirection("below")}
          className={`btn btn-toggle${data.alertDirection === "below" ? " btn-toggle-active-critical" : ""}`}
        >
          Düşerse
        </button>
        <button
          onClick={() => data.setAlertDirection("above")}
          className={`btn btn-toggle${data.alertDirection === "above" ? " btn-toggle-active-good" : ""}`}
        >
          Yükselirse
        </button>

        <input
          type="number"
          value={data.alertPercent}
          onChange={(e) => data.setAlertPercent(e.target.value)}
          className="input"
          style={{ width: 70 }}
        />
        <span className="text-secondary">%</span>

        <button onClick={data.handleAddAlert} className="btn btn-borsa">
          Alarm Ekle
        </button>
      </div>

      <div style={{ marginTop: "1rem" }}>
        {data.alerts.length === 0 && (
          <p className="text-muted" style={{ fontSize: "0.9rem" }}>
            Aktif alarm yok.
          </p>
        )}
        {data.alerts.map((a) => (
          <div key={a.id} className="row row-between">
            <span className="table-num" style={{ fontSize: "0.9rem" }}>
              {a.symbol} {a.direction === "above" ? "≥" : "≤"} ₺{formatTry(a.targetPrice)}
            </span>
            <button
              onClick={() => data.handleRemoveAlert(a.id)}
              className="btn btn-ghost"
              style={{ color: "var(--critical)" }}
            >
              Sil
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

interface BorsaPageProps {
  data: BistData;
}

export default function BorsaPage({ data }: BorsaPageProps) {
  const sortedTransactions = [...data.transactions].sort((a, b) => b.timestamp - a.timestamp);

  return (
    <>
      <div className="card card-toolbar" style={{ marginBottom: "1.5rem" }}>
        <input
          type="text"
          value={data.newSymbolInput}
          onChange={(e) => data.setNewSymbolInput(e.target.value)}
          placeholder="örn. THYAO"
          className="input"
          style={{ width: 140 }}
        />
        <button onClick={data.handleAddSymbol} className="btn btn-borsa">
          Hisse Ekle
        </button>
        <span className="text-muted" style={{ fontSize: "0.78rem" }}>
          Fiyatlar resmi olmayan bir kaynaktan (Yahoo Finance) geliyor, 30 saniyede bir güncelleniyor.
        </span>
      </div>

      {data.addSymbolError && (
        <p className="text-critical" style={{ fontSize: "0.85rem", marginTop: "-1rem", marginBottom: "1rem" }}>
          {data.addSymbolError}
        </p>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1.25rem" }}>
        {data.watchedSymbols.map((symbol) => {
          const p = data.prices[symbol];
          const change = p ? p.price - p.previous_close : null;
          const changePercent = p && p.previous_close > 0 ? ((change as number) / p.previous_close) * 100 : null;
          const changeColor = change !== null ? (change >= 0 ? "var(--good)" : "var(--critical)") : "var(--ink-muted)";

          return (
            <div key={symbol} className="card">
              <div className="row-between" style={{ alignItems: "baseline" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <h2 style={{ margin: 0, fontSize: "1.1rem" }}>{symbol}</h2>
                  <button
                    onClick={() => data.handleRemoveSymbol(symbol)}
                    title="Listeden kaldır"
                    className="btn btn-ghost"
                  >
                    ✕
                  </button>
                </div>
              </div>
              {p ? (
                <>
                  <div className="text-muted" style={{ fontSize: "0.8rem", margin: "0.25rem 0" }}>
                    {p.name}
                  </div>
                  <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>₺{formatTry(p.price)}</div>
                  <div style={{ fontSize: "0.9rem", color: changeColor }}>
                    {change !== null
                      ? `${change >= 0 ? "+" : ""}₺${formatTry(change)} (${change >= 0 ? "+" : ""}${changePercent!.toFixed(2)}%)`
                      : "..."}
                  </div>
                </>
              ) : (
                <p className="text-muted">Fiyat bekleniyor...</p>
              )}
            </div>
          );
        })}

        {data.watchedSymbols.length === 0 && (
          <p className="text-muted">Henüz izlenen hisse yok, üstteki kutudan bir sembol ekle (örn. THYAO).</p>
        )}
      </div>

      <div className="card" style={{ marginTop: "1.25rem" }}>
        <h2 className="card-title">Cüzdan</h2>

        {data.holdings.filter((h) => h.quantity > 0).length === 0 && (
          <p className="text-muted" style={{ fontSize: "0.9rem" }}>
            Henüz varlık yok.
          </p>
        )}

        {data.holdings
          .filter((h) => h.quantity > 0)
          .map((h) => {
            const currentPrice = data.currentPriceOf(h.symbol);
            const currentValue = currentPrice !== null ? h.quantity * currentPrice : h.totalCost;
            const unrealizedPnl = currentValue - h.totalCost;
            const pnlColor = unrealizedPnl >= 0 ? "var(--good)" : "var(--critical)";

            return (
              <div key={h.symbol} className="row">
                <div className="row-between" style={{ alignItems: "baseline" }}>
                  <span style={{ fontSize: "0.95rem", fontWeight: 600 }}>{h.symbol}</span>
                  <span className="text-muted table-num" style={{ fontSize: "0.8rem" }}>
                    {h.quantity} adet
                  </span>
                </div>
                <div className="text-muted table-num" style={{ fontSize: "0.8rem" }}>
                  Ort. maliyet ₺{formatTry(h.avgCost)} · güncel{" "}
                  {currentPrice !== null ? `₺${formatTry(currentPrice)}` : "..."}
                </div>
                <div className="table-num" style={{ fontSize: "1.4rem", fontWeight: 700, color: pnlColor }}>
                  {unrealizedPnl >= 0 ? "+" : "-"}₺{formatTry(Math.abs(unrealizedPnl))}
                </div>
              </div>
            );
          })}

        {data.holdings.filter((h) => h.quantity > 0).length > 0 && (
          <div style={{ marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "2px solid #c3c2b7" }}>
            <div className="text-secondary" style={{ fontSize: "0.85rem" }}>
              Maliyet: ₺{formatTry(data.totalInvested)} · Güncel değer: ₺{formatTry(data.totalCurrentValue)}
            </div>
            <div
              style={{
                fontSize: "1.3rem",
                fontWeight: 700,
                color: data.totalUnrealizedPnl >= 0 ? "var(--good)" : "var(--critical)",
              }}
            >
              Değerlenmemiş: {data.totalUnrealizedPnl >= 0 ? "+" : "-"}₺{formatTry(Math.abs(data.totalUnrealizedPnl))}{" "}
              ({data.totalPnlPercent >= 0 ? "+" : ""}
              {data.totalPnlPercent.toFixed(2)}%)
            </div>
            {data.totalRealizedPnl !== 0 && (
              <div
                style={{
                  fontSize: "0.9rem",
                  color: data.totalRealizedPnl >= 0 ? "var(--good)" : "var(--critical)",
                }}
              >
                Gerçekleşen (satışlardan): {data.totalRealizedPnl >= 0 ? "+" : "-"}₺
                {formatTry(Math.abs(data.totalRealizedPnl))}
              </div>
            )}
          </div>
        )}
      </div>

      <BorsaAlarmPaneli data={data} />

      <div className="card" style={{ marginTop: "1.25rem" }}>
        <h2 className="card-title">İşlem Ekle</h2>

        <div className="card-toolbar">
          <select value={data.txSymbol} onChange={(e) => data.setTxSymbol(e.target.value)} className="select">
            {data.watchedSymbols.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <button
            onClick={() => data.setTxType("buy")}
            className={`btn btn-toggle${data.txType === "buy" ? " btn-toggle-active-good" : ""}`}
          >
            Alış
          </button>
          <button
            onClick={() => data.setTxType("sell")}
            className={`btn btn-toggle${data.txType === "sell" ? " btn-toggle-active-critical" : ""}`}
          >
            Satış
          </button>

          <input
            type="number"
            value={data.txQuantity}
            onChange={(e) => data.setTxQuantity(e.target.value)}
            placeholder="Miktar (adet)"
            className="input"
            style={{ width: 120 }}
          />

          <input
            type="number"
            value={data.txPrice}
            onChange={(e) => data.setTxPrice(e.target.value)}
            placeholder="Fiyat (₺)"
            className="input"
            style={{ width: 110 }}
          />
          <button onClick={data.fillCurrentTxPrice} className="btn btn-outline" style={{ fontSize: "0.8rem" }}>
            Şu anki fiyat
          </button>

          <input
            type="datetime-local"
            value={data.txTimestamp}
            onChange={(e) => data.setTxTimestamp(e.target.value)}
            className="input"
          />

          <button
            onClick={data.handleAddTransaction}
            className={`btn ${data.txType === "buy" ? "btn-good" : "btn-critical"}`}
          >
            {data.txType === "buy" ? "Alışı Kaydet" : "Satışı Kaydet"}
          </button>
        </div>

        <p className="text-muted" style={{ fontSize: "0.78rem", marginTop: "0.5rem" }}>
          Tarih boş bırakılırsa şu anki an kullanılır. Geçmişte yaptığın bir alım/satımı eklemek için tarihi ve o
          andaki fiyatı elle girebilirsin.
        </p>

        <h3 style={{ fontSize: "0.95rem", marginTop: "1.5rem", marginBottom: "0.5rem" }}>İşlem Geçmişi</h3>

        {sortedTransactions.length === 0 && (
          <p className="text-muted" style={{ fontSize: "0.9rem" }}>
            Henüz işlem yok.
          </p>
        )}

        {sortedTransactions.map((t) => (
          <div key={t.id} className="row row-between">
            <span className="table-num" style={{ fontSize: "0.85rem" }}>
              <strong style={{ color: t.type === "buy" ? "var(--good)" : "var(--critical)" }}>
                {t.type === "buy" ? "Alış" : "Satış"}
              </strong>{" "}
              · {t.symbol} · {t.quantity} adet · ₺{formatTry(t.price)} · {new Date(t.timestamp).toLocaleString("tr-TR")}
            </span>
            <button onClick={() => data.handleRemoveTransaction(t.id)} className="btn btn-ghost">
              Sil
            </button>
          </div>
        ))}
      </div>
    </>
  );
}