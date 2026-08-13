import { GoldData } from "../hooks/useGoldData";
import { formatTry } from "../utils";

function AltinAlarmPaneli({ gold }: { gold: GoldData }) {
  return (
    <div className="card" style={{ marginTop: "1.25rem" }}>
      <h2 className="card-title">Fiyat Alarmı Ekle</h2>

      <div className="card-toolbar">
        <button
          onClick={() => gold.setAlertDirection("below")}
          className={`btn btn-toggle${gold.alertDirection === "below" ? " btn-toggle-active-critical" : ""}`}
        >
          Düşerse
        </button>
        <button
          onClick={() => gold.setAlertDirection("above")}
          className={`btn btn-toggle${gold.alertDirection === "above" ? " btn-toggle-active-good" : ""}`}
        >
          Yükselirse
        </button>

        <input
          type="number"
          value={gold.alertPercent}
          onChange={(e) => gold.setAlertPercent(e.target.value)}
          className="input"
          style={{ width: 70 }}
        />
        <span className="text-secondary">%</span>

        <button onClick={gold.handleAddAlert} className="btn btn-altin">
          Alarm Ekle
        </button>
      </div>

      <div style={{ marginTop: "1rem" }}>
        {gold.alerts.length === 0 && (
          <p className="text-muted" style={{ fontSize: "0.9rem" }}>
            Aktif alarm yok.
          </p>
        )}
        {gold.alerts.map((a) => (
          <div key={a.id} className="row row-between">
            <span className="table-num" style={{ fontSize: "0.9rem" }}>
              Gram altın {a.direction === "above" ? "≥" : "≤"} ₺{formatTry(a.targetPrice)}
            </span>
            <button
              onClick={() => gold.handleRemoveAlert(a.id)}
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

interface AltinPageProps {
  gold: GoldData;
}

export default function AltinPage({ gold }: AltinPageProps) {
  const { goldPrice } = gold;
  const sortedTransactions = [...gold.transactions].sort((a, b) => b.timestamp - a.timestamp);

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem" }}>
        <div className="card" style={{ padding: "1.5rem" }}>
          <h2 className="card-title">Gram Altın</h2>

          {goldPrice === null ? (
            <p className="text-muted">Fiyat bekleniyor...</p>
          ) : (
            <>
              <div style={{ fontSize: "2.4rem", fontWeight: 700 }}>₺{formatTry(goldPrice.gram_try)}</div>

              <div className="text-secondary" style={{ fontSize: "0.95rem", marginTop: "0.5rem" }}>
                ${goldPrice.gram_usd.toFixed(2)} / gram
              </div>

              <div
                className="text-muted"
                style={{
                  marginTop: "1.25rem",
                  paddingTop: "1rem",
                  borderTop: "1px solid var(--gridline)",
                  fontSize: "0.85rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.35rem",
                }}
              >
                <span className="table-num">Ons (XAU/USD): ${goldPrice.ons_usd.toFixed(2)}</span>
                <span className="table-num">USD/TRY kuru: {formatTry(goldPrice.usd_try)}</span>
                <span>Son güncelleme: {new Date(goldPrice.time).toLocaleTimeString()}</span>
              </div>
            </>
          )}
        </div>

        <div className="card" style={{ padding: "1.5rem" }}>
          <h2 className="card-title">Cüzdan</h2>

          {gold.holding.quantity <= 0 ? (
            <p className="text-muted" style={{ fontSize: "0.9rem" }}>
              Henüz altın alışı yok.
            </p>
          ) : (
            <>
              <div className="text-secondary" style={{ fontSize: "0.9rem" }}>
                {gold.holding.quantity.toFixed(2)} gram
              </div>
              <div className="text-muted" style={{ fontSize: "0.85rem", marginTop: "0.25rem" }}>
                Ort. maliyet ₺{formatTry(gold.holding.avgCost)} · güncel değer ₺{formatTry(gold.currentValue)}
              </div>
              <div
                style={{
                  fontSize: "1.6rem",
                  fontWeight: 700,
                  color: gold.unrealizedPnl >= 0 ? "var(--good)" : "var(--critical)",
                  marginTop: "0.5rem",
                }}
              >
                {gold.unrealizedPnl >= 0 ? "+" : "-"}₺{formatTry(Math.abs(gold.unrealizedPnl))}
                <span style={{ fontSize: "1rem" }}>
                  {" "}
                  ({gold.totalPnlPercent >= 0 ? "+" : ""}
                  {gold.totalPnlPercent.toFixed(2)}%)
                </span>
              </div>
              {gold.holding.realizedPnl !== 0 && (
                <div
                  style={{
                    fontSize: "0.9rem",
                    color: gold.holding.realizedPnl >= 0 ? "var(--good)" : "var(--critical)",
                    marginTop: "0.35rem",
                  }}
                >
                  Gerçekleşen (satışlardan): {gold.holding.realizedPnl >= 0 ? "+" : "-"}₺
                  {formatTry(Math.abs(gold.holding.realizedPnl))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <AltinAlarmPaneli gold={gold} />

      <div className="card" style={{ marginTop: "1.25rem" }}>
        <h2 className="card-title">İşlem Ekle</h2>

        <div className="card-toolbar">
          <button
            onClick={() => gold.setTxType("buy")}
            className={`btn btn-toggle${gold.txType === "buy" ? " btn-toggle-active-good" : ""}`}
          >
            Alış
          </button>
          <button
            onClick={() => gold.setTxType("sell")}
            className={`btn btn-toggle${gold.txType === "sell" ? " btn-toggle-active-critical" : ""}`}
          >
            Satış
          </button>

          <input
            type="number"
            value={gold.txQuantity}
            onChange={(e) => gold.setTxQuantity(e.target.value)}
            placeholder="Miktar (gram)"
            className="input"
            style={{ width: 120 }}
          />

          <input
            type="number"
            value={gold.txPrice}
            onChange={(e) => gold.setTxPrice(e.target.value)}
            placeholder="Fiyat (₺/gram)"
            className="input"
            style={{ width: 130 }}
          />
          <button onClick={gold.fillCurrentTxPrice} className="btn btn-outline" style={{ fontSize: "0.8rem" }}>
            Şu anki fiyat
          </button>

          <input
            type="datetime-local"
            value={gold.txTimestamp}
            onChange={(e) => gold.setTxTimestamp(e.target.value)}
            className="input"
          />

          <button
            onClick={gold.handleAddTransaction}
            className={`btn ${gold.txType === "buy" ? "btn-good" : "btn-critical"}`}
          >
            {gold.txType === "buy" ? "Alışı Kaydet" : "Satışı Kaydet"}
          </button>
        </div>

        <p className="text-muted" style={{ fontSize: "0.78rem", marginTop: "0.5rem" }}>
          Tarih boş bırakılırsa şu anki an kullanılır. Geçmişte kuyumcudan aldığın bir altını, o günkü gram
          fiyatıyla ve tarihiyle buradan girebilirsin.
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
              · {t.quantity} gram · ₺{formatTry(t.price)} · {new Date(t.timestamp).toLocaleString("tr-TR")}
            </span>
            <button onClick={() => gold.handleRemoveTransaction(t.id)} className="btn btn-ghost">
              Sil
            </button>
          </div>
        ))}
      </div>
    </>
  );
}