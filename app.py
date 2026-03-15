from flask import Flask, render_template, jsonify, request
import json
import re
import os
import random
import uuid
from pathlib import Path
from werkzeug.security import generate_password_hash, check_password_hash
from pymongo import MongoClient

app = Flask(__name__)

BASE_DIR = Path(__file__).parent
QUESTIONS_DIR = BASE_DIR / "questions"

# ==========================================
# إعدادات قاعدة البيانات MongoDB
# ==========================================
# في Vercel هنحط الرابط ده في الـ Environment Variables
MONGO_URI ="mongodb+srv://abdohamdy6:abdo123456@cluster0.qzwpsf2.mongodb.net/?appName=Cluster0"
client = MongoClient(MONGO_URI)
db = client["hamdy_quiz_db"]
users_col = db["users"]
used_q_col = db["used_questions"]


def smart_load_json(filepath):
    """
    ذكي في قراءة JSON - بيتعامل مع:
    - Comments بـ // أو /* */
    - Trailing commas
    - BOM characters
    - Different encodings
    """
    encodings = ['utf-8-sig', 'utf-8', 'cp1256', 'iso-8859-6']
    content = None
    for enc in encodings:
        try:
            with open(filepath, encoding=enc) as f:
                content = f.read()
            break
        except (UnicodeDecodeError, LookupError):
            continue
    if content is None:
        raise ValueError(f"Could not read file: {filepath}")

    # حل ذكي لمسح التعليقات (//) مع تجاهلها لو كانت داخل نص زي روابط الصور (https://)
    content = re.sub(r'("(?:\\.|[^"\\])*")|//[^\n]*', lambda m: m.group(1) if m.group(1) else '', content)
    # حل ذكي لمسح التعليقات المتعددة (/* */) مع تجاهلها داخل النصوص
    content = re.sub(r'("(?:\\.|[^"\\])*")|/\*.*?\*/', lambda m: m.group(1) if m.group(1) else '', content, flags=re.DOTALL)
    # Remove trailing commas before } or ]
    content = re.sub(r',\s*([}\]])', r'\1', content)
    # Remove BOM if still present
    content = content.lstrip('\ufeff')

    return json.loads(content)


def get_user_by_token():
    """
    دالة بتجيب بيانات المستخدم من قاعدة البيانات بناءً على التوكن المبعوت في الهيدر
    """
    token = request.headers.get("Authorization")
    if not token:
        return None
    return users_col.find_one({"token": token})


# ==========================================
# Routes: Auth (تسجيل الدخول وحساب جديد)
# ==========================================
@app.route("/api/register", methods=["POST"])
def register():
    data = request.json
    username = data.get("username", "").strip()
    password = data.get("password", "")
    
    if not username or not password:
        return jsonify({"error": "يرجى إدخال اسم المستخدم وكلمة المرور"}), 400
        
    if users_col.find_one({"username": username}):
        return jsonify({"error": "اسم المستخدم موجود بالفعل"}), 400
        
    token = str(uuid.uuid4())
    users_col.insert_one({
        "username": username,
        "password": generate_password_hash(password),
        "token": token
    })
    return jsonify({"token": token, "username": username})


@app.route("/api/login", methods=["POST"])
def login():
    data = request.json
    username = data.get("username", "").strip()
    password = data.get("password", "")
    
    user = users_col.find_one({"username": username})
    if user and check_password_hash(user["password"], password):
        token = str(uuid.uuid4()) # تجديد التوكن للأمان مع كل تسجيل دخول
        users_col.update_one({"_id": user["_id"]}, {"$set": {"token": token}})
        return jsonify({"token": token, "username": username})
        
    return jsonify({"error": "بيانات الدخول غير صحيحة"}), 400


