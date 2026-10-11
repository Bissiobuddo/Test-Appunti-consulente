"""
Ricerca sistematica di correlazioni tra eventi/indicatori e rendimenti futuri.

Per ogni mercato (target), ogni indicatore (feature) e ogni orizzonte (1, 5, 15
sedute) misura se il valore di oggi dell'indicatore anticipa il rendimento dei
giorni successivi.

Come si evita di "trovare" correlazioni che sono solo caso:
  1. SCOPERTA sui dati fino al 2012 (crypto: fino al 2019).
  2. Con migliaia di test, il 5% esce "significativo" per puro caso. Si usa la
     correzione di Benjamini-Hochberg (falsi positivi attesi ≤ 5% dei segnali).
  3. Le correlazioni sopravvissute devono RIPETERSI, con lo stesso segno, sul
     periodo di VERIFICA 2013-2026 (crypto: 2020-2026), mai usato prima.
  4. Gli errori standard tengono conto della sovrapposizione dei rendimenti a
     più giorni (Newey-West). Tutti gli indicatori di altri mercati sono
     ritardati di un giorno per non usare informazioni non ancora disponibili.

Uso:  python3 ricerca.py        (scrive results/ricerca_*.csv)
"""
from __future__ import annotations

import glob
import os
import re

import numpy as np
import pandas as pd
from scipy.stats import norm

HERE = os.path.dirname(os.path.abspath(__file__))
DIR = os.path.join(HERE, "data", "ricerca")
OUT = os.path.join(HERE, "results")
ORIZZONTI = [1, 5, 15]
FINE_SCOPERTA = {"azioni": "2013-01-01", "crypto": "2020-01-01"}
FDR = 0.05

TARGET = ["gspc", "ndx", "rut", "spy", "qqq", "iwm", "dia",
          "xlk", "xlf", "xle", "xlv", "xly", "xlp", "xli", "xlu", "xlb",
          "efa", "eem", "gdaxi", "ftsemib_mi", "stoxx50e", "n225",
          "tlt", "ief", "hyg", "gc_f", "cl_f", "btcusdt", "ethusdt"]
CRYPTO = {"btcusdt", "ethusdt", "solusdt", "bnbusdt", "xrpusdt"}
SETTORI = ["xlk", "xlf", "xle", "xlv", "xly", "xlp", "xli", "xlu", "xlb"]


# ----------------------------------------------------------------------------- dati
def carica(nome: str) -> pd.DataFrame | None:
    path = os.path.join(DIR, f"{nome}.csv")
    if not os.path.exists(path):
        return None
    df = pd.read_csv(path, index_col="date", parse_dates=True).sort_index()
    df = df[~df.index.duplicated()]
    px = df["adj close"] if "adj close" in df and df["adj close"].notna().any() else df["close"]
    df["px"] = px.where(px > 0)
    return df.dropna(subset=["px"])


MESI = "January|February|March|April|May|June|July|August|September|October|November|December"


def date_fomc() -> pd.DatetimeIndex:
    """Giorni di annuncio delle riunioni FOMC programmate (ultimo giorno della riunione),
    estratti dalle pagine ufficiali della Fed scaricate con `dati.py eventi`."""
    cartella = os.path.join(HERE, "data", "eventi", "fomc")
    date = set()
    for f in glob.glob(os.path.join(cartella, "storico_*.html")):
        testo = open(f, encoding="utf-8", errors="ignore").read()
        for h in re.findall(r"<h5[^>]*>(.*?)</h5>", testo, re.S):
            m = re.match(rf"\s*({MESI})\s+(\d+)(?:-(?:({MESI})\s+)?(\d+))?\s+Meeting\s*-\s*(\d{{4}})", h)
            if m:
                date.add(pd.Timestamp(f"{m.group(3) or m.group(1)} {m.group(4) or m.group(2)} {m.group(5)}"))
                continue
            m = re.match(r"\s*(\w{3})/(\w{3})\s+\d+-(\d+)\s+Meeting\s*-\s*(\d{4})", h)  # "Jan/Feb 31-1"
            if m:
                date.add(pd.Timestamp(f"{m.group(2)} {m.group(3)} {m.group(4)}"))
    cal = os.path.join(cartella, "calendario.html")
    if os.path.exists(cal):
        testo = open(cal, encoding="utf-8", errors="ignore").read()
        blocchi = re.split(r">(\d{4}) FOMC Meetings<", testo)
        for anno, blocco in zip(blocchi[1::2], blocchi[2::2]):
            for mese, giorni in re.findall(r"fomc-meeting__month[^>]*><strong>([^<]+)</strong>.*?"
                                           r"fomc-meeting__date[^>]*>([^<]+)<", blocco, re.S):
                if "notation" in giorni or "unscheduled" in giorni.lower():
                    continue
                g = re.findall(r"\d+", giorni)
                mesi = mese.split("/")
                fine = int(g[-1])
                m_fine = mesi[-1] if len(g) > 1 and fine < int(g[0]) or len(mesi) > 1 else mesi[0]
                try:
                    date.add(pd.Timestamp(f"{m_fine} {fine} {anno}"))
                except ValueError:
                    pass
    return pd.DatetimeIndex(sorted(date))


