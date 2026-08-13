import { Transaction } from "./types";

export interface HoldingSummary {
  symbol: string;
  quantity: number; // şu an elde tutulan miktar
  avgCost: number; // ortalama alış maliyeti (birim başına)
  totalCost: number; // quantity * avgCost -> elde kalan kısmın toplam maliyeti
  realizedPnl: number; // satışlardan gerçekleşen toplam kâr/zarar
}

// Ortalama maliyet (average cost basis) yöntemiyle işlem geçmişinden
// her sembol için: şu an elde tutulan miktarı, ortalama maliyeti ve
// satışlardan gerçekleşen kâr/zararı hesaplar.
//
// Mantık: her "alış" geldiğinde ortalama maliyet yeniden hesaplanır.
// Her "satış" geldiğinde, satılan kısmın (satış fiyatı - o anki ortalama
// maliyet) farkı "gerçekleşen kâr/zarar"a eklenir; ortalama maliyet
// değişmez, sadece miktar azalır.
export function computeHoldings(transactions: Transaction[]): Record<string, HoldingSummary> {
  const bySymbol: Record<string, HoldingSummary> = {};
  const sorted = [...transactions].sort((a, b) => a.timestamp - b.timestamp);

  for (const tx of sorted) {
    const h: HoldingSummary =
      bySymbol[tx.symbol] ?? { symbol: tx.symbol, quantity: 0, avgCost: 0, totalCost: 0, realizedPnl: 0 };

    if (tx.type === "buy") {
      const newQuantity = h.quantity + tx.quantity;
      const newTotalCost = h.totalCost + tx.quantity * tx.price;
      h.quantity = newQuantity;
      h.totalCost = newTotalCost;
      h.avgCost = newQuantity > 0 ? newTotalCost / newQuantity : 0;
    } else {
      const sellQty = Math.min(tx.quantity, h.quantity);
      h.realizedPnl += sellQty * (tx.price - h.avgCost);
      h.quantity = Math.max(0, h.quantity - sellQty);
      h.totalCost = h.quantity * h.avgCost;
    }

    bySymbol[tx.symbol] = h;
  }

  return bySymbol;
}

export function generateTxId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}