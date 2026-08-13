export interface TradePayload {
  symbol: string;
  price: string;
  time: number;
  sma: number | null;
  rsi: number | null;
}

export interface LivePricePayload {
  symbol: string;
  price: string;
}

export interface GoldPricePayload {
  ons_usd: number;
  usd_try: number;
  gram_usd: number;
  gram_try: number;
  time: number;
}

export interface PricePoint {
  time: string;
  price: number;
  sma: number | null;
}

export interface AlertRule {
  id: number;
  symbol: string;
  targetPrice: number;
  direction: "above" | "below";
  currency: string; // bildirim metninde gösterilecek işaret ("$" ya da "₺")
}

// Eski (tekli pozisyon) cüzdan formatı — artık kullanılmıyor, sadece
// kullanıcının önceki verisini yeni sisteme bir kereliğine taşımak için tutuluyor.
export interface Position {
  id: string;
  symbol: string;
  usdAmount: number;
  quantity: number;
  entryPrice: number;
  createdAt: number;
}

// Yeni, ortak işlem geçmişi (ledger) formatı: her alış/satış ayrı bir kayıt.
// Coin ve Altın sayfaları aynı bu yapıyı kullanıyor.
export interface Transaction {
  id: string;
  symbol: string;
  type: "buy" | "sell";
  quantity: number;
  price: number; // işlem anındaki birim fiyat (coin: USD, altın: gram başına TRY)
  timestamp: number; // ms epoch — geçmişe dönük işlemler için elle değiştirilebilir
  note?: string;
}

export interface BistPricePayload {
  symbol: string; // ".IS" eki olmadan, örn. "THYAO"
  name: string;
  price: number;
  previous_close: number;
  currency: string;
  time: number;
}

export type Page = "home" | "coin" | "altin" | "borsa";