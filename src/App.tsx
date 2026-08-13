import { useState } from "react";
import "./theme.css";
import "./chartSetup";
import { Page } from "./types";
import { useCryptoData } from "./hooks/useCryptoData";
import { useGoldData } from "./hooks/useGoldData";
import { useBistData } from "./hooks/useBistData";
import HomePage from "./pages/HomePage";
import CoinPage from "./pages/CoinPage";
import AltinPage from "./pages/AltinPage";
import BorsaPage from "./pages/BorsaPage";

const NAV_ITEMS: { key: Page; label: string; color: string }[] = [
  { key: "home", label: "Ana Sayfa", color: "#0b0b0b" },
  { key: "coin", label: "Coin", color: "#2a78d6" },
  { key: "altin", label: "Altın", color: "#eb6834" },
  { key: "borsa", label: "Borsa", color: "#1baf7a" },
];

const PAGE_TITLES: Record<Page, string> = {
  home: "Ana Sayfa",
  coin: "Kripto Analiz Paneli",
  altin: "Altın Takip Paneli",
  borsa: "Borsa (BİST) Paneli",
};

function App() {
  const [page, setPage] = useState<Page>("home");

  // Bu üç hook burada, App seviyesinde bir kez çağrılıyor. Böylece sayfalar
  // arasında geçiş yapmak (örn. Ana Sayfa -> Coin -> Ana Sayfa) fiyat geçmişini
  // veya bağlantıları sıfırlamıyor; sayfalar sadece görüntüleniyor/gizleniyor.
  const crypto = useCryptoData();
  const gold = useGoldData();
  const bist = useBistData();

  return (
    <div className="app-shell">
      <div className="app-header">
        <h1 className="app-title">{PAGE_TITLES[page]}</h1>

        <div className="nav-tabs">
          {NAV_ITEMS.map((item) => {
            const active = page === item.key;
            return (
              <button
                key={item.key}
                onClick={() => setPage(item.key)}
                className={`nav-tab${active ? " nav-tab-active" : ""}`}
                style={active ? { backgroundColor: item.color } : undefined}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: page === "home" ? "block" : "none" }}>
        <HomePage crypto={crypto} gold={gold} bist={bist} onNavigate={setPage} />
      </div>
      <div style={{ display: page === "coin" ? "block" : "none" }}>
        <CoinPage data={crypto} />
      </div>
      <div style={{ display: page === "altin" ? "block" : "none" }}>
        <AltinPage gold={gold} />
      </div>
      <div style={{ display: page === "borsa" ? "block" : "none" }}>
        <BorsaPage data={bist} />
      </div>
    </div>
  );
}

export default App;