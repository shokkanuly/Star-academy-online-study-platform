/**
 * Star Academy: Genesis UI & State Controller
 * Handles user sessions, SQLite backend integration, teacher LMS cabinets,
 * parent cabinets, 15 Khan Academy topic modules, and dynamic canvas syncs.
 */

class UIController {
  constructor() {
    this.currentTab = 'hangar';
    this.activeSubject = 'math';
    this.activeTopic = '1'; // 1 to 5
    this.activeModuleType = 'notes'; // notes, test

    // User session details
    this.userId = null;
    this.userRole = 'student'; // student, teacher, parent
    this.fullName = '';
    this.email = '';
    
    // Core progress variables
    this.shards = 0;
    this.highscore = 0;
    this.xp = 0;
    this.level = 1;
    this.rankTitle = 'ЗВЕЗДНЫЙ КУРСАНТ';

    // Ship Customization inventory
    this.unlockedItems = ['flame_pink'];
    this.activeFlame = 'flame_pink';
    this.activeShield = 'cyan';

    // Mock database fallbacks (if server is offline)
    this.leaderboard = [
      { rank: 1, name: "Командор Вейн", level: 8, xp: 820 },
      { rank: 2, name: "Лейтенант Рипли", level: 6, xp: 580 },
      { rank: 3, name: "Навигатор Соло", level: 4, xp: 390 },
      { rank: 4, name: "Курсант Спок", level: 2, xp: 120 }
    ];

    this.mockGrades = {
      math_1: null, math_2: null, math_3: null, math_4: null, math_5: null,
      physics_1: null, physics_2: null, physics_3: null, physics_4: null, physics_5: null,
      cs_1: null, cs_2: null, cs_3: null, cs_4: null, cs_5: null
    };

    // Teacher & Parent local caching
    this.teacherCourses = [];
    this.activeTeacherCourse = null;
    this.linkedChildren = [];

    // Custom Course assignments cache for students
    this.customCourseMaterials = [];
    this.customCourseQuizzes = [];
    this.activeCustomQuiz = null;

    // Sandbox settings
    this.mathSandboxParams = { a: 2, b: 4, c: 10 };
    this.physSandboxParams = { V: 12, R: 6 };
    this.csSandboxParams = { A: false, B: false, gate: 'AND' };

    // Instantiate game engine
    this.game = new GameEngine('game-canvas');

    // Load session and state
    this.initSession().then(() => {
      this.initListeners();
      this.switchTab('hangar');
      this.renderStudyStageContent();
      this.updateLeaderboardUI();
      this.updateShopUI();
    });

    window.onGameOver = (score, wave, shards, accuracy, solvedCount, avgSpeed) => {
      this.handleGameFinished(score, wave, shards, accuracy, solvedCount, avgSpeed);
    };
  }

  // --- API SERVICE CONNECTORS ---

