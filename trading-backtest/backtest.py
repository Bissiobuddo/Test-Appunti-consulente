"""
Backtest: "raddoppiare il capitale in 1-3 settimane con probabilità ~90%".

Per ogni mercato e per ogni combinazione di
    segnale di ingresso x direzione (long/short) x leva x stop-loss
simula un'operazione aperta in ogni barra in cui il segnale è attivo e
misura se il capitale tocca l'obiettivo (es. 2x = +100%) entro 3 settimane
prima di toccare lo stop (o la liquidazione).

Per evitare l'auto-inganno (overfitting) i parametri vengono scelti SOLO sul
primo 70% della storia (in-sample) e poi verificati sul 30% finale
(out-of-sample), che la strategia non ha mai "visto".

Uso:  python3 backtest.py            (scrive i risultati in results/)
"""
from __future__ import annotations

import itertools
import os

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
OUT = os.path.join(HERE, "results")

# bars_week: barre in una settimana; cost: costo round-trip (spread+commissioni)
# per unità di nozionale; carry: costo di finanziamento per barra per unità di
# nozionale (funding dei perpetui / overnight dei CFD); eu_max_lev: leva massima
# consentita ai clienti retail UE (ESMA).
ASSETS = {
    "BTC": dict(file="btc.csv", bars_week=7, cost=0.0010, carry=0.0003, eu_max_lev=2),
    "ETH": dict(file="eth.csv", bars_week=7, cost=0.0010, carry=0.0003, eu_max_lev=2),
    "GOOG": dict(file="goog.csv", bars_week=5, cost=0.0010, carry=0.0002, eu_max_lev=5),
    "BRENT": dict(file="brent.csv", bars_week=5, cost=0.0010, carry=0.0002, eu_max_lev=10),
    "EURUSD_1h": dict(file="eurusd_1h.csv", bars_week=120, cost=0.0001, carry=0.000004, eu_max_lev=30),
}
LEVERAGES = [1, 2, 3, 5, 10, 20, 30]
STOPS = [0.0, 0.5, 0.7]  # livello di equity a cui si esce (0 = solo liquidazione)
TRAIN_FRAC = 0.70
MIN_TRADES = 30


def load(name: str) -> pd.Series:
    df = pd.read_csv(os.path.join(DATA, ASSETS[name]["file"]))
    s = pd.Series(df["close"].values, index=pd.to_datetime(df["date"]), name=name)
    return s.sort_index()


def signals(p: pd.Series, bars_week: int) -> dict[str, np.ndarray]:
    """Segnali di ingresso calcolati solo con dati passati (nessun look-ahead)."""
    n_m = 4 * bars_week  # ~1 mese
    r = np.log(p).diff()
    vol = r.rolling(n_m).std()
    sig = {
        "sempre": np.ones(len(p), bool),
        "momentum_1m": (p > p.rolling(n_m).mean()) & (p.pct_change(n_m) > 0),
        "momentum_3m": (p > p.rolling(3 * n_m).mean()) & (p.pct_change(3 * n_m) > 0),
        "breakout_1m": p >= p.rolling(n_m).max(),
        "dip_1w": p.pct_change(bars_week) < -2 * vol * np.sqrt(bars_week),
        "squeeze": vol <= vol.rolling(12 * n_m, min_periods=3 * n_m).quantile(0.2),
        "vol_alta": vol >= vol.rolling(12 * n_m, min_periods=3 * n_m).quantile(0.8),
    }
    return {k: np.asarray(v, bool) for k, v in sig.items()}


def simulate_paths(prices: np.ndarray, entries: np.ndarray, sigma: np.ndarray, direction: int,
                   lev, stop, horizon: int, target: float, cost: float, carry: float,
                   rng: np.random.Generator) -> dict:
    """Simula un'operazione per ogni ingresso valido.

    `lev` e `stop` (livello di equity a cui si esce, 0 = liquidazione) possono
    essere un numero oppure un array lungo quanto `prices` (valore per barra).

    I dati sono solo prezzi di chiusura: per non ignorare i movimenti dentro la
    barra (le "spike" che liquidano le posizioni a leva) si usa la probabilità
    di attraversamento del ponte browniano tra due chiusure consecutive, con la
    volatilità stimata sul passato. Se obiettivo e stop sono toccati nella
    stessa barra si assume, prudenzialmente, che arrivi prima lo stop.
    """
    idx = np.flatnonzero(entries & np.isfinite(sigma))
    idx = idx[idx + horizon < len(prices)]
    empty = np.array([])
    if len(idx) == 0:
        return dict(idx=idx.astype(int), success=empty.astype(bool), final=empty,
                    exit=idx.astype(int))
    per_bar = lambda v: np.asarray(v, float)[idx][:, None] if np.ndim(v) else float(v)
    lev, floor = per_bar(lev), np.maximum(per_bar(stop), 0.0)
    steps = np.arange(1, horizon + 1)
    ratio = prices[idx[:, None] + steps[None, :]] / prices[idx, None]
    drag = lev * cost + lev * carry * steps[None, :]
    eq = 1 + direction * lev * (ratio - 1) - drag

    lr = np.log(ratio)
    prev = np.hstack([np.zeros((len(idx), 1)), lr[:, :-1]])
    var = (sigma[idx] ** 2)[:, None]

    def touched(level_eq, above):
        r = 1 + (level_eq - 1 + drag) / (direction * lev)  # prezzo relativo della barriera
        with np.errstate(divide="ignore", invalid="ignore"):
            b = np.where(r > 0, np.log(np.where(r > 0, r, 1)), -np.inf)
        crossed = (lr >= b) if above else (lr <= b)
        same_side = (prev < b) & (lr < b) if above else (prev > b) & (lr > b)
        with np.errstate(over="ignore", invalid="ignore"):
            p = np.where(same_side & np.isfinite(b), np.exp(-2 * (b - prev) * (b - lr) / var), 0.0)
        return crossed | (rng.random(p.shape) < p)

    # per un long l'obiettivo è sopra e lo stop sotto; per uno short il contrario
    hit = touched(target, above=direction == 1)
    out = touched(floor, above=direction == -1)
    big = horizon + 1
    t_hit = np.where(hit.any(1), hit.argmax(1), big)
    t_out = np.where(out.any(1), out.argmax(1), big)
    success = t_hit < t_out
    stopped = ~success & (t_out <= horizon - 1)
    floor_v = np.broadcast_to(floor, (len(idx), 1))[:, 0]
    final = np.where(success, target, np.where(stopped, floor_v, np.clip(eq[:, -1], 0, None)))
    exit_bar = idx + 1 + np.minimum(np.minimum(t_hit, t_out), horizon - 1)
    return dict(idx=idx, success=success, final=final, exit=exit_bar)


