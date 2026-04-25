/* =============================================
   LIFE DASHBOARD — script.js
   ============================================= */

'use strict';

// ── Storage keys ──────────────────────────────
const STORAGE_TODOS     = 'dashboard_todos';
const STORAGE_LINKS     = 'dashboard_links';
const STORAGE_THEME     = 'dashboard_theme';
const STORAGE_NAME      = 'dashboard_name';
const STORAGE_DURATION  = 'dashboard_duration';
const STORAGE_SORT      = 'dashboard_sort';

// ── Ring circumference (2π × r=52) ───────────
const RING_CIRCUMFERENCE = 2 * Math.PI * 52; // ≈ 326.7

/* ==============================================
   UTILITIES
   ============================================== */

/** Generates a collision-resistant unique ID. */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

/**
 * Reads and JSON-parses a localStorage key.
 * Returns `fallback` on missing key or parse error.
 * @template T
 * @param {string} key
 * @param {T} fallback
 * @returns {T}
 */
function storageGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw !== null ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * JSON-serialises `value` and writes it to localStorage.
 * @param {string} key
 * @param {unknown} value
 */
function storageSet(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

/* ==============================================
   TOAST NOTIFICATIONS
   ============================================== */

const toastContainer = document.getElementById('toast-container');

/**
 * Shows a small pill toast that fades in, waits, then fades out.
 *
 * @param {string} message   - Text to display
 * @param {'success'|'link'|'info'} [type='success'] - Colours the dot
 * @param {number} [duration=2200] - ms before the toast exits
 */
function showToast(message, type = 'success', duration = 2200) {
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);

  // Trigger exit animation, then remove from DOM
  setTimeout(() => {
    toast.classList.add('toast--exit');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  }, duration);
}

/* ==============================================
   0. THEME (Light / Dark)
   ============================================== */

const htmlEl    = document.documentElement;
const btnTheme  = document.getElementById('btn-theme');
const themeIcon = document.getElementById('theme-icon');

/** Applies `theme` to the <html> element and updates the toggle icon. */
function applyTheme(theme) {
  htmlEl.setAttribute('data-theme', theme);
  themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
  btnTheme.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
}

/** Toggles between dark and light, persists the choice. */
function toggleTheme() {
  const next = htmlEl.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  storageSet(STORAGE_THEME, next);
  applyTheme(next);
}

btnTheme.addEventListener('click', toggleTheme);

// Load saved theme, fall back to system preference, then dark
const savedTheme = storageGet(STORAGE_THEME, null);
const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
applyTheme(savedTheme ?? (systemDark ? 'dark' : 'light'));

/* ==============================================
   1. GREETING & CLOCK
   ============================================== */

const greetingEl  = document.getElementById('greeting-message');
const datetimeEl  = document.getElementById('current-datetime');
const nameDisplay = document.getElementById('name-display');
const btnEditName = document.getElementById('btn-edit-name');

/** Saved user name (empty string = not set). */
let userName = storageGet(STORAGE_NAME, '');

/** Renders the stored name into the name display span. */
function renderName() {
  nameDisplay.textContent = userName;
}

/** Maps hour ranges to greeting strings, optionally personalised. */
function getGreeting(hour) {
  const suffix = userName ? `, ${userName}` : '';
  if (hour >= 5  && hour < 12) return `Good Morning${suffix}! ☀️`;
  if (hour >= 12 && hour < 17) return `Good Afternoon${suffix}! 🌤️`;
  if (hour >= 17 && hour < 21) return `Good Evening${suffix}! 🌇`;
  return `Good Night${suffix}! 🌙`;
}

/** Refreshes the greeting text and live clock. Called every second. */
function updateClock() {
  const now  = new Date();
  const hour = now.getHours();

  greetingEl.textContent = getGreeting(hour);

  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  const timeStr = now.toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

  datetimeEl.textContent = `${dateStr} — ${timeStr}`;
}

/**
 * Replaces the name display with a temporary inline input.
 * Commits on Enter or blur, cancels on Escape.
 */
