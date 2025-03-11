import os
import time
import hashlib
import hmac
import sqlite3
import random

from flask import Flask, request, session, redirect, jsonify, send_from_directory
from config import BOT_TOKEN, SECRET_KEY, DATABASE_PATH

app = Flask(__name__, 
            static_folder='static',  # React build files go here
            static_url_path='')

app.secret_key = SECRET_KEY

app.config['SESSION_COOKIE_SECURE'] = True
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'

def get_db_connection():
    conn = sqlite3.connect(DATABASE_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def verify_telegram_login(query_dict, bot_token):
    their_hash = query_dict.pop("hash", None)
    if not their_hash:
        return False
    secret_key = hashlib.sha256(bot_token.encode('utf-8')).digest()
    sorted_kv = sorted(query_dict.items(), key=lambda x: x[0])
    data_check_str = "\n".join([f"{k}={v}" for k, v in sorted_kv])
    calc_hash_bytes = hmac.new(secret_key, data_check_str.encode('utf-8'), hashlib.sha256).hexdigest()
    return calc_hash_bytes == their_hash

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    if path != "" and os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    else:
        return send_from_directory(app.static_folder, 'index.html')

@app.route("/callback")
def telegram_login_callback():
    print("=== Telegram Callback Called ===")
    args = request.args.to_dict()
    print(f"Args received: {args}")
    
    user_id = args.get("id")
    tg_hash = args.get("hash")
    auth_date = args.get("auth_date")
    
    if not user_id or not tg_hash or not auth_date:
        print("Missing login data!")
        return "<h3>Missing Telegram login data!</h3>", 400

    if not verify_telegram_login(args, BOT_TOKEN):
        print(f"Invalid hash! Data: {args}")
        return "<h3>Invalid hash - data might be forged!</h3>", 403

    print(f"Login successful for user {user_id}")
    
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        user_id_int = int(user_id)
    except ValueError:
        user_id_int = user_id

    cursor.execute("SELECT corvax_count FROM users WHERE user_id=?", (user_id_int,))
    row = cursor.fetchone()
    if row is None:
        first_name = args.get("first_name", "Unknown")
        print(f"Creating new user: {first_name}")
        cursor.execute(
            "INSERT INTO users (user_id, first_name, corvax_count) VALUES (?, ?, 0)",
            (user_id_int, first_name)
        )
        conn.commit()

    cursor.close()
    conn.close()

    session['telegram_id'] = str(user_id_int)
    print(f"Session set, redirecting to homepage")
    return redirect("https://test.cvxlab.net/")

@app.route("/api/whoami")
def whoami():
    if 'telegram_id' not in session:
        return jsonify({"loggedIn": False}), 200

    user_id = session['telegram_id']
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT first_name FROM users WHERE user_id=?", (user_id,))
    row = cur.fetchone()
    cur.close()
    conn.close()

    if row:
        return jsonify({"loggedIn": True, "firstName": row[0]})
    else:
        return jsonify({"loggedIn": True, "firstName": "Unknown"})

@app.route("/api/machines", methods=["GET"])
def get_machines():
    if 'telegram_id' not in session:
        return jsonify({"error": "Not logged in"}), 401

    user_id = session['telegram_id']
    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT id, machine_type, x, y, level, last_activated, is_offline
        FROM user_machines
        WHERE user_id=?
    """, (user_id,))
    rows = cur.fetchall()

    machines = []
    for r in rows:
        machines.append({
            "id": r["id"],
            "type": r["machine_type"],
            "x": r["x"],
            "y": r["y"],
            "level": r["level"],
            "lastActivated": r["last_activated"],
            "isOffline": r["is_offline"]
        })

    cur.close()
    conn.close()

    return jsonify(machines)

@app.route("/api/resources", methods=["GET"])
def get_resources():
    if 'telegram_id' not in session:
        return jsonify({"error": "Not logged in"}), 401

    user_id = session['telegram_id']
    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("SELECT corvax_count FROM users WHERE user_id=?", (user_id,))
    row = cur.fetchone()
    tcorvax = row["corvax_count"] if row else 0

    catNips = get_or_create_resource(cur, user_id, 'catNips')
    energy = get_or_create_resource(cur, user_id, 'energy')

    cur.close()
    conn.close()

    return jsonify({
        "tcorvax": float(tcorvax),
        "catNips": float(catNips),
        "energy": float(energy)
    })

def get_or_create_resource(cursor, user_id, resource_name):
    cursor.execute("SELECT amount FROM resources WHERE user_id=? AND resource_name=?", (user_id, resource_name))
    row = cursor.fetchone()
    if row is None:
        cursor.execute("INSERT INTO resources (user_id, resource_name, amount) VALUES (?, ?, 0)",
                       (user_id, resource_name))
        return 0
    else:
        return row[0]

def set_resource_amount(cursor, user_id, resource_name, amount):
    cursor.execute("SELECT amount FROM resources WHERE user_id=? AND resource_name=?", (user_id, resource_name))
    row = cursor.fetchone()
    if row is None:
        cursor.execute("INSERT INTO resources (user_id, resource_name, amount) VALUES (?, ?, ?)",
                       (user_id, resource_name, amount))
    else:
        cursor.execute("UPDATE resources SET amount=? WHERE user_id=? AND resource_name=?",
                       (amount, user_id, resource_name))

def update_amplifiers_status(user_id, conn, cur):
    cur.execute("""
        SELECT id, level, is_offline, next_cost_time
        FROM user_machines
        WHERE user_id=? AND machine_type='amplifier'
    """, (user_id,))
    amps = cur.fetchall()
    if not amps:
        return

    now_ms = int(time.time() * 1000)
    energy_val = get_or_create_resource(cur, user_id, 'energy')

    for amp in amps:
        amp_id = amp["id"]
        level = amp["level"]
        is_offline = amp["is_offline"]
        next_cost = amp["next_cost_time"]

        if next_cost == 0:
            next_cost = now_ms + 24*60*60*1000
            cur.execute("""
                UPDATE user_machines
                SET next_cost_time=?
                WHERE user_id=? AND id=?
            """, (next_cost, user_id, amp_id))
            conn.commit()

        cost = 2 * level
        if is_offline == 0:
            while next_cost <= now_ms:
                if energy_val >= cost:
                    energy_val -= cost
                    set_resource_amount(cur, user_id, 'energy', energy_val)
                    next_cost += 24*60*60*1000
                else:
                    is_offline = 1
                    cur.execute("""
                        UPDATE user_machines
                        SET is_offline=1
                        WHERE user_id=? AND id=?
                    """, (user_id, amp_id))
                    conn.commit()
                    break
        else:
            if next_cost <= now_ms:
                if energy_val >= cost:
                    energy_val -= cost
                    set_resource_amount(cur, user_id, 'energy', energy_val)
                    next_cost = now_ms + 24*60*60*1000
                    is_offline = 0
                    cur.execute("""
                        UPDATE user_machines
                        SET is_offline=0, next_cost_time=?
                        WHERE user_id=? AND id=?
                    """, (next_cost, user_id, amp_id))
                    conn.commit()
                else:
                    pass

        cur.execute("""
            UPDATE user_machines
            SET next_cost_time=?, is_offline=?
            WHERE user_id=? AND id=?
        """, (next_cost, is_offline, user_id, amp_id))
        conn.commit()

@app.route("/api/getGameState", methods=["GET"])
def get_game_state():
    if 'telegram_id' not in session:
        return jsonify({"error": "Not logged in"}), 401

    user_id = session['telegram_id']
    conn = get_db_connection()
    cur = conn.cursor()

    update_amplifiers_status(user_id, conn, cur)

    cur.execute("SELECT corvax_count FROM users WHERE user_id=?", (user_id,))
    row = cur.fetchone()
    tcorvax = row["corvax_count"] if row else 0

    catNips = get_or_create_resource(cur, user_id, 'catNips')
    energy = get_or_create_resource(cur, user_id, 'energy')

    cur.execute("""
        SELECT id, machine_type, x, y, level, last_activated, is_offline
        FROM user_machines
        WHERE user_id=?
    """, (user_id,))
    rows = cur.fetchall()

    machines = []
    for r in rows:
        machines.append({
            "id": r["id"],
            "type": r["machine_type"],
            "x": r["x"],
            "y": r["y"],
            "level": r["level"],
            "lastActivated": r["last_activated"],
            "isOffline": r["is_offline"]
        })

    cur.close()
    conn.close()

    return jsonify({
        "tcorvax": float(tcorvax),
        "catNips": float(catNips),
        "energy": float(energy),
        "machines": machines
    })

def build_cost(machine_type, how_many_already):
    if machine_type == "catLair":
        if how_many_already == 0:
            return {"tcorvax": 10}
        elif how_many_already == 1:
            return {"tcorvax": 40}
        else:
            return None

    elif machine_type == "reactor":
        if how_many_already == 0:
            return {"tcorvax": 10, "catNips": 10}
        elif how_many_already == 1:
            return {"tcorvax": 40, "catNips": 40}
        else:
            return None

    elif machine_type == "amplifier":
        if how_many_already == 0:
            return {"tcorvax": 10, "catNips": 10, "energy": 10}
        else:
            return None
            
    elif machine_type == "incubator":
        if how_many_already == 0:
            return {"tcorvax": 320, "catNips": 320, "energy": 320}
        else:
            return None

    return None

def is_second_machine(cur, user_id, machine_type, machine_id):
    cur.execute("""
        SELECT id FROM user_machines
        WHERE user_id=? AND machine_type=?
        ORDER BY id
    """, (user_id, machine_type))
    machine_ids = [row["id"] for row in cur.fetchall()]
    if machine_id not in machine_ids:
        return False
    index = machine_ids.index(machine_id)
    return (index == 1)

def are_first_machine_lvl3(cur, user_id, mtype):
    cur.execute("""
        SELECT level FROM user_machines
        WHERE user_id=? AND machine_type=?
        ORDER BY id
        LIMIT 1
    """, (user_id, mtype))
    r = cur.fetchone()
    if r and r["level"] >= 3:
        return True
    return False

def are_two_machines_lvl3(cur, user_id, mtype):
    cur.execute("""
        SELECT level FROM user_machines
        WHERE user_id=? AND machine_type=?
        ORDER BY id
    """, (user_id, mtype))
    rows = cur.fetchall()
    if len(rows) < 2:
        return False
    if rows[0]["level"] >=3 and rows[1]["level"] >=3:
        return True
    return False

def check_amplifier_gating(cur, user_id, next_level):
    if next_level == 4:
        if not are_first_machine_lvl3(cur, user_id, "catLair"):
            return False
        if not are_first_machine_lvl3(cur, user_id, "reactor"):
            return False
        return True
    elif next_level == 5:
        if not are_two_machines_lvl3(cur, user_id, "catLair"):
            return False
        if not are_two_machines_lvl3(cur, user_id, "reactor"):
            return False
        return True
    return True

def can_build_incubator(cur, user_id):
    cur.execute("""
        SELECT COUNT(*) FROM user_machines
        WHERE user_id=? AND machine_type='catLair'
    """, (user_id,))
    total_cat_lairs = cur.fetchone()[0]
    if total_cat_lairs == 0:
        return False
    cur.execute("""
        SELECT COUNT(*) FROM user_machines
        WHERE user_id=? AND machine_type='catLair' AND level=3
    """, (user_id,))
    max_level_cat_lairs = cur.fetchone()[0]
    if max_level_cat_lairs < total_cat_lairs:
        return False

    cur.execute("""
        SELECT COUNT(*) FROM user_machines
        WHERE user_id=? AND machine_type='reactor'
    """, (user_id,))
    total_reactors = cur.fetchone()[0]
    if total_reactors == 0:
        return False
    cur.execute("""
        SELECT COUNT(*) FROM user_machines
        WHERE user_id=? AND machine_type='reactor' AND level=3
    """, (user_id,))
    max_level_reactors = cur.fetchone()[0]
    if max_level_reactors < total_reactors:
        return False

    cur.execute("""
        SELECT COUNT(*) FROM user_machines
        WHERE user_id=? AND machine_type='amplifier' AND level=5
    """, (user_id,))
    max_level_amplifier = cur.fetchone()[0]
    if max_level_amplifier == 0:
        return False

    return True

def upgrade_cost(cur, user_id, machine_type, current_level, machine_id):
    next_level = current_level + 1
    if machine_type in ("catLair","reactor"):
        if next_level > 3:
            return None
    elif machine_type == "amplifier":
        if next_level > 5:
            return None
        if not check_amplifier_gating(cur, user_id, next_level):
            return None
    else:
        return None

    if machine_type == "amplifier":
        if not check_amplifier_gating(cur, user_id, next_level):
            return None

    if machine_type == "catLair":
        base_for_level1 = {"tcorvax": 10}
    elif machine_type == "reactor":
        base_for_level1 = {"tcorvax":10, "catNips":10}
    elif machine_type == "amplifier":
        base_for_level1 = {"tcorvax":10, "catNips":10, "energy":10}
    else:
        return None

    second = is_second_machine(cur, user_id, machine_type, machine_id)
    mult = 2 ** (next_level - 1)
    cost_out = {}
    for res, val in base_for_level1.items():
        c = val * mult
        if second and (machine_type in ["catLair","reactor"]):
            c *= 4
        cost_out[res] = c

    return cost_out

@app.route("/api/buildMachine", methods=["POST"])
def build_machine():
    if 'telegram_id' not in session:
        return jsonify({"error": "Not logged in"}), 401

    data = request.json or {}
    machine_type = data.get("machineType")
    x_coord = data.get("x", 0)
    y_coord = data.get("y", 0)

    user_id = session['telegram_id']
    conn = get_db_connection()
    cur = conn.cursor()

    update_amplifiers_status(user_id, conn, cur)

    cur.execute("""
        SELECT COUNT(*) FROM user_machines
        WHERE user_id=? AND machine_type=?
    """, (user_id, machine_type))
    how_many = cur.fetchone()[0]

    cost_dict = build_cost(machine_type, how_many)
    if cost_dict is None:
        cur.close()
        conn.close()
        return jsonify({"error": "Cannot build more of this machine type."}), 400

    if machine_type == "incubator":
        if not can_build_incubator(cur, user_id):
            cur.close()
            conn.close()
            return jsonify({"error": "All machines must be at max level to build Incubator."}), 400

    cur.execute("SELECT corvax_count FROM users WHERE user_id=?", (user_id,))
    row = cur.fetchone()
    if not row:
        cur.close()
        conn.close()
        return jsonify({"error": "User not found"}), 404
    tcorvax_val = float(row["corvax_count"])
    catNips_val = float(get_or_create_resource(cur, user_id, 'catNips'))
    energy_val  = float(get_or_create_resource(cur, user_id, 'energy'))

    if (tcorvax_val < cost_dict.get("tcorvax",0) or
        catNips_val < cost_dict.get("catNips",0) or
        energy_val < cost_dict.get("energy",0)):
        cur.close()
        conn.close()
        return jsonify({"error": "Not enough resources"}), 400

    machine_size = 128
    max_x = 800 - machine_size
    max_y = 600 - machine_size
    if x_coord < 0 or x_coord > max_x or y_coord < 0 or y_coord > max_y:
        cur.close()
        conn.close()
        return jsonify({"error": "Cannot build outside map boundaries."}), 400

    cur.execute("SELECT x, y FROM user_machines WHERE user_id=?", (user_id,))
    all_m = cur.fetchall()
    for m in all_m:
        dx = abs(m["x"] - x_coord)
        dy = abs(m["y"] - y_coord)
        if dx < machine_size and dy < machine_size:
            cur.close()
            conn.close()
            return jsonify({"error": "Cannot build here!"}), 400

    tcorvax_val -= cost_dict.get("tcorvax",0)
    catNips_val -= cost_dict.get("catNips",0)
    energy_val  -= cost_dict.get("energy",0)

    cur.execute("""
        UPDATE users SET corvax_count=?
        WHERE user_id=?
    """, (tcorvax_val, user_id))
    set_resource_amount(cur, user_id, 'catNips', catNips_val)
    set_resource_amount(cur, user_id, 'energy', energy_val)

    is_offline = 1 if machine_type == "incubator" else 0
    cur.execute("""
        INSERT INTO user_machines
        (user_id, machine_type, x, y, level, last_activated, is_offline, next_cost_time)
        VALUES (?, ?, ?, ?, 1, 0, ?, 0)
    """, (user_id, machine_type, x_coord, y_coord, is_offline))

    conn.commit()
    cur.close()
    conn.close()

    return jsonify({
        "status": "ok",
        "machineType": machine_type,
        "newResources": {
            "tcorvax": tcorvax_val,
            "catNips": catNips_val,
            "energy": energy_val
        }
    })

@app.route("/api/upgradeMachine", methods=["POST"])
def upgrade_machine():
    if 'telegram_id' not in session:
        return jsonify({"error": "Not logged in"}), 401

    data = request.json or {}
    machine_id = data.get("machineId")
    if not machine_id:
        return jsonify({"error": "Missing machineId"}), 400

    user_id = session['telegram_id']
    conn = get_db_connection()
    cur = conn.cursor()

    update_amplifiers_status(user_id, conn, cur)

    cur.execute("""
        SELECT id, machine_type, level
        FROM user_machines
        WHERE user_id=? AND id=?
    """, (user_id, machine_id))
    row = cur.fetchone()
    if not row:
        cur.close()
        conn.close()
        return jsonify({"error": "Machine not found"}), 404

    machine_type = row["machine_type"]
    current_level = row["level"]

    cost_dict = upgrade_cost(cur, user_id, machine_type, current_level, machine_id)
    if cost_dict is None:
        cur.close()
        conn.close()
        return jsonify({"error": "Cannot upgrade further or gating not met."}), 400

    cur.execute("SELECT corvax_count FROM users WHERE user_id=?", (user_id,))
    urow = cur.fetchone()
    if not urow:
        cur.close()
        conn.close()
        return jsonify({"error": "User not found"}), 404

    tcorvax_val = float(urow["corvax_count"])
    catNips_val = float(get_or_create_resource(cur, user_id, 'catNips'))
    energy_val  = float(get_or_create_resource(cur, user_id, 'energy'))

    if (tcorvax_val < cost_dict.get("tcorvax",0) or
        catNips_val < cost_dict.get("catNips",0) or
        energy_val < cost_dict.get("energy",0)):
        cur.close()
        conn.close()
        return jsonify({"error": "Not enough resources"}), 400

    new_level = current_level + 1
    cur.execute("""
        UPDATE user_machines
        SET level=?
        WHERE user_id=? AND id=?
    """, (new_level, user_id, machine_id))

    tcorvax_val -= cost_dict.get("tcorvax",0)
    catNips_val -= cost_dict.get("catNips",0)
    energy_val  -= cost_dict.get("energy",0)

    cur.execute("""
        UPDATE users
        SET corvax_count=?
        WHERE user_id=?
    """, (tcorvax_val, user_id))
    set_resource_amount(cur, user_id, 'catNips', catNips_val)
    set_resource_amount(cur, user_id, 'energy', energy_val)

    conn.commit()
    cur.close()
    conn.close()

    return jsonify({
        "status": "ok",
        "machineId": machine_id,
        "newLevel": new_level,
        "newResources": {
            "tcorvax": tcorvax_val,
            "catNips": catNips_val,
            "energy": energy_val
        }
    })

@app.route("/api/activateMachine", methods=["POST"])
def activate_machine():
    if 'telegram_id' not in session:
        return jsonify({"error": "Not logged in"}), 401

    data = request.json or {}
    machine_id = data.get("machineId")
    if machine_id is None:
        return jsonify({"error": "Missing machineId"}), 400

    user_id = session['telegram_id']
    conn = get_db_connection()
    cur = conn.cursor()

    update_amplifiers_status(user_id, conn, cur)

    cur.execute("""
        SELECT machine_type, level, last_activated, is_offline
        FROM user_machines
        WHERE user_id=? AND id=?
    """, (user_id, machine_id))
    row = cur.fetchone()
    if not row:
        cur.close()
        conn.close()
        return jsonify({"error": "Machine not found"}), 404

    machine_type = row["machine_type"]
    machine_level = row["level"]
    last_activated = row["last_activated"] or 0
    is_offline = row["is_offline"]

    COOL_MS = 10*1000
    now_ms = int(time.time()*1000)
    elapsed = now_ms - last_activated
    if elapsed < COOL_MS:
        remain = COOL_MS - elapsed
        cur.close()
        conn.close()
        return jsonify({"error":"Cooldown not finished","remainingMs":remain}), 400

    cur.execute("SELECT corvax_count FROM users WHERE user_id=?", (user_id,))
    urow = cur.fetchone()
    if not urow:
        cur.close()
        conn.close()
        return jsonify({"error":"User not found"}), 404

    tcorvax_val = float(urow["corvax_count"])
    catNips_val = float(get_or_create_resource(cur, user_id, 'catNips'))
    energy_val  = float(get_or_create_resource(cur, user_id, 'energy'))

    if machine_type == "amplifier":
        status = "Online" if is_offline==0 else "Offline"
        cur.close()
        conn.close()
        return jsonify({"status":"ok","message":status})

    if machine_type == "incubator":
        if last_activated == 0:
            cur.execute("""
                UPDATE user_machines
                SET is_offline=0, last_activated=?
                WHERE user_id=? AND id=?
            """, (now_ms, user_id, machine_id))
            conn.commit()
            cur.close()
            conn.close()
            return jsonify({
                "status": "ok",
                "message": "Incubator Online",
                "newLastActivated": now_ms
            })
        else:
            staked_cvx = float(data.get("stakedCvx", 0))
            reward = min(10, int(staked_cvx // 100))
            tcorvax_val += reward

            cur.execute("""
                UPDATE users
                SET corvax_count=?
                WHERE user_id=?
            """, (tcorvax_val, user_id))

            cur.execute("""
                UPDATE user_machines
                SET last_activated=?
                WHERE user_id=? AND id=?
            """, (now_ms, user_id, machine_id))

            conn.commit()
            cur.close()
            conn.close()

            return jsonify({
                "status": "ok",
                "machineId": machine_id,
                "machineType": machine_type,
                "newLastActivated": now_ms,
                "stakedCVX": staked_cvx,
                "reward": reward,
                "updatedResources": {
                    "tcorvax": tcorvax_val,
                    "catNips": catNips_val,
                    "energy": energy_val
                }
            })

    if machine_type == "catLair":
        gained = 5 + (machine_level - 1)
        catNips_val += gained
    elif machine_type == "reactor":
        if catNips_val < 3:
            cur.close()
            conn.close()
            return jsonify({"error":"Not enough Cat Nips to run the Reactor!"}), 400
        catNips_val -= 3
        if machine_level == 1:
            base_t = 1.0
        elif machine_level == 2:
            base_t = 1.5
        elif machine_level == 3:
            base_t = 2.0
        else:
            base_t = 1.0

        cur.execute("""
            SELECT level, is_offline
            FROM user_machines
            WHERE user_id=? AND machine_type='amplifier'
        """,(user_id,))
        amp = cur.fetchone()
        if amp and amp["is_offline"] == 0:
            amp_level = amp["level"]
            base_t += 0.5 * amp_level

        base_e = 2
        tcorvax_val += base_t
        energy_val  += base_e

    cur.execute("""
        UPDATE user_machines
        SET last_activated=?
        WHERE user_id=? AND id=?
    """,(now_ms,user_id,machine_id))

    cur.execute("""
        UPDATE users
        SET corvax_count=?
        WHERE user_id=?
    """,(tcorvax_val,user_id))
    set_resource_amount(cur, user_id,'catNips',catNips_val)
    set_resource_amount(cur, user_id,'energy', energy_val)

    conn.commit()
    cur.close()
    conn.close()

    return jsonify({
        "status":"ok",
        "machineId":machine_id,
        "machineType":machine_type,
        "newLastActivated":now_ms,
        "updatedResources":{
            "tcorvax": tcorvax_val,
            "catNips": catNips_val,
            "energy": energy_val
        }
    })

@app.route("/api/syncLayout", methods=["POST"])
def sync_layout():
    if 'telegram_id' not in session:
        return jsonify({"error":"Not logged in"}), 401

    data = request.json or {}
    machine_list = data.get("machines", [])

    user_id = session['telegram_id']
    conn = get_db_connection()
    cur = conn.cursor()

    for m in machine_list:
        mid = m.get("id")
        mx = m.get("x",0)
        my = m.get("y",0)
        cur.execute("""
            UPDATE user_machines
            SET x=?, y=?
            WHERE user_id=? AND id=?
        """,(mx,my,user_id,mid))

    conn.commit()
    cur.close()
    conn.close()

    return jsonify({"status":"ok","message":"Layout updated"})

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=False)
