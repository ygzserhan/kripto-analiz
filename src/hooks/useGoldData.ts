import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { Store } from "@tauri-apps/plugin-store";
import { AlertRule, GoldPricePayload, Transaction } from "../types";
import { computeHoldings, generateTxId } from "../ledger";

// Altın için tek bir "sembol" var; ledger yapısını coin ile aynı tutmak için
// sabit bir sembol adı kullanıyoruz. Fiyatlar TRY (gram başına) cinsinden.
const GOLD_SYMBOL = "GRAM_ALTIN";

export function useGoldData() {
  const [goldPrice, setGoldPrice] = useState<GoldPricePayload | null>(null);

  // Fiyat alarmı — coin sayfasındakiyle aynı mantık: yüzde + yön seçip
  // o anki gram fiyatından sabit bir hedef fiyat hesaplanıyor. Tek sembol
  // olduğu için (coin sayfasının aksine) ayrıca bir sembol seçimi yok.
  const [alerts, setAlerts] = useState<AlertRule[]>([]);
  const [alertDirection, setAlertDirection] = useState<"above" | "below">("below");
  const [alertPercent, setAlertPercent] = useState<string>("5");

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [txType, setTxType] = useState<"buy" | "sell">("buy");
  const [txQuantity, setTxQuantity] = useState<string>("");
  const [txPrice, setTxPrice] = useState<string>("");
  const [txTimestamp, setTxTimestamp] = useState<string>("");

  const storeRef = useRef<Store | null>(null);

  useEffect(() => {
    const unlistenGold = listen<GoldPricePayload>("gold-price", (event) => {
      setGoldPrice(event.payload);
    });

    const unlistenAlert = listen<number>("alert-triggered", (event) => {
      setAlerts((prev) => prev.filter((a) => a.id !== event.payload));
    });

    (async () => {
      const store = await Store.load("gold_portfolio.json");
      storeRef.current = store;
      const saved = (await store.get<Transaction[]>("transactions")) ?? [];
      setTransactions(saved);
    })();

    return () => {
      unlistenGold.then((fn) => fn());
      unlistenAlert.then((fn) => fn());
    };
  }, []);

  function currentGramPrice(): number | null {
    return goldPrice !== null ? goldPrice.gram_try : null;
  }

  async function persistTransactions(updated: Transaction[]) {
    setTransactions(updated);
    if (storeRef.current) {
      await storeRef.current.set("transactions", updated);
      await storeRef.current.save();
    }
  }

  function fillCurrentTxPrice() {
    const price = currentGramPrice();
    if (price !== null) setTxPrice(String(price));
  }

  async function handleAddAlert() {
    const currentPrice = currentGramPrice();
    if (currentPrice === null) return;

    const pct = parseFloat(alertPercent);
    if (isNaN(pct) || pct <= 0) return;

    const targetPrice =
      alertDirection === "above" ? currentPrice * (1 + pct / 100) : currentPrice * (1 - pct / 100);

    const id = await invoke<number>("add_alert", {
      symbol: GOLD_SYMBOL,
      targetPrice,
      direction: alertDirection,
      currency: "₺",
    });

    setAlerts((prev) => [
      ...prev,
      { id, symbol: GOLD_SYMBOL, targetPrice, direction: alertDirection, currency: "₺" },
    ]);
  }

  async function handleRemoveAlert(id: number) {
    await invoke("remove_alert", { id });
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }

  async function handleAddTransaction() {
    const quantity = parseFloat(txQuantity);
    const price = parseFloat(txPrice);
    if (isNaN(quantity) || quantity <= 0 || isNaN(price) || price <= 0) return;

    const timestamp = txTimestamp ? new Date(txTimestamp).getTime() : Date.now();

    const newTx: Transaction = {
      id: generateTxId(),
      symbol: GOLD_SYMBOL,
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
  const holding = holdingsMap[GOLD_SYMBOL] ?? {
    symbol: GOLD_SYMBOL,
    quantity: 0,
    avgCost: 0,
    totalCost: 0,
    realizedPnl: 0,
  };

  const currentPrice = currentGramPrice();
  const currentValue = currentPrice !== null ? holding.quantity * currentPrice : holding.totalCost;
  const unrealizedPnl = currentValue - holding.totalCost;
  const totalPnl = unrealizedPnl + holding.realizedPnl;
  const totalPnlPercent = holding.totalCost > 0 ? (unrealizedPnl / holding.totalCost) * 100 : 0;

  return {
    goldPrice,
    alerts,
    alertDirection,
    setAlertDirection,
    alertPercent,
    setAlertPercent,
    handleAddAlert,
    handleRemoveAlert,
    transactions,
    holding,
    currentValue,
    unrealizedPnl,
    totalPnl,
    totalPnlPercent,
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
  };
}

export type GoldData = ReturnType<typeof useGoldData>;