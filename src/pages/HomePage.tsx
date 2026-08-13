import { ReactNode } from "react";
import { Doughnut } from "react-chartjs-2";
import { CryptoData } from "../hooks/useCryptoData";
import { GoldData } from "../hooks/useGoldData";
import { BistData } from "../hooks/useBistData";
import { Page } from "../types";
import { formatUsd, formatTry, CHART_PALETTE } from "../utils";

interface HomePageProps {
  crypto: CryptoData;
  gold: GoldData;
  bist: BistData;
  onNavigate: (page: Page) => void;
}

function MarketCard({
  title,
  btnClass,
  onNavigate,
  children,
}: {
  title: string;
  btnClass: string;
  onNavigate: () => void;
  children: ReactNode;
}) {
  return (
    <div className="card card-interactive">
      <h2 className="card-title">{title}</h2>
      <div style={{ flex: 1 }}>{children}</div>
      <button onClick={onNavigate} className={`btn ${btnClass}`} style={{ marginTop: "1rem", padding: "0.6rem" }}>
        İncele →
      </button>
    </div>
  );
}

export default function HomePage({ crypto, gold, bist, onNavigate }: HomePageProps) {
  // Coin dağılımı: elde tutulan her sembolün güncel toplam değeri (halka grafik için)
  const activeHoldings = crypto.holdings.filter((h) => h.quantity > 0);

  const coinLabels = activeHoldings.map((h) => h.symbol);
  const coinValues = activeHoldings.map((h) => {
    const price = crypto.currentPriceOf(h.symbol);
    return price !== null ? h.quantity * price : h.totalCost;
  });
  const coinTotal = coinValues.reduce((a, b) => a + b, 0);

  const doughnutData = {
    labels: coinLabels,
    datasets: [
      {
        data: coinValues,
        backgroundColor: coinLabels.map((_, i) => CHART_PALETTE[i % CHART_PALETTE.length]),
        borderColor: "#fcfcfb",
        borderWidth: 2,
        hoverOffset: 14,
      },
    ],
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "right" as const,
        labels: { color: "#52514e", boxWidth: 12, font: { size: 11 } },
      },
      tooltip: {
        bodyFont: { size: 14 },
        titleFont: { size: 14 },
        callbacks: {
          label: (ctx: { label?: string; parsed: number }) => {
            const value = ctx.parsed;
            const pct = coinTotal > 0 ? ((value / coinTotal) * 100).toFixed(1) : "0";
            return `${ctx.label}: $${value.toFixed(2)} (%${pct})`;
          },
        },
      },
    },
  };

  // Borsa dağılımı: elde tutulan her hissenin güncel toplam değeri (halka grafik için)
  const activeBistHoldings = bist.holdings.filter((h) => h.quantity > 0);

  const bistLabels = activeBistHoldings.map((h) => h.symbol);
  const bistValues = activeBistHoldings.map((h) => {
    const price = bist.currentPriceOf(h.symbol);
    return price !== null ? h.quantity * price : h.totalCost;
  });
  const bistTotal = bistValues.reduce((a, b) => a + b, 0);

  const bistDoughnutData = {
    labels: bistLabels,
    datasets: [
      {
        data: bistValues,
        backgroundColor: bistLabels.map((_, i) => CHART_PALETTE[i % CHART_PALETTE.length]),
        borderColor: "#fcfcfb",
        borderWidth: 2,
        hoverOffset: 14,
      },
    ],
  };

  const bistDoughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "right" as const,
        labels: { color: "#52514e", boxWidth: 12, font: { size: 11 } },
      },
      tooltip: {
        bodyFont: { size: 14 },
        titleFont: { size: 14 },
        callbacks: {
          label: (ctx: { label?: string; parsed: number }) => {
            const value = ctx.parsed;
            const pct = bistTotal > 0 ? ((value / bistTotal) * 100).toFixed(1) : "0";
            return `${ctx.label}: ₺${formatTry(value)} (%${pct})`;
          },
        },
      },
    },
  };

  const coinPnlColor = crypto.totalPnl >= 0 ? "var(--good)" : "var(--critical)";
  const goldPnlColor = gold.totalPnl >= 0 ? "var(--good)" : "var(--critical)";
  const bistPnlColor = bist.totalPnl >= 0 ? "var(--good)" : "var(--critical)";

  return (
    <div className="card-grid">
      <MarketCard title="Coin Piyasası" btnClass="btn-primary" onNavigate={() => onNavigate("coin")}>
        {activeHoldings.length === 0 ? (
          <p className="text-muted" style={{ fontSize: "0.9rem" }}>
            Henüz varlık yok.
          </p>
        ) : (
          <>
            <div style={{ height: 180 }}>
              <Doughnut data={doughnutData} options={doughnutOptions} />
            </div>
            <div className="text-secondary" style={{ marginTop: "1rem", fontSize: "0.85rem" }}>
              Maliyet: ${crypto.totalInvested.toFixed(2)} · Güncel: ${crypto.totalCurrentValue.toFixed(2)}
            </div>
            <div style={{ fontSize: "1.2rem", fontWeight: 700, color: coinPnlColor }}>
              {formatUsd(crypto.totalPnl)} ({crypto.totalPnl >= 0 ? "+" : ""}
              {crypto.totalPnlPercent.toFixed(2)}%)
            </div>
          </>
        )}
      </MarketCard>

      <MarketCard title="Altın Piyasası" btnClass="btn-altin" onNavigate={() => onNavigate("altin")}>
        {gold.goldPrice === null ? (
          <p className="text-muted" style={{ fontSize: "0.9rem" }}>
            Fiyat bekleniyor...
          </p>
        ) : gold.holding.quantity <= 0 ? (
          <>
            <div style={{ fontSize: "1.8rem", fontWeight: 700 }}>₺{formatTry(gold.goldPrice.gram_try)}</div>
            <div className="text-secondary" style={{ fontSize: "0.85rem" }}>
              gram altın
            </div>
            <p className="text-muted" style={{ fontSize: "0.8rem", marginTop: "0.75rem" }}>
              Henüz varlık yok.
            </p>
          </>
        ) : (
          <>
            <div style={{ fontSize: "1.8rem", fontWeight: 700 }}>{gold.holding.quantity.toFixed(2)} gr</div>
            <div className="text-secondary" style={{ fontSize: "0.85rem" }}>
              Güncel değer: ₺{formatTry(gold.currentValue)}
            </div>
            <div style={{ fontSize: "1.2rem", fontWeight: 700, color: goldPnlColor, marginTop: "0.35rem" }}>
              {gold.totalPnl >= 0 ? "+" : "-"}₺{formatTry(Math.abs(gold.totalPnl))} (
              {gold.totalPnlPercent >= 0 ? "+" : ""}
              {gold.totalPnlPercent.toFixed(2)}%)
            </div>
          </>
        )}
      </MarketCard>

      <MarketCard title="Borsa (BİST)" btnClass="btn-borsa" onNavigate={() => onNavigate("borsa")}>
        {activeBistHoldings.length === 0 ? (
          <p className="text-muted" style={{ fontSize: "0.9rem" }}>
            Henüz varlık yok.
          </p>
        ) : (
          <>
            <div style={{ height: 180 }}>
              <Doughnut data={bistDoughnutData} options={bistDoughnutOptions} />
            </div>
            <div className="text-secondary" style={{ marginTop: "1rem", fontSize: "0.85rem" }}>
              Maliyet: ₺{formatTry(bist.totalInvested)} · Güncel: ₺{formatTry(bist.totalCurrentValue)}
            </div>
            <div style={{ fontSize: "1.2rem", fontWeight: 700, color: bistPnlColor }}>
              {bist.totalPnl >= 0 ? "+" : "-"}₺{formatTry(Math.abs(bist.totalPnl))} (
              {bist.totalPnlPercent >= 0 ? "+" : ""}
              {bist.totalPnlPercent.toFixed(2)}%)
            </div>
          </>
        )}
      </MarketCard>
    </div>
  );
}