# ----------------------------------------------------------------------------- indicatori
def rsi(p: pd.Series, n: int) -> pd.Series:
    d = p.diff()
    up = d.clip(lower=0).ewm(alpha=1 / n, adjust=False).mean()
    dn = (-d.clip(upper=0)).ewm(alpha=1 / n, adjust=False).mean()
    return 100 - 100 / (1 + up / dn)


def indicatori_propri(df: pd.DataFrame) -> dict[str, pd.Series]:
    p = df.px
    r = np.log(p).diff()
    vol20 = r.rolling(20).std()
    giu = (r < 0).astype(int)
    giorni_giu = giu.groupby((giu == 0).cumsum()).cumsum()
    return {
        "rend_1g": r,
        "rend_5g": np.log(p / p.shift(5)),
        "rend_20g": np.log(p / p.shift(20)),
        "rend_60g": np.log(p / p.shift(60)),
        "rend_250g": np.log(p / p.shift(250)),
        "dist_media50": np.log(p / p.rolling(50).mean()) / vol20,
        "sopra_media200": (p > p.rolling(200).mean()).astype(float),
        "rsi2": rsi(p, 2),
        "rsi14": rsi(p, 14),
        "calo_da_max20": np.log(p / p.rolling(20).max()),
        "minimo_20g": (p <= p.rolling(20).min()).astype(float),
        "massimo_20g": (p >= p.rolling(20).max()).astype(float),
        "giorni_di_calo": giorni_giu.astype(float),
        "vol20": vol20,
        "vol5_su_vol60": r.rolling(5).std() / r.rolling(60).std(),
    }


def indicatori_mercato() -> dict[str, pd.Series]:
    """Indicatori comuni, ritardati di 1 giorno (si usano solo dati già noti)."""
    s = {}
    get = lambda n: (carica(n).px if carica(n) is not None else None)
    vix, vix3m, vix9d, vvix = get("vix"), get("vix3m"), get("vix9d"), get("vvix")
    if vix is not None:
        s["vix"] = vix
        s["vix_zscore_1a"] = (vix - vix.rolling(250).mean()) / vix.rolling(250).std()
        s["vix_var_5g"] = np.log(vix / vix.shift(5))
    if vix is not None and vix3m is not None:
        s["vix_su_vix3m"] = vix / vix3m           # > 1 = paura a breve (backwardation)
    if vix is not None and vix9d is not None:
        s["vix9d_su_vix"] = vix9d / vix
    if vvix is not None:
        s["vvix"] = vvix
    tnx, irx = get("tnx"), get("irx")
    if tnx is not None:
        s["tassi10a_var_20g"] = tnx - tnx.shift(20)
    if tnx is not None and irx is not None:
        s["curva_10a_3m"] = tnx - irx
    for nome, simb in (("dollaro", "dx_y_nyb"), ("oro", "gc_f"), ("petrolio", "cl_f")):
        x = get(simb)
        if x is not None:
            s[f"{nome}_var_20g"] = np.log(x / x.shift(20))
    hyg, ief = get("hyg"), get("ief")
    if hyg is not None and ief is not None:
        rap = np.log(hyg / ief).dropna()
        s["credito_var_20g"] = rap - rap.shift(20)
    rame, oro = get("hg_f"), get("gc_f")
    if rame is not None and oro is not None:
        rap = np.log(rame / oro).dropna()
        s["rame_su_oro_var_20g"] = rap - rap.shift(20)
    sett = [get(x) for x in SETTORI]
    sett = [x for x in sett if x is not None]
    if sett:
        sopra = pd.concat([(x > x.rolling(50).mean()).astype(float).where(x.rolling(50).count() == 50)
                           for x in sett], axis=1)
        s["ampiezza_settori"] = sopra.mean(axis=1, skipna=True)
    return s


