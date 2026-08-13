#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{Emitter, Manager};
use tauri_plugin_notification::NotificationExt;

const BASE_TICK_SECONDS: u64 = 1;
const GOLD_TICK_SECONDS: u64 = 30;
const BIST_TICK_SECONDS: u64 = 30;
const TRY_RATE_CACHE_SECONDS: u64 = 900;
const GRAMS_PER_TROY_OUNCE: f64 = 31.1034768;
const VOLATILITY_THRESHOLD_PCT: f64 = 5.0;
const PERIOD: usize = 14;
const DEFAULT_SYMBOLS: [&str; 4] = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "PEPEUSDT"];
const DEFAULT_BIST_SYMBOLS: [&str; 3] = ["THYAO", "ASELS", "GARAN"];
// Altın ledger/alarm sisteminin kullandığı sabit "sembol" — frontend'deki
// GOLD_SYMBOL ("GRAM_ALTIN") ile birebir aynı olmalı.
const GOLD_SYMBOL: &str = "GRAM_ALTIN";
const YAHOO_USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

fn now_secs() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs()
}

fn now_millis() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as u64
}

#[derive(Debug, Deserialize)]
struct TickerPrice {
    symbol: String,
    price: String,
}

#[derive(Debug, Serialize, Clone)]
struct PricePayload {
    symbol: String,
    price: String,
    time: u64,
    sma: Option<f64>,
    rsi: Option<f64>,
}

#[derive(Debug, Serialize, Clone)]
struct LivePricePayload {
    symbol: String,
    price: String,
}

struct SymbolState {
    prices: VecDeque<f64>,
    last_price: Option<f64>,
    avg_gain: f64,
    avg_loss: f64,
    rsi_ticks: u32,
    last_emitted_price: Option<f64>,
    last_emitted_at: u64,
}

impl SymbolState {
    fn new() -> Self {
        Self {
            prices: VecDeque::new(),
            last_price: None,
            avg_gain: 0.0,
            avg_loss: 0.0,
            rsi_ticks: 0,
            last_emitted_price: None,
            last_emitted_at: 0,
        }
    }
}