function startNameEdit() {
  // Build the inline input
  const input = document.createElement('input');
  input.type        = 'text';
  input.className   = 'name-input-inline';
  input.value       = userName;
  input.maxLength   = 30;
  input.placeholder = 'Your name';
  input.setAttribute('aria-label', 'Enter your name');

  // Swap display → input
  nameDisplay.replaceWith(input);
  btnEditName.style.display = 'none';
  requestAnimationFrame(() => { input.focus(); input.select(); });

  function commit() {
    userName = input.value.trim();
    storageSet(STORAGE_NAME, userName);
    input.replaceWith(nameDisplay);
    btnEditName.style.display = '';
    renderName();
    // Greeting updates on next clock tick — force immediate refresh
    updateClock();
  }

  function cancel() {
    input.replaceWith(nameDisplay);
    btnEditName.style.display = '';
  }

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter')  { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  });
  input.addEventListener('blur', commit);
}

// Clicking the display text or the pencil button both open the editor
nameDisplay.addEventListener('click', startNameEdit);
btnEditName.addEventListener('click', startNameEdit);

renderName();
updateClock();
setInterval(updateClock, 1000);

/* ==============================================
   2. FOCUS TIMER
   ============================================== */

const timerDisplayEl  = document.getElementById('timer-display');
const timerLabelEl    = document.getElementById('timer-label');
const ringProgress    = document.getElementById('ring-progress');
const btnStart        = document.getElementById('btn-start');
const btnStop         = document.getElementById('btn-stop');
const btnReset        = document.getElementById('btn-reset');
const timerMinutesEl  = document.getElementById('timer-minutes');
const btnSetDuration  = document.getElementById('btn-set-duration');

/** Total seconds for the current session (persisted). */
let pomodoroSeconds = storageGet(STORAGE_DURATION, 25) * 60;

let timerSeconds  = pomodoroSeconds;
let timerInterval = null;
let timerRunning  = false;

// Reflect saved duration in the input on load
timerMinutesEl.value = pomodoroSeconds / 60;

/** Converts total seconds to a MM:SS string. */
function formatTime(secs) {
  const m = String(Math.floor(secs / 60)).padStart(2, '0');
  const s = String(secs % 60).padStart(2, '0');
  return `${m}:${s}`;
}

/** Syncs the timer display and SVG ring to the current `timerSeconds`. */
function renderTimer() {
  timerDisplayEl.textContent = formatTime(timerSeconds);

  // Progress ring: full circle when at max, empty when at 0
  const progress = timerSeconds / pomodoroSeconds;
  ringProgress.style.strokeDashoffset = RING_CIRCUMFERENCE * (1 - progress);
}

/** Starts (or resumes) the countdown. */
function startTimer() {
  if (timerRunning) return;

  timerRunning = true;
  timerDisplayEl.classList.add('running');
  timerDisplayEl.classList.remove('finished');
  ringProgress.classList.remove('finished');
  timerLabelEl.textContent = 'Focus session in progress…';
  updateTimerButtonStates('running');

  timerInterval = setInterval(() => {
    timerSeconds--;
    renderTimer();

    if (timerSeconds <= 0) {
      clearInterval(timerInterval);
      timerRunning = false;
      timerDisplayEl.classList.remove('running');
      timerDisplayEl.classList.add('finished');
      ringProgress.classList.add('finished');
      timerLabelEl.textContent = '🎉 Session complete! Take a break.';
      updateTimerButtonStates('idle');
      // Notify the turtle
      document.dispatchEvent(new CustomEvent('timer:complete'));
    }
  }, 1000);
}

/** Pauses the countdown without resetting. */
function stopTimer() {
  if (!timerRunning) return;
  clearInterval(timerInterval);
  timerRunning = false;
  timerDisplayEl.classList.remove('running');
  timerLabelEl.textContent = 'Paused — click Start to resume.';
  updateTimerButtonStates('stopped');
}

