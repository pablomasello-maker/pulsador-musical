# Renders Temón's original intro rock loop + ending stinger.
import numpy as np, sys
from scipy.signal import lfilter, butter, sosfilt, fftconvolve
SR = 44100
rng = np.random.default_rng(7)
BPM = 140; S16 = 60 / BPM / 4
BAR = 16 * S16
NB = 8
L = NB * BAR
E2 = 82.41
hz = lambda st: E2 * 2 ** (st / 12)
N = {"E": 0, "G": 3, "A": 5, "Bb": 6, "B": 7, "C": 8, "D": 10, "F#": 2}

def bp(lo, hi, x, order=2):
    return sosfilt(butter(order, [lo, hi], "bandpass", fs=SR, output="sos"), x)
def lp(f, x, order=2): return sosfilt(butter(order, f, "lowpass", fs=SR, output="sos"), x)
def hp(f, x, order=2): return sosfilt(butter(order, f, "highpass", fs=SR, output="sos"), x)
def peak(f, gain_db, q, x):
    A = 10 ** (gain_db / 40); w = 2 * np.pi * f / SR; al = np.sin(w) / (2 * q)
    b = [1 + al * A, -2 * np.cos(w), 1 - al * A]; a = [1 + al / A, -2 * np.cos(w), 1 - al / A]
    return lfilter(b, a, x)

def ks(freq, dur, damp=0.996, bright=0.5, seed=None):
    """Karplus-Strong plucked string."""
    r = np.random.default_rng(seed)
    n = int(dur * SR); P = max(2, int(round(SR / freq)))
    exc = np.zeros(n); burst = r.uniform(-1, 1, P)
    burst = lfilter([1 - bright], [1, -bright], burst)  # softer pick
    exc[:P] = burst
    a = np.zeros(P + 2); a[0] = 1; a[P] = -damp * 0.5; a[P + 1] = -damp * 0.5
    return lfilter([1], a, exc)

def gtr_note(st, dur, mute, seed):
    n = int((dur + 0.05) * SR)
    out = np.zeros(n)
    voices = [0, 7, 12] if not mute else [0, 7]
    for k, iv in enumerate(voices):
        off = int((0.004 * k + rng.uniform(0, 0.003)) * SR)  # strum
        f = hz(st + iv) * 2 ** (rng.normal(0, 4) / 1200)
        s = ks(f, dur + 0.05, damp=0.985 if mute else 0.9985, bright=0.7 if mute else 0.35, seed=seed + k)
        out[off:] += s[: n - off]
    env = np.ones(n)
    rel = int(0.03 * SR); end = int(dur * SR)
    env[end:] = 0; env[max(0, end - rel):end] *= np.linspace(1, 0, min(rel, end))
    if mute: env *= np.exp(-np.arange(n) / (0.07 * SR))
    return out * env

def amp(x):
    x = hp(110, x)                   # tight low end before the amp
    x = peak(800, 6, 0.7, x)         # tube-screamer style mid push
    x = np.tanh(x * 18 + 0.15) - np.tanh(0.15)
    x = np.tanh(x * 2.2)
    # 4x12 cabinet approximation
    x = hp(85, x); x = lp(5200, x, 4); x = peak(2300, 4, 1.2, x); x = peak(400, -3, 1.0, x); x = peak(120, 3, 0.8, x)
    return x

def bass_note(st, dur, seed):
    s = ks(hz(st) / 2, dur + 0.05, damp=0.998, bright=0.2, seed=seed)
    n = len(s); end = int(dur * SR); env = np.ones(n); env[end:] = 0
    s = s * env
    return lp(900, np.tanh(s * 3)) * 0.9

# ---- riff: (step, note, len16, mute) ----
def bar(spec):
    out = []
    for item in spec.split():
        step, rest = item.split(":")
        note, ln = rest.split("/")
        mute = note.islower()
        out.append((int(step), note if not mute else note.upper(), int(ln), mute))
    return out
A = bar("0:e/1 1:e/1 2:E/2 4:G/2 6:A/3 9:e/1 10:e/1 11:Bb/1 12:A/2 14:G/2")
B = bar("0:e/1 1:e/1 2:E/2 4:G/2 6:A/3 9:e/1 10:e/1 11:D/2 13:C/1 14:D/2")
C = bar("0:D/4 4:C/4 8:A/3 11:a/1 12:B/4")
SONG = [A, B, A, C, A, B, A, C]

TOT = int((L + 3) * SR)
gl = np.zeros(TOT); gr = np.zeros(TOT); bass = np.zeros(TOT); drums = np.zeros(TOT)
def add(buf, t, sig, g=1.0):
    i = int(t * SR); j = min(len(buf), i + len(sig)); buf[i:j] += sig[: j - i] * g

seed = 100
for bi, b in enumerate(SONG):
    for step, note, ln, mute in b:
        t = bi * BAR + step * S16
        dur = ln * S16 * (0.92 if not mute else 0.9)
        st = N[note]
        for side, buf in ((0, gl), (1, gr)):
            seed += 1
            add(buf, t + rng.uniform(0, 0.006), gtr_note(st, dur, mute, seed), 0.55 if mute else 0.6)
        seed += 1
        add(bass, t, bass_note(st, ln * S16 * 0.95, seed))

