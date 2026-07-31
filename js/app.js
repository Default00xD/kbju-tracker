/**
 * КБЖУ Трекер — Основной скрипт приложения
 * Подсчет КБЖУ, шаблоны, отслеживание веса (+0.1/-0.1кг), календарь, статистика и JSON импорт/экспорт.
 */

// ==========================================
// 1. STATE & LOCALSTORAGE MANAGEMENT
// ==========================================
const STORAGE_KEYS = {
  INITIALIZED: 'kbju_initialized_v10',
  GOALS: 'kbju_goals_v10',
  TEMPLATES: 'kbju_templates_v10',
  LOGS: 'kbju_logs_v10',
  WEIGHTS: 'kbju_weights_v10',
  THEME: 'kbju_theme_v10'
};

// Default Goals
const DEFAULT_GOALS = {
  calories: 2000,
  protein: 130,
  fat: 65,
  carbs: 220
};

const DEFAULT_TEMPLATES = [];

class AppState {
  constructor() {
    this.selectedDate = this.getTodayIso();
    this.currentCalendarYear = new Date().getFullYear();
    this.currentCalendarMonth = new Date().getMonth();
    this.weightRange = '14'; // 14, 30, all

    const isInitialized = localStorage.getItem(STORAGE_KEYS.INITIALIZED);

    this.goals = this.loadFromStorage(STORAGE_KEYS.GOALS, DEFAULT_GOALS);
    this.templates = this.loadFromStorage(STORAGE_KEYS.TEMPLATES, DEFAULT_TEMPLATES);
    this.logs = this.loadFromStorage(STORAGE_KEYS.LOGS, {});
    this.weights = this.loadFromStorage(STORAGE_KEYS.WEIGHTS, {});
    this.theme = this.loadFromStorage(STORAGE_KEYS.THEME, 'dark');

    if (!isInitialized) {
      localStorage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
      this.saveToStorage(STORAGE_KEYS.GOALS, this.goals);
      this.saveToStorage(STORAGE_KEYS.TEMPLATES, this.templates);
      this.saveToStorage(STORAGE_KEYS.LOGS, this.logs);
      this.saveToStorage(STORAGE_KEYS.WEIGHTS, this.weights);
      this.saveToStorage(STORAGE_KEYS.THEME, this.theme);
    }
  }

  loadFromStorage(key, fallback) {
    try {
      const data = localStorage.getItem(key);
      if (data !== null && data !== undefined) {
        return JSON.parse(data);
      }
      return fallback;
    } catch (e) {
      console.error(`Failed to load ${key} from storage:`, e);
      return fallback;
    }
  }

  saveToStorage(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
      if (window.cloudSync && key !== STORAGE_KEYS.THEME) {
        window.cloudSync.debouncedPushToCloud();
      }
    } catch (e) {
      console.error(`Failed to save ${key} to storage:`, e);
    }
  }

  getTodayIso() {
    const today = new Date();
    return this.formatDateIso(today);
  }

  formatDateIso(dateObj) {
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  initSampleLogsIfEmpty() {
    const today = this.getTodayIso();
    if (Object.keys(this.logs).length === 0) {
      this.logs[today] = [
        {
          id: 'log-sample-1',
          templateId: 'tpl-1',
          name: 'Овсянка с ягодами и орехами',
          category: 'breakfast',
          calories: 350,
          protein: 12,
          fat: 8,
          carbs: 55,
          portionFactor: 1
        },
        {
          id: 'log-sample-2',
          templateId: 'tpl-3',
          name: 'Куриное филе с гречкой и салатом',
          category: 'lunch',
          calories: 480,
          protein: 42,
          fat: 9,
          carbs: 52,
          portionFactor: 1
        }
      ];
      this.saveToStorage(STORAGE_KEYS.LOGS, this.logs);
    }

    if (Object.keys(this.weights).length === 0) {
      this.weights[today] = 72.5;
      this.saveToStorage(STORAGE_KEYS.WEIGHTS, this.weights);
    }
  }

  // Goal updates
  setGoals(newGoals) {
    this.goals = { ...this.goals, ...newGoals };
    this.saveToStorage(STORAGE_KEYS.GOALS, this.goals);
  }

  // Template methods
  addTemplate(template) {
    template.id = 'tpl-' + Date.now();
    this.templates.push(template);
    this.saveToStorage(STORAGE_KEYS.TEMPLATES, this.templates);
    return template;
  }

  updateTemplate(id, updatedFields) {
    const idx = this.templates.findIndex(t => t.id === id);
    if (idx !== -1) {
      this.templates[idx] = { ...this.templates[idx], ...updatedFields };
      this.saveToStorage(STORAGE_KEYS.TEMPLATES, this.templates);
    }
  }

  deleteTemplate(id) {
    this.templates = this.templates.filter(t => t.id !== id);
    this.saveToStorage(STORAGE_KEYS.TEMPLATES, this.templates);
  }

  // Log methods (Snapshot strategy: historical items keep independent values!)
  addMealLog(dateStr, mealLog) {
    if (!this.logs[dateStr]) {
      this.logs[dateStr] = [];
    }
    mealLog.id = 'log-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4);
    this.logs[dateStr].push(mealLog);
    this.saveToStorage(STORAGE_KEYS.LOGS, this.logs);
  }

  deleteMealLog(dateStr, logId) {
    if (this.logs[dateStr]) {
      this.logs[dateStr] = this.logs[dateStr].filter(item => item.id !== logId);
      if (this.logs[dateStr].length === 0) {
        delete this.logs[dateStr];
      }
      this.saveToStorage(STORAGE_KEYS.LOGS, this.logs);
    }
  }

  getDayTotals(dateStr) {
    const dayItems = this.logs[dateStr] || [];
    return dayItems.reduce((acc, item) => {
      acc.calories += Number(item.calories) || 0;
      acc.protein += Number(item.protein) || 0;
      acc.fat += Number(item.fat) || 0;
      acc.carbs += Number(item.carbs) || 0;
      return acc;
    }, { calories: 0, protein: 0, fat: 0, carbs: 0 });
  }

  // Weight methods (+0.1 / -0.1 precision handling)
  setWeight(dateStr, weightVal) {
    // Precise float rounding to 1 decimal
    const rounded = Math.round(Number(weightVal) * 10) / 10;
    if (isNaN(rounded) || rounded <= 0) {
      delete this.weights[dateStr];
    } else {
      this.weights[dateStr] = rounded;
    }
    this.saveToStorage(STORAGE_KEYS.WEIGHTS, this.weights);
  }

  getWeight(dateStr) {
    return this.weights[dateStr] || null;
  }
}

// Instantiate Global App State
const state = new AppState();

// ==========================================
// 2. UI RENDERERS & EVENT HANDLERS
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  window.cloudSync = new CloudDatabaseService(state);
  try { window.cloudSync.initUI(); } catch (e) { console.error(e); }
  try { initTheme(); } catch (e) { console.error(e); }
  try { initNavigation(); } catch (e) { console.error(e); }
  try { initDashboard(); } catch (e) { console.error(e); }
  try { initTemplatesPage(); } catch (e) { console.error(e); }
  try { initWeightTracker(); } catch (e) { console.error(e); }
  try { initCalendarAndStats(); } catch (e) { console.error(e); }
  try { initModals(); } catch (e) { console.error(e); }
  try { initBackup(); } catch (e) { console.error(e); }
});

