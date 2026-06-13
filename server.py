from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import sqlite3
from werkzeug.security import generate_password_hash, check_password_hash
import random
import string
import json
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
app = Flask(__name__, static_folder=BASE_DIR, static_url_path='')
CORS(app)

@app.route('/')
def serve_index():
    return send_from_directory(BASE_DIR, 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    if os.path.exists(os.path.join(BASE_DIR, path)):
        return send_from_directory(BASE_DIR, path)
    return send_from_directory(BASE_DIR, 'index.html')

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'star_academy.db')

# Check if PostgreSQL database is configured (e.g., via environment variables in production)
DATABASE_URL = os.environ.get('DATABASE_URL')
IS_POSTGRES = False
if DATABASE_URL and (DATABASE_URL.startswith('postgres://') or DATABASE_URL.startswith('postgresql://')):
    IS_POSTGRES = True

try:
    import psycopg2
    import psycopg2.extras
    HAS_PSYCOPG2 = True
except ImportError:
    HAS_PSYCOPG2 = False

class PostgresCursorWrapper:
    def __init__(self, cursor):
        self.cursor = cursor

    def execute(self, query, params=None):
        # 1. Translate INTEGER PRIMARY KEY AUTOINCREMENT -> SERIAL PRIMARY KEY for schema definitions
        query_translated = query.replace("INTEGER PRIMARY KEY AUTOINCREMENT", "SERIAL PRIMARY KEY")
        # 2. Translate SQLite placeholders (?) -> PostgreSQL placeholders (%s)
        query_translated = query_translated.replace("?", "%s")
        
        if params is not None:
            self.cursor.execute(query_translated, params)
        else:
            self.cursor.execute(query_translated)

    def fetchone(self):
        return self.cursor.fetchone()

    def fetchall(self):
        return self.cursor.fetchall()

    def close(self):
        self.cursor.close()

    def __getattr__(self, name):
        return getattr(self.cursor, name)

class PostgresConnectionWrapper:
    def __init__(self, conn):
        self.conn = conn

    def cursor(self):
        real_cursor = self.conn.cursor()
        return PostgresCursorWrapper(real_cursor)

    def commit(self):
        self.conn.commit()

    def rollback(self):
        self.conn.rollback()

    def close(self):
        self.conn.close()

    def __getattr__(self, name):
        return getattr(self.conn, name)

def get_db_connection():
    if IS_POSTGRES and HAS_PSYCOPG2:
        # Render and Heroku sometimes pass postgres:// URLs, but modern psycopg2 needs postgresql://.
        url = DATABASE_URL
        if url.startswith('postgres://'):
            url = url.replace('postgres://', 'postgresql://', 1)
        conn = psycopg2.connect(url, cursor_factory=psycopg2.extras.DictCursor)
        return PostgresConnectionWrapper(conn)
    else:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 1. Users table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            full_name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL, -- 'student', 'teacher', 'parent'
            xp INTEGER DEFAULT 0,
            level INTEGER DEFAULT 1,
            shards INTEGER DEFAULT 0,
            highscore INTEGER DEFAULT 0,
            unlocked_items TEXT DEFAULT '["flame_pink"]',
            active_flame TEXT DEFAULT 'flame_pink',
            active_shield TEXT DEFAULT 'cyan',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # 2. Courses table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS courses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            teacher_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            course_code TEXT UNIQUE NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (teacher_id) REFERENCES users (id)
        )
    ''')
    
    # 3. Enrollments table (student -> course)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS enrollments (
            student_id INTEGER NOT NULL,
            course_id INTEGER NOT NULL,
            enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (student_id, course_id),
            FOREIGN KEY (student_id) REFERENCES users (id),
            FOREIGN KEY (course_id) REFERENCES courses (id)
        )
    ''')
    
    # 4. Parent-Student relation table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS parent_student (
            parent_id INTEGER NOT NULL,
            student_id INTEGER NOT NULL,
            linked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (parent_id, student_id),
            FOREIGN KEY (parent_id) REFERENCES users (id),
            FOREIGN KEY (student_id) REFERENCES users (id)
        )
    ''')
    
    # 5. Custom Materials table (Lessons uploaded by teachers)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS custom_materials (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            course_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (course_id) REFERENCES courses (id)
        )
    ''')
    
    # 6. Custom Quizzes table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS custom_quizzes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            course_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            questions_json TEXT NOT NULL, -- JSON array of questions
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (course_id) REFERENCES courses (id)
        )
    ''')
    
    # 7. Student Progress table (grades, tests, simulator stats)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS student_progress (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER NOT NULL,
            subject TEXT NOT NULL, -- 'math', 'physics', 'cs', or custom course title
            type TEXT NOT NULL, -- 'notes_read', 'test_a', 'test_b', 'simulator', 'custom_quiz'
            score INTEGER,
            max_score INTEGER,
            details TEXT, -- JSON string of extra metadata (accuracy, speed, etc.)
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (student_id) REFERENCES users (id)
        )
    ''')
    
    conn.commit()
    conn.close()
    if IS_POSTGRES and HAS_PSYCOPG2:
        print("=== PostgreSQL Database Initialized Successfully ===")
    else:
        print("=== SQLite Database Initialized Successfully ===")