/** Resets the timer to the current duration and clears all state. */
function resetTimer() {
  clearInterval(timerInterval);
  timerRunning = false;
  timerSeconds = pomodoroSeconds;
  timerDisplayEl.classList.remove('running', 'finished');
  ringProgress.classList.remove('finished');
  timerLabelEl.textContent = `Pomodoro — ${pomodoroSeconds / 60} min`;
  renderTimer();
  updateTimerButtonStates('reset');
}

/**
 * Updates the visual state of the three timer buttons.
 *
 * States:
 *  'running' — Start lights up accent, others gray
 *  'stopped' — Stop flashes red briefly, then all gray
 *  'reset'   — Reset flashes purple briefly, then all gray
 *  'idle'    — All gray (default / session complete)
 *
 * @param {'running'|'stopped'|'reset'|'idle'} state
 */
function updateTimerButtonStates(state) {
  // Clear all modifier classes first
  btnStart.classList.remove('btn-timer--active');
  btnStop.classList.remove('btn-timer--stop');
  btnReset.classList.remove('btn-timer--reset');

  if (state === 'running') {
    btnStart.classList.add('btn-timer--active');

  } else if (state === 'stopped') {
    btnStop.classList.add('btn-timer--stop');
    // Flash red for 600 ms then return to gray
    setTimeout(() => btnStop.classList.remove('btn-timer--stop'), 600);

  } else if (state === 'reset') {
    btnReset.classList.add('btn-timer--reset');
    // Flash purple for 600 ms then return to gray
    setTimeout(() => btnReset.classList.remove('btn-timer--reset'), 600);
  }
  // 'idle' — all classes already cleared above
}

/**
 * Applies a new custom duration from the number input.
 * Resets the timer to the new value and saves it.
 */
function applyDuration() {
  const raw = parseInt(timerMinutesEl.value, 10);
  const mins = Math.min(60, Math.max(1, isNaN(raw) ? 25 : raw));
  timerMinutesEl.value = mins;

  pomodoroSeconds = mins * 60;
  storageSet(STORAGE_DURATION, mins);
  resetTimer(); // resetTimer already calls updateTimerButtonStates('reset')
}

btnStart.addEventListener('click', startTimer);
btnStop.addEventListener('click',  stopTimer);
btnReset.addEventListener('click', resetTimer);
btnSetDuration.addEventListener('click', applyDuration);
timerMinutesEl.addEventListener('keydown', e => { if (e.key === 'Enter') applyDuration(); });

/* ==============================================
   SPARKLE EFFECT
   ============================================== */

/**
 * Colour sets per button so each feels distinct.
 * Start = accent purple, Stop = warm amber, Reset = soft teal.
 */
const SPARKLE_COLORS = {
  'btn-start': ['#6c63ff', '#a78bfa', '#c4b5fd', '#ffffff'],
  'btn-stop':  ['#f59e0b', '#fbbf24', '#fde68a', '#ffffff'],
  'btn-reset': ['#2dd4bf', '#5eead4', '#99f6e4', '#ffffff'],
};

/**
 * Spawns a burst of sparkle particles centred on the click point.
 * Particles are absolutely-positioned <span>s appended to <body>
 * and removed automatically once their CSS animation ends.
 *
 * @param {MouseEvent} e   - The originating click event
 * @param {string}     id  - The button's id, used to pick a colour palette
 */
function spawnSparkles(e, id) {
  const colors  = SPARKLE_COLORS[id] ?? ['#6c63ff', '#ffffff'];
  const count   = 7;
  const cx      = e.clientX;
  const cy      = e.clientY;

  for (let i = 0; i < count; i++) {
    const dot = document.createElement('span');
    dot.className = 'sparkle-dot';

    // Random angle and travel distance for each particle
    const angle    = (360 / count) * i + Math.random() * 20 - 10; // degrees
    const distance = 28 + Math.random() * 22;                      // px
    const size     = 4 + Math.random() * 4;                        // px
    const color    = colors[Math.floor(Math.random() * colors.length)];
    const duration = 480 + Math.random() * 160;                    // ms

    dot.style.cssText = `
      left: ${cx}px;
      top:  ${cy}px;
      width:  ${size}px;
      height: ${size}px;
      background: ${color};
      --angle:    ${angle}deg;
      --distance: ${distance}px;
      animation-duration: ${duration}ms;
    `;

    document.body.appendChild(dot);
    dot.addEventListener('animationend', () => dot.remove(), { once: true });
  }
}