# ---- drums ----
def kick():
    n = int(0.45 * SR); t = np.arange(n) / SR
    f = 45 + 110 * np.exp(-t / 0.035)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.16)
    click = hp(2000, rng.uniform(-1, 1, n)) * np.exp(-t / 0.004) * 0.5
    return np.tanh((s + click) * 1.5)
def snare():
    n = int(0.35 * SR); t = np.arange(n) / SR
    body = (np.sin(2 * np.pi * 185 * t) + 0.5 * np.sin(2 * np.pi * 330 * t)) * np.exp(-t / 0.06)
    wires = bp(1500, 9000, rng.uniform(-1, 1, n)) * np.exp(-t / 0.13)
    return np.tanh((body * 0.7 + wires * 1.6) * 1.3)
def metal(n, dec, lo=6000):
    t = np.arange(n) / SR
    fs = [205.3, 304.4, 369.6, 522.7, 540, 800]
    s = sum(np.sign(np.sin(2 * np.pi * f * 2.1 * t + rng.uniform(0, 6))) for f in fs)
    s = s + rng.uniform(-1, 1, n) * 2
    return hp(lo, s, 4) * np.exp(-t / dec) * 0.25
def hat(open_=False): return metal(int((0.5 if open_ else 0.08) * SR), 0.18 if open_ else 0.025)
def crash(): return metal(int(3.0 * SR), 0.9, 4000) * 1.6
def tom(f0):
    n = int(0.4 * SR); t = np.arange(n) / SR
    f = f0 * (1 + 0.6 * np.exp(-t / 0.03))
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.18) + bp(300, 3000, rng.uniform(-1, 1, n)) * np.exp(-t / 0.02) * 0.3

K, SN = kick(), snare()
for bi in range(NB):
    t0 = bi * BAR
    fill = bi % 4 == 3
    for s in range(16):
        t = t0 + s * S16
        if s in (0, 8, 10) or (s == 3 and bi % 2): add(drums, t, K, 1.0)
        if s in (4, 12) and not (fill and s == 12): add(drums, t, SN, 0.9)
        if fill and s >= 12: add(drums, t, tom([220, 180, 140, 110][s - 12]), 0.8)
        if s % 2 == 0 and not (fill and s >= 12): add(drums, t, hat(s == 14), 0.9 if s % 4 == 0 else 0.6)
    if bi % 4 == 0: add(drums, t0, crash(), 1.0)

def room(x, sec=0.9, wet=0.18):
    n = int(sec * SR); t = np.arange(n) / SR
    ir = rng.normal(0, 1, n) * np.exp(-t / (sec / 5)); ir = lp(6000, ir); ir /= np.sqrt(np.sum(ir ** 2))
    return x + wet * fftconvolve(x, ir)[: len(x)]

def master(l, r):
    m = np.stack([l, r])
    peakv = np.max(np.abs(m)); m = m / peakv * 1.6
    m = np.tanh(m)  # soft limiter
    return m / np.max(np.abs(m)) * 0.93

def mix(gl, gr, bass, drums):
    GL, GR = amp(gl), amp(gr)
    d = room(drums)
    g = 0.42 / max(np.max(np.abs(GL)), 1e-9)
    l = GL * g + bass * 0.5 + d * 0.55
    r = GR * g + bass * 0.5 + d * 0.55
    return l, r

l, r = mix(gl, gr, bass, drums)
# make the loop seamless: fold the tail past L back onto the start
n = int(L * SR)
for ch in (l, r): ch[: len(ch) - n] += ch[n:]
l, r = l[:n], r[:n]
pre = int(0.5 * SR); post = int(1.0 * SR)
L2 = np.concatenate([l[-pre:], l, l[:post]]); R2 = np.concatenate([r[-pre:], r, r[:post]])
out = master(L2, R2)
np.save(sys.argv[1] + "/loop.npy", out)

# ---- ending: big E chord + kick + crash ----
TE = int(3.6 * SR)
gl = np.zeros(TE); gr = np.zeros(TE); bass = np.zeros(TE); drums = np.zeros(TE)
for buf in (gl, gr):
    seed += 1; add(buf, 0.0, gtr_note(0, 3.3, False, seed), 0.7)
add(bass, 0, bass_note(0, 3.2, seed + 9))
add(drums, 0, K, 1.1); add(drums, 0, crash(), 1.2); add(drums, 0, SN, 0.6)
l, r = mix(gl, gr, bass, drums)
fade = np.ones(TE); fade[int(2.2 * SR):] = np.linspace(1, 0, TE - int(2.2 * SR)) ** 2
end = master(l * fade, r * fade) * 0.95
np.save(sys.argv[1] + "/end.npy", end)
print("loop sec", L, "file sec", out.shape[1] / SR)
