const $ = (selector) => document.querySelector(selector);
const state = { csrf: '', user: null, habits: [], stats: null, offset: 0, limit: 12, hasMore: false, editing: false, searchTimer: null };
const today = new Date();
const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (['POST', 'PATCH', 'DELETE', 'PUT'].includes((options.method || 'GET').toUpperCase())) headers.set('X-CSRF-Token', state.csrf);
  const response = await fetch(path, { ...options, headers, credentials: 'same-origin', cache: 'no-store' });
  if (response.status === 401) { location.replace('/login'); throw new Error('Сессия завершена'); }
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = Array.isArray(payload.detail) ? payload.detail.map((item) => item.msg).join(', ') : payload.detail;
    throw new Error(message || `Ошибка ${response.status}`);
  }
  return payload;
}

function showToast(message, isError = false) {
  const toast = $('#toast'); toast.textContent = message; toast.classList.toggle('error', isError); toast.classList.add('visible');
  window.clearTimeout(showToast.timer); showToast.timer = window.setTimeout(() => toast.classList.remove('visible'), 2800);
}
function plural(value, one, few, many) { const n = Math.abs(value) % 100; const last = n % 10; if (n > 10 && n < 20) return many; if (last > 1 && last < 5) return few; if (last === 1) return one; return many; }
function escapeText(value) { return String(value ?? ''); }

async function init() {
  try {
    const csrfData = await fetch('/api/auth/csrf', { credentials: 'same-origin', cache: 'no-store' }).then(r => r.json());
    state.csrf = csrfData.csrf_token;
    state.user = await api('/api/auth/me');
    const name = state.user.username;
    $('#welcome-user').textContent = name; $('#sidebar-user').textContent = name;
    $('#avatar').textContent = name.slice(0, 1).toUpperCase(); $('#mobile-avatar').textContent = name.slice(0, 1).toUpperCase();
    $('#date-pill').textContent = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(today);
    $('#today-label').textContent = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(today).toUpperCase();
    await refresh();
  } catch (error) {
    if (error.message !== 'Сессия завершена') location.replace('/login');
  }
}

async function refresh(reset = true) {
  if (reset) { state.offset = 0; state.habits = []; }
  const params = new URLSearchParams({ limit: String(state.limit), offset: String(state.offset), sort: $('#sort-select').value });
  const query = $('#search-input').value.trim(); if (query) params.set('q', query);
  const active = $('#active-filter').value; if (active !== 'all') params.set('active', active);
  const list = $('#habit-list');
  if (reset) list.replaceChildren(Object.assign(document.createElement('div'), { className: 'loading-state', textContent: 'Загружаем привычки…' }));
  try {
    const [habits, stats] = await Promise.all([api(`/api/habits?${params}`), api('/api/stats')]);
    state.habits = reset ? habits : [...state.habits, ...habits]; state.stats = stats; state.offset += habits.length; state.hasMore = habits.length === state.limit;
    renderStats(); renderHabits(); $('#load-more').hidden = !state.hasMore;
  } catch (error) { list.replaceChildren(Object.assign(document.createElement('div'), { className: 'empty-state', textContent: error.message })); }
}

function renderStats() {
  const stats = state.stats; const completed = stats.habits.reduce((sum, item) => sum + item.completed_total, 0);
  const streak = stats.habits.reduce((sum, item) => sum + item.streak, 0);
  $('#done-count').textContent = stats.done_today; $('#total-count').textContent = `/ ${stats.total_habits}`;
  $('#today-progress').style.width = `${stats.completion_percent}%`;
  $('#progress-caption').textContent = stats.total_habits ? `${stats.completion_percent}% привычек выполнено` : 'Добавь первую привычку';
  $('#best-streak').textContent = streak; $('#total-completed').textContent = completed;
  $('#habit-counter').textContent = `${stats.total_habits} ${plural(stats.total_habits, 'привычка', 'привычки', 'привычек')}`;
}

