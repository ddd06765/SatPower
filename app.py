"""
SatPower — Web Edition
Plateforme IA de correction d'orientation orbitale (SADA) + Analyse
énergétique de mission. Portage web (Flask) de l'application Tkinter
originale. Toute la mécanique orbitale est conservée à l'identique.
"""

import os
import json
import math
from functools import wraps

from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from werkzeug.security import generate_password_hash, check_password_hash

APP_DIR = os.path.dirname(os.path.abspath(__file__))
# On Render, DATA_DIR points at the persistent disk (see render.yaml) so
# accounts survive redeploys. Locally it just falls back to the project folder.
DATA_DIR = os.environ.get("SATPOWER_DATA_DIR", APP_DIR)
os.makedirs(DATA_DIR, exist_ok=True)
DB_FILE = os.path.join(DATA_DIR, "satpower_data.json")

app = Flask(__name__)
app.secret_key = os.environ.get("SATPOWER_SECRET", "dev-secret-change-me")

if os.environ.get("RENDER") and app.secret_key == "dev-secret-change-me":
    # Safety net: refuse to run on Render with the default dev secret.
    raise RuntimeError(
        "SATPOWER_SECRET n'est pas défini. Ajoutez une variable d'environnement "
        "SATPOWER_SECRET (valeur aléatoire) dans les réglages Render."
    )


# ═══════════════════════════════════════════════════════════════
# PERSISTENCE (users) — identique à la version bureau (JSON)
# ═══════════════════════════════════════════════════════════════

def load_db():
    if os.path.exists(DB_FILE):
        try:
            with open(DB_FILE) as f:
                return json.load(f)
        except Exception:
            pass
    return {"users": {}}


def save_db(db):
    with open(DB_FILE, "w") as f:
        json.dump(db, f, indent=2, ensure_ascii=False)


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not session.get("email"):
            return redirect(url_for("landing"))
        return view(*args, **kwargs)
    return wrapped


# ═══════════════════════════════════════════════════════════════
# ORBITAL MECHANICS ENGINE — Mission Power Budget Planner
# (portage direct des fonctions de la version Tkinter, inchangées)
# ═══════════════════════════════════════════════════════════════

RE_KM = 6378.137
MU_KM3S2 = 398600.4418
GEO_ALT_KM = 35786.0
MEO_ALT_KM = 20200.0


def orbital_period_seconds(altitude_km):
    r = RE_KM + altitude_km
    return 2 * math.pi * math.sqrt((r ** 3) / MU_KM3S2)


def solar_declination_deg(day_of_year):
    return 23.44 * math.sin(math.radians(360.0 / 365.0 * (day_of_year - 81)))


def beta_angle_deg(orbit_type, day_of_year, inclination_deg=97.5):
    decl = solar_declination_deg(day_of_year)
    if orbit_type == "dawn_dusk":
        return 82.0 + 6.0 * math.sin(math.radians(360.0 / 365.0 * day_of_year))
    if orbit_type == "noon_midnight":
        return 5.0 + 3.0 * math.sin(math.radians(360.0 / 365.0 * day_of_year))
    if orbit_type == "custom":
        scale = max(0.15, 1.0 - abs(inclination_deg - 90.0) / 90.0)
        return decl * scale * 2.2
    if orbit_type == "meo":
        return decl * 0.9
    if orbit_type == "geo":
        return decl
    return 45.0


def leo_eclipse_fraction(altitude_km, beta_deg):
    r = RE_KM + altitude_km
    beta_r = math.radians(beta_deg)
    cos_b = math.cos(beta_r)
    if abs(cos_b) < 1e-9:
        return 0.0
    ratio = math.sqrt(max(r * r - RE_KM * RE_KM, 0.0)) / (r * cos_b)
    if ratio >= 1.0:
        return 0.0
    return math.acos(ratio) / math.pi


