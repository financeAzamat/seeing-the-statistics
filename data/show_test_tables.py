"""Print the tables the test.html copy quotes, from the reproducible reference."""
import json
from pathlib import Path

r = json.load(open(Path(__file__).resolve().parent / "test_reference.json"))
DSETS = ("retail", "diamond", "geyser")

for title, eff in (("POWER — share detecting a real +5% lift", 0.05),
                   ("POWER — real +2% lift", 0.02),
                   ("POWER — real +10% lift", 0.1),
                   ("FALSE POSITIVES — nothing going on", 0.0)):
    print(f"\n{title}  (alpha 0.05)")
    print(f"  {'n':>6} " + " ".join(f"{d:>9}" for d in DSETS))
    for n in (30, 100, 500, 2000):
        cells = []
        for d in DSETS:
            v = r[f"{d}|{eff}|{n}"]["rates"]["0.05"] * 100
            cells.append(f"{v:>8.1f}%")
        print(f"  {n:>6} " + " ".join(cells))

print("\nreps per cell:", {n: r[f"retail|0.0|{n}"]["reps"] for n in (30, 100, 500, 2000)})
print("KS vs uniform under the null (n=500):",
      {d: round(r[f"{d}|0.0|500"]["ks_uniform"], 4) for d in DSETS})