fn update_indicators(state: &mut SymbolState, price: f64) -> (Option<f64>, Option<f64>) {
    state.prices.push_back(price);
    if state.prices.len() > PERIOD {
        state.prices.pop_front();
    }
    let sma = if state.prices.len() == PERIOD {
        Some(state.prices.iter().sum::<f64>() / PERIOD as f64)
    } else {
        None
    };

    let rsi = if let Some(last) = state.last_price {
        let change = price - last;
        let gain = if change > 0.0 { change } else { 0.0 };
        let loss = if change < 0.0 { -change } else { 0.0 };

        if state.rsi_ticks < PERIOD as u32 {
            state.avg_gain += gain;
            state.avg_loss += loss;
            state.rsi_ticks += 1;

            if state.rsi_ticks == PERIOD as u32 {
                state.avg_gain /= PERIOD as f64;
                state.avg_loss /= PERIOD as f64;
            }
            None
        } else {
            state.avg_gain = (state.avg_gain * (PERIOD as f64 - 1.0) + gain) / PERIOD as f64;
            state.avg_loss = (state.avg_loss * (PERIOD as f64 - 1.0) + loss) / PERIOD as f64;

            if state.avg_loss == 0.0 {
                Some(100.0)
            } else {
                let rs = state.avg_gain / state.avg_loss;
                Some(100.0 - (100.0 / (1.0 + rs)))
            }
        }
    } else {
        None
    };

    state.last_price = Some(price);
    (sma, rsi)
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
enum AlertDirection {
    Above,
    Below,
}

#[derive(Debug, Clone, Serialize)]
struct AlertRule {
    id: u64,
    symbol: String,
    target_price: f64,
    direction: AlertDirection,
    // Bildirim metninde gösterilecek para birimi işareti ("$" kripto, "₺" altın/BİST).
    currency: String,
}

#[derive(Default)]
struct AlertState {
    rules: Mutex<Vec<AlertRule>>,
    next_id: AtomicU64,
}

#[tauri::command]
fn add_alert(
    symbol: String,
    target_price: f64,
    direction: AlertDirection,
    currency: String,
    state: tauri::State<AlertState>,
) -> u64 {
    let id = state.next_id.fetch_add(1, Ordering::Relaxed);
    state.rules.lock().unwrap().push(AlertRule {
        id,
        symbol: symbol.to_uppercase(),
        target_price,
        direction,
        currency,
    });
    id
}

#[tauri::command]
fn remove_alert(id: u64, state: tauri::State<AlertState>) {
    state.rules.lock().unwrap().retain(|r| r.id != id);
}

// Küçük kripto fiyatları (örn. $0.00000123) için çok sayıda ondalık basamak
// gerekiyor; büyük/TRY değerler için 2 basamak yeterli ve daha okunaklı.
fn format_alert_price(currency: &str, price: f64) -> String {
    if price >= 1.0 {
        format!("{currency}{price:.2}")
    } else {
        format!("{currency}{price:.8}")
    }
}

fn check_alerts(app_handle: &tauri::AppHandle, symbol: &str, price: f64) {
    let alert_state = app_handle.state::<AlertState>();
    let mut rules = alert_state.rules.lock().unwrap();
    let mut triggered_ids = Vec::new();

    for rule in rules.iter() {
        if rule.symbol != symbol {
            continue;
        }

        let hit = match rule.direction {
            AlertDirection::Above => price >= rule.target_price,
            AlertDirection::Below => price <= rule.target_price,
        };

        if hit {
            triggered_ids.push(rule.id);

            let target_str = format_alert_price(&rule.currency, rule.target_price);
            let title = format!("{} Fiyat Alarmı", rule.symbol);
            let body = match rule.direction {
                AlertDirection::Above => {
                    format!("{} {target_str} seviyesinin üzerine çıktı!", rule.symbol)
                }
                AlertDirection::Below => {
                    format!("{} {target_str} seviyesinin altına indi!", rule.symbol)
                }
            };

            let _ = app_handle.notification().builder().title(title).body(body).show();
            let _ = app_handle.emit("alert-triggered", rule.id);
        }
    }

    rules.retain(|r| !triggered_ids.contains(&r.id));
}

struct WatchState {
    symbols: Mutex<Vec<String>>,
    interval_secs: AtomicU64,
}

impl Default for WatchState {
    fn default() -> Self {
        Self {
            symbols: Mutex::new(DEFAULT_SYMBOLS.iter().map(|s| s.to_string()).collect()),
            interval_secs: AtomicU64::new(30),
        }
    }
}

#[derive(Default)]
struct SymbolStates(Mutex<HashMap<String, SymbolState>>);

#[tauri::command]
async fn add_symbol(
    symbol: String,
    watch: tauri::State<'_, WatchState>,
    client: tauri::State<'_, reqwest::Client>,
) -> Result<(), String> {
    let symbol = symbol.to_uppercase();
    let url = format!("https://api.binance.com/api/v3/ticker/price?symbol={symbol}");
    let response = client.get(&url).send().await.map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!("\"{symbol}\" Binance'de bulunamadı."));
    }

    let mut symbols = watch.symbols.lock().unwrap();
    if !symbols.contains(&symbol) {
        symbols.push(symbol);
    }
    Ok(())
}

#[tauri::command]
fn remove_symbol(symbol: String, watch: tauri::State<WatchState>) {
    let symbol = symbol.to_uppercase();
    watch.symbols.lock().unwrap().retain(|s| s != &symbol);
}

#[tauri::command]
fn set_symbols(symbols: Vec<String>, watch: tauri::State<WatchState>) {
    let mut list = watch.symbols.lock().unwrap();
    *list = symbols.into_iter().map(|s| s.to_uppercase()).collect();
}