def calendario(idx: pd.DatetimeIndex, crypto: bool, fomc: pd.DatetimeIndex) -> dict[str, pd.Series]:
    d = pd.Series(idx, index=idx)
    s = {}
    for i, g in enumerate(["lunedi", "martedi", "mercoledi", "giovedi", "venerdi"]):
        s[f"giorno_{g}"] = (d.dt.dayofweek == i).astype(float)
    if crypto:
        s["weekend"] = (d.dt.dayofweek >= 5).astype(float)
        return s
    mese = d.dt.to_period("M")
    pos = d.groupby(mese).cumcount()
    da_fine = d.groupby(mese).cumcount(ascending=False)
    # si entra alla chiusura del giorno t: "fine mese" = entrare il penultimo giorno
    s["fine_inizio_mese"] = ((da_fine == 1) | (da_fine == 0) | (pos <= 1)).astype(float)
    s["meta_mese"] = ((pos >= 8) & (da_fine >= 6)).astype(float)
    s["mesi_nov_apr"] = d.dt.month.isin([11, 12, 1, 2, 3, 4]).astype(float)
    s["settembre"] = (d.dt.month == 9).astype(float)
    terzo_ven = (d.dt.dayofweek == 4) & (d.dt.day >= 15) & (d.dt.day <= 21)
    sett_id = d.dt.to_period("W")
    s["settimana_scadenze"] = terzo_ven.groupby(sett_id).transform("max").astype(float)
    prossimo = pd.Series(idx[1:].append(pd.DatetimeIndex([idx[-1] + pd.Timedelta(days=1)])), index=idx)
    s["prefestivo"] = (((prossimo - d).dt.days > 1) & (d.dt.dayofweek != 4)).astype(float)
    if len(fomc):
        f = pd.Series(1.0, index=fomc)
        vigilia = f.reindex(idx).shift(-1).fillna(0)        # entro la sera prima dell'annuncio
        s["vigilia_fomc"] = vigilia
        s["settimana_fomc"] = (f.reindex(idx).fillna(0)[::-1].rolling(5, min_periods=1).max()[::-1]
                               .shift(-1).fillna(0))
    return s


# ----------------------------------------------------------------------------- statistica
def nw_regressione(x: np.ndarray, y: np.ndarray, lag: int) -> tuple[float, float]:
    """Pendenza di y su x con errore standard Newey-West. Restituisce (beta, t)."""
    x = x - x.mean()
    sxx = (x * x).sum()
    if sxx <= 0:
        return np.nan, np.nan
    b = (x * (y - y.mean())).sum() / sxx
    u = (y - y.mean()) - b * x
    s = x * u
    S = (s * s).sum()
    for l in range(1, lag + 1):
        S += 2 * (1 - l / (lag + 1)) * (s[l:] * s[:-l]).sum()
    return b, b / np.sqrt(S / sxx**2)


def test(feat: pd.Series, fwd: pd.Series, h: int, binaria: bool, soglie=None):
    df = pd.concat([feat, fwd], axis=1, sort=True).dropna()
    if len(df) < 250:
        return None
    x, y = df.iloc[:, 0].values, df.iloc[:, 1].values
    lo, hi = np.percentile(y, [1, 99])
    y = np.clip(y, lo, hi)  # i crolli estremi non devono dominare la statistica
    if binaria:
        if x.sum() < 30 or (1 - x).sum() < 30:
            return None
        xr = x
        alto = y[x == 1].mean()
        basso = y[x == 0].mean()
    else:
        xr = pd.Series(x).rank(pct=True).values
        q20, q80 = soglie if soglie is not None else np.percentile(x, [20, 80])
        alto, basso = y[x >= q80].mean(), y[x <= q20].mean()
    b, t = nw_regressione(xr, y, max(h, 5))
    return dict(n=len(df), beta=b, t=t, p=2 * norm.sf(abs(t)), rend_alto=alto, rend_basso=basso,
                rend_medio=y.mean())