// Attach sparkle to each timer button
[btnStart, btnStop, btnReset].forEach(btn => {
  btn.addEventListener('click', e => spawnSparkles(e, btn.id));
});

/* ==============================================
   3. TO-DO LIST
   ============================================== */

const todoInputEl   = document.getElementById('todo-input');
const btnAddTodo    = document.getElementById('btn-add-todo');
const todoListEl    = document.getElementById('todo-list');
const todoEmptyEl   = document.getElementById('todo-empty');
const taskCounterEl = document.getElementById('task-counter');
const todoSortEl    = document.getElementById('todo-sort');

const editModal     = document.getElementById('edit-modal');
const editInputEl   = document.getElementById('edit-input');
const btnSaveEdit   = document.getElementById('btn-save-edit');
const btnCancelEdit = document.getElementById('btn-cancel-edit');

/**
 * @typedef {{ id: string, text: string, completed: boolean }} Todo
 * @type {Todo[]}
 */
let todos = storageGet(STORAGE_TODOS, []);

/** The id of the task currently open in the edit modal. */
let editingId = null;

/** Current sort mode — persisted. */
let sortMode = storageGet(STORAGE_SORT, 'default');
todoSortEl.value = sortMode;

todoSortEl.addEventListener('change', () => {
  sortMode = todoSortEl.value;
  storageSet(STORAGE_SORT, sortMode);
  renderTodos();
});

/** Persists the current todos array to localStorage. */
function saveTodos() {
  storageSet(STORAGE_TODOS, todos);
}

/** Updates the task counter badge (e.g. "3 / 5 done"). */
function updateCounter() {
  const total = todos.length;
  const done  = todos.filter(t => t.completed).length;
  taskCounterEl.textContent = total === 0 ? '' : `${done} / ${total} done`;
}

/** Returns a sorted copy of `todos` based on the current `sortMode`. */
function getSortedTodos() {
  const copy = [...todos];
  if (sortMode === 'az') {
    copy.sort((a, b) => a.text.localeCompare(b.text, undefined, { sensitivity: 'base' }));
  } else if (sortMode === 'pending') {
    copy.sort((a, b) => Number(a.completed) - Number(b.completed));
  }
  // 'default' — insertion order, no sort needed
  return copy;
}

/** Rebuilds the todo list in the DOM from the `todos` array. */
function renderTodos() {
  todoListEl.innerHTML = '';
  todoEmptyEl.style.display = todos.length === 0 ? 'block' : 'none';
  updateCounter();

  getSortedTodos().forEach(todo => {
    const li = document.createElement('li');
    li.className = `todo-item${todo.completed ? ' completed' : ''}`;
    li.dataset.id = todo.id;

    // Checkbox
    const checkbox = document.createElement('input');
    checkbox.type      = 'checkbox';
    checkbox.className = 'todo-checkbox';
    checkbox.checked   = todo.completed;
    checkbox.id        = `todo-check-${todo.id}`;
    checkbox.addEventListener('change', () => toggleTodo(todo.id));

    // Label (for accessibility — clicking text also toggles)
    const label = document.createElement('label');
    label.htmlFor   = checkbox.id;
    label.className = 'todo-text';
    label.textContent = todo.text;

    // Action buttons
    const actions = document.createElement('div');
    actions.className = 'todo-actions';

    const editBtn = document.createElement('button');
    editBtn.className   = 'btn-action';
    editBtn.textContent = '✏️';
    editBtn.setAttribute('aria-label', `Edit: ${todo.text}`);
    editBtn.addEventListener('click', () => openEditModal(todo.id));

    const deleteBtn = document.createElement('button');
    deleteBtn.className   = 'btn-action delete';
    deleteBtn.textContent = '🗑️';
    deleteBtn.setAttribute('aria-label', `Delete: ${todo.text}`);
    deleteBtn.addEventListener('click', () => deleteTodo(todo.id));

    actions.append(editBtn, deleteBtn);
    li.append(checkbox, label, actions);
    todoListEl.appendChild(li);
  });
}