def geo_eclipse_minutes(day_of_year):
    decl = solar_declination_deg(day_of_year)
    r = RE_KM + GEO_ALT_KM
    crit_deg = math.degrees(math.asin(RE_KM / r))
    if abs(decl) >= crit_deg:
        return 0.0
    return 72.0 * math.sqrt(max(0.0, 1.0 - (decl / crit_deg) ** 2))


def pointing_efficiency(err_deg, ai_corrected):
    e = 0.03 if ai_corrected else err_deg
    return max(0.0, math.cos(math.radians(e)))


def simulate_uncorrected_error_deg(orbit_type, altitude_km):
    if orbit_type == "geo":
        period_min = orbital_period_seconds(GEO_ALT_KM) / 60.0
    elif orbit_type == "meo":
        period_min = orbital_period_seconds(MEO_ALT_KM) / 60.0
    else:
        period_min = orbital_period_seconds(altitude_km) / 60.0

    tracking_rate_deg_per_min = 360.0 / period_min
    lag_minutes = 25.0
    err = tracking_rate_deg_per_min * lag_minutes
    return max(4.0, min(35.0, err))


def simulate_mission(orbit_type, altitude_km, inclination_deg,
                      duration_years, degrad_pct_year,
                      sample_every_days=5):
    days_total = int(duration_years * 365)
    uncorrected_err_deg = simulate_uncorrected_error_deg(orbit_type, altitude_km)

    days, eclipse_pct, cum_ai, cum_noai, cum_diff = [], [], [], [], []
    total_ai = 0.0
    total_noai = 0.0

    d = 0
    while d <= days_total:
        year_elapsed = d / 365.0
        degrad_factor = (1.0 - degrad_pct_year / 100.0) ** year_elapsed
        doy = (d % 365) + 1

        if orbit_type == "geo":
            ecl_min = geo_eclipse_minutes(doy)
            ecl_frac = ecl_min / 1440.0
        elif orbit_type == "meo":
            beta = beta_angle_deg("meo", doy)
            ecl_frac = leo_eclipse_fraction(MEO_ALT_KM, beta)
        else:
            beta = beta_angle_deg(orbit_type, doy, inclination_deg)
            ecl_frac = leo_eclipse_fraction(altitude_km, beta)

        daylight_frac = 1.0 - ecl_frac

        eff_ai = pointing_efficiency(uncorrected_err_deg, ai_corrected=True)
        eff_noai = pointing_efficiency(uncorrected_err_deg, ai_corrected=False)

        day_kwh_ai = daylight_frac * eff_ai * degrad_factor * 24.0 * 0.20
        day_kwh_noai = daylight_frac * eff_noai * degrad_factor * 24.0 * 0.20

        total_ai += day_kwh_ai * sample_every_days
        total_noai += day_kwh_noai * sample_every_days

        days.append(d)
        eclipse_pct.append(round(ecl_frac * 100, 1))
        cum_ai.append(round(total_ai, 2))
        cum_noai.append(round(total_noai, 2))
        cum_diff.append(round(total_ai - total_noai, 2))

        d += sample_every_days

    gain_pct = round((total_ai - total_noai) / max(total_noai, 1e-6) * 100, 1)

    if orbit_type == "geo":
        period_min = orbital_period_seconds(GEO_ALT_KM) / 60.0
    elif orbit_type == "meo":
        period_min = orbital_period_seconds(MEO_ALT_KM) / 60.0
    else:
        period_min = orbital_period_seconds(altitude_km) / 60.0

    return {
        "days": days, "eclipse_pct": eclipse_pct,
        "cum_ai": cum_ai, "cum_noai": cum_noai, "cum_diff": cum_diff,
        "total_ai_kwh": round(total_ai, 1), "total_noai_kwh": round(total_noai, 1),
        "total_diff_kwh": round(total_ai - total_noai, 1),
        "gain_pct": gain_pct,
        "uncorrected_err_deg": round(uncorrected_err_deg, 1),
        "max_eclipse_pct": round(max(eclipse_pct) if eclipse_pct else 0, 1),
        "period_minutes": round(period_min, 1),
    }


