import { Line } from "react-chartjs-2";
import { CryptoData } from "../hooks/useCryptoData";
import { formatPrice, formatUsd, rsiStatus } from "../utils";

interface CoinPageProps {
  data: CryptoData;
}

const INTERVAL_OPTIONS = [
  { label: "Anlık (1 sn)", seconds: 1 },
  { label: "5 saniye", seconds: 5 },
  { label: "30 saniye", seconds: 30 },
  { label: "1 dakika", seconds: 60 },
  { label: "5 dakika", seconds: 300 },
  { label: "10 dakika", seconds: 600 },
];

export default function CoinPage({ data }: CoinPageProps) {
  const sortedTransactions = [...data.transactions].sort((a, b) => b.timestamp - a.timestamp);

  return (
    <>
      <div className="card card-toolbar" style={{ marginBottom: "1.5rem" }}>
        <input
          type="text"
          value={data.newSymbolInput}
          onChange={(e) => data.setNewSymbolInput(e.target.value)}
          placeholder="örn. DOGEUSDT"
          className="input"
          style={{ width: 140 }}
        />
        <button onClick={data.handleAddSymbol} className="btn btn-primary">
          Coin Ekle
        </button>

        <div className="divider-v" />

        <label className="text-secondary" style={{ fontSize: "0.85rem" }}>
          Yenileme sıklığı:
        </label>
        <select
          value={data.refreshInterval}
          onChange={(e) => data.handleIntervalChange(Number(e.target.value))}
          className="select"
        >
          {INTERVAL_OPTIONS.map((opt) => (
            <option key={opt.seconds} value={opt.seconds}>
              {opt.label}
            </option>
          ))}
        </select>

        <button onClick={data.handleRefreshNow} className="btn btn-outline">
          Şimdi Yenile
        </button>
      </div>

      {data.addSymbolError && (
        <p className="text-critical" style={{ fontSize: "0.85rem", marginTop: "-1rem", marginBottom: "1rem" }}>
          {data.addSymbolError}
        </p>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "1.25rem" }}>
        {data.watchedSymbols.map((symbol) => {
          const history = data.priceHistories[symbol] ?? [];
          const displayPrice = data.currentPriceOf(symbol);
          const rsi = data.latestRsi[symbol] ?? null;
          const status = rsiStatus(rsi);

          const chartData = {
            labels: history.map((p) => p.time),
            datasets: [
              {
                label: "Fiyat",
                data: history.map((p) => p.price),
                borderColor: "#2a78d6",
                backgroundColor: "rgba(42, 120, 214, 0.08)",
                borderWidth: 2,
                pointRadius: 0,
                tension: 0.25,
                fill: true,
              },
              {
                label: "SMA(14)",
                data: history.map((p) => p.sma),
                borderColor: "#eb6834",
                borderWidth: 1.5,
                borderDash: [4, 4],
                pointRadius: 0,
                tension: 0.25,
                fill: false,
              },
            ],
          };

          const chartOptions = {
            responsive: true,
            maintainAspectRatio: false,
            animation: false as const,
            plugins: {
              legend: {
                display: true,
                position: "top" as const,
                labels: { color: "#52514e", boxWidth: 12, font: { size: 11 } },
              },
              tooltip: { enabled: true },
            },
            scales: {
              x: { grid: { display: false }, ticks: { color: "#898781", maxTicksLimit: 5 } },
              y: {
                grid: { color: "#e1e0d9" },
                ticks: {
                  color: "#898781",
                  callback: (v: number | string) => formatPrice(Number(v)),
                },
              },
            },
          };

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
                <span style={{ fontSize: "1.3rem" }}>
                  {displayPrice !== null ? `$${formatPrice(displayPrice)}` : "..."}
                </span>
              </div>

              <div style={{ fontSize: "0.85rem", color: status.color, margin: "0.35rem 0 0.75rem" }}>
                {status.label}
              </div>

              <div style={{ height: 220 }}>
                {history.length > 1 && <Line data={chartData} options={chartOptions} />}
              </div>
            </div>
          );
        })}

        {data.watchedSymbols.length === 0 && (
          <p className="text-muted">Henüz izlenen coin yok, üstteki kutudan bir sembol ekle (örn. BTCUSDT).</p>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem", marginTop: "2rem" }}>
        <div className="card">
          <h2 className="card-title">Fiyat Alarmı Ekle</h2>

          <div className="card-toolbar">
            <select
              value={data.alertSymbol}
              onChange={(e) => data.setAlertSymbol(e.target.value)}
              className="select"
            >
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

            <button onClick={data.handleAddAlert} className="btn btn-primary">
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
                <span style={{ fontSize: "0.9rem" }}>
                  {a.symbol} {a.direction === "above" ? "≥" : "≤"} ${formatPrice(a.targetPrice)}
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

        <div className="card">
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
                    Ort. maliyet ${formatPrice(h.avgCost)} · güncel{" "}
                    {currentPrice !== null ? `$${formatPrice(currentPrice)}` : "..."}
                  </div>
                  <div className="table-num" style={{ fontSize: "1.4rem", fontWeight: 700, color: pnlColor }}>
                    {formatUsd(unrealizedPnl)}
                  </div>
                </div>
              );
            })}

          {data.holdings.filter((h) => h.quantity > 0).length > 0 && (
            <div style={{ marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "2px solid #c3c2b7" }}>
              <div className="text-secondary" style={{ fontSize: "0.85rem" }}>
                Maliyet: ${data.totalInvested.toFixed(2)} · Güncel değer: ${data.totalCurrentValue.toFixed(2)}
              </div>
              <div
                style={{
                  fontSize: "1.3rem",
                  fontWeight: 700,
                  color: data.totalUnrealizedPnl >= 0 ? "var(--good)" : "var(--critical)",
                }}
              >
                Değerlenmemiş: {formatUsd(data.totalUnrealizedPnl)} ({data.totalUnrealizedPnl >= 0 ? "+" : ""}
                {data.totalPnlPercent.toFixed(2)}%)
              </div>
              {data.totalRealizedPnl !== 0 && (
                <div
                  style={{
                    fontSize: "0.9rem",
                    color: data.totalRealizedPnl >= 0 ? "var(--good)" : "var(--critical)",
                  }}
                >
                  Gerçekleşen (satışlardan): {formatUsd(data.totalRealizedPnl)}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

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
            placeholder="Fiyat ($)"
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
              · {t.symbol} · {t.quantity} adet · ${formatPrice(t.price)} ·{" "}
              {new Date(t.timestamp).toLocaleString("tr-TR")}
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