// --- Theme Management ---
function initTheme() {
  document.documentElement.setAttribute('data-theme', state.theme);
  updateThemeIcon();

  document.addEventListener('click', (e) => {
    const themeBtn = e.target.closest('#themeToggleBtn');
    if (themeBtn) {
      state.theme = state.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', state.theme);
      state.saveToStorage(STORAGE_KEYS.THEME, state.theme);
      updateThemeIcon();
      try {
        renderWeightChart();
        renderNutritionChart();
      } catch (err) {}
    }
  });
}

function updateThemeIcon() {
  const icons = document.querySelectorAll('#themeToggleBtn i');
  icons.forEach(icon => {
    if (state.theme === 'dark') {
      icon.className = 'fa-solid fa-sun';
    } else {
      icon.className = 'fa-solid fa-moon';
    }
  });
}

// --- Toast Notifications ---
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let icon = 'fa-info-circle';
  if (type === 'success') icon = 'fa-circle-check';
  if (type === 'warning') icon = 'fa-triangle-exclamation';

  toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// --- Navigation Tabs ---
function initNavigation() {
  const navBtns = document.querySelectorAll('.nav-btn');
  const pages = document.querySelectorAll('.tab-page');

  navBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const targetTab = btn.getAttribute('data-tab');

      navBtns.forEach(b => {
        if (b.getAttribute('data-tab') === targetTab) b.classList.add('active');
        else b.classList.remove('active');
      });

      pages.forEach(p => p.classList.remove('active'));
      const activePage = document.getElementById(`tab-${targetTab}`);
      if (activePage) {
        activePage.classList.add('active');
      }

      window.scrollTo({ top: 0, behavior: 'smooth' });

      // Trigger page-specific re-renders
      try {
        if (targetTab === 'dashboard') renderDashboard();
        if (targetTab === 'templates') renderTemplatesList();
        if (targetTab === 'weight') renderWeightPage();
        if (targetTab === 'calendar') renderCalendarAndStatsPage();
      } catch (err) {
        console.error('Tab render error:', err);
      }
    });
  });
}

// ==========================================
// 3. TAB 1: DASHBOARD (ГЛАВНАЯ)
// ==========================================

function initDashboard() {
  const datePicker = document.getElementById('datePickerInput');
  datePicker.value = state.selectedDate;

  datePicker.addEventListener('change', (e) => {
    if (e.target.value) {
      state.selectedDate = e.target.value;
      renderDashboard();
    }
  });

  document.getElementById('prevDateBtn').addEventListener('click', () => {
    changeSelectedDate(-1);
  });

  document.getElementById('nextDateBtn').addEventListener('click', () => {
    changeSelectedDate(1);
  });

  document.getElementById('todayBtn').addEventListener('click', () => {
    state.selectedDate = state.getTodayIso();
    datePicker.value = state.selectedDate;
    renderDashboard();
  });

  // Delegate meal category add buttons
  document.querySelectorAll('.add-meal-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mealType = btn.getAttribute('data-meal-type');
      openAddMealModal(mealType);
    });
  });

  renderDashboard();
}

function changeSelectedDate(days) {
  const [y, m, d] = state.selectedDate.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  state.selectedDate = state.formatDateIso(date);
  document.getElementById('datePickerInput').value = state.selectedDate;
  renderDashboard();
}

function renderDashboard() {
  // Update Date Display
  const dateObj = parseIsoDate(state.selectedDate);
  document.getElementById('dateTextMain').textContent = formatDateRussian(dateObj);
  
  const isToday = state.selectedDate === state.getTodayIso();
  const subTextBadge = document.getElementById('dateSubText');
  if (isToday) {
    subTextBadge.textContent = 'Сегодня';
    subTextBadge.className = 'badge-today';
  } else {
    subTextBadge.textContent = dateObj.toLocaleDateString('ru-RU', { weekday: 'long' });
    subTextBadge.className = 'badge-today badge-dayname';
  }

  // Calculate KBJU Totals for Selected Date
  const totals = state.getDayTotals(state.selectedDate);
  const goals = state.goals;

  // Render Gauges / Progress Bars
  renderMacroBar('calories', totals.calories, goals.calories, 'ккал', true);
  renderMacroBar('protein', totals.protein, goals.protein, 'г');
  renderMacroBar('fat', totals.fat, goals.fat, 'г');
  renderMacroBar('carbs', totals.carbs, goals.carbs, 'г');

  // Render Meal Categories Items
  renderMealCategoryItems('breakfast');
  renderMealCategoryItems('lunch');
  renderMealCategoryItems('dinner');
  renderMealCategoryItems('snack');
}

function renderMacroBar(macro, current, target, unit, isCalories = false) {
  current = Math.round(current);
  target = Math.round(target);

  const percent = target > 0 ? Math.min(Math.round((current / target) * 100), 200) : 0;
  const barElem = document.getElementById(`${macro}Bar`);
  const isOver = current > target;

  if (barElem) {
    barElem.style.width = Math.min(percent, 100) + '%';
    if (isOver) {
      barElem.classList.add('over-goal');
    } else {
      barElem.classList.remove('over-goal');
    }
  }

  if (isCalories) {
    document.getElementById('caloriesCurrent').textContent = current;
    document.getElementById('caloriesTarget').textContent = `Цель: ${target} ${unit}`;
    
    const statusElem = document.getElementById('caloriesStatus');
    if (isOver) {
      statusElem.textContent = `Перебор: +${current - target} ккал!`;
      statusElem.style.color = 'var(--overgoal-color)';
    } else {
      statusElem.textContent = `Осталось: ${target - current} ккал`;
      statusElem.style.color = 'var(--text-muted)';
    }
  } else {
    document.getElementById(`${macro}Current`).textContent = current;
    document.getElementById(`${macro}Target`).textContent = `${target}${unit}`;
    const pctElem = document.getElementById(`${macro}Percent`);
    if (pctElem) {
      pctElem.textContent = `${percent}%`;
      if (isOver) pctElem.style.color = 'var(--overgoal-color)';
      else pctElem.style.color = 'var(--text-muted)';
    }
  }
}

function renderMealCategoryItems(category) {
  const container = document.getElementById(`${category}Items`);
  const summaryElem = document.getElementById(`${category}Summary`);
  const dayLogs = state.logs[state.selectedDate] || [];
  const categoryItems = dayLogs.filter(item => item.category === category);

  // Category Total KBJU
  const totals = categoryItems.reduce((acc, item) => {
    acc.cal += item.calories;
    acc.p += item.protein;
    acc.f += item.fat;
    acc.c += item.carbs;
    return acc;
  }, { cal: 0, p: 0, f: 0, c: 0 });

  summaryElem.textContent = `${Math.round(totals.cal)} ккал • Б:${totals.p.toFixed(1)} Ж:${totals.f.toFixed(1)} У:${totals.c.toFixed(1)}`;

  if (categoryItems.length === 0) {
    container.innerHTML = `<div class="empty-meal-hint">Записей нет</div>`;
    return;
  }

  container.innerHTML = categoryItems.map(item => `
    <div class="meal-item-row">
      <div class="meal-item-info">
        <span class="meal-item-name">${escapeHtml(item.name)} ${item.grams ? `<small style="color:var(--text-muted)">(${item.grams}г)</small>` : ''}</span>
        <div class="meal-item-kbju">
          <span class="tag-cal">${Math.round(item.calories)} ккал</span>
          <span>Б: ${item.protein.toFixed(1)}г</span>
          <span>Ж: ${item.fat.toFixed(1)}г</span>
          <span>У: ${item.carbs.toFixed(1)}г</span>
        </div>
      </div>
      <div class="meal-item-actions">
        <button class="icon-action-btn delete-btn" title="Удалить запись" onclick="deleteMealLogItem('${item.id}')">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </div>
    </div>
  `).join('');
}