#[tauri::command]
fn list_symbols(watch: tauri::State<WatchState>) -> Vec<String> {
    let list = watch.symbols.lock().unwrap().clone();
    list
}

#[tauri::command]
fn set_refresh_interval(seconds: u64, watch: tauri::State<WatchState>) {
    watch
        .interval_secs
        .store(seconds.max(BASE_TICK_SECONDS), Ordering::Relaxed);
}

#[tauri::command]
async fn refresh_now(app_handle: tauri::AppHandle) -> Result<(), String> {
    poll_once(&app_handle, true).await.map_err(|e| e.to_string())
}

async fn poll_once(app_handle: &tauri::AppHandle, force: bool) -> Result<(), reqwest::Error> {
    let symbols = {
        let watch = app_handle.state::<WatchState>();
        let list = watch.symbols.lock().unwrap().clone();
        list
    };

    if symbols.is_empty() {
        return Ok(());
    }

    let symbols_param = symbols
        .iter()
        .map(|s| format!("%22{s}%22"))
        .collect::<Vec<_>>()
        .join("%2C");
    let url = format!(
        "https://api.binance.com/api/v3/ticker/price?symbols=%5B{symbols_param}%5D"
    );

    let client = app_handle.state::<reqwest::Client>();
    let response = client
        .get(&url)
        .send()
        .await?
        .json::<Vec<TickerPrice>>()
        .await?;

    let interval_secs = {
        let watch = app_handle.state::<WatchState>();
        let value = watch.interval_secs.load(Ordering::Relaxed);
        value
    };

    let now = now_secs();

    for ticker in response {
        let price: f64 = match ticker.price.parse() {
            Ok(p) => p,
            Err(_) => continue,
        };

        // Portföy / alarm / anlık fiyat gösterimi için HER tick'te, aralık
        // ayarından bağımsız olarak yayınlanan olay.
        app_handle
            .emit(
                "live-price",
                LivePricePayload {
                    symbol: ticker.symbol.clone(),
                    price: ticker.price.clone(),
                },
            )
            .ok();

        let (sma, rsi, should_emit) = {
            let symbol_states = app_handle.state::<SymbolStates>();
            let mut states = symbol_states.0.lock().unwrap();
            let state = states.entry(ticker.symbol.clone()).or_insert_with(SymbolState::new);

            let (sma, rsi) = update_indicators(state, price);

            let elapsed = now.saturating_sub(state.last_emitted_at);
            let pct_change = match state.last_emitted_price {
                Some(last) if last > 0.0 => ((price - last) / last * 100.0).abs(),
                _ => f64::MAX,
            };

            let should_emit = force
                || state.last_emitted_at == 0
                || elapsed >= interval_secs
                || pct_change >= VOLATILITY_THRESHOLD_PCT;

            if should_emit {
                state.last_emitted_price = Some(price);
                state.last_emitted_at = now;
            }

            let result = (sma, rsi, should_emit);
            result
        };

        if should_emit {
            let payload = PricePayload {
                symbol: ticker.symbol.clone(),
                price: ticker.price.clone(),
                time: now_millis(),
                sma,
                rsi,
            };

            app_handle.emit("new-price", payload).unwrap_or_else(|e| {
                println!("Arayüze veri gönderilirken hata oluştu: {e}");
            });
        }

        check_alerts(app_handle, &ticker.symbol, price);
    }

    Ok(())
}

#[derive(Debug, Deserialize)]
struct GoldApiResponse {
    price: f64,
}

#[derive(Debug, Deserialize)]
struct FrankfurterResponse {
    rates: HashMap<String, f64>,
}

#[derive(Debug, Serialize, Clone)]
struct GoldPricePayload {
    ons_usd: f64,
    usd_try: f64,
    gram_usd: f64,
    gram_try: f64,
    time: u64,
}

#[derive(Default)]
struct GoldState {
    cached_rate: Mutex<Option<(f64, u64)>>,
}