/** Adds a new task from the input field. Rejects case-insensitive duplicates. */
function addTodo() {
  const text = todoInputEl.value.trim();
  if (!text) return;

  // Duplicate check — case-insensitive
  const duplicate = todos.find(t => t.text.toLowerCase() === text.toLowerCase());
  if (duplicate) {
    showToast('Task already exists!', 'info', 2000);
    // Shake the matching item to draw attention to it
    const existingEl = todoListEl.querySelector(`[data-id="${duplicate.id}"]`);
    if (existingEl) {
      existingEl.classList.remove('shake');
      void existingEl.offsetWidth; // force reflow so animation re-triggers
      existingEl.classList.add('shake');
      existingEl.addEventListener('animationend', () => existingEl.classList.remove('shake'), { once: true });
      existingEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    return;
  }

  todos.push({ id: uid(), text, completed: false });
  saveTodos();
  renderTodos();
  showToast('Task added ✓', 'success');
  todoInputEl.value = '';
  todoInputEl.focus();
}

/** Toggles the completed state of a task by id. */
function toggleTodo(id) {
  const todo = todos.find(t => t.id === id);
  if (!todo) return;
  todo.completed = !todo.completed;
  saveTodos();
  renderTodos();
}

/** Removes a task by id. */
function deleteTodo(id) {
  todos = todos.filter(t => t.id !== id);
  saveTodos();
  renderTodos();
}

/** Opens the edit modal pre-filled with the task's current text. */
function openEditModal(id) {
  const todo = todos.find(t => t.id === id);
  if (!todo) return;
  editingId = id;
  editInputEl.value = todo.text;
  editModal.classList.remove('hidden');
  // Defer focus so the modal is visible first
  requestAnimationFrame(() => editInputEl.focus());
}

/** Commits the edited text and closes the modal. Rejects duplicates. */
function saveEdit() {
  const text = editInputEl.value.trim();
  if (!text) return;

  // Duplicate check — ignore the task being edited itself
  const duplicate = todos.find(
    t => t.id !== editingId && t.text.toLowerCase() === text.toLowerCase()
  );
  if (duplicate) {
    showToast('A task with that name already exists!', 'info', 2200);
    editInputEl.select();
    return;
  }

  const todo = todos.find(t => t.id === editingId);
  if (todo) {
    todo.text = text;
    saveTodos();
    renderTodos();
  }
  closeEditModal();
}

/** Closes the edit modal without saving. */
function closeEditModal() {
  editModal.classList.add('hidden');
  editingId = null;
  editInputEl.value = '';
}

// Todo event listeners
btnAddTodo.addEventListener('click', addTodo);
todoInputEl.addEventListener('keydown', e => { if (e.key === 'Enter') addTodo(); });
btnSaveEdit.addEventListener('click', saveEdit);
btnCancelEdit.addEventListener('click', closeEditModal);
editInputEl.addEventListener('keydown', e => { if (e.key === 'Enter') saveEdit(); });

// Close modal on backdrop click or Escape key
editModal.addEventListener('click', e => { if (e.target === editModal) closeEditModal(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !editModal.classList.contains('hidden')) closeEditModal();
});

/* ==============================================
   4. QUICK LINKS
   ============================================== */

const linkNameInputEl = document.getElementById('link-name-input');
const linkUrlInputEl  = document.getElementById('link-url-input');
const btnAddLink      = document.getElementById('btn-add-link');
const quickLinksEl    = document.getElementById('quick-links-list');
const linksEmptyEl    = document.getElementById('links-empty');

/**
 * @typedef {{ id: string, name: string, url: string }} Link
 * @type {Link[]}
 */
let links = storageGet(STORAGE_LINKS, []);

/** Persists the current links array to localStorage. */
function saveLinks() {
  storageSet(STORAGE_LINKS, links);
}

/** Rebuilds the quick-links list in the DOM. */
function renderLinks() {
  quickLinksEl.innerHTML = '';
  linksEmptyEl.style.display = links.length === 0 ? 'block' : 'none';

  links.forEach(link => {
    const wrapper = document.createElement('div');
    wrapper.className = 'link-chip-wrapper';
    wrapper.setAttribute('role', 'listitem');

    const anchor = document.createElement('a');
    anchor.className   = 'link-chip';
    anchor.href        = link.url;
    anchor.target      = '_blank';
    anchor.rel         = 'noopener noreferrer';
    anchor.textContent = link.name;

    const removeBtn = document.createElement('button');
    removeBtn.className   = 'link-chip-remove';
    removeBtn.textContent = '✕';
    removeBtn.setAttribute('aria-label', `Remove ${link.name}`);
    removeBtn.addEventListener('click', () => deleteLink(link.id));

    wrapper.append(anchor, removeBtn);
    quickLinksEl.appendChild(wrapper);
  });
}

/** Adds a new quick link from the input fields. */
function addLink() {
  const name = linkNameInputEl.value.trim();
  let   url  = linkUrlInputEl.value.trim();

  if (!name || !url) return;

  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }

  links.push({ id: uid(), name, url });
  saveLinks();
  renderLinks();
  showToast(`Link "${name}" saved ✓`, 'link');
  linkNameInputEl.value = '';
  linkUrlInputEl.value  = '';
  linkNameInputEl.focus();
}

