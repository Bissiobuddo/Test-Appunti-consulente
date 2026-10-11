"""
Scarica e aggiorna i dati di mercato in data/*.csv (prezzi) e data/fondamentali/.

Fonti (tutte gratuite):
  - Yahoo Finance (libreria yfinance, senza chiave): indici, azioni, ETF,
    futures, cambi, VIX. Es. ^GSPC (S&P 500), ^VIX, BZ=F (Brent), EURUSD=X.
  - Binance (API pubblica, senza chiave): crypto, es. BTCUSDT, ETHUSDT.
  - CBOE (CSV pubblico, senza chiave): storico ufficiale del VIX.
  - Financial Modeling Prep (chiave gratuita, variabile FMP_API_KEY):
    dati fondamentali (bilanci, multipli, profilo società).
  - Alpha Vantage (chiave gratuita, variabile ALPHAVANTAGE_API_KEY): in
    alternativa a FMP per i fondamentali (funzione OVERVIEW).

Uso:
    pip install yfinance pandas
    python3 dati.py aggiorna              # aggiorna tutti i mercati usati dai backtest
    python3 dati.py fondamentali AAPL     # salva i fondamentali di una società
    python3 dati.py ricerca               # universo ampio per la ricerca di correlazioni
    python3 dati.py ricerca SPY ^IRX      # solo alcuni simboli dell'universo
    python3 dati.py eventi                # calendari delle riunioni Fed (pagine originali)

Se una fonte non risponde, il file esistente resta com'è: i backtest
continuano a funzionare con i dati già salvati.
"""
from __future__ import annotations

import io
import json
import os
import sys
import time
import urllib.parse
import urllib.request

import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
UA = {"User-Agent": "Mozilla/5.0 (backtest personale)"}

# file locale -> (fonte, simbolo)
MERCATI = {
    "spx.csv": ("yahoo", "^GSPC"),
    "vix.csv": ("cboe", "VIX"),
    "btc.csv": ("binance", "BTCUSDT"),
    "eth.csv": ("binance", "ETHUSDT"),
    "brent.csv": ("yahoo", "BZ=F"),
}


# Universo per la ricerca di correlazioni (data/ricerca/<nome>.csv)
RICERCA_YAHOO = [
    # indici e ETF azionari (gli ETF hanno anche "adj close" = con dividendi)
    "^GSPC", "^NDX", "^RUT", "^DJI", "SPY", "QQQ", "IWM", "DIA",
    "XLK", "XLF", "XLE", "XLV", "XLY", "XLP", "XLI", "XLU", "XLB",
    "EFA", "EEM", "^STOXX50E", "^GDAXI", "FTSEMIB.MI", "^N225",
    # obbligazioni, credito, dollaro
    "TLT", "IEF", "HYG", "LQD", "UUP",
    # volatilità e sua struttura a termine
    "^VIX", "^VIX9D", "^VIX3M", "^VVIX",
    # tassi
    "^IRX", "^FVX", "^TNX", "^TYX",
    # cambi e materie prime
    "DX-Y.NYB", "EURUSD=X", "USDJPY=X", "GC=F", "SI=F", "CL=F", "HG=F", "NG=F",
]
RICERCA_BINANCE = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT"]


def nome_file(simbolo: str) -> str:
    return "".join(c if c.isalnum() else "_" for c in simbolo.lstrip("^")).lower() + ".csv"


def ricerca(solo: list[str] | None = None) -> int:
    cartella = os.path.join(DATA, "ricerca")
    os.makedirs(cartella, exist_ok=True)
    errori = 0
    for fonte, simboli in (("yahoo", RICERCA_YAHOO), ("binance", RICERCA_BINANCE)):
        for s in simboli:
            if solo and s not in solo:
                continue
            try:
                if fonte == "yahoo":
                    import yfinance as yf
                    df = yf.download(s, start="1985-01-01", interval="1d", auto_adjust=False,
                                     progress=False, multi_level_index=False)
                    df = df.rename(columns=str.lower)
                    df.index = pd.to_datetime(df.index).tz_localize(None)
                else:
                    df = binance(s)
                if df.empty:
                    raise RuntimeError("nessun dato")
                df.index.name = "date"
                df.to_csv(os.path.join(cartella, nome_file(s)))
                print(f"OK  {s:12s} {df.index[0].date()} -> {df.index[-1].date()} ({len(df)} righe)")
            except Exception as e:
                errori += 1
                print(f"ERR {s:12s} {type(e).__name__}: {e}")
    return errori


def eventi() -> int:
    """Salva le pagine ufficiali con le date delle riunioni FOMC (la Fed)."""
    cartella = os.path.join(DATA, "eventi", "fomc")
    os.makedirs(cartella, exist_ok=True)
    pagine = {"calendario.html": "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm"}
    for anno in range(1990, 2021):
        pagine[f"storico_{anno}.html"] = (
            f"https://www.federalreserve.gov/monetarypolicy/fomchistorical{anno}.htm")
    errori = 0
    for file, url in pagine.items():
        try:
            with open(os.path.join(cartella, file), "wb") as f:
                f.write(_get(url))
            time.sleep(0.3)
        except Exception as e:
            errori += 1
            print(f"ERR {file}: {e}")
    print(f"Pagine FOMC salvate: {len(pagine) - errori}/{len(pagine)}")
    return errori