def simulate(*args, **kwargs):
    """Restituisce (successi, equity finali) per ogni ingresso valido."""
    r = simulate_paths(*args, **kwargs)
    return r["success"], r["final"]


def run_asset(name: str, target: float) -> pd.DataFrame:
    cfg = ASSETS[name]
    p = load(name)
    prices = p.values.astype(float)
    sig = signals(p, cfg["bars_week"])
    sigma = np.log(p).diff().rolling(4 * cfg["bars_week"]).std().values
    rng = np.random.default_rng(42)
    horizon = 3 * cfg["bars_week"]
    split = int(len(prices) * TRAIN_FRAC)
    train_mask = np.arange(len(prices)) < split - horizon  # niente sovrapposizione col test
    test_mask = np.arange(len(prices)) >= split
    rows = []
    for (sname, s), d, lev, stop in itertools.product(sig.items(), (1, -1), LEVERAGES, STOPS):
        rec = dict(asset=name, segnale=sname, direzione="long" if d == 1 else "short",
                   leva=lev, stop=stop, leva_ok_UE=lev <= cfg["eu_max_lev"])
        for tag, m in (("train", train_mask), ("test", test_mask)):
            succ, fin = simulate(prices, s & m, sigma, d, lev, stop, horizon, target,
                                 cfg["cost"], cfg["carry"], rng)
            rec[f"n_{tag}"] = len(succ)
            rec[f"p_{tag}"] = succ.mean() if len(succ) else np.nan
            rec[f"ev_{tag}"] = fin.mean() if len(fin) else np.nan  # equity media finale (1 = pari)
            rec[f"rovina_{tag}"] = (fin <= 0.05).mean() if len(fin) else np.nan
        rows.append(rec)
    return pd.DataFrame(rows)


def pick(df: pd.DataFrame) -> pd.Series:
    """Sceglie la combinazione migliore usando SOLO i dati in-sample."""
    ok = df[(df.n_train >= MIN_TRADES) & (df.n_test >= MIN_TRADES)]
    return ok.sort_values(["p_train", "ev_train"], ascending=False).iloc[0]


def main():
    os.makedirs(OUT, exist_ok=True)
    targets = [1.02, 1.05, 1.10, 1.20, 1.30, 1.50, 2.00]
    best_rows, hindsight_rows = [], []
    for name in ASSETS:
        for tgt in targets:
            df = run_asset(name, tgt)
            if tgt == 2.00:
                df.to_csv(os.path.join(OUT, f"griglia_{name}_x2.csv"), index=False)
            b = pick(df).to_dict()
            b["obiettivo"] = f"+{round((tgt - 1) * 100)}%"
            best_rows.append(b)
            full = df[(df.n_train >= MIN_TRADES) & (df.n_test >= MIN_TRADES)]
            h = full.sort_values("p_test", ascending=False).iloc[0].to_dict()
            h["obiettivo"] = f"+{round((tgt - 1) * 100)}%"
            hindsight_rows.append(h)
    cols = ["asset", "obiettivo", "segnale", "direzione", "leva", "stop", "leva_ok_UE",
            "n_train", "p_train", "n_test", "p_test", "ev_test", "rovina_test"]
    best = pd.DataFrame(best_rows)[cols]
    hind = pd.DataFrame(hindsight_rows)[cols]
    best.to_csv(os.path.join(OUT, "migliori_strategie.csv"), index=False)
    hind.to_csv(os.path.join(OUT, "massimo_col_senno_di_poi.csv"), index=False)
    pd.set_option("display.width", 200)
    pd.set_option("display.max_rows", 200)
    fmt = {"p_train": "{:.0%}".format, "p_test": "{:.0%}".format,
           "ev_test": "{:.2f}".format, "rovina_test": "{:.0%}".format}
    print("\n=== Strategia scelta in-sample, verificata out-of-sample ===")
    print(best.to_string(index=False, formatters=fmt))
    print("\n=== Limite superiore: migliore combinazione scelta GUARDANDO il test (barando) ===")
    print(hind[hind.obiettivo == "+100%"].to_string(index=False, formatters=fmt))


if __name__ == "__main__":
    main()
