const SMART_ASSET_ID = 240;
const history = [];

function addSmartPrice(price) {
  price = Number(price);
  if (!Number.isFinite(price) || price <= 0) return;

  const minute = Math.floor(Date.now() / 60000);
  let candle = history.at(-1);

  if (!candle || candle.minute !== minute) {
    history.push({
      minute, open: price, high: price,
      low: price, close: price
    });
  } else {
    candle.high = Math.max(candle.high, price);
    candle.low = Math.min(candle.low, price);
    candle.close = price;
  }

  if (history.length > 300) history.shift();
}

function ema(values, period) {
  if (values.length < period) return null;
  let result = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const k = 2 / (period + 1);

  for (let i = period; i < values.length; i++) {
    result = values[i] * k + result * (1 - k);
  }
  return result;
}

function analyzeSmart() {
  if (history.length < 22) {
    return { decision: "انتظار", reason: "نحتاج 22 قراءة سعرية" };
  }

  const prices = history.map(c => c.close);
  const fast = ema(prices, 9);
  const slow = ema(prices, 21);

  let decision = "انتظار";
  if (fast > slow && prices.at(-1) > prices.at(-2)) decision = "شراء UP";
  if (fast < slow && prices.at(-1) < prices.at(-2)) decision = "بيع DOWN";

  return {
    asset: "Smarty",
    assetId: SMART_ASSET_ID,
    timeframe: "1m",
    direction: fast > slow ? "صاعد" : fast < slow ? "هابط" : "متذبذب",
    decision,
    duration: "30 ثانية",
    price: prices.at(-1)
  };
}

module.exports = { addSmartPrice, analyzeSmart };
