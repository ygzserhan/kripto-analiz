import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { isPermissionGranted, requestPermission } from "@tauri-apps/plugin-notification";
import { Store } from "@tauri-apps/plugin-store";
import { TradePayload, LivePricePayload, PricePoint, AlertRule, Position, Transaction } from "../types";
import { computeHoldings, generateTxId } from "../ledger";

const MAX_POINTS = 60;

// Kripto sayfasının tüm verisini / arka plan dinleyicilerini burada topluyoruz.
// Bu hook App.tsx içinde bir kez çağrılıyor; böylece sayfalar arasında gezinirken
// (Ana Sayfa <-> Coin) grafik geçmişi ve bağlantılar sıfırlanmıyor.
export function useCryptoData() {
  const [watchedSymbols, setWatchedSymbols] = useState<string[]>([]);
  const [newSymbolInput, setNewSymbolInput] = useState<string>("");
  const [addSymbolError, setAddSymbolError] = useState<string | null>(null);
  const [refreshInterval, setRefreshInterval] = useState<number>(30);

  const [priceHistories, setPriceHistories] = useState<Record<string, PricePoint[]>>({});
  const [latestRsi, setLatestRsi] = useState<Record<string, number | null>>({});
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});

  const [alerts, setAlerts] = useState<AlertRule[]>([]);
  const [alertSymbol, setAlertSymbol] = useState<string>("");
  const [alertDirection, setAlertDirection] = useState<"above" | "below">("below");
  const [alertPercent, setAlertPercent] = useState<string>("5");

  // İşlem geçmişi (ledger) — eski tekli "pozisyon" sisteminin yerine geçti.
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [txSymbol, setTxSymbol] = useState<string>("");
  const [txType, setTxType] = useState<"buy" | "sell">("buy");
  const [txQuantity, setTxQuantity] = useState<string>("");
  const [txPrice, setTxPrice] = useState<string>("");
  const [txTimestamp, setTxTimestamp] = useState<string>("");

  const portfolioStoreRef = useRef<Store | null>(null);
  const watchStoreRef = useRef<Store | null>(null);

  useEffect(() => {
    const unlistenPrice = listen<TradePayload>("new-price", (event) => {
      const symbol = event.payload.symbol.toUpperCase();
      const newPoint: PricePoint = {
        time: new Date(event.payload.time).toLocaleTimeString(),
        price: parseFloat(event.payload.price),
        sma: event.payload.sma,
      };

      setPriceHistories((prev) => {
        const existing = prev[symbol] ?? [];
        const updated = [...existing, newPoint];
        return {
          ...prev,
          [symbol]: updated.length > MAX_POINTS ? updated.slice(-MAX_POINTS) : updated,
        };
      });

      setLatestRsi((prev) => ({ ...prev, [symbol]: event.payload.rsi }));
    });

    const unlistenLivePrice = listen<LivePricePayload>("live-price", (event) => {
      const symbol = event.payload.symbol.toUpperCase();
      const price = parseFloat(event.payload.price);
      setLivePrices((prev) => ({ ...prev, [symbol]: price }));
    });

    const unlistenAlert = listen<number>("alert-triggered", (event) => {
      setAlerts((prev) => prev.filter((a) => a.id !== event.payload));
    });

    (async () => {
      let granted = await isPermissionGranted();
      if (!granted) {
        const permission = await requestPermission();
        granted = permission === "granted";
      }
    })();

    (async () => {
      const store = await Store.load("portfolio.json");
      portfolioStoreRef.current = store;

      let saved = await store.get<Transaction[]>("transactions");

      if (!saved) {
        // Eski "positions" formatından geçiş: her pozisyonu tek bir "alış" işlemine çevir.
        // Böylece daha önce eklediğin coinler kaybolmuyor, yeni sisteme otomatik taşınıyor.
        const oldPositions = (await store.get<Position[]>("positions")) ?? [];
        saved = oldPositions.map((p) => ({
          id: p.id,
          symbol: p.symbol,
          type: "buy" as const,
          quantity: p.quantity,
          price: p.entryPrice,
          timestamp: p.createdAt,
        }));
        await store.set("transactions", saved);
        await store.save();
      }

      setTransactions(saved);
    })();

    (async () => {
      const wstore = await Store.load("watchlist.json");
      watchStoreRef.current = wstore;

      const savedSymbols = await wstore.get<string[]>("symbols");
      const savedInterval = await wstore.get<number>("intervalSeconds");

      if (savedSymbols && savedSymbols.length > 0) {
        await invoke("set_symbols", { symbols: savedSymbols });
      }
      if (savedInterval) {
        await invoke("set_refresh_interval", { seconds: savedInterval });
        setRefreshInterval(savedInterval);
      }

      const currentSymbols = await invoke<string[]>("list_symbols");
      setWatchedSymbols(currentSymbols);
    })();

    return () => {
      unlistenPrice.then((fn) => fn());
      unlistenLivePrice.then((fn) => fn());
      unlistenAlert.then((fn) => fn());
    };
  }, []);

  // Seçili alarm/işlem coini listeden çıkarsa ya da ilk yüklemede otomatik ilk coine geç
  useEffect(() => {
    if (watchedSymbols.length === 0) return;
    if (!watchedSymbols.includes(alertSymbol)) {
      setAlertSymbol(watchedSymbols[0]);
    }
    if (!watchedSymbols.includes(txSymbol)) {
      setTxSymbol(watchedSymbols[0]);
    }
  }, [watchedSymbols]);

  function lastPriceOf(symbol: string): number | null {
    const hist = priceHistories[symbol];
    if (!hist || hist.length === 0) return null;
    return hist[hist.length - 1].price;
  }

  // Portföy, alarm ve üstteki büyük fiyat için: gösterim aralığından bağımsız,
  // her zaman en taze bilinen fiyatı kullan (live-price varsa onu, yoksa grafik verisini)
  function currentPriceOf(symbol: string): number | null {
    if (livePrices[symbol] !== undefined) return livePrices[symbol];
    return lastPriceOf(symbol);
  }

  async function persistWatchlist(symbols: string[]) {
    if (watchStoreRef.current) {
      await watchStoreRef.current.set("symbols", symbols);
      await watchStoreRef.current.save();
    }
  }

  async function handleAddSymbol() {
    const symbol = newSymbolInput.trim().toUpperCase();
    if (!symbol) return;

    setAddSymbolError(null);
    try {
      await invoke("add_symbol", { symbol });
      const updated = Array.from(new Set([...watchedSymbols, symbol]));
      setWatchedSymbols(updated);
      await persistWatchlist(updated);
      setNewSymbolInput("");
    } catch (err) {
      setAddSymbolError(String(err));
    }
  }

  async function handleRemoveSymbol(symbol: string) {
    await invoke("remove_symbol", { symbol });
    const updated = watchedSymbols.filter((s) => s !== symbol);
    setWatchedSymbols(updated);
    await persistWatchlist(updated);

    setPriceHistories((prev) => {
      const next = { ...prev };
      delete next[symbol];
      return next;
    });
    setLatestRsi((prev) => {
      const next = { ...prev };
      delete next[symbol];
      return next;
    });
    setLivePrices((prev) => {
      const next = { ...prev };
      delete next[symbol];
      return next;
    });
  }

  async function handleIntervalChange(seconds: number) {
    setRefreshInterval(seconds);
    await invoke("set_refresh_interval", { seconds });
    if (watchStoreRef.current) {
      await watchStoreRef.current.set("intervalSeconds", seconds);
      await watchStoreRef.current.save();
    }
  }

  async function handleRefreshNow() {
    await invoke("refresh_now");
  }

  async function handleAddAlert() {
    const currentPrice = currentPriceOf(alertSymbol);
    if (currentPrice === null) return;

    const pct = parseFloat(alertPercent);
    if (isNaN(pct) || pct <= 0) return;

    const targetPrice =
      alertDirection === "above"
        ? currentPrice * (1 + pct / 100)
        : currentPrice * (1 - pct / 100);

    const id = await invoke<number>("add_alert", {
      symbol: alertSymbol,
      targetPrice,
      direction: alertDirection,
      currency: "$",
    });

    setAlerts((prev) => [
      ...prev,
      { id, symbol: alertSymbol, targetPrice, direction: alertDirection, currency: "$" },
    ]);
  }

  async function handleRemoveAlert(id: number) {
    await invoke("remove_alert", { id });
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }

  async function persistTransactions(updated: Transaction[]) {
    setTransactions(updated);
    if (portfolioStoreRef.current) {
      await portfolioStoreRef.current.set("transactions", updated);
      await portfolioStoreRef.current.save();
    }
  }

  function fillCurrentTxPrice() {
    const price = currentPriceOf(txSymbol);
    if (price !== null) setTxPrice(String(price));
  }

  async function handleAddTransaction() {
    const quantity = parseFloat(txQuantity);
    const price = parseFloat(txPrice);
    if (!txSymbol || isNaN(quantity) || quantity <= 0 || isNaN(price) || price <= 0) return;

    const timestamp = txTimestamp ? new Date(txTimestamp).getTime() : Date.now();

    const newTx: Transaction = {
      id: generateTxId(),
      symbol: txSymbol,
      type: txType,
      quantity,
      price,
      timestamp,
    };

    await persistTransactions([...transactions, newTx]);
    setTxQuantity("");
  }

  async function handleRemoveTransaction(id: string) {
    await persistTransactions(transactions.filter((t) => t.id !== id));
  }

  const holdingsMap = computeHoldings(transactions);
  const holdings = Object.values(holdingsMap);

  const totalInvested = holdings.reduce((sum, h) => sum + h.totalCost, 0);
  const totalCurrentValue = holdings.reduce((sum, h) => {
    const price = currentPriceOf(h.symbol);
    return sum + (price !== null ? h.quantity * price : h.totalCost);
  }, 0);
  const totalUnrealizedPnl = totalCurrentValue - totalInvested;
  const totalRealizedPnl = holdings.reduce((sum, h) => sum + h.realizedPnl, 0);
  const totalPnl = totalUnrealizedPnl + totalRealizedPnl;
  const totalPnlPercent = totalInvested > 0 ? (totalUnrealizedPnl / totalInvested) * 100 : 0;

  return {
    watchedSymbols,
    newSymbolInput,
    setNewSymbolInput,
    addSymbolError,
    refreshInterval,
    priceHistories,
    latestRsi,
    alerts,
    alertSymbol,
    setAlertSymbol,
    alertDirection,
    setAlertDirection,
    alertPercent,
    setAlertPercent,
    transactions,
    holdings,
    txSymbol,
    setTxSymbol,
    txType,
    setTxType,
    txQuantity,
    setTxQuantity,
    txPrice,
    setTxPrice,
    txTimestamp,
    setTxTimestamp,
    fillCurrentTxPrice,
    currentPriceOf,
    handleAddSymbol,
    handleRemoveSymbol,
    handleIntervalChange,
    handleRefreshNow,
    handleAddAlert,
    handleRemoveAlert,
    handleAddTransaction,
    handleRemoveTransaction,
    totalInvested,
    totalCurrentValue,
    totalUnrealizedPnl,
    totalRealizedPnl,
    totalPnl,
    totalPnlPercent,
  };
}

export type CryptoData = ReturnType<typeof useCryptoData>;