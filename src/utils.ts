export function formatPrice(price: number): string {
  if (price >= 1) return price.toFixed(2);
  if (price >= 0.01) return price.toFixed(4);
  return price.toFixed(8);
}

export function formatUsd(value: number): string {
  const sign = value >= 0 ? "+" : "-";
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

export function formatTry(value: number): string {
  return value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function rsiStatus(rsi: number | null): { label: string; color: string } {
  if (rsi === null) return { label: "RSI hesaplanıyor...", color: "#898781" };
  if (rsi >= 70) return { label: `Aşırı Alım · RSI ${rsi.toFixed(1)}`, color: "#d03b3b" };
  if (rsi <= 30) return { label: `Aşırı Satım · RSI ${rsi.toFixed(1)}`, color: "#0ca30c" };
  return { label: `Nötr · RSI ${rsi.toFixed(1)}`, color: "#52514e" };
}

// Kategorik seri renkleri (halka/pasta grafiklerde varlık başına renk için)
export const CHART_PALETTE = [
  "#2a78d6",
  "#eb6834",
  "#1baf7a",
  "#eda100",
  "#e87ba4",
  "#4a3aa7",
  "#e34948",
  "#008300",
];