"""
HeatShield Backend – Live Verification Script
Runs a full check of all endpoints and prints a pass/fail summary.
"""

import urllib.request
import json
import sys

BASE = "http://localhost:8000"
ok = True
results = []


def check(label, url, expect_status=200, check_keys=None):
    global ok
    try:
        with urllib.request.urlopen(url, timeout=12) as r:
            status = r.status
            body = r.read()
            try:
                data = json.loads(body)
            except Exception:
                data = None

            missing = []
            if check_keys and isinstance(data, dict):
                for k in check_keys:
                    if k not in data:
                        missing.append(k)

            passed = status == expect_status and not missing
            sym = "OK" if passed else "FAIL"
            if not passed:
                ok = False
            results.append((sym, status, label))
            print(f"  [{sym}] [{status}] {label}")
            if missing:
                print(f"         Missing keys: {missing}")
            return data
    except urllib.error.HTTPError as e:
        passed = e.code == expect_status
        sym = "OK" if passed else "FAIL"
        if not passed:
            ok = False
        results.append((sym, e.code, label))
        print(f"  [{sym}] [{e.code}] {label}")
        return None
    except Exception as exc:
        ok = False
        results.append(("FAIL", "ERR", label))
        print(f"  [FAIL] [ERR] {label} → {exc}")
        return None


def expect_error(label, url, expect_status):
    """Verify that an endpoint returns a specific error status."""
    global ok
    try:
        with urllib.request.urlopen(url, timeout=10):
            ok = False
            print(f"  [FAIL] [200] {label} — expected {expect_status}, got 200")
    except urllib.error.HTTPError as e:
        passed = e.code == expect_status
        sym = "OK" if passed else "FAIL"
        if not passed:
            ok = False
        results.append((sym, e.code, label))
        print(f"  [{sym}] [{e.code}] {label}")
    except Exception as exc:
        ok = False
        print(f"  [FAIL] [ERR] {label} → {exc}")


print()
print("=" * 60)
print("  HeatShield Backend — Live Verification")
print("  " + BASE)
print("=" * 60)

# ── 1. Root ─────────────────────────────────────────────────────
print("\n[1] Root & Docs")
check("GET /  (root)", BASE + "/")
check("GET /docs  (Swagger UI HTML)", BASE + "/docs")
check("GET /openapi.json  (OpenAPI schema)", BASE + "/openapi.json",
      check_keys=["openapi", "paths"])

# ── 2. Health ────────────────────────────────────────────────────
print("\n[2] Health")
data = check("GET /api/health", BASE + "/api/health",
             check_keys=["status", "data_source", "timestamp", "version"])
if data:
    print(f"         status       = {data.get('status')}")
    print(f"         version      = {data.get('version')}")
    print(f"         data_source  = {data.get('data_source')}")
    print(f"         timestamp    = {data.get('timestamp')}")

# ── 3. Current weather – city name ───────────────────────────────
print("\n[3] /api/current — city names")
data = check("GET /api/current?location=Chennai", BASE + "/api/current?location=Chennai",
             check_keys=["location", "timestamp", "environment", "data_source", "units"])
if data:
    env = data["environment"]
    loc = data["location"]
    print(f"         city         = {loc.get('name')}, {loc.get('admin1')}, {loc.get('country')}")
    print(f"         latitude     = {loc.get('latitude')}")
    print(f"         longitude    = {loc.get('longitude')}")
    print(f"         timestamp    = {data.get('timestamp')}")
    print(f"         temperature  = {env.get('temperature')} C")
    print(f"         humidity     = {env.get('humidity')} %")
    print(f"         wind_speed   = {env.get('wind_speed')} km/h")
    print(f"         solar_rad    = {env.get('solar_radiation')} W/m2")
    print(f"         data_source  = {data.get('data_source')}")
    nulls = [k for k in ["temperature","humidity","wind_speed","solar_radiation"] if env.get(k) is None]
    if nulls:
        print(f"         WARNING null fields: {nulls}")

data2 = check("GET /api/current?location=Mumbai", BASE + "/api/current?location=Mumbai",
              check_keys=["environment"])
if data2:
    env2 = data2["environment"]
    print(f"         Mumbai temp  = {env2.get('temperature')} C  humidity={env2.get('humidity')} %")

data3 = check("GET /api/current?location=Delhi", BASE + "/api/current?location=Delhi",
              check_keys=["environment"])
if data3:
    env3 = data3["environment"]
    print(f"         Delhi  temp  = {env3.get('temperature')} C  humidity={env3.get('humidity')} %")

# ── 4. Current weather – lat/lon params ──────────────────────────
print("\n[4] /api/current — lat/lon parameters")
data = check("GET /api/current?lat=13.08&lon=80.27  (Chennai coords)",
             BASE + "/api/current?lat=13.08&lon=80.27",
             check_keys=["environment"])
if data:
    print(f"         temperature  = {data['environment'].get('temperature')} C")

# ── 5. Current weather – coord string ────────────────────────────
print("\n[5] /api/current — coordinate string")
data = check('GET /api/current?location=19.076,72.877  (Mumbai coords)',
             BASE + "/api/current?location=19.076,72.877",
             check_keys=["environment"])
if data:
    print(f"         temperature  = {data['environment'].get('temperature')} C")

# ── 6. Risk endpoint ─────────────────────────────────────────────
print("\n[6] /api/risk")
data = check("GET /api/risk?location=Chennai", BASE + "/api/risk?location=Chennai",
             check_keys=["risk","environment","location","timestamp",
                         "metadata","disclaimer","recommendations"])
if data:
    risk = data.get("risk", {})
    print(f"         score        = {risk.get('score')} / 100")
    print(f"         category     = {risk.get('category')}")
    print(f"         factors      = {risk.get('factors')}")
    print(f"         explanation  = {risk.get('explanation')}")
    print(f"         model        = {data.get('metadata', {}).get('model')}")

# ── 7. Trend endpoint ────────────────────────────────────────────
print("\n[7] /api/trend")
data = check("GET /api/trend?location=Chennai&hours=24", BASE + "/api/trend?location=Chennai&hours=24",
             check_keys=["location","hours","data","data_source","units"])
if data:
    entries = data.get("data", [])
    print(f"         records      = {len(entries)}")
    if entries:
        f = entries[0]
        l = entries[-1]
        print(f"         first        = {f.get('timestamp')}  temp={f.get('temperature')} C")
        print(f"         last         = {l.get('timestamp')}  temp={l.get('temperature')} C")
    print(f"         data_source  = {data.get('data_source')}")

# ── 8. Error handling ────────────────────────────────────────────
print("\n[8] Error handling")
expect_error("Invalid city → 404",
             BASE + "/api/current?location=ZZZZNONEXISTENT999ABC", 404)
expect_error("Missing params → 400",
             BASE + "/api/current", 400)
expect_error("Out-of-range lat → 400",
             BASE + "/api/current?lat=999&lon=0", 400)

# ── Summary ──────────────────────────────────────────────────────
print()
print("=" * 60)
total = len(results)
passed = sum(1 for r in results if r[0] == "OK")
failed = total - passed
print(f"  RESULT: {passed}/{total} checks passed  ({failed} failed)")
if ok:
    print("  STATUS: ALL CHECKS PASSED — backend is live and working")
else:
    print("  STATUS: SOME CHECKS FAILED — review output above")
print("=" * 60)
print()

sys.exit(0 if ok else 1)