def main():
    os.makedirs(OUT, exist_ok=True)
    mercato = indicatori_mercato()
    fomc = date_fomc()
    print(f"Indicatori di mercato: {len(mercato)}  |  date FOMC trovate: {len(fomc)}")
    righe = []
    for nome in TARGET:
        df = carica(nome)
        if df is None and nome in ("btcusdt", "ethusdt"):
            alt = os.path.join(HERE, "data", nome[:3] + ".csv")
            df = pd.read_csv(alt, index_col="date", parse_dates=True).rename(columns={"close": "px"})
        if df is None:
            continue
        crypto = nome in CRYPTO
        idx = df.index
        feats = {k: v for k, v in indicatori_propri(df).items()}
        if not crypto:
            for k, v in mercato.items():
                feats[k] = v.reindex(idx.union(v.index)).ffill(limit=3).shift(1).reindex(idx)
        feats.update(calendario(idx, crypto, fomc))
        fine = pd.Timestamp(FINE_SCOPERTA["crypto" if crypto else "azioni"])
        logp = np.log(df.px)
        for h in ORIZZONTI:
            fwd = logp.shift(-h) - logp
            for fn, f in feats.items():
                binaria = set(pd.unique(f.dropna())) <= {0.0, 1.0}
                a = f[idx < fine - pd.Timedelta(days=2 * h)]
                ra = test(a, fwd, h, binaria)
                if ra is None:
                    continue
                soglie = None if binaria else tuple(np.nanpercentile(a, [20, 80]))
                rb = test(f[idx >= fine], fwd, h, binaria, soglie)
                if rb is None:
                    continue
                righe.append(dict(target=nome, orizzonte=h, indicatore=fn, binaria=binaria,
                                  **{f"{k}_scoperta": v for k, v in ra.items()},
                                  **{f"{k}_verifica": v for k, v in rb.items()}))
    r = pd.DataFrame(righe)

    # Benjamini-Hochberg sul periodo di scoperta
    p = r.p_scoperta.values
    ordine = np.argsort(p)
    m = len(p)
    soglia = np.zeros(m, bool)
    passa = p[ordine] <= FDR * np.arange(1, m + 1) / m
    if passa.any():
        soglia[ordine[: np.max(np.flatnonzero(passa)) + 1]] = True
    r["scoperta_ok"] = soglia
    r["verifica_ok"] = r.scoperta_ok & (np.sign(r.beta_verifica) == np.sign(r.beta_scoperta)) & \
        (r.p_verifica / 2 < 0.05)
    r.to_csv(os.path.join(OUT, "ricerca_tutti_i_test.csv"), index=False)

    print(f"\nTest eseguiti: {m}")
    print(f"'Significativi' al 5% senza correzione: {(r.p_scoperta < 0.05).sum()} "
          f"(per puro caso ne aspetteremmo ~{0.05 * m:.0f})")
    print(f"Sopravvissuti alla correzione (scoperta): {r.scoperta_ok.sum()}")
    print(f"Confermati nel periodo di verifica: {r.verifica_ok.sum()}")
    ok = r[r.verifica_ok].copy()
    ok["bp_alto_vs_basso_verifica"] = (ok.rend_alto_verifica - ok.rend_basso_verifica) * 1e4
    cols = ["target", "orizzonte", "indicatore", "t_scoperta", "t_verifica",
            "rend_alto_verifica", "rend_basso_verifica", "rend_medio_verifica"]
    ok = ok.sort_values("t_verifica", key=abs, ascending=False)
    ok.to_csv(os.path.join(OUT, "ricerca_confermati.csv"), index=False)
    pd.set_option("display.width", 220)
    pd.set_option("display.max_rows", 300)
    pct = "{:+.2%}".format
    print(ok[cols].to_string(index=False, formatters={"t_scoperta": "{:+.1f}".format,
                                                      "t_verifica": "{:+.1f}".format,
                                                      "rend_alto_verifica": pct,
                                                      "rend_basso_verifica": pct,
                                                      "rend_medio_verifica": pct}))
    print("\nIndicatori confermati più spesso (su tutti i mercati e orizzonti):")
    print(ok.groupby("indicatore").size().sort_values(ascending=False).to_string())


if __name__ == "__main__":
    main()
