/**
 * Market data via OKX API v5.
 * Binance/Bybit are geo-blocked from US servers (HTTP 451).
 * OKX has no geo-restrictions.
 */
import axios from "axios";

const BASE = "https://www.okx.com";

export interface Kline {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

export type Symbol = "BTCUSDT" | "ETHUSDT";
export type Interval = "1m" | "3m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1d";

const INTERVAL_MAP: Record<Interval, string> = {
  "1m": "1m", "3m": "3m", "5m": "5m", "15m": "15m", "30m": "30m",
  "1h": "1H", "4h": "4H", "1d": "1D",
};

function toInstId(symbol: Symbol): string {
  return symbol === "BTCUSDT" ? "BTC-USDT" : "ETH-USDT";
}

export async function getKlines(
  symbol: Symbol,
  interval: Interval,
  limit = 100
): Promise<Kline[]> {
  const res = await axios.get(`${BASE}/api/v5/market/candles`, {
    params: { instId: toInstId(symbol), bar: INTERVAL_MAP[interval], limit },
    timeout: 8000,
  });
  const raw: string[][] = res.data.data;
  // OKX returns newest-first — reverse to chronological order
  return raw.reverse().map((k) => {
    const openTime = parseInt(k[0]!);
    return {
      openTime,
      open:      parseFloat(k[1]!),
      high:      parseFloat(k[2]!),
      low:       parseFloat(k[3]!),
      close:     parseFloat(k[4]!),
      volume:    parseFloat(k[5]!),
      closeTime: openTime + 60000,
    };
  });
}

export async function getPrice(symbol: Symbol): Promise<number> {
  const res = await axios.get(`${BASE}/api/v5/market/ticker`, {
    params: { instId: toInstId(symbol) },
    timeout: 5000,
  });
  return parseFloat(res.data.data[0].last);
}

export async function get24hStats(symbol: Symbol) {
  const res = await axios.get(`${BASE}/api/v5/market/ticker`, {
    params: { instId: toInstId(symbol) },
    timeout: 5000,
  });
  const t = res.data.data[0];
  const last   = parseFloat(t.last);
  const open24 = parseFloat(t.open24h);
  return {
    priceChange:    last - open24,
    priceChangePct: open24 > 0 ? ((last - open24) / open24) * 100 : 0,
    high:           parseFloat(t.high24h),
    low:            parseFloat(t.low24h),
    volume:         parseFloat(t.vol24h),
    quoteVolume:    parseFloat(t.volCcy24h),
  };
}