# ═══════════════════════════════════════════════════════════════
# ROUTES — PAGES
# ═══════════════════════════════════════════════════════════════

@app.route("/")
def landing():
    if session.get("email"):
        return redirect(url_for("dashboard"))
    return render_template("landing.html")


@app.route("/dashboard")
@login_required
def dashboard():
    return render_template("dashboard.html",
                            nom=session.get("nom", ""),
                            email=session.get("email", ""))


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("landing"))


# ═══════════════════════════════════════════════════════════════
# ROUTES — AUTH (API JSON, appelees en AJAX depuis landing.html)
# ═══════════════════════════════════════════════════════════════

@app.route("/api/login", methods=["POST"])
def api_login():
    data = request.get_json(force=True, silent=True) or {}
    email = (data.get("email") or "").strip()
    pwd = (data.get("password") or "").strip()

    if "@" not in email:
        return jsonify(ok=False, error="Email invalide."), 400
    if len(pwd) < 4:
        return jsonify(ok=False, error="Mot de passe trop court (4 chars min)."), 400

    db = load_db()
    users = db.get("users", {})
    if email not in users:
        return jsonify(ok=False, error="Compte introuvable. Inscrivez-vous."), 404
    stored = users[email].get("password", "")
    if not check_password_hash(stored, pwd):
        return jsonify(ok=False, error="Mot de passe incorrect."), 401

    session["email"] = email
    session["nom"] = users[email].get("nom", "")
    return jsonify(ok=True, redirect=url_for("dashboard"))


@app.route("/api/signup", methods=["POST"])
def api_signup():
    data = request.get_json(force=True, silent=True) or {}
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip()
    pwd = (data.get("password") or "").strip()
    confirm = (data.get("confirm") or "").strip()

    if not name:
        return jsonify(ok=False, error="Entrez votre nom."), 400
    if "@" not in email:
        return jsonify(ok=False, error="Email invalide."), 400
    if len(pwd) < 4:
        return jsonify(ok=False, error="Mot de passe trop court (4 chars min)."), 400
    if confirm != pwd:
        return jsonify(ok=False, error="Les mots de passe ne correspondent pas."), 400

    db = load_db()
    users = db.get("users", {})
    if email in users:
        return jsonify(ok=False, error="Email déjà utilisé. Connectez-vous."), 409

    users[email] = {"nom": name, "password": generate_password_hash(pwd)}
    db["users"] = users
    save_db(db)

    session["email"] = email
    session["nom"] = name
    return jsonify(ok=True, redirect=url_for("dashboard"), nom=name)


# ═══════════════════════════════════════════════════════════════
# ROUTES — API MISSION PLANNER
# ═══════════════════════════════════════════════════════════════

@app.route("/api/mission/simulate", methods=["POST"])
@login_required
def api_mission_simulate():
    data = request.get_json(force=True, silent=True) or {}

    orbit_class = data.get("orbit_class", "leo")
    leo_geometry = data.get("leo_geometry", "dawn_dusk")
    orbit_type = leo_geometry if orbit_class == "leo" else orbit_class

    def safe_float(key, default):
        try:
            v = float(data.get(key, default))
            return v if v >= 0 else default
        except (TypeError, ValueError):
            return default

    alt = safe_float("alt", 600)
    incl = safe_float("incl", 97.5)
    years = max(0.5, safe_float("years", 5))
    degrad = safe_float("degrad", 2.5)

    result = simulate_mission(orbit_type, alt, incl, years, degrad)
    return jsonify(ok=True, result=result)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_DEBUG", "1") == "1"
    print("\n  \U0001F6F0  SatPower — Web Edition")
    print(f"  http://127.0.0.1:{port}\n")
    app.run(debug=debug, host="0.0.0.0", port=port)