# --- 1. USER AUTHENTICATION ---

@app.route('/api/register', methods=['POST'])
def register():
    try:
        data = request.get_json()
        full_name = data.get('full_name')
        email = data.get('email').strip().lower()
        password = data.get('password')
        role = data.get('role', 'student')

        if not full_name or not email or not password:
            return jsonify({"status": "error", "message": "Все поля обязательны для заполнения"}), 400

        hashed_pw = generate_password_hash(password)
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Check if email exists
        cursor.execute("SELECT id FROM users WHERE email = ?", (email,))
        if cursor.fetchone():
            conn.close()
            return jsonify({"status": "error", "message": "Email уже зарегистрирован"}), 400

        cursor.execute(
            "INSERT INTO users (full_name, email, password, role) VALUES (?, ?, ?, ?)",
            (full_name, email, hashed_pw, role)
        )
        conn.commit()
        conn.close()
        return jsonify({"status": "success", "message": "Регистрация успешна!"}), 201
    except Exception as e:
        return jsonify({"status": "error", "message": f"Ошибка базы данных: {str(e)}"}), 500

@app.route('/api/login', methods=['POST'])
def login():
    try:
        data = request.get_json()
        email = data.get('email').strip().lower()
        password = data.get('password')

        if not email or not password:
            return jsonify({"status": "error", "message": "Заполните Email и пароль"}), 400

        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE email = ?", (email,))
        user = cursor.fetchone()
        conn.close()

        if user and check_password_hash(user['password'], password):
            unlocked = json.loads(user['unlocked_items']) if user['unlocked_items'] else ["flame_pink"]
            return jsonify({
                "status": "success",
                "user": {
                    "id": user['id'],
                    "full_name": user['full_name'],
                    "email": user['email'],
                    "role": user['role'],
                    "xp": user['xp'],
                    "level": user['level'],
                    "shards": user['shards'],
                    "highscore": user['highscore'],
                    "unlocked_items": unlocked,
                    "active_flame": user['active_flame'],
                    "active_shield": user['active_shield']
                }
            }), 200
        return jsonify({"status": "error", "message": "Неверный email или пароль"}), 401
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/profile/update', methods=['POST'])
def update_profile():
    try:
        data = request.get_json()
        user_id = data.get('user_id')
        xp = data.get('xp')
        level = data.get('level')
        shards = data.get('shards')
        highscore = data.get('highscore')
        unlocked_items = data.get('unlocked_items')
        active_flame = data.get('active_flame')
        active_shield = data.get('active_shield')

        conn = get_db_connection()
        cursor = conn.cursor()
        
        unlocked_json = json.dumps(unlocked_items) if unlocked_items is not None else None
        
        cursor.execute('''
            UPDATE users 
            SET xp = COALESCE(?, xp),
                level = COALESCE(?, level),
                shards = COALESCE(?, shards),
                highscore = COALESCE(?, highscore),
                unlocked_items = COALESCE(?, unlocked_items),
                active_flame = COALESCE(?, active_flame),
                active_shield = COALESCE(?, active_shield)
            WHERE id = ?
        ''', (xp, level, shards, highscore, unlocked_json, active_flame, active_shield, user_id))
        
        conn.commit()
        conn.close()
        return jsonify({"status": "success", "message": "Профиль успешно обновлен"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


# --- 2. COURSE MANAGEMENT ---

@app.route('/api/courses/create', methods=['POST'])
def create_course():
    try:
        data = request.get_json()
        teacher_id = data.get('teacher_id')
        title = data.get('title')

        if not teacher_id or not title:
            return jsonify({"status": "error", "message": "Название курса обязательно"}), 400

        # Generate a unique 6-character course code
        conn = get_db_connection()
        cursor = conn.cursor()
        
        while True:
            code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
            cursor.execute("SELECT id FROM courses WHERE course_code = ?", (code,))
            if not cursor.fetchone():
                break

        cursor.execute(
            "INSERT INTO courses (teacher_id, title, course_code) VALUES (?, ?, ?)",
            (teacher_id, title, code)
        )
        conn.commit()
        conn.close()
        
        return jsonify({"status": "success", "course_code": code, "message": "Курс успешно создан!"}), 201
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/courses/join', methods=['POST'])
def join_course():
    try:
        data = request.get_json()
        student_id = data.get('student_id')
        course_code = data.get('course_code').strip().upper()

        if not student_id or not course_code:
            return jsonify({"status": "error", "message": "Введите код курса"}), 400

        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Find course
        cursor.execute("SELECT id, title FROM courses WHERE course_code = ?", (course_code,))
        course = cursor.fetchone()
        
        if not course:
            conn.close()
            return jsonify({"status": "error", "message": "Курс с таким кодом не найден"}), 404
            
        course_id = course['id']
        
        # Check if already enrolled
        cursor.execute("SELECT * FROM enrollments WHERE student_id = ? AND course_id = ?", (student_id, course_id))
        if cursor.fetchone():
            conn.close()
            return jsonify({"status": "error", "message": "Вы уже зачислены на этот курс"}), 400
            
        cursor.execute("INSERT INTO enrollments (student_id, course_id) VALUES (?, ?)", (student_id, course_id))
        conn.commit()
        conn.close()
        
        return jsonify({"status": "success", "message": f"Вы успешно подключились к курсу '{course['title']}'!"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/courses/list', methods=['GET'])
def list_courses():
    try:
        user_id = request.args.get('user_id')
        role = request.args.get('role')

        if not user_id or not role:
            return jsonify({"status": "error", "message": "Параметры запроса неполные"}), 400

        conn = get_db_connection()
        cursor = conn.cursor()
        courses_list = []

        if role == 'teacher':
            cursor.execute("SELECT id, title, course_code, created_at FROM courses WHERE teacher_id = ? ORDER BY created_at DESC", (user_id,))
            courses_list = [dict(row) for row in cursor.fetchall()]
        elif role == 'student':
            cursor.execute('''
                SELECT c.id, c.title, c.course_code, u.full_name as teacher_name
                FROM courses c
                JOIN enrollments e ON c.id = e.course_id
                JOIN users u ON c.teacher_id = u.id
                WHERE e.student_id = ?
                ORDER BY e.enrolled_at DESC
            ''', (user_id,))
            courses_list = [dict(row) for row in cursor.fetchall()]
        elif role == 'parent':
            # Find children first
            cursor.execute('''
                SELECT student_id FROM parent_student WHERE parent_id = ?
            ''', (user_id,))
            child_ids = [row['student_id'] for row in cursor.fetchall()]
            
            if child_ids:
                placeholders = ','.join('?' for _ in child_ids)
                cursor.execute(f'''
                    SELECT DISTINCT c.id, c.title, c.course_code, u.full_name as teacher_name
                    FROM courses c
                    JOIN enrollments e ON c.id = e.course_id
                    JOIN users u ON c.teacher_id = u.id
                    WHERE e.student_id IN ({placeholders})
                ''', child_ids)
                courses_list = [dict(row) for row in cursor.fetchall()]

        conn.close()
        return jsonify({"status": "success", "courses": courses_list}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


# --- 3. TEACHER DASHBOARD PORTAL ---

@app.route('/api/courses/<int:course_id>/students', methods=['GET'])
def list_course_students(course_id):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Get all students enrolled in this course
        cursor.execute('''
            SELECT u.id, u.full_name, u.email, u.xp, u.level, u.highscore
            FROM users u
            JOIN enrollments e ON u.id = e.student_id
            WHERE e.course_id = ?
        ''', (course_id,))
        students = [dict(row) for row in cursor.fetchall()]
        
        # For each student, get their grades and simulator metrics
        for student in students:
            cursor.execute('''
                SELECT subject, type, score, max_score, details, timestamp
                FROM student_progress
                WHERE student_id = ?
                ORDER BY timestamp DESC
            ''', (student['id'],))
            progress_rows = cursor.fetchall()
            
            progress = []
            for row in progress_rows:
                p_dict = dict(row)
                if p_dict['details']:
                    try:
                        p_dict['details'] = json.loads(p_dict['details'])
                    except:
                        pass
                progress.append(p_dict)
                
            student['progress'] = progress

        conn.close()
        return jsonify({"status": "success", "students": students}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/courses/<int:course_id>/materials/create', methods=['POST'])
def create_course_material(course_id):
    try:
        data = request.get_json()
        title = data.get('title')
        content = data.get('content')

        if not title or not content:
            return jsonify({"status": "error", "message": "Название и содержание обязательны"}), 400

        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO custom_materials (course_id, title, content) VALUES (?, ?, ?)",
            (course_id, title, content)
        )
        conn.commit()
        conn.close()
        
        return jsonify({"status": "success", "message": "Материал успешно опубликован!"}), 201
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/courses/<int:course_id>/quizzes/create', methods=['POST'])
def create_course_quiz(course_id):
    try:
        data = request.get_json()
        title = data.get('title')
        description = data.get('description', '')
        questions = data.get('questions') # list of dicts

        if not title or not questions:
            return jsonify({"status": "error", "message": "Название и вопросы обязательны"}), 400

        questions_json = json.dumps(questions)
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO custom_quizzes (course_id, title, description, questions_json) VALUES (?, ?, ?, ?)",
            (course_id, title, description, questions_json)
        )
        conn.commit()
        conn.close()
        
        return jsonify({"status": "success", "message": "Тест успешно создан и опубликован!"}), 201
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/courses/<int:course_id>/content', methods=['GET'])
def get_course_content(course_id):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Get materials
        cursor.execute("SELECT id, title, content, created_at FROM custom_materials WHERE course_id = ? ORDER BY created_at DESC", (course_id,))
        materials = [dict(row) for row in cursor.fetchall()]
        
        # Get quizzes
        cursor.execute("SELECT id, title, description, questions_json, created_at FROM custom_quizzes WHERE course_id = ? ORDER BY created_at DESC", (course_id,))
        quizzes = []
        for row in cursor.fetchall():
            q_dict = dict(row)
            q_dict['questions'] = json.loads(q_dict['questions_json'])
            del q_dict['questions_json']
            quizzes.append(q_dict)
            
        conn.close()
        return jsonify({
            "status": "success",
            "materials": materials,
            "quizzes": quizzes
        }), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


# --- 4. PARENT FUNCTIONS ---

@app.route('/api/parent/link', methods=['POST'])
def link_child():
    try:
        data = request.get_json()
        parent_id = data.get('parent_id')
        child_email = data.get('child_email').strip().lower()

        if not parent_id or not child_email:
            return jsonify({"status": "error", "message": "Email ребенка обязателен"}), 400

        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Find child student
        cursor.execute("SELECT id, full_name, email FROM users WHERE email = ? AND role = 'student'", (child_email,))
        child = cursor.fetchone()
        
        if not child:
            conn.close()
            return jsonify({"status": "error", "message": "Студент с таким email не найден"}), 404
            
        student_id = child['id']
        
        # Check if already linked
        cursor.execute("SELECT * FROM parent_student WHERE parent_id = ? AND student_id = ?", (parent_id, student_id))
        if cursor.fetchone():
            conn.close()
            return jsonify({"status": "error", "message": "Этот ученик уже привязан к вашему кабинету"}), 400

        cursor.execute("INSERT INTO parent_student (parent_id, student_id) VALUES (?, ?)", (parent_id, student_id))
        conn.commit()
        conn.close()
        
        return jsonify({"status": "success", "message": f"Ученик {child['full_name']} успешно привязан!"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/parent/children', methods=['GET'])
def get_parent_children():
    try:
        parent_id = request.args.get('parent_id')
        
        if not parent_id:
            return jsonify({"status": "error", "message": "Идентификатор родителя обязателен"}), 400
            
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Fetch linked children profiles
        cursor.execute('''
            SELECT u.id, u.full_name, u.email, u.xp, u.level, u.shards, u.highscore
            FROM users u
            JOIN parent_student ps ON u.id = ps.student_id
            WHERE ps.parent_id = ?
        ''', (parent_id,))
        children = [dict(row) for row in cursor.fetchall()]
        
        # For each child, get their grades history
        for child in children:
            cursor.execute('''
                SELECT subject, type, score, max_score, details, timestamp
                FROM student_progress
                WHERE student_id = ?
                ORDER BY timestamp DESC
            ''', (child['id'],))
            progress_rows = cursor.fetchall()
            
            progress = []
            for row in progress_rows:
                p_dict = dict(row)
                if p_dict['details']:
                    try:
                        p_dict['details'] = json.loads(p_dict['details'])
                    except:
                        pass
                progress.append(p_dict)
            child['progress'] = progress
            
        conn.close()
        return jsonify({"status": "success", "children": children}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


# --- 5. STUDENT PROGRESS & GRADES LOGGING ---

@app.route('/api/progress/submit', methods=['POST'])
def submit_progress():
    try:
        data = request.get_json()
        student_id = data.get('student_id')
        subject = data.get('subject') # 'math', 'physics', 'cs', or custom name
        p_type = data.get('type') # 'notes_read', 'test_a', 'test_b', 'simulator', 'custom_quiz'
        score = data.get('score')
        max_score = data.get('max_score')
        details = data.get('details') # dict of metadata

        if not student_id or not subject or not p_type:
            return jsonify({"status": "error", "message": "Обязательные поля отсутствуют"}), 400

        conn = get_db_connection()
        cursor = conn.cursor()
        
        details_str = json.dumps(details) if details else None
        
        cursor.execute(
            "INSERT INTO student_progress (student_id, subject, type, score, max_score, details) VALUES (?, ?, ?, ?, ?, ?)",
            (student_id, subject, p_type, score, max_score, details_str)
        )
        
        # If simulator or test score, update highscore or shards on the user table if needed
        # We also sync XP/level separately, but we can do a verification
        
        conn.commit()
        conn.close()
        return jsonify({"status": "success", "message": "Прогресс успешно сохранен!"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/progress/get', methods=['GET'])
def get_student_progress():
    try:
        student_id = request.args.get('student_id')
        
        if not student_id:
            return jsonify({"status": "error", "message": "Идентификатор студента обязателен"}), 400
            
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT subject, type, score, max_score, details, timestamp
            FROM student_progress
            WHERE student_id = ?
            ORDER BY timestamp DESC
        ''', (student_id,))
        
        rows = cursor.fetchall()
        progress = []
        for row in rows:
            p_dict = dict(row)
            if p_dict['details']:
                try:
                    p_dict['details'] = json.loads(p_dict['details'])
                except:
                    pass
            progress.append(p_dict)
            
        conn.close()
        return jsonify({"status": "success", "progress": progress}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

init_db()

if __name__ == '__main__':
    init_db()
    print("=== Star Academy backend server running on port 5005 ===")
    app.run(host='0.0.0.0', port=5005, debug=True)