/** Removes a quick link by id. */
function deleteLink(id) {
  links = links.filter(l => l.id !== id);
  saveLinks();
  renderLinks();
}

btnAddLink.addEventListener('click', addLink);
linkUrlInputEl.addEventListener('keydown', e => { if (e.key === 'Enter') addLink(); });
linkNameInputEl.addEventListener('keydown', e => { if (e.key === 'Enter') addLink(); });

/* ==============================================
   5. TURTLE MASCOT
   ============================================== */

const turtleEl = document.getElementById('turtle-mascot');
const bubbleEl = document.getElementById('turtle-bubble');

/** All moods the turtle can be in. */
const MOODS = ['idle', 'focused', 'sleeping', 'celebrating', 'happy', 'sad', 'waving'];

/** Messages per mood — one is picked at random each time. */
const MOOD_MESSAGES = {
  idle:        ['Hey there! 👋', 'Ready when you are!', 'What are we doing today?', 'I believe in you! 🐢'],
  focused:     ['Let\'s gooo! 🎯', 'You\'re crushing it!', 'Deep focus mode 🔥', 'No distractions!'],
  sleeping:    ['Taking a break… 😴', 'Resting my shell…', 'Zzz… wake me up soon', 'Paused. Good call.'],
  celebrating: ['WOOHOO! 🎉', 'You did it!! ⭐', 'Session complete! 🏆', 'Time for a snack! 🥬'],
  happy:       ['Task added! ✅', 'On it! 🐢💨', 'Great idea!', 'Let\'s do this!', 'Link saved! 🔗'],
  sad:         ['Bye bye task… 😢', 'Gone forever…', 'Poof! It\'s gone.'],
  waving:      ['Hi hi hi! 👋', 'You clicked me!', 'Hehe 🐢', 'I\'m your buddy!'],
};

let bubbleTimer   = null;  // timeout to hide the bubble
let moodTimer     = null;  // timeout to return to idle
let currentMood   = 'idle';

