# 🌟 STAR ACADEMY // Cybernetic STEM Portal

A unified, high-fidelity STEM educational platform combining study notes, interactive math/physics sandboxes, multi-variant written exams, and dynamic gamified flight simulations. 

Star Academy brings learning to life through a beautiful sci-fi cybernetic interface. The application features a fully integrated client-server architecture with three custom portals: for **Students (Cadets)**, **Teachers (Instructors)**, and **Parents**.

---

## 🚀 Key Features

### 1. Unified Multi-Role Portal System
*   **Student Dashboard:** Link with instructors using custom group codes, track learning progress, view grades, gain levels, earn XP, and collect **Space Shards** to unlock engine customizations.
*   **Teacher Console:** Create custom courses, distribute HTML/markdown lecture materials, build quizzes from scratch, and monitor student metrics (average accuracy, quiz grades, flight performance).
*   **Parent Cabin:** Monitor linked children’s academic progress, simulator performance, and conceptual strengths.

### 2. Gamified STEM flight Simulator
*   Fly through asteroid fields and fight waves of enemy drones.
*   **STEM-Inject Quest System:** Enemies carry dynamic answers to active math, logic, or computer science equations. Blast the correct drone to collect rewards; shooting the wrong answers harms your hull!
*   **Ship Customization Shop:** Spend Space Shards to purchase cosmetic ship customizations, including engine flame exhausts (Rose, Emerald, Gold) and defensive shields (Cyan, Hexagonal Grid).
*   **Boss Invasions:** Epic boss battles that lock onto correct weak points, changing music urgency on the fly.

### 3. Procedural Audio Engine
*   **Zero-Asset Sound Design:** Synthesizes retro sound effects and ambient soundtrack scores in real-time using the **Web Audio API**—no audio files or downloads required!
*   **Selectable Tracks:** Choose between *Energetic Synthwave* (fast-paced), *Retro Kosmo-Bit* (medium pace), or *Cyber Ambient* (focus/study).

### 4. Accessibility & Inclusivity
*   **Reaction-Assist:** Adjust the speed modifier slider (50% - 100%) to slow down the space battle to match your reaction time.
*   **Photosensitivity Mode:** Toggle reduced motion to disable intense screen shaking and canvas flashing effects.

---

## 🛠 Tech Stack

*   **Frontend:** Vanilla JavaScript (ES6+), HTML5 Canvas, Vanilla CSS3 (Custom Glassmorphism, Neon glow filters, Space grids).
*   **Backend:** Python (Flask & Flask-CORS) providing lightweight REST APIs.
*   **Database:** SQLite3 (`star_academy.db`) automatically initialized upon start.
*   **Sound:** Procedural synthesizer powered by the Web Audio API.

---

## 📁 Project Structure

```bash
├── audio.js              # Web Audio API procedural synthesizer for music & SFX
├── game.js               # Canvas-based game loop, entity handling, and physics
├── ui.js                 # Event listeners, API calls, and reactive state router
├── index.html            # Sci-Fi layout, modals, and interface panels
├── index.css             # Cybernetic visual design system & glassmorphism
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

1. Start the Flask server:
   ```bash
   python server.py
   ```
2. The server runs locally on port `5005` by default and initializes the database (`star_academy.db`).
3. Open your browser and navigate to:
   [http://127.0.0.1:5005](http://127.0.0.1:5005)

---

## 🎓 STEM Curriculum Coverage

The portal comes pre-packaged with 5 levels of study material, interactive sandboxes, and exams across three subjects:

1.  **Mathematics:** Linear equations ($ax + b = c$), quadratic equations & discriminant, systems of linear equations, logarithms, and introductory calculus (limits/derivatives).
2.  **Physics:** Newton's laws of motion, conservation of momentum, Ohm's law (circuits), geometric optics/refraction, and thermodynamic gas laws.
3.  **Computer Science:** Binary & hexadecimal numbering, boolean algebra logic gates (AND, OR, XOR), algorithmic time complexity (Big O notation), search & sort algorithms, and basic structures (stacks, trees).

---

## 🎮 How to Play the Simulator

*   **Controls:** Move your ship using **W/A/S/D** (or your mouse). Shoot lasers using **Spacebar / F** (or left-click).
*   **Ability:** Activate your ship's signature special ability by pressing **Space / Shift**:
    *   *STRIKER-X:* Rapid-fire super lasers.
    *   *VANGUARD:* A circular flak wave explosion.
    *   *PHANTOM:* Time dilation (slows down obstacle velocities).
*   **Solving Quests:** View the *Active Quest* at the top of the HUD. Locate the enemy carrying the correct solution text and blow them up to clear the quest.