async fn get_usd_try_rate(app_handle: &tauri::AppHandle) -> Result<f64, String> {
    let gold_state = app_handle.state::<GoldState>();

    let cached = {
        let cache = gold_state.cached_rate.lock().unwrap();
        *cache
    };

    let now = now_secs();

    if let Some((rate, fetched_at)) = cached {
        if now.saturating_sub(fetched_at) < TRY_RATE_CACHE_SECONDS {
            return Ok(rate);
        }
    }

    let client = app_handle.state::<reqwest::Client>();
    let response = client
        .get("https://api.frankfurter.app/latest?from=USD&to=TRY")
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json::<FrankfurterResponse>()
        .await
        .map_err(|e| e.to_string())?;

    let rate = *response
        .rates
        .get("TRY")
        .ok_or_else(|| "USD/TRY kuru alınamadı.".to_string())?;

    {
        let mut cache = gold_state.cached_rate.lock().unwrap();
        *cache = Some((rate, now));
    }

    Ok(rate)
}

async fn poll_gold_once(app_handle: &tauri::AppHandle) -> Result<(), String> {
    let client = app_handle.state::<reqwest::Client>();
    let response = client
        .get("https://api.gold-api.com/price/XAU")
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json::<GoldApiResponse>()
        .await
        .map_err(|e| e.to_string())?;

    let usd_try = get_usd_try_rate(app_handle).await?;

    let gram_usd = response.price / GRAMS_PER_TROY_OUNCE;
    let gram_try = gram_usd * usd_try;

    let payload = GoldPricePayload {
        ons_usd: response.price,
        usd_try,
        gram_usd,
        gram_try,
        time: now_millis(),
    };

    app_handle
        .emit("gold-price", payload)
        .map_err(|e| e.to_string())?;

    check_alerts(app_handle, GOLD_SYMBOL, gram_try);

    Ok(())
}

#[derive(Debug, Deserialize)]
struct YahooChartResponse {
    chart: YahooChart,
}

#[derive(Debug, Deserialize)]
struct YahooChart {
    result: Option<Vec<YahooChartResult>>,
}

#[derive(Debug, Deserialize)]
struct YahooChartResult {
    meta: YahooMeta,
}

#[derive(Debug, Deserialize)]
struct YahooMeta {
    #[allow(dead_code)]
    symbol: String,
    #[serde(rename = "longName", default)]
    long_name: Option<String>,
    #[serde(rename = "shortName", default)]
    short_name: Option<String>,
    #[serde(rename = "regularMarketPrice")]
    regular_market_price: f64,
    #[serde(rename = "previousClose", default)]
    previous_close: Option<f64>,
    currency: String,
}

#[derive(Debug, Serialize, Clone)]
struct BistPricePayload {
    symbol: String,
    name: String,
    price: f64,
    previous_close: f64,
    currency: String,
    time: u64,
}

struct BistWatchState {
    symbols: Mutex<Vec<String>>,
}

impl Default for BistWatchState {
    fn default() -> Self {
        Self {
            symbols: Mutex::new(DEFAULT_BIST_SYMBOLS.iter().map(|s| s.to_string()).collect()),
        }
    }
}

// Resmi olmayan Yahoo Finance "chart" endpoint'i — anahtar/kimlik doğrulama
// gerektirmiyor, sadece normal bir tarayıcı User-Agent'ı yeterli. BİST
// sembolleri ".IS" ekiyle sorgulanıyor (örn. THYAO -> THYAO.IS).
async fn fetch_yahoo_quote(client: &reqwest::Client, symbol: &str) -> Result<YahooMeta, String> {
    let url = format!("https://query1.finance.yahoo.com/v8/finance/chart/{symbol}.IS?range=1d&interval=1d");

    let response = client
        .get(&url)
        .header("User-Agent", YAHOO_USER_AGENT)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!("\"{symbol}\" için Yahoo Finance'den veri alınamadı."));
    }

    let parsed = response
        .json::<YahooChartResponse>()
        .await
        .map_err(|e| e.to_string())?;

    let result = parsed
        .chart
        .result
        .and_then(|mut r| if r.is_empty() { None } else { Some(r.remove(0)) })
        .ok_or_else(|| format!("\"{symbol}\" BİST'te bulunamadı."))?;

    Ok(result.meta)
}