def _get(url: str, timeout: int = 30) -> bytes:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def yahoo(simbolo: str, inizio: str = "1990-01-01") -> pd.DataFrame:
    import yfinance as yf  # gestisce lui cookie e "crumb" richiesti da Yahoo

    df = yf.download(simbolo, start=inizio, interval="1d", auto_adjust=False,
                     progress=False, multi_level_index=False)
    if df.empty:
        raise RuntimeError(f"Yahoo non ha restituito dati per {simbolo}")
    df = df.rename(columns=str.lower)[["open", "high", "low", "close", "volume"]]
    df.index = pd.to_datetime(df.index).tz_localize(None)
    return df


def binance(simbolo: str, inizio: str = "2017-08-01") -> pd.DataFrame:
    """Candele giornaliere dall'API pubblica (max 1000 per richiesta)."""
    base = "https://data-api.binance.vision/api/v3/klines"
    start = int(pd.Timestamp(inizio).timestamp() * 1000)
    righe = []
    while True:
        q = urllib.parse.urlencode(dict(symbol=simbolo, interval="1d", startTime=start, limit=1000))
        lotto = json.loads(_get(f"{base}?{q}"))
        if not lotto:
            break
        righe += lotto
        start = lotto[-1][0] + 86_400_000
        if len(lotto) < 1000:
            break
        time.sleep(0.2)
    df = pd.DataFrame(righe).iloc[:, :6]
    df.columns = ["date", "open", "high", "low", "close", "volume"]
    df["date"] = pd.to_datetime(df["date"], unit="ms")
    df = df.set_index("date").astype(float)
    return df.iloc[:-1]  # l'ultima candela è quella del giorno in corso, non ancora chiusa


def cboe(indice: str = "VIX") -> pd.DataFrame:
    url = f"https://cdn.cboe.com/api/global/us_indices/daily_prices/{indice}_History.csv"
    df = pd.read_csv(io.BytesIO(_get(url)))
    df.columns = [c.strip().lower() for c in df.columns]
    df["date"] = pd.to_datetime(df["date"])
    return df.set_index("date")[["open", "high", "low", "close"]]


FONTI = {"yahoo": yahoo, "binance": binance, "cboe": cboe}


def unisci(file: str, nuovi: pd.DataFrame) -> pd.DataFrame:
    """Aggiunge i dati nuovi a quelli già salvati (i nuovi prevalgono sulle date in comune)."""
    path = os.path.join(DATA, file)
    nuovi = nuovi.copy()
    nuovi.index.name = "date"
    if os.path.exists(path):
        vecchi = pd.read_csv(path, index_col="date", parse_dates=True)
        tutti = pd.concat([vecchi, nuovi])
        tutti = tutti[~tutti.index.duplicated(keep="last")].sort_index()
    else:
        tutti = nuovi
    tutti.to_csv(path)
    return tutti


def aggiorna() -> int:
    errori = 0
    for file, (fonte, simbolo) in MERCATI.items():
        try:
            df = unisci(file, FONTI[fonte](simbolo))
            print(f"OK  {file:10s} {fonte:8s} {simbolo:8s} -> ultimo dato {df.index[-1].date()} "
                  f"chiusura {df['close'].iloc[-1]:,.2f}")
        except Exception as e:  # una fonte giù non deve fermare le altre
            errori += 1
            print(f"ERR {file:10s} {fonte:8s} {simbolo:8s} -> {type(e).__name__}: {e}")
    return errori


def fondamentali(simbolo: str) -> dict:
    """Profilo, conto economico, multipli. Usa FMP se c'è la chiave, altrimenti Alpha Vantage."""
    out = {}
    if key := os.environ.get("FMP_API_KEY"):
        base = "https://financialmodelingprep.com/stable"
        for nome in ("profile", "income-statement", "balance-sheet-statement",
                     "cash-flow-statement", "ratios", "key-metrics"):
            q = urllib.parse.urlencode(dict(symbol=simbolo, apikey=key, limit=5))
            out[nome] = json.loads(_get(f"{base}/{nome}?{q}"))
    elif key := os.environ.get("ALPHAVANTAGE_API_KEY"):
        q = urllib.parse.urlencode(dict(function="OVERVIEW", symbol=simbolo, apikey=key))
        out["overview"] = json.loads(_get(f"https://www.alphavantage.co/query?{q}"))
    else:
        raise SystemExit("Imposta FMP_API_KEY (consigliato) oppure ALPHAVANTAGE_API_KEY.")
    cartella = os.path.join(DATA, "fondamentali")
    os.makedirs(cartella, exist_ok=True)
    with open(os.path.join(cartella, f"{simbolo}.json"), "w") as f:
        json.dump(out, f, indent=1)
    return out


if __name__ == "__main__":
    comando = sys.argv[1] if len(sys.argv) > 1 else "aggiorna"
    if comando == "aggiorna":
        sys.exit(1 if aggiorna() == len(MERCATI) else 0)
    elif comando == "ricerca":
        ricerca(sys.argv[2:] or None)
    elif comando == "eventi":
        eventi()
    elif comando == "fondamentali" and len(sys.argv) > 2:
        dati = fondamentali(sys.argv[2])
        print(f"Salvati in data/fondamentali/{sys.argv[2]}.json: {', '.join(dati)}")
    else:
        print(__doc__)