/**
 * Sets the turtle's mood: swaps CSS class, shows a speech bubble,
 * then returns to idle after `duration` ms.
 *
 * @param {string} mood
 * @param {number} [duration=3000]  ms before returning to idle
 * @param {string} [customMsg]      override the random message
 */
function setMood(mood, duration = 3000, customMsg = null) {
  // Clear any pending resets
  clearTimeout(moodTimer);
  clearTimeout(bubbleTimer);

  // Swap mood class
  MOODS.forEach(m => turtleEl.classList.remove(m));
  turtleEl.classList.add(mood);
  currentMood = mood;

  // Pick message
  const msgs = MOOD_MESSAGES[mood] ?? MOOD_MESSAGES.idle;
  const msg  = customMsg ?? msgs[Math.floor(Math.random() * msgs.length)];

  // Show bubble
  bubbleEl.textContent = msg;
  bubbleEl.classList.add('visible');

  // Hide bubble after 2.5 s
  bubbleTimer = setTimeout(() => bubbleEl.classList.remove('visible'), 2500);

  // Return to idle after duration (unless celebrating — let it run longer)
  if (mood !== 'idle') {
    moodTimer = setTimeout(() => {
      MOODS.forEach(m => turtleEl.classList.remove(m));
      turtleEl.classList.add('idle');
      currentMood = 'idle';
    }, duration);
  }
}

// ── Wire turtle reactions to app events ──────

// Timer: Start — check state after startTimer runs
btnStart.addEventListener('click', () => {
  setTimeout(() => { if (timerRunning) setMood('focused', 99999); }, 0);
});

// Timer: Stop — check state after stopTimer runs
btnStop.addEventListener('click', () => {
  setTimeout(() => { if (!timerRunning) setMood('sleeping', 99999); }, 0);
});

// Timer: Reset — back to idle
btnReset.addEventListener('click', () => setMood('idle', 0));

// Timer: Session complete
document.addEventListener('timer:complete', () => {
  setMood('celebrating', 6000);
});

// Todo: task added
btnAddTodo.addEventListener('click', () => {
  if (todoInputEl.value.trim()) setMood('happy', 2500);
});
todoInputEl.addEventListener('keydown', e => {
  if (e.key === 'Enter' && todoInputEl.value.trim()) setMood('happy', 2500);
});

// Todo: task completed (checkbox change bubbles up from the list)
todoListEl.addEventListener('change', e => {
  if (e.target.classList.contains('todo-checkbox') && e.target.checked) {
    setMood('celebrating', 2500);
  }
});

// Todo: task deleted — listen for the delete buttons via delegation
todoListEl.addEventListener('click', e => {
  if (e.target.closest('.btn-action.delete')) setMood('sad', 2000);
});

// Quick links: link added
btnAddLink.addEventListener('click', () => {
  if (linkNameInputEl.value.trim() && linkUrlInputEl.value.trim()) {
    setMood('happy', 2500, 'Link saved! 🔗');
  }
});

// Quick links: link opened
quickLinksEl.addEventListener('click', e => {
  const chip = e.target.closest('.link-chip');
  if (chip) {
    showToast(`Opening ${chip.textContent.trim()} 🌐`, 'link', 1800);
    setMood('happy', 2000, 'Opening link! 🌐');
  }
});

// Turtle: click to wave
turtleEl.addEventListener('click', () => {
  // Remove waving first so re-clicking re-triggers the animation
  turtleEl.classList.remove('waving');
  void turtleEl.offsetWidth; // force reflow
  setMood('waving', 1800);
});

// Start idle with a greeting bubble after a short delay
setTimeout(() => setMood('idle', 0, 'Hi! I\'m Shelly 🐢'), 800);

/* ==============================================
   6. INIT
   ============================================== */

/** Bootstraps the app — renders persisted data and initialises the timer ring. */
function init() {
  renderTodos();
  renderLinks();
  renderTimer(); // draw ring at full for the loaded duration
  timerLabelEl.textContent = `Pomodoro — ${pomodoroSeconds / 60} min`;
}

init();