function makeElement(tag, className, text) { const element = document.createElement(tag); if (className) element.className = className; if (text !== undefined) element.textContent = text; return element; }
function renderHabits() {
  const list = $('#habit-list'); list.replaceChildren();
  if (!state.habits.length) {
    const empty = makeElement('div', 'empty-state'); empty.append(makeElement('div', 'empty-icon', '✳'), makeElement('h3', '', 'Пока здесь тихо'), makeElement('p', 'muted', 'Добавь привычку, которую хочешь сделать частью своей жизни.'));
    const add = makeElement('button', 'button primary', '＋ Добавить привычку'); add.addEventListener('click', () => openModal()); empty.append(add); list.append(empty); return;
  }
  const byId = new Map(state.stats.habits.map(item => [item.habit_id, item]));
  for (const habit of state.habits) {
    const stat = byId.get(habit.id) || { done_today: false, streak: 0, completed_total: 0 };
    const card = makeElement('article', `habit-card${stat.done_today ? ' completed' : ''}${!habit.is_active ? ' paused' : ''}`); card.style.setProperty('--habit-color', habit.color);
    const accent = makeElement('div', 'habit-accent');
    const content = makeElement('div', 'habit-content');
    const head = makeElement('div', 'habit-head');
    const titleWrap = makeElement('div', 'habit-title-wrap');
    titleWrap.append(makeElement('span', 'category-dot'), makeElement('h3', 'habit-name', habit.name));
    const category = makeElement('span', 'category-tag', habit.category); head.append(titleWrap, category);
    content.append(head);
    if (habit.description) content.append(makeElement('p', 'habit-description', habit.description));
    const meta = makeElement('div', 'habit-meta'); meta.append(makeElement('span', '', `♨ ${stat.streak} ${plural(stat.streak, 'день', 'дня', 'дней')} подряд`), makeElement('span', '', `✓ ${stat.completed_total} выполнений`), makeElement('span', '', `${habit.target_per_week}/7 в неделю`)); content.append(meta);
    const week = makeElement('div', 'week-strip');
    const recent = stat.recent_days || [];
    for (let i = 0; i < 7; i += 1) {
      const dayDate = new Date(today); dayDate.setDate(today.getDate() - 6 + i);
      const dayLabel = new Intl.DateTimeFormat('ru-RU', { weekday: 'short' }).format(dayDate).slice(0, 2);
      const cell = makeElement('span', `week-day${recent[i] ? ' is-done' : ''}`, dayLabel);
      cell.title = recent[i] ? 'Выполнено' : 'Нет отметки'; week.append(cell);
    }
    content.append(week);
    const actions = makeElement('div', 'habit-actions');
    const done = makeElement('button', `check-button${stat.done_today ? ' checked' : ''}`, stat.done_today ? '✓ Готово' : 'Отметить'); done.disabled = !habit.is_active; done.setAttribute('aria-label', stat.done_today ? `Снять отметку: ${habit.name}` : `Отметить выполнение: ${habit.name}`); done.addEventListener('click', () => toggleToday(habit.id, stat.done_today));
    const edit = makeElement('button', 'icon-button small', '✎'); edit.setAttribute('aria-label', `Редактировать ${habit.name}`); edit.addEventListener('click', () => openModal(habit));
    const remove = makeElement('button', 'icon-button small danger-button', '×'); remove.setAttribute('aria-label', `Удалить ${habit.name}`); remove.addEventListener('click', () => deleteHabit(habit.id, habit.name));
    actions.append(done, edit, remove); card.append(accent, content, actions); list.append(card);
  }
}

async function deleteHabit(id, name) {
  if (!window.confirm(`Удалить привычку «${name}» и всю историю её отметок?`)) return;
  try { await api(`/api/habits/${id}`, { method: 'DELETE' }); await refresh(); showToast('Привычка удалена'); }
  catch (error) { showToast(error.message, true); }
}

async function toggleToday(id, isDone) {
  try {
    if (isDone) {
      const logs = await api(`/api/habits/${id}/logs?from_date=${todayISO}&to_date=${todayISO}`);
      if (logs[0]) await api(`/api/logs/${logs[0].id}`, { method: 'DELETE' });
    } else await api(`/api/habits/${id}/logs`, { method: 'POST', body: JSON.stringify({ log_date: todayISO }) });
    await refresh(); showToast(isDone ? 'Отметка снята' : 'Отличная работа! Привычка выполнена ✨');
  } catch (error) { showToast(error.message, true); }
}

function openModal(habit = null) {
  const form = $('#habit-form'); form.reset(); form.elements.habit_id.value = habit?.id || '';
  form.elements.name.value = habit?.name || ''; form.elements.description.value = habit?.description || '';
  form.elements.category.value = habit?.category || 'Личное'; form.elements.target_per_week.value = String(habit?.target_per_week || 7); form.elements.is_active.checked = habit ? habit.is_active : true;
  const color = habit?.color || '#6b8afd'; const radio = [...form.querySelectorAll('input[name="color"]')].find(input => input.value === color); if (radio) radio.checked = true;
  state.editing = Boolean(habit); $('#modal-title').textContent = habit ? 'Изменить привычку' : 'Новая привычка'; $('#save-habit').textContent = habit ? 'Сохранить изменения' : 'Сохранить привычку'; $('#habit-form-error').textContent = '';
  $('#habit-modal').hidden = false; document.body.classList.add('modal-open'); form.elements.name.focus();
}
function closeModal() { $('#habit-modal').hidden = true; document.body.classList.remove('modal-open'); }

$('#habit-form').addEventListener('submit', async (event) => {
  event.preventDefault(); const form = event.currentTarget; const id = form.elements.habit_id.value;
  const payload = { name: form.elements.name.value.trim(), description: form.elements.description.value.trim(), category: form.elements.category.value, target_per_week: Number(form.elements.target_per_week.value), color: form.querySelector('input[name="color"]:checked').value, is_active: form.elements.is_active.checked };
  const button = $('#save-habit'); button.disabled = true; $('#habit-form-error').textContent = '';
  try {
    await api(id ? `/api/habits/${id}` : '/api/habits', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
    closeModal(); await refresh(); showToast(id ? 'Привычка обновлена' : 'Привычка добавлена');
  } catch (error) { $('#habit-form-error').textContent = error.message; } finally { button.disabled = false; }
});

$('#add-habit-btn').addEventListener('click', () => openModal()); $('#close-modal').addEventListener('click', closeModal); $('#cancel-modal').addEventListener('click', closeModal);
$('#habit-modal').addEventListener('click', (event) => { if (event.target === $('#habit-modal')) closeModal(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !$('#habit-modal').hidden) closeModal(); });
$('#search-input').addEventListener('input', () => { window.clearTimeout(state.searchTimer); state.searchTimer = window.setTimeout(() => refresh(), 250); });
$('#active-filter').addEventListener('change', () => refresh()); $('#sort-select').addEventListener('change', () => refresh());
$('#load-more').addEventListener('click', () => refresh(false));
$('#logout-btn').addEventListener('click', async () => { try { await api('/api/auth/logout', { method: 'POST' }); location.replace('/login'); } catch (error) { showToast(error.message, true); } });

init();