# ==========================================
# Routes: Game Logic
# ==========================================
def get_categories_structure(user_id):
    """Returns folders as groups with JSON files as categories and filters by user's used questions"""
    structure = {}
    if not QUESTIONS_DIR.exists():
        return structure

    # استدعاء الأسئلة المستخدمة لليوزر ده من قاعدة البيانات
    used_doc = used_q_col.find_one({"user_id": user_id})
    used = used_doc.get("used", {}) if used_doc else {}

    for folder in sorted(QUESTIONS_DIR.iterdir()):
        if folder.is_dir():
            group_name = folder.name
            structure[group_name] = []
            for json_file in sorted(folder.glob("*.json")):
                try:
                    data = smart_load_json(json_file)
                    category_name = data.get("category", json_file.stem)
                    all_q = data.get("questions", [])

                    # توحيد مسارات الملفات عشان تشتغل صح على كل أنظمة التشغيل (Windows/Linux)
                    file_key = str(json_file.relative_to(BASE_DIR)).replace("\\", "/") 
                    used_indices = set(used.get(file_key, []))

                    # Count available games (each game uses 6 questions: 2x200, 2x400, 2x600)
                    available_200 = [i for i, q in enumerate(all_q) if q["points"] == 200 and i not in used_indices]
                    available_400 = [i for i, q in enumerate(all_q) if q["points"] == 400 and i not in used_indices]
                    available_600 = [i for i, q in enumerate(all_q) if q["points"] == 600 and i not in used_indices]

                    possible_games = min(len(available_200) // 2, len(available_400) // 2, len(available_600) // 2)

                    structure[group_name].append({
                        "name": category_name,
                        "file": file_key,
                        "possible_games": possible_games
                    })
                except Exception as e:
                    print(f"Error reading {json_file}: {e}")

    return structure


def pick_questions_for_category(file_rel_path, user_id):
    """Pick 2x200, 2x400, 2x600 unused questions from a file for a specific user"""
    full_path = BASE_DIR / file_rel_path
    data = smart_load_json(full_path)

    # جلب سجل الأسئلة المستخدمة للمستخدم من الداتا بيز
    used_doc = used_q_col.find_one({"user_id": user_id})
    used = used_doc.get("used", {}) if used_doc else {}
    
    file_key = file_rel_path.replace("\\", "/")
    used_indices = set(used.get(file_key, []))

    all_q = data.get("questions", [])
    available_200 = [i for i, q in enumerate(all_q) if q["points"] == 200 and i not in used_indices]
    available_400 = [i for i, q in enumerate(all_q) if q["points"] == 400 and i not in used_indices]
    available_600 = [i for i, q in enumerate(all_q) if q["points"] == 600 and i not in used_indices]

    if len(available_200) < 2 or len(available_400) < 2 or len(available_600) < 2:
        return None  # Not enough questions

    chosen_200 = random.sample(available_200, 2)
    chosen_400 = random.sample(available_400, 2)
    chosen_600 = random.sample(available_600, 2)
    
    all_chosen = chosen_200 + chosen_400 + chosen_600

    # Mark as used in the dictionary
    used.setdefault(file_key, [])
    used[file_key].extend(all_chosen)
    
    # تحديث قاعدة البيانات بالأسئلة الجديدة اللي اتلعبت
    used_q_col.update_one(
        {"user_id": user_id},
        {"$set": {"used": used}},
        upsert=True
    )

    questions = []
    for idx in all_chosen:
        q = all_q[idx].copy()
        q["index"] = idx
        questions.append(q)

    return {
        "category": data.get("category", ""),
        "questions": questions
    }


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/categories")
def get_categories():
    user = get_user_by_token()
    if not user: 
        return jsonify({"error": "Unauthorized"}), 401
        
    structure = get_categories_structure(user["_id"])
    return jsonify(structure)


@app.route("/api/start-game", methods=["POST"])
def start_game():
    user = get_user_by_token()
    if not user: 
        return jsonify({"error": "Unauthorized"}), 401
    
    data = request.json
    selected_files = data.get("selected_files", [])

    if len(selected_files) != 6:
        return jsonify({"error": "يجب اختيار 6 كاتيجوريز بالضبط"}), 400

    game_categories = []
    for file_path in selected_files:
        result = pick_questions_for_category(file_path, user["_id"])
        if result is None:
            return jsonify({"error": f"لا توجد أسئلة كافية في: {file_path}"}), 400
        game_categories.append(result)

    # Pick one random question for double points
    all_q_flat = []
    for ci, cat in enumerate(game_categories):
        for qi, q in enumerate(cat["questions"]):
            all_q_flat.append((ci, qi))

    double_index = random.choice(all_q_flat)

    return jsonify({
        "categories": game_categories,
        "double_points": {"cat_index": double_index[0], "q_index": double_index[1]}
    })


@app.route("/api/reset-category", methods=["POST"])
def reset_category():
    """Reset used questions for a specific file for the logged-in user"""
    user = get_user_by_token()
    if not user: 
        return jsonify({"error": "Unauthorized"}), 401
    
    data = request.json
    file_key = data.get("file").replace("\\", "/")
    
    used_doc = used_q_col.find_one({"user_id": user["_id"]})
    if used_doc and "used" in used_doc and file_key in used_doc["used"]:
        del used_doc["used"][file_key]
        used_q_col.update_one({"user_id": user["_id"]}, {"$set": {"used": used_doc["used"]}})
        
    return jsonify({"success": True})


if __name__ == "__main__":
    app.run(debug=True, port=5000)
