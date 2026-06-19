# 🌟 STAR ACADEMY // Cybernetic STEM Portal

A unified, high-fidelity STEM educational platform combining study notes, interactive math/physics sandboxes, multi-variant written exams, and dynamic gamified flight simulations. 

Star Academy brings learning to life through a beautiful sci-fi cybernetic interface. The application features a fully integrated client-server architecture with four custom portal roles: **Students (Cadets)**, **Teachers (Instructors)**, **Parents**, and a dedicated **Administrator (System Monitor)**.

---

## 🚀 Key Features

### 1. Unified Multi-Role Portal System
*   **Student Dashboard:** Link with instructors using custom group codes, track learning progress, view grades, gain levels, earn XP, and collect **Space Shards** to unlock engine customizations.
*   **Teacher Console:** Create custom courses, distribute HTML/markdown lecture materials, build quizzes from scratch, and monitor student metrics (average accuracy, quiz grades, flight performance).
*   **Parent Cabin:** Monitor linked children’s academic progress, simulator performance, and conceptual strengths.
*   **Administrator Monitor:** Dedicated security dashboard restricted exclusively to `aibek11@gmail.com`. Displays real-time interactive SVG graphs to monitor entire site usage, active courses, and user progression.

### 2. Live SVG Analytics Dashboard (Admin Exclusive)
The Administrator portal renders **5 high-fidelity interactive SVG graphs** summarizing platform-wide analytics dynamically fetched from backend aggregates:
1.  📈 **Graph of Usage:** Active hours, hourly frequency logs, and application load logs.
2.  ⏱ **Graph of Spending Time:** Tracks total time and study minutes spent per session.
3.  👥 **Graph of Users:** Registration cohorts, user growth over time, and active distribution.
4.  📚 **Graph of Courses:** Active registrations versus course completion ratios.
5.  ✅ **Graph of Completed Tasks:** Track weekly math, physics, and computer science task metrics.

### 3. Comprehensive Settings & Configuration Panel
Fully interactive configuration controls accessible via the **НАСТРОЙКИ** tab:
*   **Profile Customization:** Live update profile details (Full Name, email, avatar badge, and account security passwords).
*   **Profile Maintenance:** Options to Reset Profile progress or completely Delete the account.
*   **Difficulty & Simulation Control:** Tweak ship parameters, asteroid/drone velocity, and obstacle spawn rates in real-time.
*   **Movement Control Limiters:** Switch between restricted limits of Keyboard Arrow keys or classic W/A/S/D movement ranges.
*   **Audio Master Sync:** Synchronized volume control sliders mapping master, background music, and laser sound effect synthesizers dynamically.
*   **Accessibility Controls:**
    *   *High Contrast Mode:* Force bright light-on-dark visuals, solid black backgrounds, and outline borders for optimal readability.
    *   *Font Scaling Override:* Scale readable text elements immediately across three layout options (*Мелкий*, *Обычный*, *Крупный*).

### 4. Custom Styling & Visual Themes
Switch themes dynamically using the **🎨 СТИЛЬ** shortcut button located in the header toolbar, or select them from the Settings dashboard:
1.  🌌 **Кибер-Неон (Cyber Neon):** High-fidelity glassmorphism, animated stardust, neon grid backdrops, and pulsing color filters.
2.  🛸 **Минимализм (Cyber Minimalist):** Clean flat panels, disabled star/grid animations, and structured flat blue/pink borders.
3.  🎨 **Нео-Брутализм (Neo-Brutalist):** Bright warm paper background, thick high-contrast black borders, flat dropshadows, and raw high-contrast text layers.
4.  ◽️ **Мини-Минимализм (Mini-Minimalist):** Crisp monochrome dark style, pitch-black backdrops, gray outline borders, square corners, and high-readability monochrome typography.

---

## 🛠 Tech Stack

*   **Frontend:** Vanilla JavaScript (ES6+), HTML5 Canvas, Vanilla CSS3 (Custom Glassmorphism, Neon glow filters, Space grids).
*   **Backend:** Python (Flask & Flask-CORS) providing lightweight REST APIs.
*   **Database:** SQLite3 (`star_academy.db`) automatically initialized upon startup.
*   **Sound:** Procedural synthesizer powered by the Web Audio API (real-time soundwave oscillators).

---

## 📁 Project Structure

```bash
├── audio.js              # Web Audio API procedural synthesizer for music & SFX
├── game.js               # Canvas-based game loop, entity handling, and physics
├── ui.js                 # Event listeners, API calls, and reactive state router
├── index.html            # Sci-Fi layout, modals, and interface panels
├── index.css             # Cybernetic visual design system & theme sheets
├── server.py             # Flask application server, DB routing, and authentication
└── star_academy.db       # SQLite3 database storing profiles, courses, and progress
```

---

## 🚀 Getting Started

### Prerequisites

You need Python 3 installed on your system. Install the required dependencies using the provided `requirements.txt`:

```bash
pip install -r requirements.txt
```

### Running the App

#### Development Server
1. Start the Flask server in development mode:
   ```bash
   python server.py
   ```
2. The server runs locally on port `5005` by default and initializes the database (`star_academy.db`).
3. Open your browser and navigate to [http://127.0.0.1:5005](http://127.0.0.1:5005).

#### Production Server (Gunicorn)
To run the server in a production-ready environment using Gunicorn:
```bash
gunicorn -w 4 -b 0.0.0.0:5005 server:app
```

---

## 🔐 Administrator Account Access

*   **Admin Email:** `aibek11@gmail.com`
*   **Default Password:** `123456`

*(Note: Registration with the Administrator role is strictly locked to this email address on the backend for security purposes. No other email can claim administrative privileges.)*