window.deleteMealLogItem = function(logId) {
  state.deleteMealLog(state.selectedDate, logId);
  renderDashboard();
  showToast('Запись удалена', 'info');
};

// ==========================================
// 4. TAB 2: TEMPLATES (ШАБЛОНЫ)
// ==========================================

let activeTemplateFilter = 'all';

function initTemplatesPage() {
  document.getElementById('createTemplateBtn').addEventListener('click', () => {
    openTemplateEditModal();
  });

  document.getElementById('templateSearchInput').addEventListener('input', () => {
    renderTemplatesList();
  });

  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      activeTemplateFilter = chip.getAttribute('data-filter');
      renderTemplatesList();
    });
  });

  renderTemplatesList();
}

function renderTemplatesList() {
  const container = document.getElementById('templatesGrid');
  const searchQuery = (document.getElementById('templateSearchInput').value || '').toLowerCase().trim();

  let filtered = state.templates;

  if (activeTemplateFilter !== 'all') {
    filtered = filtered.filter(t => t.category === activeTemplateFilter);
  }

  if (searchQuery) {
    filtered = filtered.filter(t => t.name.toLowerCase().includes(searchQuery));
  }

  if (filtered.length === 0) {
    container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: var(--text-muted)">
      <i class="fa-solid fa-folder-open" style="font-size: 2.5rem; margin-bottom: 0.5rem"></i>
      <p>Шаблоны не найдены</p>
    </div>`;
    return;
  }

  const categoryNames = {
    breakfast: 'Завтрак',
    lunch: 'Обед',
    dinner: 'Ужин',
    snack: 'Перекус'
  };

  container.innerHTML = filtered.map(tpl => `
    <div class="template-card card">
      <div>
        <div class="template-card-header">
          <span class="template-name">${escapeHtml(tpl.name)}</span>
          <span class="category-badge badge-${tpl.category}">${categoryNames[tpl.category] || tpl.category}</span>
        </div>
        <div class="template-kbju-grid">
          <div class="tpl-kbju-item">
            <span class="tpl-val calories-color">${Math.round(tpl.calories)}</span>
            <span class="tpl-lbl">ккал</span>
          </div>
          <div class="tpl-kbju-item">
            <span class="tpl-val protein-color">${tpl.protein}г</span>
            <span class="tpl-lbl">Белок</span>
          </div>
          <div class="tpl-kbju-item">
            <span class="tpl-val fat-color">${tpl.fat}г</span>
            <span class="tpl-lbl">Жир</span>
          </div>
          <div class="tpl-kbju-item">
            <span class="tpl-val carbs-color">${tpl.carbs}г</span>
            <span class="tpl-lbl">Углевод</span>
          </div>
        </div>
      </div>
      <div class="template-actions">
        <button class="btn btn-sm btn-secondary btn-block" onclick="quickLogTemplate('${tpl.id}')">
          <i class="fa-solid fa-plus"></i> В дневник
        </button>
        <button class="icon-btn" title="Редактировать" onclick="openTemplateEditModal('${tpl.id}')">
          <i class="fa-solid fa-pen-to-square"></i>
        </button>
        <button class="icon-btn" title="Удалить" onclick="confirmDeleteTemplate('${tpl.id}')">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </div>
    </div>
  `).join('');
}

window.quickLogTemplate = function(tplId) {
  const template = state.templates.find(t => t.id === tplId);
  if (!template) return;

  state.addMealLog(state.selectedDate, {
    templateId: template.id,
    name: template.name,
    category: template.category,
    calories: template.calories,
    protein: template.protein,
    fat: template.fat,
    carbs: template.carbs,
    portionFactor: 1
  });

  showToast(`Добавлено: "${template.name}"`, 'success');
  renderDashboard();
};

window.confirmDeleteTemplate = function(tplId) {
  if (confirm('Вы уверены, что хотите удалить этот шаблон? (Ранее сохранённые приёмы пищи в истории сохранятся)')) {
    state.deleteTemplate(tplId);
    renderTemplatesList();
    showToast('Шаблон удалён', 'info');
  }
};

// ==========================================
// 5. TAB 3: WEIGHT TRACKER (ВЕС)
// ==========================================

function initWeightTracker() {
  const minusBtn = document.getElementById('weightMinusBtn');
  const plusBtn = document.getElementById('weightPlusBtn');
  const weightInput = document.getElementById('weightInput');
  const saveBtn = document.getElementById('saveWeightBtn');

  minusBtn.addEventListener('click', () => {
    let val = parseFloat(weightInput.value) || 70.0;
    val = Math.round((val - 0.1) * 10) / 10;
    if (val < 20) val = 20;
    weightInput.value = val.toFixed(1);
  });

  plusBtn.addEventListener('click', () => {
    let val = parseFloat(weightInput.value) || 70.0;
    val = Math.round((val + 0.1) * 10) / 10;
    if (val > 300) val = 300;
    weightInput.value = val.toFixed(1);
  });

  saveBtn.addEventListener('click', () => {
    const val = parseFloat(weightInput.value);
    if (!val || val <= 0) {
      showToast('Введите корректный вес', 'warning');
      return;
    }
    state.setWeight(state.selectedDate, val);
    renderWeightPage();
    showToast(`Вес ${val.toFixed(1)} кг сохранён!`, 'success');
  });

  // Range selector
  document.querySelectorAll('.range-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.weightRange = btn.getAttribute('data-range');
      renderWeightChart();
    });
  });

  renderWeightPage();
}

function renderWeightPage() {
  const currentVal = state.getWeight(state.selectedDate);
  const weightInput = document.getElementById('weightInput');
  if (weightInput) {
    if (currentVal !== null) {
      weightInput.value = currentVal.toFixed(1);
    } else {
      const sortedDates = Object.keys(state.weights).sort();
      const latest = sortedDates.length > 0 ? state.weights[sortedDates[sortedDates.length - 1]] : 70.0;
      weightInput.value = latest.toFixed(1);
    }
  }

  // Quick stats
  const sortedDates = Object.keys(state.weights).sort();
  const currentWeightElem = document.getElementById('currentWeightVal');
  const weightDiffElem = document.getElementById('weightDiff7d');
  const weightMinMaxElem = document.getElementById('weightMinMax');

  if (sortedDates.length > 0) {
    const latestVal = state.weights[sortedDates[sortedDates.length - 1]];
    if (currentWeightElem) currentWeightElem.textContent = `${latestVal.toFixed(1)} кг`;

    const weightsArr = sortedDates.map(d => state.weights[d]);
    const minW = Math.min(...weightsArr);
    const maxW = Math.max(...weightsArr);
    if (weightMinMaxElem) weightMinMaxElem.textContent = `${minW.toFixed(1)} / ${maxW.toFixed(1)} кг`;

    if (sortedDates.length > 1) {
      const firstVal = state.weights[sortedDates[0]];
      const diff = latestVal - firstVal;
      const sign = diff > 0 ? '+' : '';
      if (weightDiffElem) {
        weightDiffElem.textContent = `${sign}${diff.toFixed(1)} кг`;
        weightDiffElem.style.color = diff <= 0 ? 'var(--carbs-color)' : 'var(--calories-color)';
      }
    } else if (weightDiffElem) {
      weightDiffElem.textContent = '0.0 кг';
    }
  } else {
    if (currentWeightElem) currentWeightElem.textContent = '-- кг';
    if (weightDiffElem) weightDiffElem.textContent = '-- кг';
    if (weightMinMaxElem) weightMinMaxElem.textContent = '-- / -- кг';
  }

  renderWeightHistoryTable();
  renderWeightChart();
}

function renderWeightHistoryTable() {
  const tbody = document.getElementById('weightHistoryTableBody');
  if (!tbody) return;
  const sortedDates = Object.keys(state.weights).sort().reverse();

  if (sortedDates.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted)">Нет сохраненных записей веса</td></tr>`;
    return;
  }

  tbody.innerHTML = sortedDates.map((dateStr, idx) => {
    const weight = state.weights[dateStr];
    let diffStr = '--';
    let diffColor = 'inherit';

    if (idx < sortedDates.length - 1) {
      const prevWeight = state.weights[sortedDates[idx + 1]];
      const diff = weight - prevWeight;
      if (diff !== 0) {
        const sign = diff > 0 ? '+' : '';
        diffStr = `${sign}${diff.toFixed(1)} кг`;
        diffColor = diff < 0 ? 'var(--carbs-color)' : 'var(--calories-color)';
      } else {
        diffStr = '0.0 кг';
      }
    }

    return `
      <tr>
        <td>${formatDateRussian(parseIsoDate(dateStr))}</td>
        <td><strong>${weight.toFixed(1)} кг</strong></td>
        <td style="color: ${diffColor}">${diffStr}</td>
        <td>
          <button class="icon-action-btn delete-btn" onclick="deleteWeightLog('${dateStr}')">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

window.deleteWeightLog = function(dateStr) {
  delete state.weights[dateStr];
  state.saveToStorage(STORAGE_KEYS.WEIGHTS, state.weights);
  renderWeightPage();
  showToast('Запись веса удалена', 'info');
};

// Canvas Line Chart for Weight
function renderWeightChart() {
  const canvas = document.getElementById('weightCanvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const width = canvas.offsetWidth || 600;
  const height = canvas.offsetHeight || 240;

  // DPR retina fix
  canvas.width = width * window.devicePixelRatio;
  canvas.height = height * window.devicePixelRatio;
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

  ctx.clearRect(0, 0, width, height);

  let sortedDates = Object.keys(state.weights).sort();
  if (state.weightRange !== 'all') {
    const daysLimit = parseInt(state.weightRange, 10);
    sortedDates = sortedDates.slice(-daysLimit);
  }

  if (sortedDates.length < 2) {
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim();
    ctx.font = '14px Inter';
    ctx.textAlign = 'center';
    ctx.fillText('Добавьте минимум 2 записи веса для построения графика', width / 2, height / 2);
    return;
  }

  const values = sortedDates.map(d => state.weights[d]);
  const minVal = Math.floor(Math.min(...values) - 0.5);
  const maxVal = Math.ceil(Math.max(...values) + 0.5);

  const paddingLeft = 40;
  const paddingRight = 20;
  const paddingTop = 30;
  const paddingBottom = 40;

  const chartW = width - paddingLeft - paddingRight;
  const chartH = height - paddingTop - paddingBottom;

  // Grid lines
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--border-color').trim();
  ctx.lineWidth = 1;
  ctx.font = '11px Inter';
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim();

  const gridSteps = 4;
  for (let i = 0; i <= gridSteps; i++) {
    const y = paddingTop + (chartH / gridSteps) * i;
    const val = (maxVal - (i * (maxVal - minVal) / gridSteps)).toFixed(1);

    ctx.beginPath();
    ctx.moveTo(paddingLeft, y);
    ctx.lineTo(width - paddingRight, y);
    ctx.stroke();

    ctx.textAlign = 'right';
    ctx.fillText(val, paddingLeft - 8, y + 4);
  }

  // Points coords
  const points = sortedDates.map((dateStr, idx) => {
    const x = paddingLeft + (idx / (sortedDates.length - 1)) * chartW;
    const val = state.weights[dateStr];
    const y = paddingTop + chartH - ((val - minVal) / (maxVal - minVal)) * chartH;
    return { x, y, val, dateStr };
  });

  // Gradient area under curve
  const gradient = ctx.createLinearGradient(0, paddingTop, 0, height - paddingBottom);
  gradient.addColorStop(0, 'rgba(99, 102, 241, 0.3)');
  gradient.addColorStop(1, 'rgba(99, 102, 241, 0.0)');

  ctx.beginPath();
  ctx.moveTo(points[0].x, height - paddingBottom);
  points.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.lineTo(points[points.length - 1].x, height - paddingBottom);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  // Line
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  points.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.strokeStyle = '#6366f1';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Dots
  points.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#6366f1';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
  });
}

// ==========================================
// 6. TAB 4: CALENDAR & STATS
// ==========================================

function initCalendarAndStats() {
  const prevBtn = document.getElementById('calPrevMonthBtn');
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      state.currentCalendarMonth--;
      if (state.currentCalendarMonth < 0) {
        state.currentCalendarMonth = 11;
        state.currentCalendarYear--;
      }
      renderCalendar();
    });
  }

  const nextBtn = document.getElementById('calNextMonthBtn');
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      state.currentCalendarMonth++;
      if (state.currentCalendarMonth > 11) {
        state.currentCalendarMonth = 0;
        state.currentCalendarYear++;
      }
      renderCalendar();
    });
  }

  renderCalendarAndStatsPage();
}

function renderCalendarAndStatsPage() {
  renderAverages();
  renderCalendar();
  renderNutritionChart();
}

function renderAverages() {
  const weekStats = calculatePastDaysAverage(7);
  const monthStats = calculatePastDaysAverage(30);

  const avg7Cal = document.getElementById('avg7Calories');
  const avg7P = document.getElementById('avg7Protein');
  const avg7F = document.getElementById('avg7Fat');
  const avg7C = document.getElementById('avg7Carbs');

  if (avg7Cal) avg7Cal.textContent = Math.round(weekStats.calories);
  if (avg7P) avg7P.textContent = `${Math.round(weekStats.protein)}г`;
  if (avg7F) avg7F.textContent = `${Math.round(weekStats.fat)}г`;
  if (avg7C) avg7C.textContent = `${Math.round(weekStats.carbs)}г`;

  const avgMCal = document.getElementById('avgMonthCalories');
  const avgMP = document.getElementById('avgMonthProtein');
  const avgMF = document.getElementById('avgMonthFat');
  const avgMC = document.getElementById('avgMonthCarbs');

  if (avgMCal) avgMCal.textContent = Math.round(monthStats.calories);
  if (avgMP) avgMP.textContent = `${Math.round(monthStats.protein)}г`;
  if (avgMF) avgMF.textContent = `${Math.round(monthStats.fat)}г`;
  if (avgMC) avgMC.textContent = `${Math.round(monthStats.carbs)}г`;
}

function calculatePastDaysAverage(daysCount) {
  const today = new Date();
  let totalCal = 0, totalP = 0, totalF = 0, totalC = 0;
  let activeDays = 0;

  for (let i = 0; i < daysCount; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const isoStr = state.formatDateIso(d);
    const totals = state.getDayTotals(isoStr);

    if (totals.calories > 0) {
      totalCal += totals.calories;
      totalP += totals.protein;
      totalF += totals.fat;
      totalC += totals.carbs;
      activeDays++;
    }
  }

  const divisor = activeDays > 0 ? activeDays : 1;

  return {
    calories: totalCal / divisor,
    protein: totalP / divisor,
    fat: totalF / divisor,
    carbs: totalC / divisor
  };
}

function renderCalendar() {
  const grid = document.getElementById('calendarDaysGrid');
  const monthYearText = document.getElementById('calendarMonthYearText');

  const year = state.currentCalendarYear;
  const month = state.currentCalendarMonth;

  const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  monthYearText.textContent = `${monthNames[month]} ${year}`;

  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);

  // Monday = 0, Sunday = 6
  let startingDayOfWeek = (firstDayOfMonth.getDay() + 6) % 7;
  const daysInMonth = lastDayOfMonth.getDate();

  grid.innerHTML = '';

  // Previous month padding days
  const prevMonthLastDay = new Date(year, month, 0).getDate();
  for (let i = startingDayOfWeek - 1; i >= 0; i--) {
    const dayNum = prevMonthLastDay - i;
    grid.appendChild(createCalCell(dayNum, true));
  }

  // Current month days
  const todayIso = state.getTodayIso();
  for (let day = 1; day <= daysInMonth; day++) {
    const dateObj = new Date(year, month, day);
    const isoStr = state.formatDateIso(dateObj);
    const isToday = isoStr === todayIso;

    const totals = state.getDayTotals(isoStr);
    const weight = state.getWeight(isoStr);

    const cell = createCalCell(day, false, isToday, totals, weight, isoStr);
    grid.appendChild(cell);
  }

  // Next month padding days
  const totalCellsSoFar = startingDayOfWeek + daysInMonth;
  const remainingCells = (7 - (totalCellsSoFar % 7)) % 7;
  for (let i = 1; i <= remainingCells; i++) {
    grid.appendChild(createCalCell(i, true));
  }
}

function createCalCell(dayNum, isOtherMonth, isToday = false, totals = null, weight = null, isoStr = '') {
  const div = document.createElement('div');
  div.className = `cal-day-cell ${isOtherMonth ? 'other-month' : ''} ${isToday ? 'today' : ''}`;

  let calBadge = '';
  let weightBadge = '';

  if (totals && totals.calories > 0) {
    const target = state.goals.calories;
    let colorClass = 'calories-color';
    if (totals.calories > target) colorClass = 'over-goal-color';
    calBadge = `<span class="cal-calories-badge ${colorClass}">${Math.round(totals.calories)} ккал</span>`;
  }

  if (weight) {
    weightBadge = `<span class="cal-weight-badge">${weight.toFixed(1)} кг</span>`;
  }

  div.innerHTML = `
    <span class="cal-day-num">${dayNum}</span>
    <div class="cal-day-info">
      ${calBadge}
      ${weightBadge}
    </div>
  `;

  if (!isOtherMonth && isoStr) {
    div.addEventListener('click', () => {
      state.selectedDate = isoStr;
      document.getElementById('datePickerInput').value = isoStr;
      // Switch tab to dashboard
      document.querySelector('.nav-btn[data-tab="dashboard"]').click();
    });
  }

  return div;
}

// Canvas Bar Chart for 14-day Nutrition Trend
function renderNutritionChart() {
  const canvas = document.getElementById('nutritionCanvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const width = canvas.offsetWidth || 600;
  const height = canvas.offsetHeight || 220;

  canvas.width = width * window.devicePixelRatio;
  canvas.height = height * window.devicePixelRatio;
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

  ctx.clearRect(0, 0, width, height);

  const daysCount = 14;
  const today = new Date();
  const pastDates = [];
  for (let i = daysCount - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    pastDates.push(state.formatDateIso(d));
  }

  const calData = pastDates.map(d => state.getDayTotals(d).calories);
  const maxCal = Math.max(...calData, state.goals.calories, 2000);

  const paddingLeft = 40;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 40;

  const chartW = width - paddingLeft - paddingRight;
  const chartH = height - paddingTop - paddingBottom;

  const barWidth = (chartW / daysCount) * 0.55;

  // Target Goal Line
  const targetY = paddingTop + chartH - (state.goals.calories / maxCal) * chartH;
  ctx.strokeStyle = 'rgba(239, 68, 68, 0.6)';
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(paddingLeft, targetY);
  ctx.lineTo(width - paddingRight, targetY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Bars
  pastDates.forEach((isoStr, idx) => {
    const cal = calData[idx];
    const x = paddingLeft + idx * (chartW / daysCount) + (chartW / daysCount - barWidth) / 2;
    const barH = (cal / maxCal) * chartH;
    const y = paddingTop + chartH - barH;

    if (cal > 0) {
      const gradient = ctx.createLinearGradient(0, y, 0, y + barH);
      if (cal > state.goals.calories) {
        gradient.addColorStop(0, '#ef4444');
        gradient.addColorStop(1, '#f87171');
      } else {
        gradient.addColorStop(0, '#ff6b35');
        gradient.addColorStop(1, '#f7c59f');
      }

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barH, [4, 4, 0, 0]);
      ctx.fill();
    }

    // X Axis Label
    const dateObj = parseIsoDate(isoStr);
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim();
    ctx.font = '10px Inter';
    ctx.textAlign = 'center';
    ctx.fillText(`${dateObj.getDate()}`, x + barWidth / 2, height - paddingBottom + 16);
  });
}

// ==========================================
// 7. MODALS LOGIC
// ==========================================

function initModals() {
  // Global Delegate listener for ALL modal close buttons (X, Cancel, Backdrop)
  document.addEventListener('click', (e) => {
    const closeBtn = e.target.closest('[data-close-modal]');
    if (closeBtn) {
      const modalId = closeBtn.getAttribute('data-close-modal');
      const modal = document.getElementById(modalId);
      if (modal) modal.classList.add('hidden');
      return;
    }

    // Close modal when clicking backdrop
    if (e.target.classList.contains('modal-backdrop')) {
      e.target.classList.add('hidden');
    }

    // Goal Settings Trigger
    const goalBtn = e.target.closest('#goalSettingsBtn');
    if (goalBtn) {
      const modal = document.getElementById('goalSettingsModal');
      if (modal) {
        document.getElementById('goalCalInput').value = state.goals.calories;
        document.getElementById('goalPInput').value = state.goals.protein;
        document.getElementById('goalFInput').value = state.goals.fat;
        document.getElementById('goalCInput').value = state.goals.carbs;
        modal.classList.remove('hidden');
      }
    }

    // Backup Trigger
    const backupBtn = e.target.closest('#backupBtn');
    if (backupBtn) {
      const modal = document.getElementById('backupModal');
      if (modal) modal.classList.remove('hidden');
    }

    // JSON Import Trigger
    const jsonBtn = e.target.closest('#openJsonImportBtn, #importJsonModalBtn');
    if (jsonBtn) {
      const modal = document.getElementById('jsonImportModal');
      const textarea = document.getElementById('jsonInputTextarea');
      const alertBox = document.getElementById('jsonValidationAlert');
      if (textarea) textarea.value = '';
      if (alertBox) alertBox.classList.add('hidden');
      if (modal) modal.classList.remove('hidden');
    }

    // Create Template Trigger
    const createTplBtn = e.target.closest('#createTemplateBtn');
    if (createTplBtn) {
      openTemplateEditModal();
    }
  });

  // Modal Sub-tabs (From Template vs Custom Entry)
  document.querySelectorAll('.modal-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.modal-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.modal-tab-content').forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const targetTab = btn.getAttribute('data-modal-tab');
      if (targetTab === 'from-template') {
        const tab1 = document.getElementById('modalTabFromTemplate');
        if (tab1) tab1.classList.add('active');
      } else {
        const tab2 = document.getElementById('modalTabCustomEntry');
        if (tab2) tab2.classList.add('active');
      }
    });
  });

  const saveGoalsBtn = document.getElementById('saveGoalsBtn');
  if (saveGoalsBtn) {
    saveGoalsBtn.addEventListener('click', () => {
      const calories = Number(document.getElementById('goalCalInput').value) || 2000;
      const protein = Number(document.getElementById('goalPInput').value) || 130;
      const fat = Number(document.getElementById('goalFInput').value) || 65;
      const carbs = Number(document.getElementById('goalCInput').value) || 220;

      state.setGoals({ calories, protein, fat, carbs });
      document.getElementById('goalSettingsModal').classList.add('hidden');
      renderDashboard();
      showToast('Цели КБЖУ обновлены!', 'success');
    });
  }

  // Add Meal Modal Submit
  const submitAddMealBtn = document.getElementById('submitAddMealBtn');
  if (submitAddMealBtn) submitAddMealBtn.addEventListener('click', handleAddMealSubmit);

  // Template Modal Save
  const saveTemplateBtn = document.getElementById('saveTemplateBtn');
  if (saveTemplateBtn) saveTemplateBtn.addEventListener('click', handleSaveTemplateSubmit);

  // Template Select Preview change
  const modalTemplateSelect = document.getElementById('modalTemplateSelect');
  if (modalTemplateSelect) {
    modalTemplateSelect.addEventListener('change', (e) => {
      const tplId = e.target.value;
      const previewBox = document.getElementById('templatePreviewBox');
      if (!previewBox) return;

      if (!tplId) {
        previewBox.classList.add('hidden');
        return;
      }

      const tpl = state.templates.find(t => t.id === tplId);
      if (tpl) {
        const portionSelect = document.getElementById('modalPortionFactor');
        if (portionSelect) portionSelect.value = '1.0';

        const nameElem = document.getElementById('prevTemplateName');
        const calElem = document.getElementById('prevTemplateCal');
        const pElem = document.getElementById('prevTemplateP');
        const fElem = document.getElementById('prevTemplateF');
        const cElem = document.getElementById('prevTemplateC');

        if (nameElem) nameElem.textContent = tpl.name;
        if (calElem) calElem.textContent = `${Math.round(tpl.calories)} ккал`;
        if (pElem) pElem.textContent = `Б: ${tpl.protein}г`;
        if (fElem) fElem.textContent = `Ж: ${tpl.fat}г`;
        if (cElem) cElem.textContent = `У: ${tpl.carbs}г`;

        previewBox.classList.remove('hidden');
      }
    });
  }

  // JSON Import Modal init
  initJsonImportModal();
}

let activeAddMealCategory = 'breakfast';

function openAddMealModal(category) {
  activeAddMealCategory = category;
  const catNames = { breakfast: 'Завтрак', lunch: 'Обед', dinner: 'Ужин', snack: 'Перекус' };
  document.getElementById('addMealModalTitle').textContent = `Добавить в ${catNames[category]}`;

  // Populate Templates Select Filtered by Category / All
  const select = document.getElementById('modalTemplateSelect');
  select.innerHTML = '<option value="">-- Выберите шаблон --</option>';

  state.templates.forEach(tpl => {
    const opt = document.createElement('option');
    opt.value = tpl.id;
    opt.textContent = `${tpl.name} (${Math.round(tpl.calories)} ккал)`;
    select.appendChild(opt);
  });

  document.getElementById('templatePreviewBox').classList.add('hidden');
  document.getElementById('modalPortionFactor').value = '1.0';
  document.getElementById('customMealName').value = '';
  document.getElementById('customMealCal').value = '';
  document.getElementById('customMealP').value = '';
  document.getElementById('customMealF').value = '';
  document.getElementById('customMealC').value = '';

  document.getElementById('addMealModal').classList.remove('hidden');
}

function handleAddMealSubmit() {
  const isFromTemplate = document.querySelector('.modal-tab-btn[data-modal-tab="from-template"]').classList.contains('active');

  if (isFromTemplate) {
    const tplId = document.getElementById('modalTemplateSelect').value;
    const factor = parseFloat(document.getElementById('modalPortionFactor').value) || 1.0;

    if (!tplId) {
      showToast('Пожалуйста, выберите шаблон', 'warning');
      return;
    }

    const tpl = state.templates.find(t => t.id === tplId);
    if (!tpl) return;

    // Snapshot with portion factor applied
    state.addMealLog(state.selectedDate, {
      templateId: tpl.id,
      name: tpl.name,
      category: activeAddMealCategory,
      calories: Math.round(tpl.calories * factor * 10) / 10,
      protein: Math.round(tpl.protein * factor * 10) / 10,
      fat: Math.round(tpl.fat * factor * 10) / 10,
      carbs: Math.round(tpl.carbs * factor * 10) / 10,
      portionFactor: factor
    });

  } else {
    // Custom entry
    const name = (document.getElementById('customMealName').value || '').trim();
    const calories = Number(document.getElementById('customMealCal').value) || 0;
    const protein = Number(document.getElementById('customMealP').value) || 0;
    const fat = Number(document.getElementById('customMealF').value) || 0;
    const carbs = Number(document.getElementById('customMealC').value) || 0;

    if (!name) {
      showToast('Введите название блюда', 'warning');
      return;
    }

    state.addMealLog(state.selectedDate, {
      name,
      category: activeAddMealCategory,
      calories,
      protein,
      fat,
      carbs,
      portionFactor: 1
    });
  }

  document.getElementById('addMealModal').classList.add('hidden');
  renderDashboard();
  showToast('Блюдо добавлено в дневник!', 'success');
}

function openTemplateEditModal(tplId = null) {
  const modal = document.getElementById('templateEditModal');
  const title = document.getElementById('templateModalTitle');
  const idInput = document.getElementById('editTemplateId');

  if (tplId) {
    const tpl = state.templates.find(t => t.id === tplId);
    if (!tpl) return;

    title.textContent = 'Редактировать шаблон';
    idInput.value = tpl.id;
    document.getElementById('tplNameInput').value = tpl.name;
    document.getElementById('tplCategoryInput').value = tpl.category;
    document.getElementById('tplCalInput').value = tpl.calories;
    document.getElementById('tplPInput').value = tpl.protein;
    document.getElementById('tplFInput').value = tpl.fat;
    document.getElementById('tplCInput').value = tpl.carbs;
  } else {
    title.textContent = 'Создать новый шаблон';
    idInput.value = '';
    document.getElementById('tplNameInput').value = '';
    document.getElementById('tplCategoryInput').value = 'breakfast';
    document.getElementById('tplCalInput').value = '';
    document.getElementById('tplPInput').value = '';
    document.getElementById('tplFInput').value = '';
    document.getElementById('tplCInput').value = '';
  }

  modal.classList.remove('hidden');
}

function handleSaveTemplateSubmit() {
  const id = document.getElementById('editTemplateId').value;
  const name = (document.getElementById('tplNameInput').value || '').trim();
  const category = document.getElementById('tplCategoryInput').value;
  const calories = Number(document.getElementById('tplCalInput').value) || 0;
  const protein = Number(document.getElementById('tplPInput').value) || 0;
  const fat = Number(document.getElementById('tplFInput').value) || 0;
  const carbs = Number(document.getElementById('tplCInput').value) || 0;

  if (!name) {
    showToast('Введите название шаблона', 'warning');
    return;
  }

  if (id) {
    state.updateTemplate(id, { name, category, calories, protein, fat, carbs });
    showToast('Шаблон обновлен!', 'success');
  } else {
    state.addTemplate({ name, category, calories, protein, fat, carbs });
    showToast('Новый шаблон сохранен!', 'success');
  }

  document.getElementById('templateEditModal').classList.add('hidden');
  renderTemplatesList();
}

// ==========================================
// 8. JSON IMPORT / EXPORT & BACKUP LOGIC
// ==========================================

function initJsonImportModal() {
  const importModalBtn = document.getElementById('openJsonImportBtn') || document.getElementById('importJsonModalBtn');
  const modal = document.getElementById('jsonImportModal');
  const sampleBtn = document.getElementById('insertSampleJsonBtn');
  const copyBtn = document.getElementById('copyJsonBtn');
  const submitBtn = document.getElementById('submitImportJsonBtn');
  const textarea = document.getElementById('jsonInputTextarea');
  const alertBox = document.getElementById('jsonValidationAlert');

  if (importModalBtn) {
    importModalBtn.addEventListener('click', () => {
      if (textarea) textarea.value = '';
      if (alertBox) alertBox.classList.add('hidden');
      if (modal) modal.classList.remove('hidden');
    });
  }

  const templateFileInput = document.getElementById('templateJsonFileInput');
  if (templateFileInput) {
    templateFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        textarea.value = evt.target.result;
        alertBox.className = 'alert alert-success';
        alertBox.textContent = `Файл "${file.name}" прочитан! Нажмите "Загрузить шаблоны".`;
        alertBox.classList.remove('hidden');
      };
      reader.readAsText(file);
    });
  }

  sampleBtn.addEventListener('click', () => {
    const sampleArr = [
      { name: "Сырники с сметаной", category: "breakfast", calories: 380, protein: 22, fat: 14, carbs: 42 },
      { name: "Стейк из тунца с овощами", category: "dinner", calories: 410, protein: 48, fat: 10, carbs: 18 }
    ];
    textarea.value = JSON.stringify(sampleArr, null, 2);
    alertBox.classList.add('hidden');
  });

  copyBtn.addEventListener('click', () => {
    textarea.value = JSON.stringify(state.templates, null, 2);
    alertBox.className = 'alert alert-success';
    alertBox.textContent = 'Текущие шаблоны скопированы в поле ввода выше!';
    alertBox.classList.remove('hidden');
  });

  submitBtn.addEventListener('click', () => {
    const rawText = textarea.value.trim();
    if (!rawText) {
      alertBox.className = 'alert alert-danger';
      alertBox.textContent = 'Пожалуйста, вставьте JSON текст!';
      alertBox.classList.remove('hidden');
      return;
    }

    try {
      const parsed = JSON.parse(rawText);
      const itemsToImport = Array.isArray(parsed) ? parsed : [parsed];

      let count = 0;
      itemsToImport.forEach(item => {
        if (item.name) {
          state.addTemplate({
            name: String(item.name).trim(),
            category: item.category || 'breakfast',
            calories: Number(item.calories) || 0,
            protein: Number(item.protein) || 0,
            fat: Number(item.fat) || 0,
            carbs: Number(item.carbs) || 0
          });
          count++;
        }
      });

      modal.classList.add('hidden');
      renderTemplatesList();
      showToast(`Успешно импортировано ${count} шаблонов!`, 'success');

    } catch (err) {
      alertBox.className = 'alert alert-danger';
      alertBox.textContent = `Ошибка синтаксиса JSON: ${err.message}`;
      alertBox.classList.remove('hidden');
    }
  });
}

function initBackup() {
  const backupModal = document.getElementById('backupModal');
  const exportBtn = document.getElementById('exportBackupFileBtn');
  const triggerImportBtn = document.getElementById('triggerImportFileBtn');
  const textarea = document.getElementById('importBackupTextarea');

  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const fullState = {
        version: '6.0',
        exportedAt: new Date().toISOString(),
        goals: state.goals,
        templates: state.templates,
        logs: state.logs,
        weights: state.weights
      };

      const jsonStr = JSON.stringify(fullState, null, 2);
      if (textarea) textarea.value = jsonStr;

      if (navigator.clipboard) {
        navigator.clipboard.writeText(jsonStr).then(() => {
          showToast('Текст бэкапа скопирован в буфер обмена!', 'success');
        }).catch(() => {
          showToast('Текст бэкапа помещен в текстовое поле ниже!', 'info');
        });
      } else {
        showToast('Текст бэкапа помещен в текстовое поле ниже!', 'info');
      }
    });
  }

  if (triggerImportBtn) {
    triggerImportBtn.addEventListener('click', () => {
      const rawText = (textarea ? textarea.value : '').trim();
      if (!rawText) {
        showToast('Вставьте JSON текст бэкапа в поле!', 'warning');
        return;
      }

      try {
        const importedData = JSON.parse(rawText);
        if (importedData.goals) state.goals = importedData.goals;
        if (importedData.templates) state.templates = importedData.templates;
        if (importedData.logs) state.logs = importedData.logs;
        if (importedData.weights) state.weights = importedData.weights;

        state.saveToStorage(STORAGE_KEYS.GOALS, state.goals);
        state.saveToStorage(STORAGE_KEYS.TEMPLATES, state.templates);
        state.saveToStorage(STORAGE_KEYS.LOGS, state.logs);
        state.saveToStorage(STORAGE_KEYS.WEIGHTS, state.weights);

        if (backupModal) backupModal.classList.add('hidden');
        renderDashboard();
        renderTemplatesList();
        showToast('Все данные успешно восстановлены из JSON!', 'success');
      } catch (err) {
        alert('Ошибка в синтаксисе JSON: ' + err.message);
      }
    });
  }
}

// --- Helper Functions ---
function parseIsoDate(isoStr) {
  const [y, m, d] = isoStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDateRussian(dateObj) {
  const monthNames = [
    'Января', 'Февраля', 'Матра', 'Апреля', 'Мая', 'Июня',
    'Июля', 'Августа', 'Сентября', 'Октября', 'Ноября', 'Декабря'
  ];
  const day = dateObj.getDate();
  const month = monthNames[dateObj.getMonth()];
  const year = dateObj.getFullYear();
  return `${day} ${month} ${year}`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ==========================================
// 8. CLOUD DATABASE SYNC SERVICE
// ==========================================

class CloudDatabaseService {
  constructor(appState) {
    this.state = appState;
    this.syncKey = (localStorage.getItem('kbju_cloud_sync_key') || '').trim().toLowerCase();
    this.kvdbBucket = '6arVkEW6YQfWsNCByhNw6Q'; // Dedicated free bucket for KBJU Tracker
    this.pushDebounceTimer = null;
    this.lastUpdatedAt = localStorage.getItem('kbju_last_updated_at') || '1970-01-01T00:00:00.000Z';
    this.isFetching = false;
    this.isPushing = false;
    this.pollInterval = null;
  }

  getEndpoint() {
    return `https://kvdb.io/${this.kvdbBucket}/kbju_sync_${this.syncKey}`;
  }

  initUI() {
    const input = document.getElementById('cloudSyncKeyInput');
    const connectBtn = document.getElementById('connectCloudBtn');
    const syncNowBtn = document.getElementById('syncNowBtn');

    if (input && this.syncKey) {
      input.value = this.syncKey;
    }

    if (connectBtn) {
      connectBtn.addEventListener('click', () => {
        const val = (input ? input.value : '').trim().toLowerCase();
        if (!val) {
          showToast('Введите ваш код доступа (например, 1 или 7788)', 'warning');
          return;
        }
        this.syncKey = val;
        localStorage.setItem('kbju_cloud_sync_key', this.syncKey);
        showToast(`Облако подключено! Код: ${this.syncKey}`, 'success');
        this.pullFromCloud(true);
      });
    }

    if (syncNowBtn) {
      syncNowBtn.addEventListener('click', () => {
        if (!this.syncKey) {
          showToast('Сначала введите ваш код синхронизации', 'warning');
          return;
        }
        showToast('Синхронизация с облаком...', 'info');
        this.pullFromCloud(true).then(loaded => {
          if (!loaded) this.pushToCloud();
          showToast('Синхронизация завершена!', 'success');
        });
      });
    }

    if (this.syncKey) {
      this.updateBadge('online', `Облако: ${this.syncKey}`);
      this.pullFromCloud(true);
      this.startAutoPolling();
    } else {
      this.updateBadge('offline', 'Локально');
    }

    // Auto-sync when phone/browser becomes visible or focused
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.syncKey) {
        this.pullFromCloud(false);
      }
    });

    window.addEventListener('focus', () => {
      if (this.syncKey) {
        this.pullFromCloud(false);
      }
    });
  }

  startAutoPolling() {
    if (this.pollInterval) clearInterval(this.pollInterval);
    this.pollInterval = setInterval(() => {
      if (this.syncKey && !document.hidden && !this.isPushing) {
        this.pullFromCloud(false);
      }
    }, 1000); // 1-second polling for instant screen updates
  }

  debouncedPushToCloud() {
    if (!this.syncKey) return;
    clearTimeout(this.pushDebounceTimer);
    this.pushDebounceTimer = setTimeout(() => {
      this.pushToCloud();
    }, 500); // 0.5s debounce for fast pushes
  }

  async pushToCloud() {
    if (!this.syncKey || this.isFetching) return;
    
    this.isPushing = true;
    this.updateBadge('syncing', 'Сохранение...');

    const nowIso = new Date().toISOString();
    this.lastUpdatedAt = nowIso;
    localStorage.setItem('kbju_last_updated_at', nowIso);

    const payload = {
      updatedAt: nowIso,
      goals: this.state.goals,
      templates: this.state.templates,
      logs: this.state.logs,
      weights: this.state.weights
    };

    try {
      const res = await fetch(this.getEndpoint(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        this.updateBadge('online', `Облако: ${this.syncKey}`);
      } else {
        throw new Error('Save failed');
      }
    } catch (e) {
      console.warn('Cloud DB push error:', e);
      this.updateBadge('offline', 'Ошибка сети');
    } finally {
      this.isPushing = false;
    }
  }

  async pullFromCloud(forceToast = false) {
    if (!this.syncKey || this.isFetching || this.isPushing) return false;
    
    this.isFetching = true;

    try {
      const res = await fetch(this.getEndpoint());
      if (res.ok) {
        const item = await res.json();
        if (item && item.updatedAt) {
          this.applyRemoteData(item, forceToast);
          return true;
        }
      } else if (res.status === 404) {
        // Record doesn't exist yet, we will push our local data to create it
        if (forceToast) this.pushToCloud();
      }
    } catch (e) {
      console.warn('Cloud DB pull error:', e);
    } finally {
      this.isFetching = false;
    }
    return false;
  }

  applyRemoteData(d, forceToast = false) {
    const remoteUpdatedAt = d.updatedAt || '1970-01-01T00:00:00.000Z';
    
    // Only apply if remote is newer or forced
    if (forceToast || remoteUpdatedAt > this.lastUpdatedAt) {
      this.lastUpdatedAt = remoteUpdatedAt;
      localStorage.setItem('kbju_last_updated_at', remoteUpdatedAt);

      if (d.goals) this.state.goals = d.goals;
      if (d.templates) this.state.templates = d.templates;
      if (d.logs) this.state.logs = d.logs;
      if (d.weights) this.state.weights = d.weights;

      // Save quietly to local storage
      try {
        localStorage.setItem(STORAGE_KEYS.GOALS, JSON.stringify(this.state.goals));
        localStorage.setItem(STORAGE_KEYS.TEMPLATES, JSON.stringify(this.state.templates));
        localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(this.state.logs));
        localStorage.setItem(STORAGE_KEYS.WEIGHTS, JSON.stringify(this.state.weights));
      } catch (e) {}

      // Re-render UI views if they exist in global scope
      try {
        if (typeof renderDashboard === 'function') renderDashboard();
        if (typeof renderTemplatesList === 'function') renderTemplatesList();
        if (typeof renderWeightPage === 'function') renderWeightPage();
        if (typeof renderCalendarAndStatsPage === 'function') renderCalendarAndStatsPage();
      } catch (e) {}

      this.updateBadge('online', `Облако: ${this.syncKey}`);
      if (forceToast) showToast('Данные загружены из облака!', 'success');
    } else {
      this.updateBadge('online', `Облако: ${this.syncKey}`);
    }
  }

  updateBadge(status, text) {
    const badge = document.getElementById('cloudSyncStatusBadge');
    if (!badge) return;
    if (status === 'online') {
      badge.className = 'sync-badge online';
      badge.innerHTML = `<i class="fa-solid fa-cloud"></i> ${escapeHtml(text)}`;
    } else if (status === 'syncing') {
      badge.className = 'sync-badge offline';
      badge.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${escapeHtml(text)}`;
    } else {
      badge.className = 'sync-badge offline';
      badge.innerHTML = `<i class="fa-solid fa-hard-drive"></i> ${escapeHtml(text)}`;
    }
  }
}
