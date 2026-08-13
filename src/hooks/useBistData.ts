import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { Store } from "@tauri-apps/plugin-store";
import { AlertRule, BistPricePayload, Transaction } from "../types";
import { computeHoldings, generateTxId } from "../ledger";

// BİST sayfasının verisi. Coin sayfasına çok benziyor (izleme listesi +
// cüzdan/işlem geçmişi + fiyat alarmı) ama RSI/SMA veya "canlı fiyat" ayrımı
// yok — Yahoo Finance'ten 30 saniyede bir gelen tek bir fiyat akışı yeterli.
export function useBistData() {
  const [watchedSymbols, setWatchedSymbols] = useState<string[]>([]);
  const [newSymbolInput, setNewSymbolInput] = useState<string>("");
  const [addSymbolError, setAddSymbolError] = useState<string | null>(null);

  const [prices, setPrices] = useState<Record<string, BistPricePayload>>({});

  const [alerts, setAlerts] = useState<AlertRule[]>([]);
  const [alertSymbol, setAlertSymbol] = useState<string>("");
  const [alertDirection, setAlertDirection] = useState<"above" | "below">("below");
  const [alertPercent, setAlertPercent] = useState<string>("5");

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [txSymbol, setTxSymbol] = useState<string>("");
  const [txType, setTxType] = useState<"buy" | "sell">("buy");
  const [txQuantity, setTxQuantity] = useState<string>("");
  const [txPrice, setTxPrice] = useState<string>("");
  const [txTimestamp, setTxTimestamp] = useState<string>("");

  const storeRef = useRef<Store | null>(null);
  const watchStoreRef = useRef<Store | null>(null);

  useEffect(() => {
    const unlistenPrice = listen<BistPricePayload>("bist-price", (event) => {
      setPrices((prev) => ({ ...prev, [event.payload.symbol]: event.payload }));
    });

    const unlistenAlert = listen<number>("alert-triggered", (event) => {
      setAlerts((prev) => prev.filter((a) => a.id !== event.payload));
    });

    (async () => {
      const store = await Store.load("bist_portfolio.json");
      storeRef.current = store;
      const saved = (await store.get<Transaction[]>("transactions")) ?? [];
      setTransactions(saved);
    })();

    (async () => {
      const wstore = await Store.load("bist_watchlist.json");
      watchStoreRef.current = wstore;

      const savedSymbols = await wstore.get<string[]>("symbols");
      if (savedSymbols && savedSymbols.length > 0) {
        await invoke("set_bist_symbols", { symbols: savedSymbols });
      }

      const currentSymbols = await invoke<string[]>("list_bist_symbols");
      setWatchedSymbols(currentSymbols);
    })();

    return () => {
      unlistenPrice.then((fn) => fn());
      unlistenAlert.then((fn) => fn());
    };
  }, []);

  // Seçili alarm/işlem hissesi listeden çıkarsa ya da ilk yüklemede otomatik ilk hisseye geç
  useEffect(() => {
    if (watchedSymbols.length === 0) return;
    if (!watchedSymbols.includes(alertSymbol)) {
      setAlertSymbol(watchedSymbols[0]);
    }
    if (!watchedSymbols.includes(txSymbol)) {
      setTxSymbol(watchedSymbols[0]);
    }
  }, [watchedSymbols]);

  function currentPriceOf(symbol: string): number | null {
    return prices[symbol]?.price ?? null;
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
      await invoke("add_bist_symbol", { symbol });
      const updated = Array.from(new Set([...watchedSymbols, symbol]));
      setWatchedSymbols(updated);
      await persistWatchlist(updated);
      setNewSymbolInput("");
    } catch (err) {
      setAddSymbolError(String(err));
    }
  }

  async function handleRemoveSymbol(symbol: string) {
    await invoke("remove_bist_symbol", { symbol });
    const updated = watchedSymbols.filter((s) => s !== symbol);
    setWatchedSymbols(updated);
    await persistWatchlist(updated);

    setPrices((prev) => {
      const next = { ...prev };
      delete next[symbol];
      return next;
    });
  }

  async function handleAddAlert() {
    const currentPrice = currentPriceOf(alertSymbol);
    if (currentPrice === null) return;

    const pct = parseFloat(alertPercent);
    if (isNaN(pct) || pct <= 0) return;

    const targetPrice =
      alertDirection === "above" ? currentPrice * (1 + pct / 100) : currentPrice * (1 - pct / 100);

    const id = await invoke<number>("add_alert", {
      symbol: alertSymbol,
      targetPrice,
      direction: alertDirection,
      currency: "₺",
    });

    setAlerts((prev) => [
      ...prev,
      { id, symbol: alertSymbol, targetPrice, direction: alertDirection, currency: "₺" },
    ]);
  }

  async function handleRemoveAlert(id: number) {
    await invoke("remove_alert", { id });
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }

  async function persistTransactions(updated: Transaction[]) {
    setTransactions(updated);
    if (storeRef.current) {
      await storeRef.current.set("transactions", updated);
      await storeRef.current.save();
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
    prices,
    currentPriceOf,
    handleAddSymbol,
    handleRemoveSymbol,
    alerts,
    alertSymbol,
    setAlertSymbol,
    alertDirection,
    setAlertDirection,
    alertPercent,
    setAlertPercent,
    handleAddAlert,
    handleRemoveAlert,
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

export type BistData = ReturnType<typeof useBistData>;