  async apiCall(endpoint, method = 'GET', body = null) {
    const url = `http://localhost:5005${endpoint}`;
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 2000); // 2 second timeout
      const options = {
        method,
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal
      };
      if (body) options.body = JSON.stringify(body);
      const res = await fetch(url, options);
      clearTimeout(id);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Request failed");
      }
      return await res.json();
    } catch (e) {
      console.warn(`API connection to ${endpoint} failed, utilizing local mock database:`, e.message);
      return null;
    }
  }

  async initSession() {
    const cachedUser = localStorage.getItem('star_user_session');
    if (cachedUser) {
      try {
        const u = JSON.parse(cachedUser);
        this.userId = u.id;
        this.fullName = u.full_name;
        this.email = u.email;
        this.userRole = u.role;   // role is FIXED from registration — no override
        this.xp = u.xp || 0;
        this.level = u.level || 1;
        this.shards = u.shards || 0;
        this.highscore = u.highscore || 0;
        this.unlockedItems = u.unlocked_items || ['flame_pink'];
        this.activeFlame = u.active_flame || 'flame_pink';
        this.activeShield = u.active_shield || 'cyan';
      } catch (e) {
        console.warn("Failed to parse cached session:", e);
      }
    }
    // Apply role to body immediately for CSS visibility
    document.body.setAttribute('data-role', this.userRole || 'student');
    this.updateHeaderSessionUI();
  }

  applyUserSession(user) {
    this.userId = user.id;
    this.fullName = user.full_name;
    this.email = user.email;
    this.userRole = user.role;  // ALWAYS use role from server — permanent
    this.xp = user.xp;
    this.level = user.level;
    this.shards = user.shards;
    this.highscore = user.highscore;
    this.unlockedItems = user.unlocked_items;
    this.activeFlame = user.active_flame;
    this.activeShield = user.active_shield;
    
    this.updateRankTitle();
    // Save to localStorage — role is baked in from server
    localStorage.setItem('star_user_session', JSON.stringify(user));
    // Remove any old role override that may exist from guest switching
    localStorage.removeItem('star_user_role');
    this.updateHeaderSessionUI();
  }

  updateHeaderSessionUI() {
    const authOverlay = document.getElementById('auth-overlay');
    const uNameText = document.getElementById('header-user-name');
    const logoutBtn = document.getElementById('btn-logout');

    if (this.userId) {
      authOverlay.classList.add('hidden');
      uNameText.innerText = this.fullName;
      uNameText.style.display = 'block';
      logoutBtn.style.display = 'block';
      // Update name fields in all role panels
      const teacherName = document.getElementById('teacher-profile-name');
      const parentName = document.getElementById('parent-profile-name');
      if (teacherName) teacherName.innerText = this.fullName || 'Инструктор Академии';
      if (parentName) parentName.innerText = this.fullName || 'Родитель Курсанта';

      // ROLE IS PERMANENT for logged-in users — hide ALL switcher sections
      document.querySelectorAll('.role-switcher-section').forEach(el => el.style.display = 'none');

      this.switchRole(this.userRole);
    } else {
      authOverlay.classList.remove('hidden');
      uNameText.style.display = 'none';
      logoutBtn.style.display = 'none';
      // For guests — show role switcher so they can demo all roles
      document.querySelectorAll('.role-switcher-section').forEach(el => el.style.display = '');
      document.body.setAttribute('data-role', 'student');
    }
  }

  async syncProfileWithServer() {
    if (!this.userId) return;
    const stats = {
      user_id: this.userId,
      xp: this.xp,
      level: this.level,
      shards: this.shards,
      highscore: this.highscore,
      unlocked_items: this.unlockedItems,
      active_flame: this.activeFlame,
      active_shield: this.activeShield
    };
    
    // Save locally
    const cachedUser = JSON.parse(localStorage.getItem('star_user_session') || '{}');
    Object.assign(cachedUser, stats);
    localStorage.setItem('star_user_session', JSON.stringify(cachedUser));

    // Update server database
    await this.apiCall('/api/profile/update', 'POST', stats);
  }

  updateRankTitle() {
    if (this.level >= 8) this.rankTitle = 'КИБЕР-КОМАНДОР';
    else if (this.level >= 5) this.rankTitle = 'STEM-ИНЖЕНЕР';
    else if (this.level >= 3) this.rankTitle = 'КОСМО-ИССЛЕДОВАТЕЛЬ';
    else this.rankTitle = 'ЗВЕЗДНЫЙ КУРСАНТ';
  }

  async awardXP(amount) {
    this.xp += amount;
    const thresh = 100 * this.level;
    this.showToast(`Получено +${amount} XP опыта!`);
    
    if (this.xp >= thresh) {
      this.xp -= thresh;
      this.level++;
      this.updateRankTitle();
      gameAudio.playUpgradeSound();
      this.showToast(`🎉 ЗВАНИЕ ПОВЫШЕНО! Вы достигли Уровня ${this.level}!`);
    }
    
    this.updateProfileCard();
    this.updateLeaderboardUI();
    await this.syncProfileWithServer();
  }

  // --- VIEW TABS MANAGER ---

  async switchTab(tabId) {
    this.currentTab = tabId;
    
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
    });

    document.querySelectorAll('.tab-view').forEach(view => {
      view.classList.toggle('hidden', view.getAttribute('id') !== `tab-${tabId}`);
    });

    if (tabId !== 'simulator' && this.game.gameState === 'playing') {
      this.game.gameState = 'menu';
      gameAudio.stopMusic();
      document.getElementById('sim-active-container').classList.add('hidden');
      document.getElementById('sim-setup-screen').classList.remove('hidden');
    }

    if (tabId === 'simulator') {
      // Ensure setup screen is visible when navigating to simulator tab
      const setupScreen = document.getElementById('sim-setup-screen');
      const activeContainer = document.getElementById('sim-active-container');
      if (this.game.gameState !== 'playing' && this.game.gameState !== 'paused') {
        if (setupScreen) setupScreen.classList.remove('hidden');
        if (activeContainer) activeContainer.classList.add('hidden');
      }
      // Make canvas visible so game can draw on it
      const canvas = document.getElementById('game-canvas');
      if (canvas) canvas.style.display = 'block';
    } else if (tabId === 'gradebook') {
      await this.updateGradebookCockpit();
    } else if (tabId === 'hangar') {
      this.updateProfileCard();
      this.updateLeaderboardUI();
      this.updateShopUI();
    }
  }

  switchRole(role) {
    this.userRole = role;
    const labelMap = { student: 'СТУДЕНТ', teacher: 'ИНСТРУКТОР', parent: 'РОДИТЕЛЬ' };
    
    // Set body attribute — CSS uses body[data-role] to show/hide tabs
    document.body.setAttribute('data-role', role);
    
    document.getElementById('header-role-text').innerText = `${labelMap[role]} // УР. ${this.level}`;
    this.updateProfileCard();

    // Keep legacy feature-view toggles (for hangar card panel)
    document.querySelectorAll('.role-feature-view').forEach(view => {
      view.classList.toggle('hidden', view.getAttribute('id') !== `feature-${role}`);
    });

    // Highlight the active role button (only visible to guests)
    document.querySelectorAll('.role-btn').forEach(btn => {
      const isActive = btn.getAttribute('data-role') === role;
      btn.classList.toggle('active', isActive);
      btn.style.background = isActive ? 'var(--color-pink)' : 'rgba(255,255,255,0.02)';
      btn.style.borderColor = isActive ? 'var(--color-pink)' : 'rgba(255,255,255,0.06)';
      btn.style.color = isActive ? '#fff' : '#bfbdd3';
      btn.style.boxShadow = isActive ? '0 0 10px var(--color-pink-glow)' : 'none';
    });

    // Navigate to the role's default tab
    const defaultTabs = { student: 'hangar', teacher: 'teacher-hangar', parent: 'parent-hangar' };
    this.switchTab(defaultTabs[role]);

    // Load role-specific data
    if (role === 'teacher') this.loadTeacherCoursesTab();
    if (role === 'parent') this.loadParentChildrenTab();
    if (role === 'student') this.loadStudentCourses();
  }


  updateProfileCard() {
    document.getElementById('profile-shards').innerText = this.shards;
    document.getElementById('profile-rank-badge').innerText = `ЗВАНИЕ: ${this.rankTitle}`;
    document.getElementById('profile-name').innerText = this.fullName || "Пилот Академии";
    
    const thresh = 100 * this.level;
    document.getElementById('lbl-rank-title').innerText = `${this.rankTitle} // УР. ${this.level}`;
    document.getElementById('lbl-xp-val').innerText = `${this.xp} / ${thresh} XP`;
    
    const pct = Math.min(100, (this.xp / thresh) * 100);
    document.getElementById('xp-fill-bar').style.width = `${pct}%`;
  }

  // --- LEADERBOARD & SHOP ---

  updateLeaderboardUI() {
    const list = document.getElementById('leaderboard-entries');
    if (!list) return;
    list.innerHTML = "";

    // Insert user row if not present
    let playerRow = this.leaderboard.find(e => e.isPlayer);
    if (!playerRow) {
      playerRow = { name: `${this.fullName} (Вы)`, isPlayer: true };
      this.leaderboard.push(playerRow);
    }
    playerRow.level = this.level;
    playerRow.xp = this.xp + (this.level - 1) * 150;

    this.leaderboard.sort((a, b) => b.xp - a.xp);

    this.leaderboard.forEach((item, idx) => {
      item.rank = idx + 1;
      const row = document.createElement('div');
      row.className = `leaderboard-row-entry ${item.isPlayer ? 'highlight-self' : ''}`;
      row.innerHTML = `
        <span class="rank-num">#${item.rank}</span>
        <span class="name">${item.name}</span>
        <span class="lvl">УР. ${item.level}</span>
        <span class="xp">${item.xp} XP</span>
      `;
      list.appendChild(row);
    });
  }

  updateShopUI() {
    const shopPrices = { flame_green: 15, flame_gold: 30, shield_hex: 25 };
    const keys = ['flame_pink', 'flame_green', 'flame_gold', 'shield_hex'];
    keys.forEach(key => {
      const isOwned = this.unlockedItems.includes(key);
      const btn = document.getElementById(`sh-btn-${key}`);
      const badge = document.getElementById(`sh-status-${key}`);
      if (!btn || !badge) return;

      if (isOwned) {
        badge.innerText = "КУПЛЕНО";
        badge.className = "status-bought active";
        const isCurrent = (key === this.activeFlame || key === this.activeShield);
        btn.innerText = isCurrent ? "АКТИВНО" : "ВЫБРАТЬ";
        btn.className = `btn item-action-btn select-btn ${isCurrent ? 'active' : ''}`;
      } else {
        const price = shopPrices[key];
        badge.innerText = `${price} ШАРДОВ`;
        badge.className = "status-bought";
        btn.innerText = "КУПИТЬ";
        btn.className = "btn item-action-btn buy-btn";
        btn.style.opacity = this.shards < price ? '0.5' : '1.0';
      }
    });
  }

  async buyShopItem(itemId, price) {
    if (this.shards >= price) {
      this.shards -= price;
      this.unlockedItems.push(itemId);
      
      if (itemId.startsWith('flame')) this.activeFlame = itemId;
      if (itemId.startsWith('shield')) this.activeShield = 'hex';

      gameAudio.playUpgradeSound();
      this.updateShopUI();
      this.updateProfileCard();
      this.showToast(`Приобретен и применен скин!`);
      await this.syncProfileWithServer();
    } else {
      gameAudio.playWrongSound();
      this.showToast("Недостаточно Шардов для покупки!");
    }
  }

  async selectShopItem(itemId) {
    if (itemId.startsWith('flame')) {
      this.activeFlame = itemId;
    } else {
      this.activeShield = itemId === 'shield_hex' ? 'hex' : 'cyan';
    }
    gameAudio.playLaserSound(0.9);
    this.updateShopUI();
    this.showToast("Скин кастомизации успешно применен!");
    await this.syncProfileWithServer();
  }

  // --- TEACHER ACTIONS ---

  async loadTeacherCourses() {
    const res = await this.apiCall(`/api/courses/list?user_id=${this.userId}&role=teacher`);
    const grid = document.getElementById('teacher-courses-grid');
    if (!grid) return;
    grid.innerHTML = "";

    if (res && res.status === 'success') {
      this.teacherCourses = res.courses;
    }

    if (this.teacherCourses.length === 0) {
      grid.innerHTML = `<p style="color:#8e8ab3; font-style:italic; font-size:0.8rem;">У вас пока нет созданных курсов.</p>`;
      return;
    }

    this.teacherCourses.forEach(c => {
      const card = document.createElement('div');
      card.className = "course-card";
      card.innerHTML = `
        <h4>${c.title}</h4>
        <p>Код: <strong class="text-glow-pink">${c.course_code}</strong></p>
        <p style="font-size:0.6rem; color:#686580; margin-top:5px;">Создан: ${new Date(c.created_at || Date.now()).toLocaleDateString()}</p>
      `;
      card.addEventListener('click', () => this.openTeacherCourseDetails(c));
      grid.appendChild(card);
    });
  }

  async openTeacherCourseDetails(course) {
    this.activeTeacherCourse = course;
    document.getElementById('teacher-main-view').classList.add('hidden');
    document.getElementById('teacher-course-detail-view').classList.remove('hidden');

    document.getElementById('teacher-active-course-title').innerText = course.title;
    document.getElementById('teacher-active-course-code').innerText = course.course_code;

    // Load Roster
    const res = await this.apiCall(`/api/courses/${course.id}/students`);
    const tbody = document.getElementById('teacher-roster-tbody');
    tbody.innerHTML = "";

    if (res && res.status === 'success' && res.students.length > 0) {
      res.students.forEach(st => {
        // Calculate grades string
        let gradesStr = "Нет оценок";
        if (st.progress && st.progress.length > 0) {
          const exams = st.progress.filter(p => p.type === 'test' || p.type === 'custom_quiz');
          if (exams.length > 0) {
            gradesStr = exams.map(e => `${e.subject}: ${e.score}/${e.max_score}`).slice(0, 3).join(', ');
          }
        }

        const tr = document.createElement('tr');
        tr.style.borderBottom = "1px solid rgba(255,255,255,0.03)";
        tr.innerHTML = `
          <td style="padding: 10px; color:#fff; font-weight:bold;">${st.full_name}</td>
          <td style="padding: 10px;">${st.xp} XP (Ур. ${st.level})</td>
          <td style="padding: 10px; color:var(--color-cyan);">${st.highscore.toLocaleString()}</td>
          <td style="padding: 10px;">${st.progress && st.progress.find(p => p.type === 'simulator')?.details?.accuracy || '0'}%</td>
          <td style="padding: 10px; color:#a5a2bf; max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${gradesStr}</td>
        `;
        tbody.appendChild(tr);
      });
    } else {
      tbody.innerHTML = `<tr><td colspan="5" style="padding: 15px; text-align:center; color:#8e8ab3; font-style:italic;">На этом курсе пока нет учеников. Поделитесь кодом для подключения!</td></tr>`;
    }
  }

  // --- PARENT ACTIONS ---

  async loadParentChildren() {
    const res = await this.apiCall(`/api/parent/children?parent_id=${this.userId}`);
    const container = document.getElementById('parent-children-container');
    if (!container) return;
    container.innerHTML = "";

    if (res && res.status === 'success') {
      this.linkedChildren = res.children;
    }

    if (this.linkedChildren.length === 0) {
      container.innerHTML = `<p style="color:#8e8ab3; font-style:italic; font-size:0.8rem; text-align:center;">Привязанных детских аккаунтов не найдено.</p>`;
      return;
    }

    this.linkedChildren.forEach(child => {
      // Find latest simulator performance
      const simRun = child.progress?.find(p => p.type === 'simulator');
      const latestAccuracy = simRun?.details?.accuracy || 0;
      const latestSpeed = simRun?.details?.avgSpeed || 0;

      const card = document.createElement('div');
      card.className = "child-progress-card";
      card.innerHTML = `
        <div class="child-card-header">
          <h3>${child.full_name}</h3>
          <span class="status-indicator">УРОВЕНЬ: ${child.level} (${child.xp} XP)</span>
        </div>
        <div class="child-stats-summary">
          <div class="child-stat-box-mini">
            <span class="lbl">Космо-Шарды</span>
            <span class="val text-glow-pink">${child.shards}</span>
          </div>
          <div class="child-stat-box-mini">
            <span class="lbl">Рекорд Симулятора</span>
            <span class="val text-glow-cyan">${child.highscore.toLocaleString()}</span>
          </div>
          <div class="child-stat-box-mini">
            <span class="lbl">Точность в бою</span>
            <span class="val" style="color:var(--color-green);">${latestAccuracy}%</span>
          </div>
          <div class="child-stat-box-mini">
            <span class="lbl">Реакция</span>
            <span class="val">${latestSpeed} мс</span>
          </div>
        </div>
        <div style="font-size:0.75rem; color:#8e8ab3; margin-top:5px;">
          <strong>Последняя успеваемость:</strong>
          <ul style="padding-left:15px; margin-top:4px;">
            ${child.progress?.slice(0, 3).map(p => `<li>${p.type === 'simulator' ? 'Симулятор' : p.subject}: ${p.score}/${p.max_score} (${new Date(p.timestamp).toLocaleDateString()})</li>`).join('') || '<li>Нет записей прогресса</li>'}
          </ul>
        </div>
      `;
      container.appendChild(card);
    });
  }

  // --- STUDENT ACTIONS ---

  async loadStudentCourses() {
    const res = await this.apiCall(`/api/courses/list?user_id=${this.userId}&role=student`);
    const ul = document.getElementById('student-courses-ul');
    const select = document.getElementById('student-active-course-select');
    if (!ul || !select) return;

    ul.innerHTML = "";
    select.innerHTML = `<option value="">-- Выберите курс --</option>`;

    let courses = [];
    if (res && res.status === 'success') {
      courses = res.courses;
    }

    if (courses.length === 0) {
      ul.innerHTML = `<li style="color:#8e8ab3; font-style:italic;">Вы пока не подключены ни к одному курсу. Получите код у преподавателя!</li>`;
      return;
    }

    courses.forEach(c => {
      const li = document.createElement('li');
      li.style.background = "rgba(255,255,255,0.02)";
      li.style.padding = "8px 12px";
      li.style.borderRadius = "4px";
      li.style.border = "1px solid rgba(255,255,255,0.05)";
      li.innerHTML = `<strong>${c.title}</strong> <span style="font-size:0.7rem; color:#8e8ab3; margin-left:10px;">(Преподаватель: ${c.teacher_name})</span>`;
      ul.appendChild(li);

      const opt = document.createElement('option');
      opt.value = c.id;
      opt.innerText = c.title;
      select.appendChild(opt);
    });
  }

  async loadCustomCourseContent(courseId) {
    const listArea = document.getElementById('custom-course-content-list');
    if (!listArea) return;
    listArea.innerHTML = "";

    if (!courseId) {
      listArea.innerHTML = `<p style="font-size:0.75rem; color:#8e8ab3; font-style:italic; text-align:center;">Выберите подключенный курс выше, чтобы загрузить задания.</p>`;
      return;
    }

    const res = await this.apiCall(`/api/courses/${courseId}/content`);
    if (res && res.status === 'success') {
      this.customCourseMaterials = res.materials;
      this.customCourseQuizzes = res.quizzes;

      if (res.materials.length === 0 && res.quizzes.length === 0) {
        listArea.innerHTML = `<p style="font-size:0.75rem; color:#8e8ab3; font-style:italic; text-align:center;">Преподаватель еще не добавил материалы для этого курса.</p>`;
        return;
      }

      // Render custom materials
      res.materials.forEach(m => {
        const btn = document.createElement('button');
        btn.className = "module-btn";
        btn.style.borderColor = "rgba(0, 243, 255, 0.2)";
        btn.innerHTML = `<span style="color:var(--color-cyan);">📖 ЛЕКЦИЯ:</span> ${m.title}`;
        btn.addEventListener('click', () => {
          this.activeSubject = 'custom_courses';
          this.activeModuleType = `material_${m.id}`;
          this.renderCustomMaterial(m);
        });
        listArea.appendChild(btn);
      });

      // Render custom quizzes
      res.quizzes.forEach(q => {
        const btn = document.createElement('button');
        btn.className = "module-btn";
        btn.style.borderColor = "rgba(255, 0, 127, 0.2)";
        btn.innerHTML = `<span style="color:var(--color-pink);">📝 ТЕСТ:</span> ${q.title}`;
        btn.addEventListener('click', () => {
          this.activeSubject = 'custom_courses';
          this.activeModuleType = `quiz_${q.id}`;
          this.renderCustomQuiz(q);
        });
        listArea.appendChild(btn);
      });
    }
  }

  renderCustomMaterial(mat) {
    const stage = document.getElementById('study-stage-content');
    stage.innerHTML = `
      <div class="notes-container">
        <h2>${mat.title}</h2>
        <p class="subtitle-text">Материал предоставлен вашим инструктором</p>
        <hr style="border:0; border-top:1px solid rgba(255,255,255,0.08); margin:20px 0;">
        <div style="font-size:0.95rem; line-height:1.6; color:#e0dff2;">
          ${mat.content}
        </div>
      </div>
    `;
    this.apiCall('/api/progress/submit', 'POST', {
      student_id: this.userId,
      subject: this.email,
      type: 'notes_read',
      score: 1,
      max_score: 1,
      details: { material_id: mat.id, title: mat.title }
    });
    this.awardXP(10);
  }

  renderCustomQuiz(quiz) {
    this.activeCustomQuiz = quiz;
    const stage = document.getElementById('study-stage-content');
    let examHTML = `
      <div class="test-stage-container">
        <div class="test-stage-header">
          <h2>${quiz.title}</h2>
          <p>${quiz.description || "Пройдите тест, созданный вашим учителем."}</p>
        </div>
        <div class="test-questions-scroller" style="margin-top:15px; max-height:400px; overflow-y:auto; padding-right:10px;">
          <form id="custom-exam-form" style="display:flex; flex-direction:column; gap:15px;">
    `;

    quiz.questions.forEach((q, idx) => {
      examHTML += `
        <div class="test-question-card glass-panel" style="padding:15px; border-radius:8px;" data-q-idx="${idx}">
          <span class="question-headline" style="display:block; font-weight:bold; margin-bottom:10px;">${idx + 1}. ${q.text}</span>
          <div class="test-answers-grid" style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
            ${q.options.map((opt, oIdx) => `
              <label class="test-option" style="display:flex; align-items:center; gap:8px; padding:10px; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); border-radius:6px; cursor:pointer;">
                <input type="radio" name="question_${idx}" value="${oIdx}">
                ${opt}
              </label>
            `).join('')}
          </div>
        </div>
      `;
    });

    examHTML += `
          </form>
        </div>
        <div class="test-submit-footer" style="margin-top:20px;">
          <button class="btn primary-btn pulse-glow" id="btn-submit-custom-exam" style="width:100%;">СДАТЬ ТЕСТ</button>
        </div>
      </div>
    `;

    stage.innerHTML = examHTML;

    stage.querySelectorAll('.test-question-card').forEach(card => {
      const options = card.querySelectorAll('.test-option');
      options.forEach(opt => {
        opt.addEventListener('click', () => {
          options.forEach(o => {
            o.classList.remove('selected');
            o.style.borderColor = 'rgba(255,255,255,0.05)';
            o.style.background = 'rgba(255,255,255,0.02)';
          });
          opt.classList.add('selected');
          opt.style.borderColor = 'var(--color-cyan)';
          opt.style.background = 'rgba(0, 243, 255, 0.05)';
        });
      });
    });

    stage.querySelector('#btn-submit-custom-exam').addEventListener('click', () => this.evaluateCustomQuiz());
  }

  async evaluateCustomQuiz() {
    const quiz = this.activeCustomQuiz;
    const form = document.getElementById('custom-exam-form');
    const formData = new FormData(form);
    
    let correct = 0;
    const details = [];

    quiz.questions.forEach((q, idx) => {
      const selectedVal = formData.get(`question_${idx}`);
      const isAnswered = selectedVal !== null;
      const selected = isAnswered ? parseInt(selectedVal, 10) : -1;
      const isCorrect = (selected === q.answerIdx);
      if (isCorrect) correct++;
      
      details.push({
        num: idx + 1,
        isCorrect,
        statusText: isCorrect ? "Верно ✓" : (isAnswered ? "Ошибка ✗" : "Пропущено ✗"),
        correctOption: q.options[q.answerIdx]
      });
    });

    const total = quiz.questions.length;
    const pct = Math.round((correct / total) * 100);

    // Save to server
    await this.apiCall('/api/progress/submit', 'POST', {
      student_id: this.userId,
      subject: quiz.title,
      type: 'custom_quiz',
      score: correct,
      max_score: total,
      details: { quiz_id: quiz.id, percentage: pct }
    });

    // Reward
    this.shards += correct * 5;
    this.awardXP(correct * 15);

    const stage = document.getElementById('study-stage-content');
    const isPassed = pct >= 60;
    
    let feedback = `
      <div class="results-board" style="text-align:center;">
        <h2 class="${isPassed ? 'text-glow-cyan' : 'text-glow-pink'}">РЕЗУЛЬТАТ: ${correct} / ${total} (${pct}%)</h2>
        <p class="subtitle">${isPassed ? "Вы успешно прошли тест преподавателя!" : "Рекомендуем пересдать тест для улучшения баллов."}</p>
        <div class="graded-list" style="margin-top:20px; display:flex; flex-direction:column; gap:8px;">
          ${details.map(d => `
            <div class="graded-item" style="display:flex; justify-content:space-between; padding:8px 12px; background:rgba(255,255,255,0.02); border-radius:4px; font-size:0.8rem;">
              <span>Вопрос ${d.num}</span>
              <div>
                <span style="color:${d.isCorrect ? 'var(--color-green)' : 'var(--color-pink)'}; font-weight:bold;">${d.statusText}</span>
                ${!d.isCorrect ? `<span style="color:#8e8ab3; margin-left:10px;">(Верно: ${d.correctOption})</span>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
        <button class="btn secondary-btn" id="btn-results-back" style="margin-top: 30px; width:100%;">НАЗАД К ОБУЧЕНИЮ</button>
      </div>
    `;

    stage.innerHTML = feedback;
    stage.querySelector('#btn-results-back').addEventListener('click', () => {
      this.loadCustomCourseContent(document.getElementById('student-active-course-select').value);
    });
  }

  // --- STUDY TAB WIDGETS ---

  renderStudyStageContent() {
    const stage = document.getElementById('study-stage-content');
    if (!stage) return;
    stage.innerHTML = "";

    // If custom courses subject is active
    if (this.activeSubject === 'custom_courses') {
      const activeId = document.getElementById('student-active-course-select').value;
      this.loadCustomCourseContent(activeId);
      return;
    }

    const data = getSubjectData(this.activeSubject, this.activeTopic);

    if (this.activeModuleType === 'notes') {
      const notes = data.notes;
      let notesHTML = `
        <div class="notes-container">
          <h2>${notes.title}</h2>
          <p class="subtitle-text">${notes.subtitle}</p>
          <hr style="border: 0; border-top: 1px solid rgba(255,255,255,0.08); margin: 20px 0;">
      `;

      notes.sections.forEach(sec => {
        notesHTML += `
          <h3>${sec.heading}</h3>
          <p style="margin-bottom:10px; font-size:0.85rem; line-height:1.6; color:#dbdaea;">${sec.text}</p>
        `;
        if (sec.formula) {
          notesHTML += `
            <div class="notes-formula-box" style="margin-bottom:15px; padding:10px 15px; background:rgba(0,0,0,0.3); border-left:3px solid var(--color-cyan); border-radius:4px;">
              <p style="font-family:'Orbitron', sans-serif; color:var(--color-cyan); font-weight:bold; font-size:1.05rem;">${sec.formula}</p>
              <div class="desc" style="font-size:0.75rem; color:#8e8ab3; margin-top:4px;">${sec.formulaDesc || ""}</div>
            </div>
          `;
        }
      });

      // INJECT DYNAMIC SIMULATOR SANDBOX WIDGETS
      if (this.activeSubject === 'math' && this.activeTopic === '1') {
        notesHTML += `
          <div class="math-sandbox glass-panel">
            <h4>📐 ИНТЕРАКТИВНЫЙ СТЕНД: РЕШЕНИЕ УРАВНЕНИЙ</h4>
            <p style="font-size:0.75rem; color:#a5a2bf; margin-bottom:10px;">Двигайте ползунки, чтобы изменить параметры линейного уравнения <strong>ax + b = c</strong> и увидеть смещение корня на числовой оси:</p>
            
            <div class="math-sliders">
              <div class="math-slider-row">
                <span>Коэффициент a:</span>
                <input type="range" id="ws-math-a" min="1" max="10" value="${this.mathSandboxParams.a}">
                <span id="ws-math-val-a">${this.mathSandboxParams.a}</span>
              </div>
              <div class="math-slider-row">
                <span>Слагаемое b:</span>
                <input type="range" id="ws-math-b" min="-15" max="15" value="${this.mathSandboxParams.b}">
                <span id="ws-math-val-b">${this.mathSandboxParams.b}</span>
              </div>
              <div class="math-slider-row">
                <span>Результат c:</span>
                <input type="range" id="ws-math-c" min="1" max="30" value="${this.mathSandboxParams.c}">
                <span id="ws-math-val-c">${this.mathSandboxParams.c}</span>
              </div>
            </div>

            <div class="notes-formula-box" style="margin:10px 0; background:rgba(0,0,0,0.25); border-left:3px solid var(--color-cyan); padding:10px;">
              <p style="font-size:1.1rem; color:var(--color-cyan); font-family:'Orbitron', sans-serif;" id="ws-math-equation-solved">2x + 4 = 10 ➔ x = 3</p>
            </div>

            <div class="math-number-line" style="height:35px; border:1px solid rgba(255,255,255,0.08); position:relative; margin-top:10px; background:rgba(255,255,255,0.01); border-radius:4px;">
              <div class="math-root-marker" id="ws-math-root-marker" style="width:12px; height:12px; border-radius:50%; background:var(--color-pink); position:absolute; top:11px; left:50%; box-shadow:0 0 10px var(--color-pink-glow); transform:translateX(-50%); transition: left 0.2s;"></div>
              <div class="math-line-scale-text scale-left" style="position:absolute; left:5%; top:10px; font-size:0.6rem; color:#8e8ab3;">-10</div>
              <div class="math-line-scale-text scale-center" style="position:absolute; left:50%; top:10px; font-size:0.6rem; color:#8e8ab3; transform:translateX(-50%);">0</div>
              <div class="math-line-scale-text scale-right" style="position:absolute; right:5%; top:10px; font-size:0.6rem; color:#8e8ab3;">10</div>
            </div>
          </div>
        `;
      } 
      else if (this.activeSubject === 'physics' && this.activeTopic === '3') {
        notesHTML += `
          <div class="physics-sandbox glass-panel" style="padding:20px; background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.05); border-radius:10px; margin-top:20px; display:flex; flex-direction:column; gap:15px;">
            <h4>⚡ ЛАБОРАТОРНЫЙ СТЕНД: ЦЕПЬ ТОКА (ЗАКОН ОМА)</h4>
            <p style="font-size:0.75rem; color:#a5a2bf;">Регулируйте Напряжение (V) и Сопротивление (R). Наблюдайте скорость движения неоновых электронов в проводнике!</p>
            
            <div class="phys-sliders" style="display:flex; flex-direction:column; gap:12px;">
              <div class="phys-slider-row" style="display:grid; grid-template-columns:120px 1fr 50px; align-items:center; font-size:0.8rem;">
                <span>Напряжение V (Вольты):</span>
                <input type="range" id="ws-phys-v" min="0" max="24" value="${this.physSandboxParams.V}">
                <span id="ws-phys-val-v">${this.physSandboxParams.V} В</span>
              </div>
              <div class="phys-slider-row" style="display:grid; grid-template-columns:120px 1fr 50px; align-items:center; font-size:0.8rem;">
                <span>Сопротивление R (Омы):</span>
                <input type="range" id="ws-phys-r" min="1" max="12" value="${this.physSandboxParams.R}">
                <span id="ws-phys-val-r">${this.physSandboxParams.R} Ом</span>
              </div>
            </div>

            <div class="notes-formula-box" style="margin:10px 0; background:rgba(0,0,0,0.25); border-left:3px solid var(--color-green); padding:10px;">
              <p style="font-size:1.1rem; color:var(--color-green); font-family:'Orbitron', sans-serif;" id="ws-phys-current-solved">Ток I = V / R = 2.00 Ампер</p>
            </div>

            <div class="circuit-wire-loop" style="height:40px; border:2px solid rgba(255,255,255,0.06); border-radius:20px; position:relative; overflow:hidden; background:rgba(0,0,0,0.3); display:flex; align-items:center;">
              <div class="neon-electron e1" style="width:10px; height:10px; border-radius:50%; background:var(--color-green); position:absolute; left:10%; animation: electronFlow 2s linear infinite; box-shadow:0 0 8px var(--color-green-glow);"></div>
              <div class="neon-electron e2" style="width:10px; height:10px; border-radius:50%; background:var(--color-green); position:absolute; left:35%; animation: electronFlow 2s linear infinite; box-shadow:0 0 8px var(--color-green-glow);"></div>
              <div class="neon-electron e3" style="width:10px; height:10px; border-radius:50%; background:var(--color-green); position:absolute; left:60%; animation: electronFlow 2s linear infinite; box-shadow:0 0 8px var(--color-green-glow);"></div>
              <div class="neon-electron e4" style="width:10px; height:10px; border-radius:50%; background:var(--color-green); position:absolute; left:85%; animation: electronFlow 2s linear infinite; box-shadow:0 0 8px var(--color-green-glow);"></div>
            </div>
            <style>
              @keyframes electronFlow {
                0% { transform: translateX(0); }
                100% { transform: translateX(300px); }
              }
            </style>
          </div>
        `;
      } 
      else if (this.activeSubject === 'cs' && this.activeTopic === '2') {
        notesHTML += `
          <div class="cs-sandbox glass-panel" style="padding:20px; background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.05); border-radius:10px; margin-top:20px; display:flex; flex-direction:column; gap:15px;">
            <h4>💻 СХЕМА ЛОГИЧЕСКИХ ВЕНТИЛЕЙ</h4>
            <p style="font-size:0.75rem; color:#a5a2bf;">Переключайте двоичные входы A и B. Выберите вентиль, чтобы увидеть прохождение сигнала на светодиод!</p>
            
            <div class="logic-gate-diagram" style="display:flex; flex-direction:column; gap:15px; align-items:center;">
              <div class="logic-inputs-panel" style="display:flex; gap:20px;">
                <div class="logic-input-switch" style="display:flex; align-items:center; gap:8px;">
                  <span>Вход A:</span>
                  <button class="btn secondary-btn switch-btn ${this.csSandboxParams.A ? 'active' : ''}" id="ws-cs-btn-a" style="padding:4px 10px; font-size:0.75rem; width:80px;">${this.csSandboxParams.A ? '1 (TRUE)' : '0 (FALSE)'}</button>
                </div>
                <div class="logic-input-switch" style="display:flex; align-items:center; gap:8px;">
                  <span>Вход B:</span>
                  <button class="btn secondary-btn switch-btn ${this.csSandboxParams.B ? 'active' : ''}" id="ws-cs-btn-b" style="padding:4px 10px; font-size:0.75rem; width:80px;">${this.csSandboxParams.B ? '1 (TRUE)' : '0 (FALSE)'}</button>
                </div>
              </div>

              <div class="logic-selector-inline" style="display:flex; gap:10px;">
                <button class="btn secondary-btn ${this.csSandboxParams.gate === 'AND' ? 'active' : ''}" id="ws-cs-gate-and" style="padding:4px 8px; font-size:0.7rem;">AND (И)</button>
                <button class="btn secondary-btn ${this.csSandboxParams.gate === 'OR' ? 'active' : ''}" id="ws-cs-gate-or" style="padding:4px 8px; font-size:0.7rem;">OR (ИЛИ)</button>
                <button class="btn secondary-btn ${this.csSandboxParams.gate === 'XOR' ? 'active' : ''}" id="ws-cs-gate-xor" style="padding:4px 8px; font-size:0.7rem;">XOR</button>
              </div>

              <div style="display:flex; align-items:center; gap:25px; margin-top:5px;">
                <div class="logic-gate-chip" id="ws-cs-gate-title" style="padding:15px 25px; background:rgba(0,0,0,0.5); border:1px solid rgba(255,255,255,0.1); border-radius:5px; font-family:'Orbitron', sans-serif; font-weight:bold; color:var(--color-pink); text-shadow:0 0 5px var(--color-pink-glow); font-size:1.1rem;">
                  ${this.csSandboxParams.gate}
                </div>
                <div style="font-size:1.5rem; color:#8e8ab3;">➔</div>
                <div class="logic-output-display" style="display:flex; align-items:center; gap:10px;">
                  <span style="font-size:0.75rem; color:#8e8ab3;">ВЫХОД:</span>
                  <div class="neon-light-bulb" id="ws-cs-light-bulb" style="width:24px; height:24px; border-radius:50%; background:#3a3a3a; box-shadow:inset 0 0 5px rgba(0,0,0,0.5); transition:background 0.25s, box-shadow 0.25s;"></div>
                </div>
              </div>
            </div>
          </div>
        `;
      }

      notesHTML += `</div>`;
      stage.innerHTML = notesHTML;

      // Bind sandbox widgets events
      if (this.activeSubject === 'math' && this.activeTopic === '1') this.bindMathSandboxEvents();
      if (this.activeSubject === 'physics' && this.activeTopic === '3') this.bindPhysicsSandboxEvents();
      if (this.activeSubject === 'cs' && this.activeTopic === '2') this.bindCsSandboxEvents();
    } 
    else {
      // Draw written exam form
      const exam = data.exam;
      let examHTML = `
        <div class="test-stage-container">
          <div class="test-stage-header">
            <h2>${exam.title}</h2>
            <p>${exam.desc}</p>
          </div>
          <div class="test-questions-scroller" style="margin-top:20px; max-height:420px; overflow-y:auto; padding-right:10px;">
            <form id="study-exam-form" style="display:flex; flex-direction:column; gap:15px;">
      `;

      exam.questions.forEach((q, idx) => {
        examHTML += `
          <div class="test-question-card glass-panel" style="padding:15px; border-radius:8px;" data-q-idx="${idx}">
            <span class="question-headline" style="display:block; font-weight:bold; margin-bottom:10px;">${idx + 1}. ${q.text}</span>
            <div class="test-answers-grid" style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
              ${q.options.map((opt, oIdx) => `
                <label class="test-option" style="display:flex; align-items:center; gap:8px; padding:10px; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); border-radius:6px; cursor:pointer;">
                  <input type="radio" name="question_${idx}" value="${oIdx}">
                  ${opt}
                </label>
              `).join('')}
            </div>
          </div>
        `;
      });

      examHTML += `
            </form>
          </div>
          <div class="test-submit-footer" style="margin-top:20px;">
            <button class="btn primary-btn pulse-glow" id="btn-submit-exam" style="width:100%;">СДАТЬ ЭКЗАМЕН</button>
          </div>
        </div>
      `;

      stage.innerHTML = examHTML;

      stage.querySelectorAll('.test-question-card').forEach(card => {
        const options = card.querySelectorAll('.test-option');
        options.forEach(opt => {
          opt.addEventListener('click', () => {
            options.forEach(o => {
              o.classList.remove('selected');
              o.style.borderColor = 'rgba(255,255,255,0.05)';
              o.style.background = 'rgba(255,255,255,0.02)';
            });
            opt.classList.add('selected');
            opt.style.borderColor = 'var(--color-cyan)';
            opt.style.background = 'rgba(0, 243, 255, 0.05)';
          });
        });
      });

      stage.querySelector('#btn-submit-exam').addEventListener('click', () => {
        this.evaluateExam(exam);
      });
    }
  }

  // --- STEM SANDBOX ACTIVE CALCULATORS ---

  bindMathSandboxEvents() {
    const sA = document.getElementById('ws-math-a');
    const sB = document.getElementById('ws-math-b');
    const sC = document.getElementById('ws-math-c');

    const updateMathSandbox = () => {
      const a = parseInt(sA.value, 10);
      const b = parseInt(sB.value, 10);
      const c = parseInt(sC.value, 10);
      
      this.mathSandboxParams = { a, b, c };

      document.getElementById('ws-math-val-a').innerText = a;
      document.getElementById('ws-math-val-b').innerText = b;
      document.getElementById('ws-math-val-c').innerText = c;

      const root = (c - b) / a;
      const roundedRoot = Math.round(root * 100) / 100;
      
      const plusSign = b >= 0 ? '+' : '-';
      const absB = Math.abs(b);
      document.getElementById('ws-math-equation-solved').innerText = `${a}x ${plusSign} ${absB} = ${c} ➔ x = ${roundedRoot}`;

      let leftPct = 50;
      if (roundedRoot <= -10) leftPct = 5;
      else if (roundedRoot >= 10) leftPct = 95;
      else {
        leftPct = 50 + (roundedRoot / 10) * 45;
      }
      
      document.getElementById('ws-math-root-marker').style.left = `${leftPct}%`;
    };

    sA.addEventListener('input', updateMathSandbox);
    sB.addEventListener('input', updateMathSandbox);
    sC.addEventListener('input', updateMathSandbox);
    updateMathSandbox();
  }

  bindPhysicsSandboxEvents() {
    const sV = document.getElementById('ws-phys-v');
    const sR = document.getElementById('ws-phys-r');

    const updatePhysicsSandbox = () => {
      const V = parseInt(sV.value, 10);
      const R = parseInt(sR.value, 10);

      this.physSandboxParams = { V, R };

      document.getElementById('ws-phys-val-v').innerText = `${V} В`;
      document.getElementById('ws-phys-val-r').innerText = `${R} Ом`;

      const I = V / R;
      document.getElementById('ws-phys-current-solved').innerText = `Ток I = V / R = ${I.toFixed(2)} Ампер`;

      const electrons = document.querySelectorAll('.neon-electron');
      
      if (I === 0) {
        electrons.forEach(el => {
          el.style.animationPlayState = 'paused';
          el.style.opacity = '0.2';
        });
      } else {
        const duration = Math.max(0.2, Math.min(6, 1.8 / I));
        electrons.forEach(el => {
          el.style.animationPlayState = 'running';
          el.style.animationDuration = `${duration}s`;
          el.style.opacity = '1.0';
          const glowIntensity = Math.min(25, 4 + I * 0.8);
          el.style.boxShadow = `0 0 ${glowIntensity}px var(--color-green)`;
        });
      }
    };

    sV.addEventListener('input', updatePhysicsSandbox);
    sR.addEventListener('input', updatePhysicsSandbox);
    updatePhysicsSandbox();
  }

  bindCsSandboxEvents() {
    const btnA = document.getElementById('ws-cs-btn-a');
    const btnB = document.getElementById('ws-cs-btn-b');
    
    const gateAnd = document.getElementById('ws-cs-gate-and');
    const gateOr = document.getElementById('ws-cs-gate-or');
    const gateXor = document.getElementById('ws-cs-gate-xor');

    const updateCsSandbox = () => {
      const A = this.csSandboxParams.A;
      const B = this.csSandboxParams.B;
      const gate = this.csSandboxParams.gate;

      btnA.innerText = A ? '1 (TRUE)' : '0 (FALSE)';
      btnA.className = `btn secondary-btn switch-btn ${A ? 'active' : ''}`;
      
      btnB.innerText = B ? '1 (TRUE)' : '0 (FALSE)';
      btnB.className = `btn secondary-btn switch-btn ${B ? 'active' : ''}`;

      document.getElementById('ws-cs-gate-title').innerText = gate;

      gateAnd.className = `btn secondary-btn ${gate === 'AND' ? 'active' : ''}`;
      gateOr.className = `btn secondary-btn ${gate === 'OR' ? 'active' : ''}`;
      gateXor.className = `btn secondary-btn ${gate === 'XOR' ? 'active' : ''}`;

      let out = false;
      if (gate === 'AND') out = A && B;
      else if (gate === 'OR') out = A || B;
      else out = A !== B;

      const bulb = document.getElementById('ws-cs-light-bulb');
      if (out) {
        bulb.style.background = 'var(--color-pink)';
        bulb.style.boxShadow = '0 0 15px var(--color-pink-glow)';
      } else {
        bulb.style.background = '#3a3a3a';
        bulb.style.boxShadow = 'none';
      }
    };

    btnA.addEventListener('click', () => {
      this.csSandboxParams.A = !this.csSandboxParams.A;
      gameAudio.playLaserSound(1.0);
      updateCsSandbox();
    });

    btnB.addEventListener('click', () => {
      this.csSandboxParams.B = !this.csSandboxParams.B;
      gameAudio.playLaserSound(1.0);
      updateCsSandbox();
    });

    const setGate = (gName) => {
      this.csSandboxParams.gate = gName;
      gameAudio.playUpgradeSound();
      updateCsSandbox();
    };

    gateAnd.addEventListener('click', () => setGate('AND'));
    gateOr.addEventListener('click', () => setGate('OR'));
    gateXor.addEventListener('click', () => setGate('XOR'));

    updateCsSandbox();
  }

  // --- EXAM GRADER & SAVER ---

  async evaluateExam(exam) {
    const form = document.getElementById('study-exam-form');
    const formData = new FormData(form);
    
    let correctCount = 0;
    const reportList = [];

    exam.questions.forEach((q, idx) => {
      const selectedStr = formData.get(`question_${idx}`);
      const isAnswered = selectedStr !== null;
      const selected = isAnswered ? parseInt(selectedStr, 10) : -1;
      const isCorrect = (selected === q.answerIdx);
      
      if (isCorrect) correctCount++;

      reportList.push({
        num: idx + 1,
        isCorrect: isCorrect,
        statusText: isCorrect ? "Верно ✓" : (isAnswered ? "Ошибка ✗" : "Пропущено ✗"),
        rightAnswer: q.options[q.answerIdx]
      });
    });

    const totalQuestions = exam.questions.length;
    const finalScorePct = Math.round((correctCount / totalQuestions) * 100);

    const gradeCode = `${this.activeSubject}_${this.activeTopic}`;
    this.mockGrades[gradeCode] = finalScorePct;
    this.shards += correctCount * 3;
    
    // Save to backend SQLite
    await this.apiCall('/api/progress/submit', 'POST', {
      student_id: this.userId,
      subject: `${this.activeSubject.toUpperCase()} Раздел ${this.activeTopic}`,
      type: 'test',
      score: correctCount,
      max_score: totalQuestions,
      details: { percentage: finalScorePct }
    });

    // Award XP
    const xpReward = correctCount * 10;
    await this.awardXP(xpReward);

    const stage = document.getElementById('study-stage-content');
    let isPassed = finalScorePct >= 60;
    let message = finalScorePct === 100 ? "Идеальный квалификационный балл! Грант одобрен на 100%!" :
                  (finalScorePct >= 70 ? "Отличный уровень знаний STEM! Кандидат рекомендован к поощрению." :
                  (isPassed ? "Экзамен успешно сдан!" : "Недостаточно для сдачи. Рекомендуем повторить лекцию."));

    let feedbackHTML = `
      <div class="results-board" style="text-align:center;">
        <h2 class="${isPassed ? 'text-glow-cyan' : 'text-glow-pink'}">ОЦЕНКА: ${correctCount} / ${totalQuestions} (${finalScorePct}%)</h2>
        <p class="subtitle">${message}</p>
        
        <div class="graded-list" style="margin-top:20px; display:flex; flex-direction:column; gap:8px;">
          ${reportList.map(r => `
            <div class="graded-item" style="display:flex; justify-content:space-between; padding:8px 12px; background:rgba(255,255,255,0.02); border-radius:4px; font-size:0.8rem;">
              <span>Вопрос ${r.num}</span>
              <div>
                <span style="color:${r.isCorrect ? 'var(--color-green)' : 'var(--color-pink)'}; font-weight:bold;">${r.statusText}</span>
                ${!r.isCorrect ? `<span style="font-size:0.75rem; color:#8a88a0; margin-left:10px;">(Правильно: ${r.rightAnswer})</span>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
    `;

    if (finalScorePct >= 80) {
      feedbackHTML += `
        <div class="certificate-award" style="margin-top:20px; border:1px solid var(--color-cyan); padding:15px; border-radius:8px; background:rgba(0, 243, 255, 0.05); text-align:center;">
          <h3 style="color:var(--color-cyan); font-family:'Orbitron', sans-serif;">🎖 ЗВЕЗДНЫЙ STEM-СЕРТИФИКАТ</h3>
          <p style="font-size:0.75rem; margin-top:5px; color:#dbdaea;">Курсант успешно квалифицировался по теме <strong>"${exam.title}"</strong> с отличием (${finalScorePct}%).</p>
        </div>
      `;
      gameAudio.playUpgradeSound();
    } else if (isPassed) {
      gameAudio.playCorrectSound();
    } else {
      gameAudio.playWrongSound();
    }

    feedbackHTML += `
        <button class="btn secondary-btn" id="btn-results-back" style="margin-top: 30px; width:100%;">НАЗАД К ТЕОРИИ</button>
      </div>
    `;

    stage.innerHTML = feedbackHTML;

    stage.querySelector('#btn-results-back').addEventListener('click', () => {
      this.activeModuleType = 'notes';
      this.renderStudyStageContent();
    });

    this.showToast(`Результаты теста записаны: ${finalScorePct}%`);
  }

  // --- GAMEPLAY SYNC ---

  async handleGameFinished(score, wave, shards, accuracy, solvedCount, avgSpeed) {
    this.shards += shards;
    
    let isRecord = false;
    if (score > this.highscore) {
      this.highscore = score;
      isRecord = true;
    }

    // Submit metrics to backend SQLite
    await this.apiCall('/api/progress/submit', 'POST', {
      student_id: this.userId,
      subject: document.querySelector('#sim-topic-group button.active')?.innerText || 'Simulator Flight',
      type: 'simulator',
      score: score,
      max_score: score,
      details: { accuracy, solvedCount, avgSpeed, wave }
    });

    const flightXP = accuracy + wave * 10;
    await this.awardXP(flightXP);

    document.getElementById('go-score').innerText = score.toLocaleString();
    document.getElementById('go-wave').innerText = wave;
    document.getElementById('go-shards').innerText = shards;
    
    const accuracyEl = document.getElementById('go-accuracy');
    accuracyEl.innerText = `${accuracy}%`;
    accuracyEl.style.color = accuracy >= 80 ? '#39ff14' : (accuracy >= 50 ? '#00f3ff' : '#ff007f');

    document.getElementById('sim-active-container').classList.add('hidden');
    document.getElementById('game-over-screen').classList.remove('hidden');
  }

  // --- GRADEBOOK COCKPIT ---

  async updateGradebookCockpit() {
    // Attempt to pull latest progress
    const progress = await this.apiCall(`/api/progress/get?student_id=${this.userId}`);
    let mathScore = null;
    let physScore = null;
    let csScore = null;

    if (progress && progress.status === 'success') {
      const tests = progress.progress.filter(p => p.type === 'test');
      
      const mathTests = tests.filter(p => p.subject.includes('MATH'));
      if (mathTests.length > 0) {
        mathScore = Math.round(mathTests.reduce((acc, c) => acc + (c.score/c.max_score)*100, 0) / mathTests.length);
      }
      const physTests = tests.filter(p => p.subject.includes('PHYSICS'));
      if (physTests.length > 0) {
        physScore = Math.round(physTests.reduce((acc, c) => acc + (c.score/c.max_score)*100, 0) / physTests.length);
      }
      const csTests = tests.filter(p => p.subject.includes('CS'));
      if (csTests.length > 0) {
        csScore = Math.round(csTests.reduce((acc, c) => acc + (c.score/c.max_score)*100, 0) / csTests.length);
      }
    }

    const setBar = (barId, valId, val) => {
      const bar = document.getElementById(barId);
      const txt = document.getElementById(valId);
      if (!bar || !txt) return;
      if (val === null) {
        bar.style.width = '0%'; txt.innerText = "НЕ СДАНО"; txt.className = "item-score text-glow-pink";
      } else {
        bar.style.width = `${val}%`; txt.innerText = `${val}%`; txt.className = val >= 60 ? "item-score text-glow-cyan" : "item-score text-glow-pink";
      }
    };

    setBar('grade-math-bar', 'grade-math-val', mathScore);
    setBar('grade-physics-bar', 'grade-physics-val', physScore);
    setBar('grade-cs-bar', 'grade-cs-val', csScore);

    // Update flight metrics
    document.getElementById('analytics-highscore').innerText = this.highscore.toLocaleString();
    
    // Fill strengths
    const fillRadar = (barId, val) => {
      const el = document.getElementById(barId);
      if (el) el.style.width = `${val}%`;
    };
    fillRadar('radar-bar-calc', mathScore || 0);
    fillRadar('radar-bar-logic', csScore || 0);
    fillRadar('radar-bar-phys', physScore || 0);
    fillRadar('radar-bar-code', csScore || 0);
  }

  simulateReportCardDownload() {
    this.showToast("Формирование отчетного табеля...");
    gameAudio.playUpgradeSound();

    setTimeout(() => {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({
        student: this.fullName,
        email: this.email,
        level: this.level,
        rank: this.rankTitle,
        reportDate: new Date().toLocaleDateString(),
        highScoreRecord: this.highscore,
        coinBalance: this.shards
      }, null, 2));
      
      const dl = document.createElement('a');
      dl.setAttribute("href", dataStr);
      dl.setAttribute("download", `${this.fullName.replace(/\s+/g, '_')}_StarAcademy_Report.json`);
      document.body.appendChild(dl);
      dl.click();
      dl.remove();
      this.showToast("Отчетный табель успешно сохранен!");
    }, 1200);
  }

  showToast(msg) {
    const toast = document.getElementById('toast-notification');
    if (!toast) return;
    toast.innerText = msg;
    toast.classList.remove('hidden');
    setTimeout(() => {
      toast.classList.add('hidden');
    }, 2500);
  }

  // --- DOM EVENTS BINDINGS ---

  initListeners() {
    // Authorization overlays switcher
    const tabLogin = document.getElementById('auth-tab-login');
    const tabRegister = document.getElementById('auth-tab-register');
    const formLogin = document.getElementById('auth-login-form');
    const formRegister = document.getElementById('auth-register-form');

    if (tabLogin && tabRegister && formLogin && formRegister) {
      tabLogin.addEventListener('click', () => {
        tabLogin.classList.add('active');
        tabLogin.style.borderBottomColor = 'var(--color-cyan)';
        tabLogin.style.color = '#fff';
        tabRegister.classList.remove('active');
        tabRegister.style.borderBottomColor = 'transparent';
        tabRegister.style.color = '#8e8ab3';
        formLogin.style.display = 'flex';
        formLogin.classList.remove('hidden');
        formRegister.style.display = 'none';
        formRegister.classList.add('hidden');
        gameAudio.playLaserSound(1.0);
      });

      tabRegister.addEventListener('click', () => {
        tabRegister.classList.add('active');
        tabRegister.style.borderBottomColor = 'var(--color-cyan)';
        tabRegister.style.color = '#fff';
        tabLogin.classList.remove('active');
        tabLogin.style.borderBottomColor = 'transparent';
        tabLogin.style.color = '#8e8ab3';
        formRegister.style.display = 'flex';
        formRegister.classList.remove('hidden');
        formLogin.style.display = 'none';
        formLogin.classList.add('hidden');
        gameAudio.playLaserSound(1.0);
      });
    }

    // Sign In API Connection
    if (formLogin) {
      formLogin.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        
        const res = await this.apiCall('/api/login', 'POST', { email, password });
        if (res && res.status === 'success') {
          this.applyUserSession(res.user);
          this.showToast("Добро пожаловать в Star Academy!");
          gameAudio.playUpgradeSound();
        } else {
          gameAudio.playWrongSound();
          alert(res ? res.message : "Не удается подключиться к серверу. Попробуйте режим Гостя.");
        }
      });
    }

    // Sign Up API Connection
    if (formRegister) {
      formRegister.addEventListener('submit', async (e) => {
        e.preventDefault();
        const full_name = document.getElementById('register-name').value;
        const email = document.getElementById('register-email').value;
        const password = document.getElementById('register-password').value;
        const role = document.getElementById('register-role').value;

        if (password.length < 6) {
          alert("Пароль должен содержать не менее 6 символов");
          return;
        }

        const res = await this.apiCall('/api/register', 'POST', { full_name, email, password, role });
        if (res && res.status === 'success') {
          this.showToast("Регистрация успешна! Теперь выполните вход.");
          tabLogin.click();
          gameAudio.playUpgradeSound();
        } else {
          gameAudio.playWrongSound();
          alert(res ? res.message : "Ошибка регистрации. Проверьте соединение.");
        }
      });
    }

    // Guest Auth Fallback
    const btnGuest = document.getElementById('btn-auth-guest');
    if (btnGuest) {
      btnGuest.addEventListener('click', () => {
        this.applyUserSession({
          id: 9999,
          full_name: "Гость Академии",
          email: "guest@staracademy.edu",
          role: "student",
          xp: 0,
          level: 1,
          shards: 10,
          highscore: 0,
          unlocked_items: ["flame_pink"],
          active_flame: "flame_pink",
          active_shield: "cyan"
        });
        this.showToast("Запущено в автономном режиме Гостя.");
        gameAudio.playUpgradeSound();
      });
    }

    // Log Out
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
      btnLogout.addEventListener('click', () => {
        localStorage.removeItem('star_user_session');
        this.userId = null;
        this.fullName = '';
        this.email = '';
        this.userRole = 'student';
        this.updateHeaderSessionUI();
        gameAudio.playWrongSound();
      });
    }

    // Navigation Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.switchTab(btn.getAttribute('data-tab'));
        gameAudio.playLaserSound(1.1);
      });
    });

    // Profile Ranks Changer
    document.querySelectorAll('.role-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.switchRole(btn.getAttribute('data-role'));
        gameAudio.playUpgradeSound();
      });
    });

    // Accordion Panes
    document.querySelectorAll('.accordion-bar').forEach(bar => {
      bar.addEventListener('click', () => {
        const item = bar.parentElement;
        const currentActive = item.classList.contains('active');
        
        document.querySelectorAll('.accordion-panel').forEach(p => {
          p.classList.remove('active');
          const chev = p.querySelector('.chevron');
          if (chev) chev.textContent = '▼';
        });

        if (!currentActive) {
          item.classList.add('active');
          const chev = bar.querySelector('.chevron');
          if (chev) chev.textContent = '▲';
          this.activeSubject = item.getAttribute('data-subject');
          
          item.querySelectorAll('.module-btn').forEach(b => b.classList.remove('active'));
          const notesBtn = item.querySelector('[data-type=notes]');
          if (notesBtn) notesBtn.classList.add('active');
          this.activeModuleType = 'notes';
          this.renderStudyStageContent();
        }
        gameAudio.playLaserSound(0.95);
      });
    });

    // Module change click triggers (Notes vs practice)
    document.querySelectorAll('.module-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const panel = btn.closest('.accordion-panel');
        panel.querySelectorAll('.module-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        this.activeSubject = panel.getAttribute('data-subject');
        this.activeModuleType = btn.getAttribute('data-type');
        this.renderStudyStageContent();
        gameAudio.playLaserSound(1.05);
      });
    });

    // Dropdown topic selections change triggers
    document.getElementById('math-topic-select').addEventListener('change', (e) => {
      this.activeTopic = e.target.value;
      if (this.activeSubject === 'math') this.renderStudyStageContent();
    });
    document.getElementById('physics-topic-select').addEventListener('change', (e) => {
      this.activeTopic = e.target.value;
      if (this.activeSubject === 'physics') this.renderStudyStageContent();
    });
    document.getElementById('cs-topic-select').addEventListener('change', (e) => {
      this.activeTopic = e.target.value;
      if (this.activeSubject === 'cs') this.renderStudyStageContent();
    });
    document.getElementById('student-active-course-select').addEventListener('change', (e) => {
      if (this.activeSubject === 'custom_courses') this.renderStudyStageContent();
    });

    // Teacher course details back btn
    document.getElementById('btn-teacher-back').addEventListener('click', () => {
      document.getElementById('teacher-main-view').classList.remove('hidden');
      document.getElementById('teacher-course-detail-view').classList.add('hidden');
      this.loadTeacherCourses();
    });

    // Teacher interior tabs
    const btnRoster = document.getElementById('tab-teacher-roster');
    const btnMat = document.getElementById('tab-teacher-material');
    const btnQuiz = document.getElementById('tab-teacher-quiz');
    const tabRoster = document.getElementById('teacher-sub-roster');
    const tabMat = document.getElementById('teacher-sub-material');
    const tabQuiz = document.getElementById('teacher-sub-quiz');

    const selectTeacherSubTab = (activeBtn, activeTab) => {
      [btnRoster, btnMat, btnQuiz].forEach(b => b.classList.remove('active'));
      [tabRoster, tabMat, tabQuiz].forEach(t => t.classList.add('hidden'));
      activeBtn.classList.add('active');
      activeTab.classList.remove('hidden');
      gameAudio.playLaserSound(1.0);
    };
    btnRoster.addEventListener('click', () => selectTeacherSubTab(btnRoster, tabRoster));
    btnMat.addEventListener('click', () => selectTeacherSubTab(btnMat, tabMat));
    btnQuiz.addEventListener('click', () => selectTeacherSubTab(btnQuiz, tabQuiz));

    // Create Course Teacher button
    document.getElementById('btn-create-course').addEventListener('click', async () => {
      const title = document.getElementById('course-title-input').value.trim();
      if (!title) return;
      const res = await this.apiCall('/api/courses/create', 'POST', { teacher_id: this.userId, title });
      if (res && res.status === 'success') {
        this.showToast("Курс успешно создан!");
        document.getElementById('course-title-input').value = "";
        this.loadTeacherCourses();
        gameAudio.playUpgradeSound();
      } else {
        alert("Ошибка создания курса");
      }
    });

    // Publish Custom lecture
    document.getElementById('btn-teacher-publish-material').addEventListener('click', async () => {
      const title = document.getElementById('material-title-input').value.trim();
      const content = document.getElementById('material-content-input').value.trim();
      if (!title || !content) {
        alert("Заполните все поля");
        return;
      }
      const res = await this.apiCall(`/api/courses/${this.activeTeacherCourse.id}/materials/create`, 'POST', { title, content });
      if (res && res.status === 'success') {
        this.showToast("Материал опубликован!");
        document.getElementById('material-title-input').value = "";
        document.getElementById('material-content-input').value = "";
        gameAudio.playUpgradeSound();
      }
    });

    // Add builder question fields
    document.getElementById('btn-add-builder-question').addEventListener('click', () => {
      const area = document.getElementById('builder-questions-list');
      const idx = area.children.length;
      const qDiv = document.createElement('div');
      qDiv.className = "builder-question-item glass-panel";
      qDiv.style.padding = "10px";
      qDiv.style.border = "1px solid rgba(255,255,255,0.06)";
      qDiv.style.borderRadius = "5px";
      qDiv.style.marginTop = "8px";
      qDiv.innerHTML = `
        <div class="input-group">
          <label style="font-size:0.7rem; color:#8e8ab3;">Вопрос #${idx + 1}:</label>
          <input type="text" class="builder-q-text" placeholder="Текст вопроса" style="width:100%; padding:6px; background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.1); color:#fff; font-size:0.8rem; border-radius:4px;">
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-top:8px;">
          <input type="text" class="builder-opt-0" placeholder="Вариант A" style="padding:6px; font-size:0.75rem;">
          <input type="text" class="builder-opt-1" placeholder="Вариант B" style="padding:6px; font-size:0.75rem;">
          <input type="text" class="builder-opt-2" placeholder="Вариант C" style="padding:6px; font-size:0.75rem;">
          <input type="text" class="builder-opt-3" placeholder="Вариант D" style="padding:6px; font-size:0.75rem;">
        </div>
        <div class="input-group" style="margin-top:8px;">
          <label style="font-size:0.7rem; color:#8e8ab3;">Индекс правильного ответа (0-A, 1-B, 2-C, 3-D):</label>
          <select class="builder-correct-idx" style="padding:5px; font-size:0.75rem;">
            <option value="0">Вариант A</option>
            <option value="1">Вариант B</option>
            <option value="2">Вариант C</option>
            <option value="3">Вариант D</option>
          </select>
        </div>
      `;
      area.appendChild(qDiv);
      gameAudio.playLaserSound(0.9);
    });

    // Publish custom quiz
    document.getElementById('btn-teacher-publish-quiz').addEventListener('click', async () => {
      const title = document.getElementById('quiz-title-input').value.trim();
      const description = document.getElementById('quiz-desc-input').value.trim();
      const qItems = document.querySelectorAll('.builder-question-item');
      
      if (!title || qItems.length === 0) {
        alert("Введите название и добавьте хотя бы 1 вопрос");
        return;
      }

      const questions = [];
      qItems.forEach(el => {
        const text = el.querySelector('.builder-q-text').value.trim();
        const o0 = el.querySelector('.builder-opt-0').value.trim();
        const o1 = el.querySelector('.builder-opt-1').value.trim();
        const o2 = el.querySelector('.builder-opt-2').value.trim();
        const o3 = el.querySelector('.builder-opt-3').value.trim();
        const correctIdx = parseInt(el.querySelector('.builder-correct-idx').value, 10);
        
        if (text && o0 && o1 && o2 && o3) {
          questions.push({
            text,
            options: [`A) ${o0}`, `B) ${o1}`, `C) ${o2}`, `D) ${o3}`],
            answerIdx: correctIdx
          });
        }
      });

      const res = await this.apiCall(`/api/courses/${this.activeTeacherCourse.id}/quizzes/create`, 'POST', {
        title,
        description,
        questions
      });

      if (res && res.status === 'success') {
        this.showToast("Тест успешно создан и опубликован!");
        document.getElementById('quiz-title-input').value = "";
        document.getElementById('quiz-desc-input').value = "";
        document.getElementById('builder-questions-list').innerHTML = "";
        gameAudio.playUpgradeSound();
      }
    });

    // Parent link child account trigger
    document.getElementById('btn-link-child').addEventListener('click', async () => {
      const email = document.getElementById('child-email-input').value.trim();
      if (!email) return;
      const res = await this.apiCall('/api/parent/link', 'POST', { parent_id: this.userId, child_email: email });
      if (res && res.status === 'success') {
        this.showToast(res.message);
        document.getElementById('child-email-input').value = "";
        this.loadParentChildren();
        gameAudio.playUpgradeSound();
      } else {
        alert(res ? res.message : "Ошибка привязки. Проверьте правильность email.");
      }
    });

    // Student joins Course trigger
    document.getElementById('btn-student-join-course').addEventListener('click', async () => {
      const code = document.getElementById('student-join-course-code').value.trim();
      if (!code) return;
      const res = await this.apiCall('/api/courses/join', 'POST', { student_id: this.userId, course_code: code });
      if (res && res.status === 'success') {
        this.showToast(res.message);
        document.getElementById('student-join-course-code').value = "";
        this.loadStudentCourses();
        gameAudio.playUpgradeSound();
      } else {
        alert(res ? res.message : "Не удалось вступить в курс. Проверьте код.");
      }
    });

    // Customize hanger shop actions
    const setupShopItem = (itemId, price) => {
      const btn = document.getElementById(`sh-btn-${itemId}`);
      if (!btn) return;
      btn.addEventListener('click', () => {
        const isOwned = this.unlockedItems.includes(itemId);
        if (isOwned) {
          this.selectShopItem(itemId);
        } else {
          this.buyShopItem(itemId, price);
        }
      });
    };
    setupShopItem('flame_green', 15);
    setupShopItem('flame_gold', 30);
    setupShopItem('shield_hex', 25);

    const btnFlamePink = document.getElementById('sh-btn-flame_pink');
    if (btnFlamePink) {
      btnFlamePink.addEventListener('click', () => this.selectShopItem('flame_pink'));
    }

    // Simulator topics select
    const topicBtns = document.querySelectorAll('#sim-topic-group button');
    topicBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        topicBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        gameAudio.playLaserSound(1.0);
      });
    });

    // Simulator vessel type selects
    const shipCards = document.querySelectorAll('.mini-ship-card');
    shipCards.forEach(card => {
      card.addEventListener('click', () => {
        shipCards.forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        gameAudio.playLaserSound(0.9);
      });
    });

    // Music Soundtrack Synthesizer
    const musicDropdown = document.getElementById('sim-music-track');
    if (musicDropdown) {
      musicDropdown.addEventListener('change', (e) => {
        const track = e.target.value;
        gameAudio.setSoundtrack(track);
        this.showToast(`Музыкальный синтезатор: ${e.target.options[e.target.selectedIndex].text}`);
      });
    }

    // Speed slider modifier
    const speedRange = document.getElementById('sim-speed-modifier');
    const speedValText = document.getElementById('val-sim-speed');
    if (speedRange && speedValText) {
      speedRange.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        speedValText.innerText = val === 100 ? `100% (Норма)` : `${val}% (Замедленно)`;
      });
    }

    // Launch Simulator Flight
    document.getElementById('btn-start-simulation').addEventListener('click', () => {
      const activeShip = document.querySelector('.mini-ship-card.active').getAttribute('data-ship');
      const activeTopic = document.querySelector('#sim-topic-group button.active').getAttribute('data-topic');
      const speedModifier = parseInt(speedRange.value, 10) / 100;
      const reducedMotion = document.getElementById('acc-reduced-motion').checked;

      this.game.activeCustomFlame = this.activeFlame;
      this.game.activeCustomShield = this.activeShield;

      document.getElementById('sim-setup-screen').classList.add('hidden');
      document.getElementById('sim-active-container').classList.remove('hidden');
      
      this.game.start(activeShip, this.game.upgrades, activeTopic, speedModifier, reducedMotion);
      gameAudio.playPowerupSound();
    });

    // Pause menu controls
    document.getElementById('btn-pause').addEventListener('click', () => {
      document.getElementById('pause-screen').classList.remove('hidden');
      this.game.gameState = 'paused';
      gameAudio.stopMusic();
    });

    document.getElementById('btn-resume').addEventListener('click', () => {
      document.getElementById('pause-screen').classList.add('hidden');
      this.game.gameState = 'playing';
      gameAudio.startMusic();
    });

    document.getElementById('btn-quit').addEventListener('click', () => {
      document.getElementById('pause-screen').classList.add('hidden');
      document.getElementById('sim-active-container').classList.add('hidden');
      document.getElementById('sim-setup-screen').classList.remove('hidden');
      this.game.gameState = 'menu';
      gameAudio.stopMusic();
    });

    document.getElementById('btn-restart').addEventListener('click', () => {
      document.getElementById('game-over-screen').classList.add('hidden');
      document.getElementById('sim-active-container').classList.remove('hidden');
      document.getElementById('btn-start-simulation').click();
    });

    document.getElementById('btn-home').addEventListener('click', () => {
      document.getElementById('game-over-screen').classList.add('hidden');
      document.getElementById('sim-active-container').classList.add('hidden');
      document.getElementById('sim-setup-screen').classList.remove('hidden');
      this.game.gameState = 'menu';
      this.switchTab('hangar');
    });

    // Master volume sliders
    const masterVol = document.getElementById('volume-master');
    const masterVal = document.getElementById('val-volume-master');
    masterVol.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      masterVal.innerText = `${val}%`;
      gameAudio.setVolume('master', val / 100);
    });

    const musicVol = document.getElementById('volume-music');
    const musicVal = document.getElementById('val-volume-music');
    musicVol.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      musicVal.innerText = `${val}%`;
      gameAudio.setVolume('music', val / 100);
    });

    const sfxVol = document.getElementById('volume-sfx');
    const sfxVal = document.getElementById('val-volume-sfx');
    sfxVol.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      sfxVal.innerText = `${val}%`;
      gameAudio.setVolume('sfx', val / 100);
    });

    // Download PDF Report
    document.getElementById('btn-generate-report').addEventListener('click', () => {
      this.simulateReportCardDownload();
    });

    // ============================================================
    // TEACHER-HANGAR: CREATE COURSE (NEW TAB BUTTON)
    // ============================================================
    const btnTeacherCreateCourse = document.getElementById('btn-teacher-create-course');
    if (btnTeacherCreateCourse) {
      btnTeacherCreateCourse.addEventListener('click', async () => {
        const input = document.getElementById('teacher-course-title-input');
        const title = input?.value.trim();
        if (!title) return;
        const res = await this.apiCall('/api/courses/create', 'POST', { teacher_id: this.userId, title });
        if (res && res.status === 'success') {
          this.showToast("Курс успешно создан!");
          input.value = "";
          this.loadTeacherCoursesTab();
          gameAudio.playUpgradeSound();
        } else {
          alert("Ошибка создания курса");
        }
      });
    }

    // ============================================================
    // CONSTRUCTOR TAB: MATERIAL / QUIZ SWITCH + PUBLISH
    // ============================================================
    const btnConsMat = document.getElementById('btn-constructor-tab-material');
    const btnConsQuiz = document.getElementById('btn-constructor-tab-quiz');
    const consMaterialForm = document.getElementById('constructor-material-form');
    const consQuizForm = document.getElementById('constructor-quiz-form');
    const consPlaceholder = document.getElementById('constructor-no-course-placeholder');

    if (btnConsMat && btnConsQuiz) {
      btnConsMat.addEventListener('click', () => {
        btnConsMat.classList.add('active');
        btnConsQuiz.classList.remove('active');
        if (this.activeTeacherCourse) {
          consMaterialForm?.classList.remove('hidden');
          consQuizForm?.classList.add('hidden');
          consPlaceholder?.classList.add('hidden');
        }
        gameAudio.playLaserSound(1.0);
      });
      btnConsQuiz.addEventListener('click', () => {
        btnConsQuiz.classList.add('active');
        btnConsMat.classList.remove('active');
        if (this.activeTeacherCourse) {
          consQuizForm?.classList.remove('hidden');
          consMaterialForm?.classList.add('hidden');
          consPlaceholder?.classList.add('hidden');
        }
        gameAudio.playLaserSound(1.0);
      });
    }

    // Constructor — publish material (new tab IDs)
    const btnConsPublishMat = document.getElementById('btn-constructor-publish-material');
    if (btnConsPublishMat) {
      btnConsPublishMat.addEventListener('click', async () => {
        const title = document.getElementById('material-title-input-tab')?.value.trim();
        const content = document.getElementById('material-content-input-tab')?.value.trim();
        if (!title || !content) { alert("Заполните все поля"); return; }
        if (!this.activeTeacherCourse) { alert("Сначала выберите курс в разделе Консоль"); return; }
        const res = await this.apiCall(`/api/courses/${this.activeTeacherCourse.id}/materials/create`, 'POST', { title, content });
        if (res && res.status === 'success') {
          this.showToast("Материал опубликован!");
          document.getElementById('material-title-input-tab').value = "";
          document.getElementById('material-content-input-tab').value = "";
          gameAudio.playUpgradeSound();
        }
      });
    }

    // Constructor — add question card (new tab IDs)
    const btnConsAddQ = document.getElementById('btn-add-builder-question-tab');
    if (btnConsAddQ) {
      btnConsAddQ.addEventListener('click', () => {
        const area = document.getElementById('builder-questions-list-tab');
        if (!area) return;
        const idx = area.children.length;
        const card = document.createElement('div');
        card.className = "question-builder-card";
        card.innerHTML = `
          <span class="q-num">ВОПРОС #${idx + 1}</span>
          <button class="remove-question-btn" title="Удалить">✕</button>
          <input type="text" class="builder-q-text" placeholder="Текст вопроса...">
          <div class="options-grid">
            <div class="option-row"><input type="radio" name="correct-${idx}" value="0" checked><input type="text" class="builder-opt-0" placeholder="Вариант A"></div>
            <div class="option-row"><input type="radio" name="correct-${idx}" value="1"><input type="text" class="builder-opt-1" placeholder="Вариант B"></div>
            <div class="option-row"><input type="radio" name="correct-${idx}" value="2"><input type="text" class="builder-opt-2" placeholder="Вариант C"></div>
            <div class="option-row"><input type="radio" name="correct-${idx}" value="3"><input type="text" class="builder-opt-3" placeholder="Вариант D"></div>
          </div>
        `;
        card.querySelector('.remove-question-btn').addEventListener('click', () => card.remove());
        area.appendChild(card);
        gameAudio.playLaserSound(0.9);
      });
    }

    // Constructor — publish quiz (new tab IDs)
    const btnConsPublishQuiz = document.getElementById('btn-constructor-publish-quiz');
    if (btnConsPublishQuiz) {
      btnConsPublishQuiz.addEventListener('click', async () => {
        const title = document.getElementById('quiz-title-input-tab')?.value.trim();
        const description = document.getElementById('quiz-desc-input-tab')?.value.trim();
        const cards = document.querySelectorAll('#builder-questions-list-tab .question-builder-card');
        if (!title || cards.length === 0) { alert("Введите название и добавьте хотя бы 1 вопрос"); return; }
        if (!this.activeTeacherCourse) { alert("Сначала выберите курс"); return; }

        const questions = [];
        cards.forEach(el => {
          const text = el.querySelector('.builder-q-text')?.value.trim();
          const opts = [0,1,2,3].map(i => el.querySelector(`.builder-opt-${i}`)?.value.trim());
          const checked = el.querySelector('input[type=radio]:checked');
          const correctIdx = checked ? parseInt(checked.value, 10) : 0;
          if (text && opts.every(o => o)) {
            questions.push({ text, options: opts.map((o,i) => `${'ABCD'[i]}) ${o}`), answerIdx: correctIdx });
          }
        });

        const res = await this.apiCall(`/api/courses/${this.activeTeacherCourse.id}/quizzes/create`, 'POST', { title, description, questions });
        if (res && res.status === 'success') {
          this.showToast("Тест успешно создан и опубликован!");
          document.getElementById('quiz-title-input-tab').value = "";
          document.getElementById('quiz-desc-input-tab').value = "";
          document.getElementById('builder-questions-list-tab').innerHTML = "";
          gameAudio.playUpgradeSound();
        }
      });
    }

    // ============================================================
    // PARENT-HANGAR: LINK CHILD (NEW TAB BUTTON)
    // ============================================================
    const btnParentLink = document.getElementById('btn-parent-link-child');
    if (btnParentLink) {
      btnParentLink.addEventListener('click', async () => {
        const emailInput = document.getElementById('parent-child-email-input');
        const email = emailInput?.value.trim();
        if (!email) return;
        const res = await this.apiCall('/api/parent/link', 'POST', { parent_id: this.userId, child_email: email });
        if (res && res.status === 'success') {
          this.showToast(res.message);
          emailInput.value = "";
          this.loadParentChildrenTab();
          gameAudio.playUpgradeSound();
        } else {
          alert(res ? res.message : "Ошибка привязки.");
        }
      });
    }

    // Parent monitoring child selector
    const parentChildSelect = document.getElementById('parent-child-select');
    if (parentChildSelect) {
      parentChildSelect.addEventListener('change', (e) => {
        const childId = e.target.value;
        if (childId) {
          this.loadMonitoringChild(childId);
        } else {
          document.getElementById('parent-monitoring-no-child-placeholder')?.classList.remove('hidden');
          document.getElementById('parent-monitoring-container')?.classList.add('hidden');
        }
      });
    }

    // ============================================================
    // SCROLL ELEVATOR WIDGET
    // ============================================================
    this.initElevatorWidget();
  }

  // ============================================================
  // SCROLL ELEVATOR WIDGET CONTROLLER
  // ============================================================

  initElevatorWidget() {
    const elevator = document.getElementById('scroll-elevator');
    const btnUp = document.getElementById('btn-scroll-up');
    const btnDown = document.getElementById('btn-scroll-down');
    const handle = document.getElementById('elevator-slider-handle');
    const track = handle?.parentElement;

    if (!elevator || !btnUp || !btnDown || !handle || !track) return;

    // Find the currently active scrollable content pane
    const getScrollTarget = () => {
      const activeView = document.querySelector('.tab-view:not(.hidden)');
      if (!activeView) return document.querySelector('main');
      // Find the deepest scrollable container inside the active tab
      const scrollables = activeView.querySelectorAll('[style*="overflow-y:auto"], [style*="overflow-y: auto"]');
      if (scrollables.length > 0) return scrollables[scrollables.length - 1];
      return activeView;
    };

    const SCROLL_STEP = 200;

    btnUp.addEventListener('click', () => {
      const target = getScrollTarget();
      if (target) target.scrollBy({ top: -SCROLL_STEP, behavior: 'smooth' });
    });

    btnDown.addEventListener('click', () => {
      const target = getScrollTarget();
      if (target) target.scrollBy({ top: SCROLL_STEP, behavior: 'smooth' });
    });

    // Handle drag
    let isDragging = false;

    const startDrag = (e) => {
      isDragging = true;
      handle.style.cursor = 'grabbing';
      e.preventDefault();
    };

    const onDrag = (e) => {
      if (!isDragging) return;
      const trackRect = track.getBoundingClientRect();
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const offsetY = clientY - trackRect.top;
      const trackH = trackRect.height;
      const handleH = handle.offsetHeight;
      const maxTop = trackH - handleH;
      const newTop = Math.max(0, Math.min(offsetY - handleH / 2, maxTop));

      handle.style.top = `${newTop}px`;

      // Map to scroll position
      const ratio = newTop / maxTop;
      const target = getScrollTarget();
      if (target) {
        const maxScroll = target.scrollHeight - target.clientHeight;
        target.scrollTop = ratio * maxScroll;
      }
    };

    const stopDrag = () => {
      isDragging = false;
      handle.style.cursor = 'grab';
    };

    handle.addEventListener('mousedown', startDrag);
    handle.addEventListener('touchstart', startDrag, { passive: false });
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('touchmove', onDrag, { passive: false });
    document.addEventListener('mouseup', stopDrag);
    document.addEventListener('touchend', stopDrag);

    // Click on track to jump
    track.addEventListener('click', (e) => {
      if (e.target === handle || handle.contains(e.target)) return;
      const trackRect = track.getBoundingClientRect();
      const offsetY = e.clientY - trackRect.top;
      const trackH = trackRect.height;
      const handleH = handle.offsetHeight;
      const maxTop = trackH - handleH;
      const newTop = Math.max(0, Math.min(offsetY - handleH / 2, maxTop));
      handle.style.top = `${newTop}px`;

      const ratio = newTop / maxTop;
      const target = getScrollTarget();
      if (target) {
        const maxScroll = target.scrollHeight - target.clientHeight;
        target.scrollTop = ratio * maxScroll;
      }
    });

    // Sync handle position on scroll
    const syncHandle = () => {
      const target = getScrollTarget();
      if (!target) return;
      const maxScroll = target.scrollHeight - target.clientHeight;
      if (maxScroll <= 0) {
        handle.style.top = '0px';
        return;
      }
      const ratio = target.scrollTop / maxScroll;
      const trackH = track.offsetHeight;
      const handleH = handle.offsetHeight;
      const maxTop = trackH - handleH;
      handle.style.top = `${ratio * maxTop}px`;
    };

    // Re-attach scroll listener when tabs change
    let lastTarget = null;
    const attachScrollListener = () => {
      const target = getScrollTarget();
      if (target !== lastTarget) {
        if (lastTarget) lastTarget.removeEventListener('scroll', syncHandle);
        lastTarget = target;
        if (target) target.addEventListener('scroll', syncHandle);
      }
      syncHandle();
    };

    // Observe tab changes
    const observer = new MutationObserver(() => {
      requestAnimationFrame(attachScrollListener);
    });
    document.querySelectorAll('.tab-view').forEach(view => {
      observer.observe(view, { attributes: true, attributeFilter: ['class'] });
    });
    attachScrollListener();
  }

  // ============================================================
  // TEACHER COURSES TAB (for the new tab-teacher-hangar)
  // ============================================================

  async loadTeacherCoursesTab() {
    const grid = document.getElementById('teacher-courses-grid-tab');
    const countEl = document.getElementById('teacher-courses-count');
    if (!grid) return;
    grid.innerHTML = "";

    const res = await this.apiCall(`/api/courses/list?user_id=${this.userId}&role=teacher`);
    if (res && res.status === 'success') {
      this.teacherCourses = res.courses;
    }

    if (countEl) countEl.innerText = this.teacherCourses.length;

    if (this.teacherCourses.length === 0) {
      grid.innerHTML = `<p style="color:#8e8ab3; font-style:italic; font-size:0.8rem; text-align:center; grid-column:1/-1; padding:40px 0;">У вас пока нет созданных курсов. Используйте форму выше для создания.</p>`;
      return;
    }

    this.teacherCourses.forEach(c => {
      const card = document.createElement('div');
      card.className = "course-card-tab";
      if (this.activeTeacherCourse && this.activeTeacherCourse.id === c.id) {
        card.classList.add('active-course');
      }
      card.innerHTML = `
        <span class="course-code-badge">${c.course_code}</span>
        <h4>${c.title}</h4>
        <span class="course-date">Создан: ${new Date(c.created_at || Date.now()).toLocaleDateString('ru-RU')}</span>
      `;
      card.addEventListener('click', () => {
        this.activeTeacherCourse = c;
        // Highlight active card
        grid.querySelectorAll('.course-card-tab').forEach(cc => cc.classList.remove('active-course'));
        card.classList.add('active-course');
        // Update constructor active course name
        const consName = document.getElementById('constructor-active-course-name');
        if (consName) consName.innerText = c.title;
        // Update gradebook course name
        const gbName = document.getElementById('gradebook-active-course-name');
        if (gbName) gbName.innerText = c.title;
        // Show constructor forms
        const consPlaceholder = document.getElementById('constructor-no-course-placeholder');
        const consMaterialForm = document.getElementById('constructor-material-form');
        if (consPlaceholder) consPlaceholder.classList.add('hidden');
        if (consMaterialForm) consMaterialForm.classList.remove('hidden');
        // Load gradebook roster
        this.loadGradebookRoster(c.id);
        gameAudio.playLaserSound(1.0);
        this.showToast(`Активный курс: ${c.title}`);
      });
      grid.appendChild(card);
    });
  }

  // ============================================================
  // TEACHER GRADEBOOK ROSTER (for tab-teacher-gradebook)
  // ============================================================

  async loadGradebookRoster(courseId) {
    const placeholder = document.getElementById('gradebook-no-course-placeholder');
    const container = document.getElementById('gradebook-roster-container');
    const tbody = document.getElementById('gradebook-roster-tbody-tab');
    const reportBtn = document.getElementById('btn-teacher-generate-report');

    if (!tbody) return;

    const res = await this.apiCall(`/api/courses/${courseId}/students`);

    if (res && res.status === 'success' && res.students.length > 0) {
      if (placeholder) placeholder.classList.add('hidden');
      if (container) container.classList.remove('hidden');
      if (reportBtn) reportBtn.style.display = 'block';

      tbody.innerHTML = "";
      res.students.forEach(st => {
        let gradesStr = "Нет оценок";
        if (st.progress && st.progress.length > 0) {
          const exams = st.progress.filter(p => p.type === 'test' || p.type === 'custom_quiz');
          if (exams.length > 0) {
            gradesStr = exams.map(e => `${e.subject}: ${e.score}/${e.max_score}`).slice(0, 3).join(', ');
          }
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${st.full_name}</td>
          <td style="color:#8e8ab3;">${st.email || '—'}</td>
          <td>${st.xp} XP (Ур. ${st.level})</td>
          <td style="color:var(--color-cyan);">${st.highscore?.toLocaleString() || '0'}</td>
          <td>${st.progress?.find(p => p.type === 'simulator')?.details?.accuracy || '0'}%</td>
          <td style="color:#a5a2bf; max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${gradesStr}</td>
        `;
        tbody.appendChild(tr);
      });
    } else {
      if (placeholder) placeholder.classList.add('hidden');
      if (container) container.classList.remove('hidden');
      tbody.innerHTML = `<tr><td colspan="6" style="padding:30px; text-align:center; color:#8e8ab3; font-style:italic;">На этом курсе пока нет учеников. Поделитесь кодом для подключения!</td></tr>`;
    }
  }

  // ============================================================
  // PARENT CHILDREN TAB (for tab-parent-hangar)
  // ============================================================

  async loadParentChildrenTab() {
    const container = document.getElementById('parent-children-list-tab');
    const countEl = document.getElementById('parent-children-count');
    const childSelect = document.getElementById('parent-child-select');
    if (!container) return;
    container.innerHTML = "";

    const res = await this.apiCall(`/api/parent/children?parent_id=${this.userId}`);
    if (res && res.status === 'success') {
      this.linkedChildren = res.children;
    }

    if (countEl) countEl.innerText = this.linkedChildren.length;

    // Update the monitoring dropdown
    if (childSelect) {
      childSelect.innerHTML = `<option value="">-- Выберите ребенка --</option>`;
      this.linkedChildren.forEach(child => {
        const opt = document.createElement('option');
        opt.value = child.id;
        opt.innerText = child.full_name;
        childSelect.appendChild(opt);
      });
    }

    if (this.linkedChildren.length === 0) {
      container.innerHTML = `<p style="color:#8e8ab3; font-style:italic; font-size:0.8rem; text-align:center; padding:40px 0;">Привязанных детских аккаунтов не найдено. Используйте форму слева для привязки.</p>`;
      return;
    }

    this.linkedChildren.forEach(child => {
      const simRun = child.progress?.find(p => p.type === 'simulator');
      const latestAccuracy = simRun?.details?.accuracy || 0;

      const card = document.createElement('div');
      card.className = "child-summary-card";
      card.innerHTML = `
        <div class="child-avatar-mini">
          <span>👦</span>
        </div>
        <div class="child-summary-info">
          <h4>${child.full_name}</h4>
          <span class="child-level-badge">УРОВЕНЬ ${child.level} • ${child.xp} XP</span>
          <div class="child-summary-stats">
            <span>Шарды: <strong class="text-glow-pink">${child.shards}</strong></span>
            <span>Рекорд: <strong class="text-glow-cyan">${child.highscore?.toLocaleString() || '0'}</strong></span>
            <span>Точность: <strong style="color:var(--color-green);">${latestAccuracy}%</strong></span>
          </div>
        </div>
      `;
      card.addEventListener('click', () => {
        // Switch to monitoring tab and auto-select this child
        this.switchTab('parent-monitoring');
        if (childSelect) {
          childSelect.value = child.id;
          childSelect.dispatchEvent(new Event('change'));
        }
        gameAudio.playLaserSound(1.0);
      });
      container.appendChild(card);
    });
  }

  // ============================================================
  // PARENT MONITORING — LOAD SPECIFIC CHILD DETAILS
  // ============================================================

  loadMonitoringChild(childId) {
    const child = this.linkedChildren.find(c => c.id == childId);
    if (!child) return;

    document.getElementById('parent-monitoring-no-child-placeholder')?.classList.add('hidden');
    document.getElementById('parent-monitoring-container')?.classList.remove('hidden');

    // 1. Stats boxes
    const statsGrid = document.getElementById('monitoring-child-stats');
    if (statsGrid) {
      const simRun = child.progress?.find(p => p.type === 'simulator');
      const accuracy = simRun?.details?.accuracy || 0;
      const avgSpeed = simRun?.details?.avgSpeed || 0;

      statsGrid.innerHTML = `
        <div class="monitoring-stat-box">
          <span class="label">УРОВЕНЬ</span>
          <span class="value text-glow-cyan">${child.level}</span>
        </div>
        <div class="monitoring-stat-box">
          <span class="label">ОПЫТ (XP)</span>
          <span class="value" style="color:var(--color-gold);">${child.xp}</span>
        </div>
        <div class="monitoring-stat-box">
          <span class="label">КОСМО-ШАРДЫ</span>
          <span class="value text-glow-pink">${child.shards}</span>
        </div>
        <div class="monitoring-stat-box">
          <span class="label">РЕКОРД</span>
          <span class="value text-glow-cyan">${child.highscore?.toLocaleString() || '0'}</span>
        </div>
      `;
    }

    // 2. Grades log
    const gradesLog = document.getElementById('monitoring-child-grades');
    if (gradesLog) {
      gradesLog.innerHTML = "";
      if (child.progress && child.progress.length > 0) {
        child.progress.slice(0, 10).forEach(p => {
          const item = document.createElement('div');
          item.className = "activity-log-item";
          const subjectName = p.type === 'simulator' ? '🚀 Симулятор' : `📖 ${p.subject || 'Тест'}`;
          const scoreColor = p.score >= (p.max_score * 0.7) ? 'var(--color-green)' : 'var(--color-pink)';
          item.innerHTML = `
            <span class="log-subject">${subjectName}</span>
            <span class="log-score" style="color:${scoreColor};">${p.score}/${p.max_score}</span>
          `;
          gradesLog.appendChild(item);
        });
      } else {
        gradesLog.innerHTML = `<p style="color:#8e8ab3; font-style:italic; font-size:0.75rem; text-align:center; padding:20px 0;">Нет записей прогресса</p>`;
      }
    }

    // 3. Strengths radar bars
    const radarContainer = document.getElementById('monitoring-child-radar');
    if (radarContainer) {
      const subjects = [
        { name: 'Математика', color: 'var(--color-cyan)', key: 'math' },
        { name: 'Физика', color: 'var(--color-green)', key: 'physics' },
        { name: 'Информатика', color: 'var(--color-pink)', key: 'cs' },
        { name: 'Симулятор', color: 'var(--color-gold)', key: 'simulator' }
      ];

      radarContainer.innerHTML = "";
      subjects.forEach(sub => {
        const related = child.progress?.filter(p => p.subject === sub.key || p.type === sub.key) || [];
        let percent = 0;
        if (related.length > 0) {
          const avg = related.reduce((sum, p) => sum + (p.score / p.max_score) * 100, 0) / related.length;
          percent = Math.round(avg);
        }
        const row = document.createElement('div');
        row.className = "radar-row";
        row.innerHTML = `
          <span style="font-size:0.75rem; color:#bfbdd3; min-width:120px;">${sub.name}</span>
          <div class="mini-bar-track" style="flex:1;">
            <div class="fill" style="width:${percent}%; background:${sub.color};"></div>
          </div>
          <span style="font-size:0.75rem; color:${sub.color}; min-width:40px; text-align:right; font-weight:bold;">${percent}%</span>
        `;
        radarContainer.appendChild(row);
      });
    }
  }
}

// --- KHAN ACADEMY CURRICULUM DATABASE (15 DEEP STEM MODULES) ---

function getSubjectData(subject, topicId) {
  const db = {
    math: {
      "1": {
        notes: {
          title: "Математика // Раздел 1: Линейные Уравнения",
          subtitle: "Основы решения линейных тождеств вида ax + b = c (8 класс)",
          sections: [
            {
              heading: "1. Понятие линейного уравнения и свойства равносильности",
              text: "Уравнение вида ax + b = c, где x — переменная, a, b и c — числа, называется линейным уравнением с одной переменной. Согласно программе 8 класса казахстанской школы, при решении уравнений мы используем свойства равносильности: перенос членов уравнения из одной части в другую с противоположным знаком, а также умножение или деление обеих частей на ненулевое число.",
              formula: "ax + b = c",
              formulaDesc: "Стандартный вид уравнения первого порядка."
            },
            {
              heading: "2. Исследование корней линейного уравнения",
              text: "Количество решений уравнения ax = c - b зависит от коэффициента a. Если a ≠ 0, то уравнение имеет единственный корень. Если a = 0 и c - b = 0, уравнение принимает вид 0x = 0, что верно при любом x (бесконечно много корней). Если a = 0 и c - b ≠ 0, уравнение принимает вид 0x = k, что не имеет решений.",
              formula: "x = (c - b) / a",
              formulaDesc: "Формула корня при условии, что коэффициент a не равен нулю."
            },
            {
              heading: "3. Текстовые задачи на составление линейных уравнений",
              text: "В курсе 8 класса большое внимание уделяется текстовым задачам на движение, совместную работу и смеси. Процесс решения включает: выбор неизвестного x, выражение остальных величин через x, составление математической модели (уравнения), его решение и интерпретацию полученного результата."
            }
          ]
        },
        exam: {
          title: "Экзамен: Линейные Уравнения",
          desc: "Проверка навыков нахождения корней линейных уравнений первого порядка. 10 вопросов.",
          questions: [
            { text: "Решите уравнение: 3x - 6 = 12", options: ["A) 6", "B) 4", "C) 2", "D) 8"], answerIdx: 0 },
            { text: "Решите уравнение: 5x + 10 = 30", options: ["A) 4", "B) 2", "C) 8", "D) 6"], answerIdx: 0 },
            { text: "Найдите корень: x/2 + 5 = 11", options: ["A) 12", "B) 6", "C) 3", "D) 8"], answerIdx: 0 },
            { text: "Чему равен x в тождестве 4x = 0?", options: ["A) 0", "B) 4", "C) 1", "D) -4"], answerIdx: 0 },
            { text: "Решите уравнение: 2(x - 3) = 8", options: ["A) 7", "B) 5", "C) 11", "D) 4"], answerIdx: 0 },
            { text: "Решите уравнение: 7x - 5 = 2x + 10", options: ["A) 3", "B) 5", "C) 2", "D) 1"], answerIdx: 0 },
            { text: "Найдите x: 3x + 9 = 2x", options: ["A) -9", "B) 9", "C) -3", "D) 3"], answerIdx: 0 },
            { text: "Чему равен x: x/3 - 1 = 2", options: ["A) 9", "B) 3", "C) 6", "D) 12"], answerIdx: 0 },
            { text: "Решите уравнение: 12 - 3x = 3", options: ["A) 3", "B) 5", "C) 4", "D) 2"], answerIdx: 0 },
            { text: "Найдите x: 5(2x - 1) = 45", options: ["A) 5", "B) 4", "C) 6", "D) 4.5"], answerIdx: 0 }
          ]
        }
      },
      "2": {
        notes: {
          title: "Математика // Раздел 2: Квадратные Уравнения & Дискриминант",
          subtitle: "Алгебраический анализ квадратного трехчлена вида ax² + bx + c = 0 (8 класс)",
          sections: [
            {
              heading: "1. Полные и неполные квадратные уравнения",
              text: "Квадратное уравнение имеет вид ax² + bx + c = 0, где a ≠ 0. Если коэффициенты b или c равны нулю, уравнение называется неполным. Неполные квадратные уравнения решаются вынесением общего множителя за скобки или извлечением квадратного корня из обеих частей тождества.",
              formula: "ax² + bx = 0 ➔ x(ax + b) = 0",
              formulaDesc: "Решение неполного уравнения с c = 0."
            },
            {
              heading: "2. Дискриминант и формула корней",
              text: "Для полного квадратного уравнения число корней определяется знаком дискриминанта D. Если D > 0, уравнение имеет два вещественных корня. Если D = 0, корни совпадают (одно решение). Если D < 0, вещественных корней нет (уравнение не пересекает ось абсцисс).",
              formula: "D = b² - 4ac",
              formulaDesc: "Формула дискриминанта квадратного уравнения."
            },
            {
              heading: "3. Теорема Виета и ее следствия",
              text: "Теорема Виета связывает корни квадратного уравнения с его коэффициентами. Для приведенного квадратного уравнения (где a = 1) сумма корней равна второму коэффициенту с противоположным знаком, а произведение корней равно свободному члену. Это позволяет решать многие задачи устно.",
              formula: "x₁ + x₂ = -b/a ; x₁ * x₂ = c/a",
              formulaDesc: "Связь корней x₁ и x₂ с коэффициентами исходного трехчлена."
            },
            {
              heading: "4. Разложение квадратного трехчлена на линейные множители",
              text: "Если квадратный трехчлен ax² + bx + c имеет корни x₁ и x₂, его можно разложить на простые множители. Это свойство широко используется для сокращения рациональных дробей в курсе алгебры 8 класса.",
              formula: "ax² + bx + c = a(x - x₁)(x - x₂)",
              formulaDesc: "Разложение трехчлена на линейные множители."
            }
          ]
        },
        exam: {
          title: "Экзамен: Квадратные Уравнения",
          desc: "Решение квадратных уравнений и вычисление дискриминанта. 10 вопросов.",
          questions: [
            { text: "Найдите дискриминант уравнения x² - 5x + 6 = 0", options: ["A) 1", "B) 25", "C) 12", "D) 5"], answerIdx: 0 },
            { text: "Найдите корни уравнения x² - 5x + 6 = 0", options: ["A) x=2, x=3", "B) x=-2, x=-3", "C) x=1, x=6", "D) x=5, x=1"], answerIdx: 0 },
            { text: "Сколько корней имеет уравнение x² + 4x + 4 = 0?", options: ["A) Один корень", "B) Два корня", "C) Нет корней", "D) Бесконечно много"], answerIdx: 0 },
            { text: "Найдите дискриминант уравнения x² + 2x + 5 = 0", options: ["A) -16", "B) 16", "C) -4", "D) 0"], answerIdx: 0 },
            { text: "Какое из уравнений не имеет вещественных корней?", options: ["A) x² + 2x + 5 = 0", "B) x² - 4 = 0", "C) x² - 6x + 9 = 0", "D) x² + 5x = 0"], answerIdx: 0 },
            { text: "Найдите корни уравнения x² - 9 = 0", options: ["A) ±3", "B) 3", "C) -3", "D) ±9"], answerIdx: 0 },
            { text: "По теореме Виета сумма корней уравнения x² - 7x + 12 = 0 равна:", options: ["A) 7", "B) 12", "C) -7", "D) -12"], answerIdx: 0 },
            { text: "По теореме Виета произведение корней уравнения x² - 7x + 12 = 0 равно:", options: ["A) 12", "B) 7", "C) 12/7", "D) -12"], answerIdx: 0 },
            { text: "Найдите корень уравнения x² - 6x + 9 = 0", options: ["A) 3", "B) -3", "C) ±3", "D) 9"], answerIdx: 0 },
            { text: "Решите квадратное уравнение: x² + x - 2 = 0", options: ["A) x=1, x=-2", "B) x=-1, x=2", "C) x=0, x=-2", "D) x=1, x=2"], answerIdx: 0 }
          ]
        }
      },
      "3": {
        notes: {
          title: "Математика // Раздел 3: Системы Линейных Уравнений",
          subtitle: "Нахождение пересечений линейных зависимостей (8 класс)",
          sections: [
            {
              heading: "1. Понятие системы уравнений с двумя переменными",
              text: "Решением системы уравнений является пара значений переменных (x, y), которая одновременно обращает каждое уравнение системы в верное числовое равенство. Геометрически каждое линейное уравнение представляет собой прямую на плоскости, а решение системы — точку пересечения этих прямых.",
              formula: "{ a₁x + b₁y = c₁ \n{ a₂x + b₂y = c₂",
              formulaDesc: "Стандартная запись системы двух линейных уравнений."
            },
            {
              heading: "2. Аналитические методы: подстановка и сложение",
              text: "Метод подстановки заключается в выражении одной переменной через другую из одного уравнения и подстановке этого выражения во второе уравнение. Метод сложения заключается в почленном сложении уравнений системы, умноженных на предварительно подобранные множители, для исключения одной из переменных.",
              formula: "x + y = 5 ➔ x = 5 - y",
              formulaDesc: "Пример выражения переменной при использовании метода подстановки."
            },
            {
              heading: "3. Исследование числа решений системы прямых",
              text: "Система может иметь ровно одно решение (если прямые пересекаются, угловые коэффициенты различны), не иметь решений (прямые параллельны, коэффициенты пропорциональны, но свободные члены разные) или иметь бесконечно много решений (прямые совпадают, все коэффициенты пропорциональны)."
            }
          ]
        },
        exam: {
          title: "Экзамен: Системы Уравнений",
          desc: "Решение систем уравнений. 10 вопросов.",
          questions: [
            { text: "Решите систему: x+y=5; x-y=1", options: ["A) (3, 2)", "B) (4, 1)", "C) (2, 3)", "D) (1, 4)"], answerIdx: 0 },
            { text: "Найдите x в системе: 2x+y=10; y=2", options: ["A) 4", "B) 6", "C) 3", "D) 5"], answerIdx: 0 },
            { text: "Решите систему: x+2y=8; 3x-2y=8", options: ["A) (4, 2)", "B) (2, 3)", "C) (3, 2.5)", "D) (4, 1)"], answerIdx: 0 },
            { text: "Найдите y: x+y=7; 2x-y=5", options: ["A) 3", "B) 4", "C) 2", "D) 1"], answerIdx: 0 },
            { text: "Решите систему: y=2x; x+y=9", options: ["A) (3, 6)", "B) (6, 3)", "C) (4, 5)", "D) (4.5, 4.5)"], answerIdx: 0 },
            { text: "При каких условиях система не имеет решений?", options: ["A) Графики параллельны", "B) Графики совпадают", "C) Графики пересекаются", "D) Нет верного ответа"], answerIdx: 0 },
            { text: "Найдите x: y=3x; 2x+y=15", options: ["A) 3", "B) 5", "C) 9", "D) 2.5"], answerIdx: 0 },
            { text: "Решите систему: x-y=0; x+y=10", options: ["A) (5, 5)", "B) (4, 6)", "C) (6, 4)", "D) (0, 10)"], answerIdx: 0 },
            { text: "Найдите y: 3x-y=5; x=2", options: ["A) 1", "B) -1", "C) 2", "D) 3"], answerIdx: 0 },
            { text: "Решите систему: x+2y=10; x-y=1", options: ["A) (4, 3)", "B) (3, 4)", "C) (5, 2.5)", "D) (7, 1.5)"], answerIdx: 0 }
          ]
        }
      },
      "4": {
        notes: {
          title: "Математика // Раздел 4: Логарифмы & Экспоненты",
          subtitle: "Степени, рациональные показатели и введение в логарифмы (8-9 классы)",
          sections: [
            {
              heading: "1. Свойства степеней с рациональным показателем",
              text: "В курсе алгебры 8-9 классов подробно изучаются свойства степени. Для любых положительных оснований выполняются правила умножения и деления степеней, возведения степени в степень, а также определение степени с отрицательным и дробным показателем (извлечение корня n-й степени).",
              formula: "a^m * a^n = a^(m+n) ; a^(1/n) = ⁿ√a",
              formulaDesc: "Основные свойства операций над степенями."
            },
            {
              heading: "2. Понятие логарифма числа",
              text: "Логарифмом положительного числа b по основанию a (где a > 0, a ≠ 1) называется показатель степени, в которую нужно возвести число a, чтобы получить b. Логарифм — это операция, обратная возведению в степень (экспоненте).",
              formula: "log_a(b) = x ➔ a^x = b",
              formulaDesc: "Определение логарифма как показателя степени."
            },
            {
              heading: "3. Логарифмические тождества и свойства",
              text: "Логарифмы обладают важными алгебраическими свойствами: логарифм произведения равен сумме логарифмов сомножителей, а логарифм частного — их разности. Также степень логарифмируемого числа можно выносить как коэффициент перед логарифмом.",
              formula: "log_a(x * y) = log_a(x) + log_a(y)",
              formulaDesc: "Свойство логарифма произведения двух положительных величин."
            }
          ]
        },
        exam: {
          title: "Экзамен: Логарифмы & Степени",
          desc: "Контроль навыков работы со степенями и логарифмами. 10 вопросов.",
          questions: [
            { text: "Чему равен log_2(8)?", options: ["A) 3", "B) 4", "C) 2", "D) 1"], answerIdx: 0 },
            { text: "Решите уравнение: log_3(x) = 2", options: ["A) 9", "B) 6", "C) 5", "D) 8"], answerIdx: 0 },
            { text: "Вычислите log_5(25)", options: ["A) 2", "B) 5", "C) 3", "D) 1"], answerIdx: 0 },
            { text: "Чему равно 2^5?", options: ["A) 32", "B) 16", "C) 64", "D) 25"], answerIdx: 0 },
            { text: "Чему равно значение log_10(1)?", options: ["A) 0", "B) 1", "C) 10", "D) Не определено"], answerIdx: 0 },
            { text: "Упростите: log_a(x) + log_a(y)", options: ["A) log_a(x * y)", "B) log_a(x / y)", "C) log_a(x + y)", "D) log_a(x) * log_a(y)"], answerIdx: 0 },
            { text: "Чему равен log_2(1/2)?", options: ["A) -1", "B) 1", "C) 0", "D) -2"], answerIdx: 0 },
            { text: "Вычислите: log_4(16)", options: ["A) 2", "B) 4", "C) 8", "D) 1"], answerIdx: 0 },
            { text: "Чему равен x, если 5^x = 125?", options: ["A) 3", "B) 4", "C) 5", "D) 25"], answerIdx: 0 },
            { text: "Чему равно (1/3)^-2?", options: ["A) 9", "B) 1/9", "C) -9", "D) 6"], answerIdx: 0 }
          ]
        }
      },
      "5": {
        notes: {
          title: "Математика // Раздел 5: Пределы и Производные",
          subtitle: "Основы математического анализа для расчета скоростей и траекторий (9 класс)",
          sections: [
            {
              heading: "1. Интуитивное понятие предела функции",
              text: "Предел функции — это значение, к которому стремится значение функции f(x), когда её аргумент x неограниченно приближается к заданной точке x₀. В курсе 9 класса это понятие вводится для понимания мгновенных процессов и исследования графиков сложных функций.",
              formula: "lim_{x ➔ x₀} f(x) = L",
              formulaDesc: "Математическая запись предела функции f(x) в точке x₀."
            },
            {
              heading: "2. Производная как скорость изменения (физический смысл)",
              text: "Производная функции в точке характеризует скорость изменения функции в этой точке. В физике 9 класса мгновенная скорость движущегося материального тела определяется как производная пути по времени. Таким образом, дифференцирование связывает положение объекта со скоростью его движения.",
              formula: "v(t) = s'(t)",
              formulaDesc: "Мгновенная скорость как производная пути s по времени t."
            },
            {
              heading: "3. Базовые правила дифференцирования",
              text: "Для нахождения производных применяются правила: производная константы равна нулю, производная линейной функции f(x) = kx равна k. Для степенной функции xⁿ производная вычисляется по формуле n * xⁿ⁻¹.",
              formula: "(xⁿ)' = n * xⁿ⁻¹",
              formulaDesc: "Правило дифференцирования степенной функции."
            }
          ]
        },
        exam: {
          title: "Экзамен: Пределы & Производные",
          desc: "Контроль базовых понятий математического анализа. 10 вопросов.",
          questions: [
            { text: "Найдите производную f(x) = x^2", options: ["A) 2x", "B) x", "C) 2", "D) x^3 / 3"], answerIdx: 0 },
            { text: "Вычислите предел: lim_{x➔3} (x + 5)", options: ["A) 8", "B) 5", "C) 3", "D) 15"], answerIdx: 0 },
            { text: "Найдите производную константы f(x) = 10", options: ["A) 0", "B) 10", "C) 10x", "D) 1"], answerIdx: 0 },
            { text: "Найдите производную f(x) = 5x", options: ["A) 5", "B) 5x", "C) 0", "D) x"], answerIdx: 0 },
            { text: "Чему равен lim_{x➔0} (sin(x)/x)?", options: ["A) 1", "B) 0", "C) Бесконечность", "D) Не определен"], answerIdx: 0 },
            { text: "Производная функции f(x) = sin(x) равна:", options: ["A) cos(x)", "B) -cos(x)", "C) sin(x)", "D) -sin(x)"], answerIdx: 0 },
            { text: "Производная функции f(x) = cos(x) равна:", options: ["A) -sin(x)", "B) sin(x)", "C) cos(x)", "D) -cos(x)"], answerIdx: 0 },
            { text: "Чему равен предел lim_{x➔∞} (1/x)?", options: ["A) 0", "B) 1", "C) Бесконечность", "D) Не определен"], answerIdx: 0 },
            { text: "Найдите производную f(x) = x^3 + x^2", options: ["A) 3x^2 + 2x", "B) 3x + 2", "C) 3x^3 + 2x^2", "D) x^2 + x"], answerIdx: 0 },
            { text: "Скорость — это производная от какой величины по времени?", options: ["A) Пути", "B) Ускорения", "C) Силы", "D) Массы"], answerIdx: 0 }
          ]
        }
      }
    },
    physics: {
      "1": {
        notes: {
          title: "Физика // Раздел 1: Законы Ньютона",
          subtitle: "Основы классической механики и динамики (9 класс)",
          sections: [
            {
              heading: "1. Первый закон Ньютона (Закон инерции)",
              text: "Существуют такие системы отсчета (называемые инерциальными), относительно которых изолированная материальная точка сохраняет свою скорость постоянной (или покоится), пока на неё не подействуют внешние силы. В космическом пространстве корабль летит по инерции с постоянной скоростью без работы двигателей именно благодаря этому закону.",
              formula: "v = const при ∑F = 0",
              formulaDesc: "Скорость неизменна, если равнодействующая всех сил равна нулю."
            },
            {
              heading: "2. Второй закон Ньютона",
              text: "Второй закон Ньютона связывает причину изменения движения (силу) с характеристикой самого тела (массой) и результатом действия (ускорением). Ускорение тела прямо пропорционально приложенной к нему силе и обратно пропорционально массе этого тела.",
              formula: "F = m * a",
              formulaDesc: "Сила (F, Ньютоны) равна произведению массы (m, кг) на ускорение (a, м/с²)."
            },
            {
              heading: "3. Третий закон Ньютона",
              text: "Тела взаимодействуют друг с другом с силами, равными по модулю и противоположными по направлению. Эти силы имеют одинаковую физическую природу и направлены вдоль одной прямой. Именно этот закон лежит в основе реактивного движения: ракета отбрасывает газы назад с силой F, а газы толкают ракету вперед с такой же силой.",
              formula: "F₁₂ = -F₂₁",
              formulaDesc: "Сила действия равна силе противодействия."
            }
          ]
        },
        exam: {
          title: "Экзамен: Механика & Законы Ньютона",
          desc: "Вопросы по кинематике и законам Ньютона. 10 вопросов.",
          questions: [
            { text: "Какая сила требуется для придания телу массой 10 кг ускорения 2 м/с²?", options: ["A) 20 Н", "B) 5 Н", "C) 12 Н", "D) 50 Н"], answerIdx: 0 },
            { text: "В каких единицах измеряется сила в системе СИ?", options: ["A) Ньютон", "B) Джоуль", "C) Ватт", "D) Паскаль"], answerIdx: 0 },
            { text: "Что такое инерция?", options: ["A) Свойство тела сохранять скорость", "B) Сила притяжения Земли", "C) Ускоренное движение", "D) Сопротивление воздуха"], answerIdx: 0 },
            { text: "Какое ускорение приобретает тело массой 4 кг под действием силы 16 Н?", options: ["A) 4 м/с²", "B) 64 м/с²", "C) 2 м/с²", "D) 8 м/с²"], answerIdx: 0 },
            { text: "Первый закон Ньютона также называют законом...", options: ["A) Инерции", "B) Действия и противодействия", "C) Тяготения", "D) Сохранения энергии"], answerIdx: 0 },
            { text: "Какое физическое тело оказывает большее противодействие изменению скорости?", options: ["A) С большей массой", "B) С меньшей массой", "C) С большей скоростью", "D) С большим объемом"], answerIdx: 0 },
            { text: "Формула веса тела в состоянии покоя на Земле:", options: ["A) P = m * g", "B) P = m / g", "C) P = F * d", "D) P = m * v"], answerIdx: 0 },
            { text: "Третий закон Ньютона утверждает, что силы действия и противодействия...", options: ["A) Равны по модулю и противоположны по направлению", "B) Складываются", "C) Не связаны", "D) Зависят от массы"], answerIdx: 0 },
            { text: "Ускорение свободного падения на Земле составляет примерно:", options: ["A) 9.8 м/с²", "B) 1.6 м/с²", "C) 3.7 м/с²", "D) 12 м/с²"], answerIdx: 0 },
            { text: "Чему равно ускорение тела при постоянной скорости?", options: ["A) 0", "B) 9.8 м/с²", "C) Не определено", "D) Зависит от пути"], answerIdx: 0 }
          ]
        }
      },
      "2": {
        notes: {
          title: "Физика // Раздел 2: Законы Сохранения",
          subtitle: "Импульс тела, работа, кинетическая и потенциальная энергия (9 класс)",
          sections: [
            {
              heading: "1. Импульс тела и закон сохранения импульса",
              text: "Импульс тела — это векторная физическая величина, равная произведению массы тела на его скорость. Закон сохранения импульса утверждает, что векторная сумма импульсов тел, составляющих замкнутую систему, остается постоянной при любых взаимодействиях тел между собой. Это объясняет отдачу при стрельбе и маневрирование корабля в вакууме с помощью микродвигателей.",
              formula: "p = m * v",
              formulaDesc: "Импульс тела (кг·м/с) равен произведению массы (кг) на скорость (м/с)."
            },
            {
              heading: "2. Механическая работа и мощность",
              text: "Механическая работа совершается только тогда, когда на тело действует сила и оно перемещается под её действием. Мощность характеризует быстроту совершения работы. В системе СИ работа измеряется в Джоулях (Дж), а мощность — в Ваттах (Вт).",
              formula: "A = F * s * cos(α) ; N = A / t",
              formulaDesc: "A — работа, F — сила, s — перемещение, α — угол между ними. N — мощность."
            },
            {
              heading: "3. Полная механическая энергия и закон сохранения энергии",
              text: "Энергия — единая мера различных форм движения материи. Кинетическая энергия — энергия движущегося тела. Потенциальная энергия определяется взаимным расположением взаимодействующих тел. Закон сохранения механической энергии гласит: в замкнутой системе тел, взаимодействующих силами упругости или тяготения, полная энергия остается постоянной.",
              formula: "E_k = mv² / 2 ; E_p = mgh",
              formulaDesc: "Формулы кинетической и потенциальной энергии поднятого над Землей тела."
            }
          ]
        },
        exam: {
          title: "Экзамен: Законы Сохранения",
          desc: "Проверка понимания кинетической энергии, импульса и работы. 10 вопросов.",
          questions: [
            { text: "Какая энергия увеличивается при подъеме тела вверх?", options: ["A) Потенциальная", "B) Кинетическая", "C) Внутренняя", "D) Химическая"], answerIdx: 0 },
            { text: "Формула импульса тела:", options: ["A) p = m * v", "B) p = m * a", "C) p = F * t", "D) p = m * v²"], answerIdx: 0 },
            { text: "В каких единицах измеряется механическая работа?", options: ["A) Джоуль", "B) Ватт", "C) Ньютон", "D) Ампер"], answerIdx: 0 },
            { text: "Какова кинетическая энергия тела массой 2 кг, движущегося со скоростью 3 м/с?", options: ["A) 9 Дж", "B) 6 Дж", "C) 18 Дж", "D) 3 Дж"], answerIdx: 0 },
            { text: "Чему равен импульс тела массой 5 кг, движущегося со скоростью 4 м/с?", options: ["A) 20 кг*м/с", "B) 1.25 кг*м/с", "C) 10 кг*м/с", "D) 40 кг*м/с"], answerIdx: 0 },
            { text: "Закон сохранения импульса выполняется в...", options: ["A) Замкнутой системе", "B) Открытой системе", "C) Только в вакууме", "D) При наличии трения"], answerIdx: 0 },
            { text: "Мощность характеризует...", options: ["A) Скорость совершения работы", "B) Величину силы", "C) Запас энергии", "D) Пройденный путь"], answerIdx: 0 },
            { text: "Чему равна потенциальная энергия тела массой 1 кг на высоте 10 м при g=10 м/с²?", options: ["A) 100 Дж", "B) 10 Дж", "C) 50 Дж", "D) 1 Дж"], answerIdx: 0 },
            { text: "При падении тела без сопротивления воздуха потенциальная энергия переходит в...", options: ["A) Кинетическую", "B) Внутреннюю", "C) Электрическую", "D) Не изменяется"], answerIdx: 0 },
            { text: "В каких единицах измеряется мощность в системе СИ?", options: ["A) Ватт", "B) Джоуль", "C) Вольт", "D) Ньютон"], answerIdx: 0 }
          ]
        }
      },
      "3": {
        notes: {
          title: "Физика // Раздел 3: Электрические Цепи (Закон Ома)",
          subtitle: "Основы цепей постоянного тока, напряжения и сопротивления (8 класс)",
          sections: [
            {
              heading: "1. Электрический ток и его основные параметры",
              text: "Электрический ток — это упорядоченное (направленное) движение заряженных частиц. Сила тока I (в Амперах) измеряет заряд, проходящий через сечение проводника за секунду. Напряжение U (в Вольтах) характеризует работу электрического поля по перемещению заряда. Сопротивление R (в Омах) показывает свойство проводника ограничивать ток.",
              formula: "I = q / t",
              formulaDesc: "Сила тока как скорость протекания электрического заряда q."
            },
            {
              heading: "2. Закон Ома для участка цепи",
              text: "Закон Ома является фундаментальным законом электродинамики 8 класса. Он утверждает, что сила тока на участке цепи прямо пропорциональна электрическому напряжению на концах этого участка и обратно пропорциональна его электрическому сопротивлению.",
              formula: "I = U / R",
              formulaDesc: "I — ток (А), U — напряжение (В), R — сопротивление (Ом)."
            },
            {
              heading: "3. Последовательное и параллельное соединения",
              text: "При последовательном соединении ток во всех элементах цепи одинаков, а общее сопротивление равно сумме сопротивлений. При параллельном соединении напряжение на всех ветвях одинаково, а величина, обратная общему сопротивлению, равна сумме обратных сопротивлений отдельных ветвей.",
              formula: "Последовательное: R_общ = R₁ + R₂ ; Параллельное: 1/R_общ = 1/R₁ + 1/R₂",
              formulaDesc: "Правила сложения сопротивлений в различных конфигурациях цепей."
            }
          ]
        },
        exam: {
          title: "Экзамен: Электродинамика & Закон Ома",
          desc: "Контроль навыков расчета параметров электрических схем. 10 вопросов.",
          questions: [
            { text: "Какова сила тока в цепи при напряжении 12 В и сопротивлении 4 Ом?", options: ["A) 3 А", "B) 48 А", "C) 0.33 А", "D) 8 А"], answerIdx: 0 },
            { text: "Единица измерения электрического сопротивления:", options: ["A) Ом", "B) Ампер", "C) Вольт", "D) Ватт"], answerIdx: 0 },
            { text: "При последовательном соединении резисторов 5 Ом и 10 Ом общее сопротивление равно:", options: ["A) 15 Ом", "B) 3.33 Ом", "C) 50 Ом", "D) 2 Ом"], answerIdx: 0 },
            { text: "При параллельном соединении двух одинаковых резисторов по 10 Ом общее сопротивление равно:", options: ["A) 5 Ом", "B) 20 Ом", "C) 10 Ом", "D) 15 Ом"], answerIdx: 0 },
            { text: "Сила тока измеряется в:", options: ["A) Амперах", "B) Вольтах", "C) Омах", "D) Кулонах"], answerIdx: 0 },
            { text: "Какой прибор служит для измерения напряжения в цепи?", options: ["A) Вольтметр", "B) Амперметр", "C) Омметр", "D) Ваттметр"], answerIdx: 0 },
            { text: "Формула электрической мощности:", options: ["A) P = I * V", "B) P = I / V", "C) P = I² / R", "D) P = V / R"], answerIdx: 0 },
            { text: "Какое вещество является хорошим проводником тока?", options: ["A) Медь", "B) Стекло", "C) Резина", "D) Пластик"], answerIdx: 0 },
            { text: "Как изменится ток в цепи, если сопротивление увеличить в 2 раза при постоянном V?", options: ["A) Уменьшится в 2 раза", "B) Увеличится в 2 раза", "C) Не изменится", "D) Станет равным нулю"], answerIdx: 0 },
            { text: "Амперметр подключается в цепь...", options: ["A) Последовательно", "B) Параллельно", "C) Любым способом", "D) Не подключается"], answerIdx: 0 }
          ]
        }
      },
      "4": {
        notes: {
          title: "Физика // Раздел 4: Волны и Геометрическая Оптика",
          subtitle: "Волновые процессы, отражение, преломление и линзы (9 класс)",
          sections: [
            {
              heading: "1. Механические волны и физика звука",
              text: "Механические колебания, распространяющиеся в упругой среде с течением времени, называются механическими волнами. Волна характеризуется частотой ν, периодом T, скоростью v и длиной волны λ. Звук — это продольная механическая волна, распространяющаяся в газообразных, жидких и твердых средах, но не способная звучать в вакууме.",
              formula: "v = λ * ν = λ / T",
              formulaDesc: "Связь скорости распространения волны с ее длиной и частотой."
            },
            {
              heading: "2. Законы геометрической оптики",
              text: "Свет распространяется прямолинейно в однородной среде. На границе раздела двух сред происходит отражение (угол падения равен углу отражения) и преломление света (изменение направления распространения при переходе в среду с иной оптической плотностью, описываемое законом Снеллиуса).",
              formula: "sin(α) / sin(β) = n₂ / n₁ = v₁ / v₂",
              formulaDesc: "Закон преломления света. α — угол падения, β — угол преломления, n — показатели преломления."
            },
            {
              heading: "3. Тонкие линзы и построение изображений",
              text: "Линза — прозрачное тело, ограниченное криволинейными поверхностями. Собирающая линза фокусирует параллельные лучи, а рассеивающая — расходящиеся. Формула тонкой линзы связывает фокусное расстояние F с расстоянием от линзы до предмета d и от линзы до изображения f.",
              formula: "1/F = 1/d + 1/f",
              formulaDesc: "Формула тонкой линзы для действительного изображения в собирающей линзе."
            }
          ]
        },
        exam: {
          title: "Экзамен: Волны & Оптика",
          desc: "Контроль тем преломления света и световых волн. 10 вопросов.",
          questions: [
            { text: "Чему равна скорость света в вакууме?", options: ["A) 300 000 км/с", "B) 340 м/с", "C) 3 000 км/с", "D) 30 000 км/с"], answerIdx: 0 },
            { text: "Изменение направления луча на границе двух сред называют...", options: ["A) Преломлением", "B) Отражением", "C) Интерференцией", "D) Дифракцией"], answerIdx: 0 },
            { text: "Угол падения луча равен углу...", options: ["A) Отражения", "B) Преломления", "C) Дифракции", "D) Поглощения"], answerIdx: 0 },
            { text: "Какая волна является звуковой в воздухе?", options: ["A) Продольная", "B) Поперечная", "C) Световая", "D) Электромагнитная"], answerIdx: 0 },
            { text: "Линза, которая собирает параллельные лучи в одну точку, называется:", options: ["A) Собирающая", "B) Рассеивающая", "C) Плоская", "D) Вогнутая"], answerIdx: 0 },
            { text: "Точка, в которой собираются лучи после прохождения собирающей линзы:", options: ["A) Фокус", "B) Оптический центр", "C) Полюс", "D) Вершина"], answerIdx: 0 },
            { text: "Частота световой волны определяет ее...", options: ["A) Цвет", "B) Скорость", "C) Яркость", "D) Направление"], answerIdx: 0 },
            { text: "Звук не может распространяться в...", options: ["A) Вакууме", "B) Воде", "C) Воздухе", "D) Металле"], answerIdx: 0 },
            { text: "Каков диапазон слышимых человеком частот звука?", options: ["A) 20 Гц - 20 кГц", "B) 0 - 100 Гц", "C) 20 кГц - 100 кГц", "D) Любая частота"], answerIdx: 0 },
            { text: "При переходе из воздуха в воду частота световой волны...", options: ["A) Не меняется", "B) Увеличивается", "C) Уменьшается", "D) Становится равной нулю"], answerIdx: 0 }
          ]
        }
      },
      "5": {
        notes: {
          title: "Физика // Раздел 5: Термодинамика & Теплообмен",
          subtitle: "Законы тепловых процессов и уравнения идеального газа (8 класс)",
          sections: [
            {
              heading: "1. Внутренняя энергия и процессы теплопередачи",
              text: "Внутренняя энергия тела слагается из кинетической энергии хаотического движения молекул и потенциальной энергии их взаимодействия. В теплообмене тепло передается от более нагретых тел к менее нагретым без совершения работы. Выделяют теплопроводность, конвекцию и излучение. Количество теплоты при нагревании рассчитывается по формуле Q = cmΔt.",
              formula: "Q = c * m * (t_кон - t_нач)",
              formulaDesc: "c — удельная теплоемкость (Дж/(кг·°C)), m — масса (кг), Δt — изменение температуры."
            },
            {
              heading: "2. Уравнение Менделеева-Клапейрона",
              text: "Уравнение состояния идеального газа связывает макроскопические параметры термодинамической системы: давление p, объем V и абсолютную температуру T. Оно применимо к разреженным газам, где взаимодействием между молекулами можно пренебречь.",
              formula: "p * V = (m / M) * R * T",
              formulaDesc: "p — давление (Па), V — объем (м³), m — масса, M — молярная масса, R — универсальная постоянная."
            },
            {
              heading: "3. Первый закон термодинамики и изопроцессы",
              text: "Изменение внутренней энергии закрытой термодинамической системы равно сумме подведенного к ней количества теплоты и работы внешних сил над системой. В курсе 8 класса рассматриваются изопроцессы: изотермический (температура постоянна), изохорный (объем постоянен) и изобарный (давление постоянно).",
              formula: "Q = ΔU + A_газа",
              formulaDesc: "Первый закон термодинамики. Q — теплота, ΔU — изменение внутренней энергии, A — работа газа."
            }
          ]
        },
        exam: {
          title: "Экзамен: Основы Термодинамики",
          desc: "Контроль законов термодинамики и газовых законов. 10 вопросов.",
          questions: [
            { text: "Чему соответствует температура 0 градусов Цельсия в шкале Кельвина?", options: ["A) 273.15 K", "B) 0 K", "C) 100 K", "D) -273.15 K"], answerIdx: 0 },
            { text: "В каком изопроцессе объем газа остается постоянным?", options: ["A) Изохорный", "B) Изобарный", "C) Изотермический", "D) Адиабатный"], answerIdx: 0 },
            { text: "Первый закон термодинамики — это закон сохранения...", options: ["A) Энергии", "B) Массы", "C) Импульса", "D) Температуры"], answerIdx: 0 },
            { text: "Количество теплоты, необходимое для нагрева вещества, вычисляется по формуле:", options: ["A) Q = c * m * Δt", "B) Q = m * L", "C) Q = p * ΔV", "D) Q = m * q"], answerIdx: 0 },
            { text: "Удельная теплоемкость измеряется в:", options: ["A) Дж / (кг * К)", "B) Дж", "C) Калориях", "D) Вт / м²"], answerIdx: 0 },
            { text: "Какое физическое состояние вещества характеризуется отсутствием постоянной формы и объема?", options: ["A) Газ", "B) Жидкость", "C) Твердое тело", "D) Плазма"], answerIdx: 0 },
            { text: "Какое термодинамическое понятие характеризует меру хаоса в системе?", options: ["A) Энтропия", "B) Энтальпия", "C) Внутренняя энергия", "D) Температура"], answerIdx: 0 },
            { text: "В изобарном процессе постоянным остается...", options: ["A) Давление", "B) Объем", "C) Температура", "D) Масса газа"], answerIdx: 0 },
            { text: "В изотермическом процессе постоянной остается...", options: ["A) Температура", "B) Давление", "C) Объем", "D) Внутренняя энергия"], answerIdx: 0 },
            { text: "Процесс перехода вещества из твердого состояния сразу в газообразное называют...", options: ["A) Сублимация", "B) Испарение", "C) Конденсация", "D) Плавление"], answerIdx: 0 }
          ]
        }
      }
    },
    cs: {
      "1": {
        notes: {
          title: "Информатика // Раздел 1: Системы счисления",
          subtitle: "Двоичные, восьмеричные, десятичные и шестнадцатеричные коды (8 класс)",
          sections: [
            {
              heading: "1. Понятие позиционной системы счисления",
              text: "Система счисления — это способ записи чисел с помощью определенного набора знаков (цифр). В позиционных системах значение цифры зависит от ее позиции (разряда) в числе. Компьютеры работают с двоичной системой счисления (основание 2), так как физические транзисторы имеют два стабильных состояния: включен (1) и выключен (0). Также широко используются восьмеричная и шестнадцатеричная системы для компактного представления кодов.",
              formula: "N_p = a_n * p^n + a_{n-1} * p^{n-1} + ... + a₀ * p⁰",
              formulaDesc: "Разложение числа по степеням основания p."
            },
            {
              heading: "2. Двоичное кодирование и перевод чисел",
              text: "Для перевода целого числа из десятичной системы счисления в систему с основанием p его последовательно делят на p, записывая остатки от деления в обратном порядке. При обратном переводе суммируют произведения цифр числа на степени основания p.",
              formula: "1101₂ = 1*2³ + 1*2² + 0*2¹ + 1*2⁰ = 8 + 4 + 0 + 1 = 13₁₀",
              formulaDesc: "Пример перевода двоичного кода 1101 в десятичную систему."
            },
            {
              heading: "3. Единицы измерения информации",
              text: "Наименьшей единицей измерения информации является бит (принимает значение 0 или 1). 8 бит составляют 1 байт. Согласно учебнику информатики за 8 класс, более крупные единицы (Килобайты, Мегабайты, Гигабайты) образуются путем умножения на степени двойки (2¹⁰ = 1024), а не на 1000.",
              formula: "1 Кбайт = 1024 байт ; 1 Мбайт = 1024 Кбайт",
              formulaDesc: "Соотношение единиц хранения цифровых данных."
            }
          ]
        },
        exam: {
          title: "Экзамен: Двоичные Коды",
          desc: "Контроль навыков двоичной арифметики и систем счисления. 10 вопросов.",
          questions: [
            { text: "Переведите двоичное число 1101 в десятичную систему:", options: ["A) 13", "B) 11", "C) 15", "D) 9"], answerIdx: 0 },
            { text: "Сколько бит в одном байте?", options: ["A) 8", "B) 4", "C) 16", "D) 32"], answerIdx: 0 },
            { text: "Какое основание имеет шестнадцатеричная система счисления?", options: ["A) 16", "B) 10", "C) 8", "D) 2"], answerIdx: 0 },
            { text: "Какая буква соответствует числу 10 в 16-ричной системе?", options: ["A) A", "B) B", "C) F", "D) E"], answerIdx: 0 },
            { text: "Переведите двоичный код 0110 в десятичное число:", options: ["A) 6", "B) 4", "C) 8", "D) 3"], answerIdx: 0 },
            { text: "Чему равно максимальное десятичное число, кодируемое 4 битами?", options: ["A) 15", "B) 16", "C) 7", "D) 31"], answerIdx: 0 },
            { text: "Какое десятичное число соответствует шестнадцатеричному F?", options: ["A) 15", "B) 10", "C) 16", "D) 14"], answerIdx: 0 },
            { text: "Как кодируется число 4 в двоичной системе?", options: ["A) 100", "B) 10", "C) 110", "D) 011"], answerIdx: 0 },
            { text: "Результат сложения двоичных чисел 10 и 01 равен:", options: ["A) 11", "B) 100", "C) 10", "D) 01"], answerIdx: 0 },
            { text: "Сколько различных значений можно закодировать 8 битами?", options: ["A) 256", "B) 128", "C) 512", "D) 64"], answerIdx: 0 }
          ]
        }
      },
      "2": {
        notes: {
          title: "Информатика // Раздел 2: Булева Алгебра & Вентили",
          subtitle: "Законы алгебры логики и цифровые микросхемы (8-9 классы)",
          sections: [
            {
              heading: "1. Основные операции алгебры логики",
              text: "Алгебра логики (Булева алгебра) работает с логическими высказываниями, которые могут быть либо ИСТИННЫМИ (1), либо ЛОЖНЫМИ (0). К базовым логическим операциям относятся: конъюнкция (логическое И, логическое умножение), дизъюнкция (логическое ИЛИ, логическое сложение) и инверсия (логическое НЕ, отрицание).",
              formula: "A ∧ B (AND) ; A ∨ B (OR) ; ¬A (NOT)",
              formulaDesc: "Математическая нотация основных логических операций."
            },
            {
              heading: "2. Таблицы истинности и законы логики",
              text: "Таблица истинности отображает результат логической функции для всех возможных комбинаций входных переменных. Законы Булевой алгебры (закон исключенного третьего, законы де Моргана, дистрибутивность) позволяют упрощать сложные логические выражения, ускоряя вычисления в компьютерных системах.",
              formula: "¬(A ∧ B) = ¬A ∨ ¬B ; ¬(A ∨ B) = ¬A ∧ ¬B",
              formulaDesc: "Законы де Моргана для отрицания конъюнкции и дизъюнкции."
            },
            {
              heading: "3. Логические элементы (вентили) компьютера",
              text: "Логический вентиль — это физическая электронная схема, реализующая простейшую логическую функцию. Элементы И (AND), ИЛИ (OR), НЕ (NOT), Исключающее ИЛИ (XOR) и их комбинации NAND/NOR составляют логическую архитектуру любого процессора. На их основе собираются сложные логические схемы (например, сумматоры и триггеры памяти).",
              formula: "Полусумматор: Sum = A ⊕ B ; Carry = A ∧ B",
              formulaDesc: "Логические функции суммирования двух бит без переноса."
            }
          ]
        },
        exam: {
          title: "Экзамен: Булева Логика",
          desc: "Контроль логических тождеств и вентилей. 10 вопросов.",
          questions: [
            { text: "Чему равен результат операции: True AND False?", options: ["A) False", "B) True", "C) Null", "D) Ошибка"], answerIdx: 0 },
            { text: "Какой вентиль возвращает True, только если входы различаются?", options: ["A) XOR", "B) AND", "C) OR", "D) NOT"], answerIdx: 0 },
            { text: "Каков результат операции NOT (True OR False)?", options: ["A) False", "B) True", "C) Null", "D) Ошибка"], answerIdx: 0 },
            { text: "Логическая операция конъюнкция — это аналог...", options: ["A) Логического умножения (И)", "B) Логического сложения (ИЛИ)", "C) Отрицания (НЕ)", "D) Исключения"], answerIdx: 0 },
            { text: "Логическая дизъюнкция — это аналог...", options: ["A) Логического сложения (ИЛИ)", "B) Умножения (И)", "C) НЕ", "D) XOR"], answerIdx: 0 },
            { text: "Какова таблица истинности вентиля NOT при входе 0?", options: ["A) 1", "B) 0", "C) Ошибка", "D) Null"], answerIdx: 0 },
            { text: "В чью честь названа алгебра логики (Булева алгебра)?", options: ["A) Джорджа Буля", "B) Алана Тьюринга", "C) Чарльза Бэббиджа", "D) Джона фон Неймана"], answerIdx: 0 },
            { text: "Какая операция возвращает 1, только если оба входа равны 0?", options: ["A) NOR (ИЛИ-НЕ)", "B) NAND", "C) XOR", "D) AND"], answerIdx: 0 },
            { text: "Логическое выражение A AND (NOT A) всегда равно...", options: ["A) False (0)", "B) True (1)", "C) A", "D) NOT A"], answerIdx: 0 },
            { text: "Выражение A OR (NOT A) всегда равно...", options: ["A) True (1)", "B) False (0)", "C) A", "D) NOT A"] }
          ]
        }
      },
      "3": {
        notes: {
          title: "Информатика // Раздел 3: Сложность Алгоритмов (Big O)",
          subtitle: "Оценка производительности программ и расхода памяти (9 класс)",
          sections: [
            {
              heading: "1. Понятие эффективности алгоритма",
              text: "Каждую задачу в программировании можно решить несколькими алгоритмами. При выборе наилучшего решения оценивают временную сложность (сколько операций выполнит процессор) и пространственную сложность (сколько оперативной памяти потребуется при увеличении объема входных данных N).",
              formula: "N ➔ f(N) шагов",
              formulaDesc: "Связь размера задачи N с количеством выполняемых операций."
            },
            {
              heading: "2. Нотация Big O (О-большое)",
              text: "Big O нотация описывает верхнюю границу времени выполнения алгоритма в худшем случае при стремлении N к бесконечности. Она отбрасывает несущественные константы и младшие слагаемые, фокусируясь на типе зависимости скорости выполнения от объема данных.",
              formula: "O(1) < O(log N) < O(N) < O(N log N) < O(N²)",
              formulaDesc: "Сравнение классов асимптотической сложности алгоритмов."
            },
            {
              heading: "3. Классы сложности на практических примерах",
              text: "Константное время O(1) характерно для получения элемента массива по индексу. Логарифмическое время O(log N) характерно для бинарного поиска. Линейное время O(N) возникает при одиночном переборе элементов массива. Квадратичная сложность O(N²) появляется при вложенных циклах (например, в пузырьковой сортировке).",
              formula: "O(N²) ➔ Цикл в цикле по массиву размера N",
              formulaDesc: "Квадратичный класс роста времени выполнения."
            }
          ]
        },
        exam: {
          title: "Экзамен: Нотация Big O",
          desc: "Контроль оценки сложности алгоритмов. 10 вопросов.",
          questions: [
            { text: "Какова временная сложность поиска элемента в хэш-таблице в лучшем случае?", options: ["A) O(1)", "B) O(N)", "C) O(log N)", "D) O(N²)"], answerIdx: 0 },
            { text: "Какова сложность бинарного поиска в отсортированном массиве?", options: ["A) O(log N)", "B) O(N)", "C) O(1)", "D) O(N log N)"], answerIdx: 0 },
            { text: "Какова сложность простого поиска перебором в массиве из N элементов?", options: ["A) O(N)", "B) O(log N)", "C) O(N²)", "D) O(1)"], answerIdx: 0 },
            { text: "Какова сложность алгоритма быстрой сортировки (QuickSort) в среднем?", options: ["A) O(N log N)", "B) O(N²)", "C) O(N)", "D) O(log N)"], answerIdx: 0 },
            { text: "Сложность пузырьковой сортировки (Bubble Sort) в худшем случае:", options: ["A) O(N²)", "B) O(N)", "C) O(N log N)", "D) O(1)"], answerIdx: 0 },
            { text: "Сложность обхода всех элементов двумерной матрицы размером N x N:", options: ["A) O(N²)", "B) O(N)", "C) O(2^N)", "D) O(N log N)"], answerIdx: 0 },
            { text: "Какой алгоритм работает быстрее при огромных значениях N?", options: ["A) O(log N)", "B) O(N)", "C) O(N log N)", "D) O(N²)"], answerIdx: 0 },
            { text: "Что означает O(1)?", options: ["A) Константная сложность", "B) Линейная сложность", "C) Один проход цикла", "D) Минимальное время"], answerIdx: 0 },
            { text: "Сложность поиска пути на графе в ширину (BFS) зависит от...", options: ["A) Количества вершин и ребер (V + E)", "B) Только вершин V", "C) Только ребер E", "D) Квадрата вершин V²"], answerIdx: 0 },
            { text: "Какая сложность растет быстрее всего с увеличением N?", options: ["A) O(2^N)", "B) O(N²)", "C) O(N log N)", "D) O(N)"] }
          ]
        }
      },
      "4": {
        notes: {
          title: "Информатика // Раздел 4: Алгоритмы Поиска & Сортировки",
          subtitle: "Организация упорядочивания и выборки данных в памяти (9 класс)",
          sections: [
            {
              heading: "1. Линейный и бинарный поиск в массиве",
              text: "Линейный поиск перебирает все элементы подряд и работает на любых массивах со сложностью O(N). Бинарный поиск требует, чтобы массив был строго отсортирован. Он на каждом шаге делит массив пополам, отбрасывая половину, в которой искомого элемента быть не может, что дает высокую скорость O(log N).",
              formula: "Бинарный поиск: O(log N) операций",
              formulaDesc: "Эффективность поиска в отсортированной последовательности."
            },
            {
              heading: "2. Простые алгоритмы сортировки (O(N²))",
              text: "Сортировка пузырьком (Bubble Sort) последовательно сравнивает соседние пары и меняет их местами, если порядок неверный. Сортировка выбором находит минимальный элемент и помещает его в начало. Эти алгоритмы просты в реализации, но неэффективны для больших массивов, требуя квадратичного времени O(N²).",
              formula: "Сложность пузырьковой сортировки: O(N²)",
              formulaDesc: "Худшее и среднее время выполнения простых алгоритмов."
            },
            {
              heading: "3. Эффективные сортировки (O(N log N))",
              text: "Алгоритмы, использующие рекурсивный подход 'разделяй и властвуй'. Сортировка слиянием (Merge Sort) делит массив на части, сортирует их и сливает воедино. Быстрая сортировка (QuickSort) выбирает опорный элемент и распределяет элементы относительно него. Они имеют среднюю сложность O(N log N).",
              formula: "QuickSort среднее: O(N log N)",
              formulaDesc: "Оптимальная сложность для алгоритмов общего сравнения."
            }
          ]
        },
        exam: {
          title: "Экзамен: Поиск & Сортировка",
          desc: "Контроль принципов работы алгоритмов сортировки и поиска. 10 вопросов.",
          questions: [
            { text: "Для какого поиска массив обязательно должен быть отсортирован?", options: ["A) Бинарного", "B) Линейного", "C) Поиска в глубину", "D) Случайного"], answerIdx: 0 },
            { text: "Какой алгоритм сортировки считается наиболее оптимальным по времени в среднем?", options: ["A) Быстрая сортировка", "B) Сортировка пузырьком", "C) Сортировка выбором", "D) Глупая сортировка"], answerIdx: 0 },
            { text: "Какой метод сортировки сравнивает соседние пары и меняет их местами?", options: ["A) Пузырьковая сортировка", "B) Быстрая сортировка", "C) Сортировка слиянием", "D) Пирамидальная сортировка"], answerIdx: 0 },
            { text: "Какова сложность сортировки слиянием (Merge Sort) в худшем случае?", options: ["A) O(N log N)", "B) O(N²)", "C) O(N)", "D) O(log N)"], answerIdx: 0 },
            { text: "Рекурсивный алгоритм — это алгоритм...", options: ["A) Вызывающий сам себя", "B) Работающий без остановки", "C) Который не имеет функций", "D) Выполняющийся параллельно"], answerIdx: 0 },
            { text: "Каким методом поиска проверяются все элементы по порядку?", options: ["A) Линейным поиском", "B) Бинарным поиском", "C) Интерполяционным поиском", "D) Хэш-поиском"], answerIdx: 0 },
            { text: "При бинарном поиске на каждом шаге область поиска уменьшается в...", options: ["A) 2 раза", "B) 10 раз", "C) 1.5 раза", "D) Зависит от N"], answerIdx: 0 },
            { text: "Что такое устойчивость (stability) сортировки?", options: ["A) Сохранение порядка равных элементов", "B) Скорость выполнения", "C) Расход дополнительной памяти", "D) Защита от переполнения стека"], answerIdx: 0 },
            { text: "Какая сортировка не использует сравнения элементов?", options: ["A) Поразрядная (Radix Sort / Counting Sort)", "B) Быстрая сортировка", "C) Сортировка кучей", "D) Сортировка вставками"], answerIdx: 0 },
            { text: "Сортировка пузырьком требует выделения дополнительной памяти объемом:", options: ["A) O(1) (in-place)", "B) O(N)", "C) O(log N)", "D) O(N²)"] }
          ]
        }
      },
      "5": {
        notes: {
          title: "Информатика // Раздел 5: Структуры Данных",
          subtitle: "Организация хранения и связей данных в памяти компьютера (9 класс)",
          sections: [
            {
              heading: "1. Массивы и связные списки",
              text: "Массив хранит элементы одного типа в непрерывной области памяти, что дает O(1) доступ по индексу, но требует O(N) времени для вставки в середину. Связный список состоит из узлов, содержащих данные и ссылки на соседние узлы. Вставка в список выполняется за O(1), но для поиска элемента по значению или индексу требуется линейный перебор O(N).",
              formula: "Массив: O(1) доступ ; Список: O(N) доступ",
              formulaDesc: "Сравнение производительности базовых структур данных."
            },
            {
              heading: "2. Стек и Очередь как линейные структуры",
              text: "Стек работает по принципу LIFO (Last In, First Out) — последним вошел, первым вышел (как стопка тарелок). Базовые операции: push (добавление) и pop (извлечение). Очередь функционирует по принципу FIFO (First In, First Out) — первым пришел, первым ушел. Используется для буферизации задач и планирования.",
              formula: "Стек: LIFO ; Очередь: FIFO",
              formulaDesc: "Принципы обслуживания элементов в структурах."
            },
            {
              heading: "3. Нелинейные структуры: Графы и Деревья",
              text: "Деревья и графы служат для отображения иерархических и сетевых связей. Бинарное дерево поиска имеет свойство: у любого узла левый потомок меньше родителя, а правый — больше. Это гарантирует быструю вставку и поиск за O(log N) в сбалансированном дереве.",
              formula: "Поиск в сбалансированном дереве: O(log N)",
              formulaDesc: "Сложность операций в древовидных структурах."
            }
          ]
        },
        exam: {
          title: "Экзамен: Структуры Данных",
          desc: "Контроль знаний о стеках, очередях, деревьях и связных списках. 10 вопросов.",
          questions: [
            { text: "По какому принципу функционирует стек?", options: ["A) LIFO", "B) FIFO", "C) LILO", "D) Случайный доступ"], answerIdx: 0 },
            { text: "По какому принципу работает классическая очередь?", options: ["A) FIFO", "B) LIFO", "C) Стек-доступ", "D) Бинарный обход"], answerIdx: 0 },
            { text: "Какая структура хранит данные в формате пар 'ключ-значение' с O(1) доступом?", options: ["A) Хэш-таблица (Словарь)", "B) Массив", "C) Связный список", "D) Стек"], answerIdx: 0 },
            { text: "Какое дерево имеет у каждой вершины не более двух потомков?", options: ["A) Бинарное дерево", "B) Дерево поиска", "C) B-дерево", "D) Красный граф"], answerIdx: 0 },
            { text: "Элемент связного списка содержит...", options: ["A) Значение и ссылку на следующий элемент", "B) Только индекс", "C) Только значение", "D) Хэш-ключ"], answerIdx: 0 },
            { text: "Какая операция в стеке извлекает верхний элемент?", options: ["A) Pop", "B) Push", "C) Peek", "D) Enqueue"], answerIdx: 0 },
            { text: "Какая операция в стеке помещает элемент наверх?", options: ["A) Push", "B) Pop", "C) Dequeue", "D) Insert"], answerIdx: 0 },
            { text: "В какой структуре данных элементы могут циклически ссылаться друг на друга?", options: ["A) Граф", "B) Стек", "C) Очередь", "D) Бинарное дерево"], answerIdx: 0 },
            { text: "Стек вызовов (Call Stack) в языках программирования служит для...", options: ["A) Отслеживания адресов возврата функций", "B) Сортировки чисел", "C) Выполнения баз данных", "D) Выделения динамической памяти"], answerIdx: 0 },
            { text: "Какое время доступа к произвольному элементу массива по индексу?", options: ["A) O(1)", "B) O(N)", "C) O(log N)", "D) O(N²)"] }
          ]
        }
      }
    }
  };
  return db[subject][topicId.toString()];
}

// Global initialization
window.addEventListener('DOMContentLoaded', () => {
  window.ui = new UIController();
});