#[tauri::command]
async fn add_bist_symbol(
    symbol: String,
    watch: tauri::State<'_, BistWatchState>,
    client: tauri::State<'_, reqwest::Client>,
) -> Result<(), String> {
    let symbol = symbol.trim().to_uppercase();
    fetch_yahoo_quote(&client, &symbol).await?;

    let mut symbols = watch.symbols.lock().unwrap();
    if !symbols.contains(&symbol) {
        symbols.push(symbol);
    }
    Ok(())
}

#[tauri::command]
fn remove_bist_symbol(symbol: String, watch: tauri::State<BistWatchState>) {
    let symbol = symbol.trim().to_uppercase();
    watch.symbols.lock().unwrap().retain(|s| s != &symbol);
}

#[tauri::command]
fn set_bist_symbols(symbols: Vec<String>, watch: tauri::State<BistWatchState>) {
    let mut list = watch.symbols.lock().unwrap();
    *list = symbols.into_iter().map(|s| s.trim().to_uppercase()).collect();
}

#[tauri::command]
fn list_bist_symbols(watch: tauri::State<BistWatchState>) -> Vec<String> {
    let list = watch.symbols.lock().unwrap().clone();
    list
}

async fn poll_bist_once(app_handle: &tauri::AppHandle) {
    let symbols = {
        let watch = app_handle.state::<BistWatchState>();
        let list = watch.symbols.lock().unwrap().clone();
        list
    };

    let client = app_handle.state::<reqwest::Client>();

    for symbol in symbols {
        match fetch_yahoo_quote(&client, &symbol).await {
            Ok(meta) => {
                let price = meta.regular_market_price;
                let payload = BistPricePayload {
                    symbol: symbol.clone(),
                    name: meta.long_name.or(meta.short_name).unwrap_or_else(|| symbol.clone()),
                    price,
                    previous_close: meta.previous_close.unwrap_or(price),
                    currency: meta.currency,
                    time: now_millis(),
                };
                app_handle.emit("bist-price", payload).ok();
                check_alerts(app_handle, &symbol, price);
            }
            Err(e) => {
                println!("BİST fiyatı çekilirken hata oluştu ({symbol}): {e}");
            }
        }
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(AlertState::default())
        .manage(WatchState::default())
        .manage(SymbolStates::default())
        .manage(GoldState::default())
        .manage(BistWatchState::default())
        .manage(reqwest::Client::new())
        .invoke_handler(tauri::generate_handler![
            add_alert,
            remove_alert,
            add_symbol,
            remove_symbol,
            set_symbols,
            list_symbols,
            set_refresh_interval,
            refresh_now,
            add_bist_symbol,
            remove_bist_symbol,
            set_bist_symbols,
            list_bist_symbols
        ])
        .setup(|app| {
            let crypto_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    if let Err(e) = poll_once(&crypto_handle, false).await {
                        println!("Fiyat çekilirken hata oluştu: {e}");
                    }
                    tokio::time::sleep(Duration::from_secs(BASE_TICK_SECONDS)).await;
                }
            });

            let gold_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    if let Err(e) = poll_gold_once(&gold_handle).await {
                        println!("Altın fiyatı çekilirken hata oluştu: {e}");
                    }
                    tokio::time::sleep(Duration::from_secs(GOLD_TICK_SECONDS)).await;
                }
            });

            let bist_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    poll_bist_once(&bist_handle).await;
                    tokio::time::sleep(Duration::from_secs(BIST_TICK_SECONDS)).await;
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Tauri uygulaması çalıştırılırken bir hata oluştu");
}