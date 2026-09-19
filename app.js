// Belajar Indonesia — spaced repetition engine + UI
// Simplified Anki-style scheduler: short in-session "learning steps" (queue-position based,
// no real-time timers needed) followed by SM-2 style long-term review intervals.

const STORAGE_CARDS = "indoSRS_cards_v1";
const STORAGE_SETTINGS = "indoSRS_settings_v1";
const STORAGE_PHRASES = "indoSRS_phrases_v1";
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_CATEGORY = "My Phrases";
const EASY_TO_LEARN = 5; // rate a card "Easy" this many times (cumulative) to mark it Learned

const DEFAULT_SETTINGS = {
  direction: "mixed", // 'id->en' | 'en->id' | 'mixed'
  categories: null, // null = all categories
};

// ---------- Persistence ----------

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_SETTINGS);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch (e) {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_SETTINGS, JSON.stringify(settings));
  } catch (e) {
    /* ignore quota errors */
  }
}

function loadCardStates() {
  try {
    const raw = localStorage.getItem(STORAGE_CARDS);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function saveCardStates(states) {
  try {
    localStorage.setItem(STORAGE_CARDS, JSON.stringify(states));
  } catch (e) {
    /* ignore quota errors */
  }
}

function freshCardState() {
  return {
    state: "new", // new | learning | review | relearning
    learningStep: 0,
    due: 0,
    interval: 0,
    ef: 2.5,
    reps: 0,
    lapses: 0,
    timesEasy: 0, // cumulative count of "Easy" ratings, toward the Learned threshold
    learned: false, // true once timesEasy has reached EASY_TO_LEARN; cleared by a single "Again"
  };
}

function loadPhrases() {
  try {
    const raw = localStorage.getItem(STORAGE_PHRASES);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function savePhrases(list) {
  try {
    localStorage.setItem(STORAGE_PHRASES, JSON.stringify(list));
  } catch (e) {
    /* ignore quota errors */
  }
}

function generatePhraseId() {
  return "p_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

// ---------- App state (in-memory) ----------

let settings = loadSettings();
let cardStates = loadCardStates();
let phrases = loadPhrases(); // every phrase is one the user typed in themselves — no starter deck
let sessionQueue = []; // array of phrase ids for the current study session
let currentCardId = null;
let currentCardDirection = "id->en"; // resolved direction for the card currently shown
let isFlipped = false;
let editingPhraseId = null; // set while the phrase form is editing an existing entry
let justLearnedCardId = null; // set for one rateCard() call when a card just crossed the Learned threshold
let justUnlearnedCardId = null; // set for one rateCard() call when a learned card was just demoted

// "Drill" state — a focused loop on ONE phrase (from Browse's 🔁 button), for when a specific
// phrase needs a few extra reps in a row. Entirely separate from the real SM-2 schedule: it never
// calls rateCard(), so it doesn't touch that phrase's interval, ease, reps, or Learned progress.
let drillCardId = null;
let drillCardDirection = "id->en";
let drillFlipped = false;
let drillRepCount = 0;

// "Listen" auto-play state — see the Listen engine section below, near the Browse screen code.
const ttsAvailable = "speechSynthesis" in window;
let listenState = {
  active: false,
  token: 0, // bumped on every start/stop to invalidate any in-flight loop, delay or utterance
  pendingTimer: null,
  pendingResolve: null,
};

let byId = {};
function rebuildIndex() {
  byId = {};
  phrases.forEach((p) => (byId[p.id] = p));
}
rebuildIndex();

function ensureAllCardsExist() {
  let changed = false;
  phrases.forEach((p) => {
    if (!cardStates[p.id]) {
      cardStates[p.id] = freshCardState();
      changed = true;
    }
  });
  // Prune scheduling state for phrases that no longer exist (deleted since last load).
  const validIds = new Set(phrases.map((p) => p.id));
  Object.keys(cardStates).forEach((id) => {
    if (!validIds.has(id)) {
      delete cardStates[id];
      changed = true;
    }
  });
  if (changed) saveCardStates(cardStates);
}

function categoryList() {
  const set = new Set(phrases.map((p) => p.cat));
  return Array.from(set);
}

// ---------- Phrase CRUD ----------

function addPhrase({ cat, id_text, en, note }) {
  const p = {
    id: generatePhraseId(),
    cat: (cat || "").trim() || DEFAULT_CATEGORY,
    id_text: id_text.trim(),
    en: en.trim(),
    note: (note || "").trim(),
  };
  phrases.push(p);
  savePhrases(phrases);
  rebuildIndex();
  cardStates[p.id] = freshCardState();
  saveCardStates(cardStates);
  return p;
}

function updatePhrase(id, { cat, id_text, en, note }) {
  const p = byId[id];
  if (!p) return;
  p.cat = (cat || "").trim() || DEFAULT_CATEGORY;
  p.id_text = id_text.trim();
  p.en = en.trim();
  p.note = (note || "").trim();
  savePhrases(phrases);
  rebuildIndex();
}

function deletePhrase(id) {
  phrases = phrases.filter((p) => p.id !== id);
  savePhrases(phrases);
  rebuildIndex();
  delete cardStates[id];
  saveCardStates(cardStates);
  sessionQueue = sessionQueue.filter((cardId) => cardId !== id);
}

function activeCategories() {
  return settings.categories && settings.categories.length
    ? settings.categories
    : categoryList();
}

// ---------- Stats ----------

// No daily cap on new cards and no hard stop once you're "caught up" — this is a small,
// self-curated deck, not a huge shared one, and there's no reason to throttle how much
// you're allowed to practice.
function computeStats() {
  const now = Date.now();
  const cats = activeCategories();
  let due = 0;
  let newAvailable = 0;
  let learned = 0;
  let total = 0;
  phrases.forEach((p) => {
    if (!cats.includes(p.cat)) return;
    total++;
    const st = cardStates[p.id];
    if (!st) return;
    if (st.state === "new") newAvailable++;
    else if (st.due <= now) due++;
    if (st.learned) learned++;
  });
  return { due, newAvailable, learned, total };
}

// ---------- Session queue ----------

function buildSessionQueue() {
  const now = Date.now();
  const cats = activeCategories();
  const due = [];
  const fresh = [];
  phrases.forEach((p) => {
    if (!cats.includes(p.cat)) return;
    const st = cardStates[p.id];
    if (!st) return;
    if (st.state === "new") fresh.push(p.id);
    else if (st.due <= now) due.push(p.id);
  });
  shuffle(due);
  shuffle(fresh);
  let queue = due.concat(fresh);
  if (queue.length === 0) {
    // Nothing is formally due — that's the schedule working as intended, not a wall.
    // Fall back to a free-practice round through every phrase in the active categories,
    // so Study is never blocked. Rating still updates real scheduling (same as reviewing
    // early in Anki), it just doesn't hold you back from drilling as often as you want.
    queue = phrases.filter((p) => cats.includes(p.cat)).map((p) => p.id);
    shuffle(queue);
  }
  return queue;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// ---------- Scheduling ----------

const LEARNING_REQUEUE_STEPS = [3, 6]; // queue positions ahead per learning step
const AGAIN_REQUEUE = 2;
const HARD_REQUEUE = 4;
const MAX_INTERVAL_DAYS = 3650; // ~10 years — sanity cap so repeated ratings on one card
// (e.g. during free practice) can't compound into an astronomical, garbled interval

function clampInterval(days) {
  return Math.max(1, Math.min(MAX_INTERVAL_DAYS, Math.round(days)));
}

function requeue(cardId, positionsAhead) {
  const insertAt = Math.min(sessionQueue.length, positionsAhead);
  sessionQueue.splice(insertAt, 0, cardId);
}

function rateCard(cardId, rating) {
  // rating: 'again' | 'hard' | 'good' | 'easy'
  const st = cardStates[cardId];
  const now = Date.now();

  // "Learned" tracking is independent of, and layered on top of, the scheduling state
  // machine below: rate a card Easy enough times (cumulative — doesn't need to be a streak)
  // and it's marked Learned; a single Again on a Learned card un-learns it completely,
  // so it has to earn its way back in from scratch.
  justLearnedCardId = null;
  justUnlearnedCardId = null;
  if (rating === "easy") {
    st.timesEasy = (st.timesEasy || 0) + 1;
    if (!st.learned && st.timesEasy >= EASY_TO_LEARN) {
      st.learned = true;
      justLearnedCardId = cardId;
    }
  } else if (rating === "again" && st.learned) {
    st.learned = false;
    st.timesEasy = 0;
    justUnlearnedCardId = cardId;
  }

  if (st.state === "new" || st.state === "learning") {
    st.state = "learning";
    if (rating === "again") {
      st.learningStep = 0;
      requeue(cardId, AGAIN_REQUEUE);
    } else if (rating === "hard") {
      requeue(cardId, HARD_REQUEUE);
    } else if (rating === "good") {
      st.learningStep += 1;
      if (st.learningStep >= LEARNING_REQUEUE_STEPS.length) {
        graduate(st, now, 1);
      } else {
        requeue(cardId, LEARNING_REQUEUE_STEPS[st.learningStep]);
      }
    } else if (rating === "easy") {
      graduate(st, now, 4);
    }
  } else if (st.state === "relearning") {
    if (rating === "again") {
      requeue(cardId, AGAIN_REQUEUE);
    } else if (rating === "hard") {
      requeue(cardId, HARD_REQUEUE);
    } else {
      // good or easy graduates back to review
      st.state = "review";
      st.interval = 1;
      st.due = now + st.interval * DAY_MS;
    }
  } else if (st.state === "review") {
    st.reps += 1;
    if (rating === "again") {
      st.lapses += 1;
      st.ef = Math.max(1.3, st.ef - 0.2);
      st.state = "relearning";
      st.interval = clampInterval(st.interval * 0.5);
      requeue(cardId, AGAIN_REQUEUE);
    } else if (rating === "hard") {
      st.ef = Math.max(1.3, st.ef - 0.15);
      st.interval = clampInterval(st.interval * 1.2);
      st.due = now + st.interval * DAY_MS;
    } else if (rating === "good") {
      st.interval = clampInterval(st.interval * st.ef);
      st.due = now + st.interval * DAY_MS;
    } else if (rating === "easy") {
      st.ef = st.ef + 0.15;
      st.interval = clampInterval(st.interval * st.ef * 1.3);
      st.due = now + st.interval * DAY_MS;
    }
  }

  saveCardStates(cardStates);
}

function graduate(st, now, days) {
  st.state = "review";
  st.interval = clampInterval(days);
  st.due = now + st.interval * DAY_MS;
  st.reps = 1;
}

function previewIntervals(cardId) {
  // Returns short human labels for the 4 buttons, for the card currently on top of screen
  const st = cardStates[cardId];
  if (st.state === "new" || st.state === "learning") {
    return { again: "<1m", hard: "<6m", good: st.learningStep + 1 >= LEARNING_REQUEUE_STEPS.length ? "1d" : "~10m", easy: "4d" };
  }
  if (st.state === "relearning") {
    return { again: "<1m", hard: "<6m", good: "1d", easy: "1d" };
  }
  // review — clamp defensively so an already-corrupted stored interval (e.g. from
  // before the MAX_INTERVAL_DAYS cap existed) still displays sanely right away
  const curIv = clampInterval(st.interval);
  const hardIv = clampInterval(curIv * 1.2);
  const goodIv = clampInterval(curIv * st.ef);
  const easyIv = clampInterval(curIv * st.ef * 1.3);
  return { again: "1d", hard: fmtDays(hardIv), good: fmtDays(goodIv), easy: fmtDays(easyIv) };
}

function fmtDays(d) {
  if (d < 30) return d + "d";
  if (d < 365) return Math.round(d / 30) + "mo";
  return (d / 365).toFixed(1) + "y";
}

// ---------- Screens ----------

const screens = {
  home: document.getElementById("screen-home"),
  study: document.getElementById("screen-study"),
  browse: document.getElementById("screen-browse"),
  suggestions: document.getElementById("screen-suggestions"),
  settings: document.getElementById("screen-settings"),
  drill: document.getElementById("screen-drill"),
};

function showScreen(name) {
  if (name !== "browse") stopListening(); // Listen only makes sense while Browse is on screen
  Object.keys(screens).forEach((k) => {
    screens[k].classList.toggle("active", k === name);
  });
  document.querySelectorAll(".navbtn").forEach((b) => {
    b.classList.toggle("active", b.dataset.screen === name);
  });
  if (name === "home") renderHome();
  if (name === "browse") renderBrowse();
  if (name === "suggestions") renderSuggestions();
  if (name === "settings") renderSettings();
}

// ---- Home ----

function renderHome() {
  const stats = computeStats();
  document.getElementById("stat-due").textContent = stats.due;
  document.getElementById("stat-new").textContent = stats.newAvailable;
  document.getElementById("stat-learned").textContent = stats.learned;
  document.getElementById("stat-total").textContent = stats.total;
  const startBtn = document.getElementById("btn-start-study");
  const totalToStudy = stats.due + stats.newAvailable;
  const emptyState = document.getElementById("home-empty-state");

  if (phrases.length === 0) {
    startBtn.classList.add("hidden");
    emptyState.classList.remove("hidden");
  } else {
    startBtn.classList.remove("hidden");
    emptyState.classList.add("hidden");
    startBtn.disabled = false; // never blocked — nothing formally due just means free-practice mode
    startBtn.textContent =
      totalToStudy === 0 ? `Practice again (${stats.total})` : `Study now (${totalToStudy})`;
  }
}

// ---- Study ----

function startStudySession() {
  if (phrases.length === 0) {
    showScreen("browse");
    return;
  }
  sessionQueue = buildSessionQueue();
  if (sessionQueue.length === 0) {
    showScreen("home");
    return;
  }
  showScreen("study");
  nextCard();
}

function resolveDirection() {
  if (settings.direction === "mixed") {
    return Math.random() < 0.5 ? "id->en" : "en->id";
  }
  return settings.direction;
}

// ---- Drill (focused repeat of a single phrase) ----

function startDrill(cardId) {
  if (!byId[cardId]) return;
  drillCardId = cardId;
  drillCardDirection = resolveDirection(); // fixed for the whole drill, so reps stay consistent
  drillRepCount = 0;
  showScreen("drill");
  renderDrillFront();
}

function renderDrillFront() {
  drillFlipped = false;
  drillRepCount += 1;
  const p = byId[drillCardId];
  document.getElementById("drill-front").textContent = drillCardDirection === "id->en" ? p.id_text : p.en;
  document.getElementById("drill-back").classList.add("hidden");
  document.getElementById("drill-tap-hint").classList.remove("hidden");
  document.getElementById("drill-buttons").classList.add("hidden");
  document.getElementById("drill-category").textContent = p.cat;
  document.getElementById("drill-progress").textContent = `Rep ${drillRepCount} — not affecting your real progress`;
}

function flipDrillCard() {
  if (drillFlipped) return;
  drillFlipped = true;
  const p = byId[drillCardId];
  const back = drillCardDirection === "id->en" ? p.en : p.id_text;
  document.getElementById("drill-back-text").textContent = back;
  document.getElementById("drill-back-note").textContent = p.note || "";
  document.getElementById("drill-back-note").classList.toggle("hidden", !p.note);
  document.getElementById("drill-back").classList.remove("hidden");
  document.getElementById("drill-tap-hint").classList.add("hidden");
  document.getElementById("drill-buttons").classList.remove("hidden");
}

function endDrill() {
  drillCardId = null;
  showScreen("browse");
}

function nextCard() {
  isFlipped = false;
  if (sessionQueue.length === 0) {
    // session complete
    document.getElementById("study-card").classList.add("hidden");
    document.getElementById("study-complete").classList.remove("hidden");
    document.getElementById("study-progress").textContent = "";
    return;
  }
  document.getElementById("study-card").classList.remove("hidden");
  document.getElementById("study-complete").classList.add("hidden");
  currentCardId = sessionQueue.shift();
  currentCardDirection = resolveDirection();
  document.getElementById("study-progress").textContent = `${sessionQueue.length + 1} left this session`;
  renderCardFront();
}

function renderCardFront() {
  const p = byId[currentCardId];
  const front = currentCardDirection === "id->en" ? p.id_text : p.en;
  document.getElementById("card-front").textContent = front;
  document.getElementById("card-back").classList.add("hidden");
  document.getElementById("card-tap-hint").classList.remove("hidden");
  document.getElementById("rating-buttons").classList.add("hidden");
  document.getElementById("card-category").textContent = p.cat;
  isFlipped = false;
}

function flipCard() {
  if (isFlipped) return;
  isFlipped = true;
  const p = byId[currentCardId];
  const back = currentCardDirection === "id->en" ? p.en : p.id_text;
  document.getElementById("card-back-text").textContent = back;
  document.getElementById("card-back-note").textContent = p.note || "";
  document.getElementById("card-back-note").classList.toggle("hidden", !p.note);
  document.getElementById("card-back").classList.remove("hidden");
  document.getElementById("card-tap-hint").classList.add("hidden");
  document.getElementById("rating-buttons").classList.remove("hidden");

  const preview = previewIntervals(currentCardId);
  document.getElementById("btn-again").querySelector(".ival").textContent = preview.again;
  document.getElementById("btn-hard").querySelector(".ival").textContent = preview.hard;
  document.getElementById("btn-good").querySelector(".ival").textContent = preview.good;
  document.getElementById("btn-easy").querySelector(".ival").textContent = preview.easy;
}

function handleRating(rating) {
  if (!isFlipped || !currentCardId) return;
  const p = byId[currentCardId];
  rateCard(currentCardId, rating);
  if (justLearnedCardId === currentCardId) {
    showLearnedToast(`🌟 "${p.id_text}" learned!`, "learned");
  } else if (justUnlearnedCardId === currentCardId) {
    showLearnedToast(`"${p.id_text}" removed from learned list`, "unlearned");
  }
  nextCard();
}

function showLearnedToast(message, kind) {
  const toast = document.getElementById("learned-toast");
  toast.textContent = message;
  toast.className = "learned-toast " + kind;
  // Force reflow so re-triggering the animation on back-to-back toasts restarts it.
  void toast.offsetWidth;
  toast.classList.add("visible");
  clearTimeout(showLearnedToast._t);
  showLearnedToast._t = setTimeout(() => toast.classList.remove("visible"), 2200);
}

function speakIndonesian(id) {
  const p = byId[id || currentCardId];
  if (!p || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(p.id_text);
    utter.lang = "id-ID";
    utter.rate = 0.85;
    window.speechSynthesis.speak(utter);
  } catch (e) {
    /* TTS not available offline / on this device — silently ignore */
  }
}

// ---- Browse / manage phrases ----

// Shared by renderBrowse() and the Listen feature, so what you see on screen and what
// Listen plays through are always exactly the same set, in the same order.
function getFilteredGroupedPhrases(filterText) {
  const search = (filterText || document.getElementById("browse-search").value || "").trim().toLowerCase();
  const learnedOnly = document.getElementById("browse-filter-learned").checked;
  const cats = {};
  phrases.forEach((p) => {
    if (search && !p.id_text.toLowerCase().includes(search) && !p.en.toLowerCase().includes(search)) return;
    if (learnedOnly && !(cardStates[p.id] && cardStates[p.id].learned)) return;
    if (!cats[p.cat]) cats[p.cat] = [];
    cats[p.cat].push(p);
  });
  return cats;
}

function renderBrowse(filterText) {
  const container = document.getElementById("browse-list");
  container.innerHTML = "";
  const learnedOnly = document.getElementById("browse-filter-learned").checked;
  const cats = getFilteredGroupedPhrases(filterText);
  Object.keys(cats).forEach((cat) => {
    const h = document.createElement("h3");
    h.className = "browse-cat";
    h.textContent = cat;
    container.appendChild(h);
    cats[cat].forEach((p) => {
      const row = document.createElement("div");
      row.className = "browse-row";
      row.dataset.id = p.id;
      const st = cardStates[p.id];
      let badge = "";
      if (st && st.learned) {
        badge = ` <span class="badge badge-learned">⭐ learned</span>`;
      } else if (st && st.state !== "new") {
        const progress = st.timesEasy > 0 ? ` ${st.timesEasy}/${EASY_TO_LEARN}` : "";
        badge = ` <span class="badge">${st.state}${progress}</span>`;
      }
      row.innerHTML = `
        <div class="browse-text">
          <div class="browse-id">${escapeHtml(p.id_text)}</div>
          <div class="browse-en">${escapeHtml(p.en)}${badge}</div>
        </div>
        <div class="browse-actions">
          <button class="browse-drill" data-id="${p.id}" aria-label="Drill this phrase" title="Drill this phrase — repeat it a few times">🔁</button>
          <button class="browse-edit" data-id="${p.id}" aria-label="Edit">✏️</button>
        </div>`;
      container.appendChild(row);
    });
  });
  if (phrases.length === 0) {
    container.innerHTML = '<p class="empty">No phrases yet. Tap "+ Add phrase" above to add your first one.</p>';
  } else if (Object.keys(cats).length === 0) {
    container.innerHTML = learnedOnly
      ? '<p class="empty">No learned words yet — rate a card "Easy" five times to mark it learned.</p>'
      : '<p class="empty">No phrases match your search.</p>';
  }
  updateCategoryDatalist();
}

function updateCategoryDatalist() {
  const dl = document.getElementById("category-options");
  dl.innerHTML = categoryList()
    .map((c) => `<option value="${escapeHtml(c)}"></option>`)
    .join("");
}

// ---- Listen (auto-play through whatever's currently visible in Browse) ----
//
// Plays English (normal speed), a ~3s pause, Indonesian (slowed down), a shorter pause,
// then moves to the next phrase in the same filtered/grouped order renderBrowse() shows —
// so it always tracks the current search text and "learned only" filter. Loops back to the
// start at the end rather than stopping, so it can run continuously while propped up.
//
// speakOnce() is wrapped in a Promise with a safety-net timeout, because speechSynthesis's
// onend/onerror events are known to be unreliable across browsers (notably iOS Safari, the
// actual target device here) — without the safety net, one missed event would stall the
// loop forever. Every await point re-checks listenState against the token captured at start,
// which is how stopping (or restarting) cleanly cancels an in-flight loop.

function getFilteredGroupedPhraseIds(filterText) {
  const cats = getFilteredGroupedPhrases(filterText);
  const ids = [];
  Object.keys(cats).forEach((cat) => cats[cat].forEach((p) => ids.push(p.id)));
  return ids;
}

function delay(ms) {
  return new Promise((resolve) => {
    listenState.pendingResolve = resolve;
    listenState.pendingTimer = setTimeout(() => {
      listenState.pendingTimer = null;
      listenState.pendingResolve = null;
      resolve();
    }, ms);
  });
}

function speakOnce(text, lang, rate) {
  return new Promise((resolve) => {
    if (!ttsAvailable) {
      resolve();
      return;
    }
    try {
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = lang;
      utter.rate = rate;
      let done = false;
      let safetyTimer;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(safetyTimer);
        resolve();
      };
      utter.onend = finish;
      utter.onerror = finish;
      // Generous ceiling based on text length + rate, so a missed event (or headless/
      // voiceless environments where nothing ever actually plays) can't hang the loop.
      const estMs = Math.max(1200, (text.length / (rate || 1)) * 110) + 800;
      safetyTimer = setTimeout(finish, estMs);
      window.speechSynthesis.speak(utter);
    } catch (e) {
      resolve();
    }
  });
}

async function runListenLoop(startToken) {
  let index = 0;
  const stillCurrent = () => listenState.active && listenState.token === startToken;
  while (stillCurrent()) {
    const ids = getFilteredGroupedPhraseIds();
    if (ids.length === 0) {
      updateListenStatusText("Nothing to play here.");
      stopListening();
      return;
    }
    if (index >= ids.length) index = 0; // reached the end — loop back to the start
    const p = byId[ids[index]];
    if (!p) {
      index++;
      continue; // phrase vanished mid-playback (deleted elsewhere); skip it
    }

    highlightListenRow(p.id);
    updateListenStatusText(`${index + 1} / ${ids.length} — ${p.id_text}`);

    await speakOnce(p.en, "en-US", 1.0);
    if (!stillCurrent()) return;
    await delay(3000); // give a few seconds to think before the Indonesian version plays
    if (!stillCurrent()) return;

    await speakOnce(p.id_text, "id-ID", 0.7);
    if (!stillCurrent()) return;
    await delay(900);
    if (!stillCurrent()) return;

    index++;
  }
}

function startListening() {
  if (!ttsAvailable || listenState.active) return;
  const ids = getFilteredGroupedPhraseIds();
  if (ids.length === 0) {
    updateListenStatusText("Nothing to play here.");
    return;
  }
  listenState.active = true;
  listenState.token += 1;
  const btn = document.getElementById("btn-listen-toggle");
  if (btn) {
    btn.textContent = "⏸️ Pause";
    btn.classList.add("playing");
  }
  const skipBtn = document.getElementById("btn-listen-skip");
  if (skipBtn) skipBtn.classList.remove("hidden");
  runListenLoop(listenState.token);
}

function stopListening() {
  if (!listenState.active) return;
  listenState.active = false;
  listenState.token += 1; // invalidates any in-flight await in runListenLoop
  try {
    window.speechSynthesis.cancel();
  } catch (e) {
    /* ignore */
  }
  if (listenState.pendingTimer) {
    clearTimeout(listenState.pendingTimer);
    listenState.pendingTimer = null;
    listenState.pendingResolve = null;
  }
  const btn = document.getElementById("btn-listen-toggle");
  if (btn) {
    btn.textContent = "▶️ Listen";
    btn.classList.remove("playing");
  }
  const skipBtn = document.getElementById("btn-listen-skip");
  if (skipBtn) skipBtn.classList.add("hidden");
  clearListenHighlight();
  updateListenStatusText("");
}

function skipListen() {
  if (!listenState.active) return;
  try {
    window.speechSynthesis.cancel(); // resolves a speakOnce() in progress via onerror/onend
  } catch (e) {
    /* ignore */
  }
  if (listenState.pendingTimer) {
    // currently mid-delay — resolve it immediately instead of waiting it out
    clearTimeout(listenState.pendingTimer);
    listenState.pendingTimer = null;
    const resolve = listenState.pendingResolve;
    listenState.pendingResolve = null;
    if (resolve) resolve();
  }
}

function highlightListenRow(id) {
  clearListenHighlight();
  const row = document.querySelector(`.browse-row[data-id="${id}"]`);
  if (row) row.classList.add("listen-active");
}

function clearListenHighlight() {
  document.querySelectorAll(".browse-row.listen-active").forEach((el) => el.classList.remove("listen-active"));
}

function updateListenStatusText(text) {
  const el = document.getElementById("listen-status");
  if (el) el.textContent = text;
}

function openPhraseForm(id) {
  stopListening(); // editing changes the underlying list Listen plays through
  editingPhraseId = id || null;
  const form = document.getElementById("phrase-form");
  const title = document.getElementById("phrase-form-title");
  const deleteBtn = document.getElementById("btn-delete-phrase");
  if (id) {
    const p = byId[id];
    title.textContent = "Edit phrase";
    document.getElementById("field-category").value = p.cat;
    document.getElementById("field-id-text").value = p.id_text;
    document.getElementById("field-en-text").value = p.en;
    document.getElementById("field-note").value = p.note || "";
    deleteBtn.classList.remove("hidden");
  } else {
    title.textContent = "Add phrase";
    document.getElementById("field-category").value = "";
    document.getElementById("field-id-text").value = "";
    document.getElementById("field-en-text").value = "";
    document.getElementById("field-note").value = "";
    deleteBtn.classList.add("hidden");
  }
  updateCategoryDatalist();
  form.classList.remove("hidden");
  document.getElementById("field-id-text").focus();
}

function closePhraseForm() {
  editingPhraseId = null;
  document.getElementById("phrase-form").classList.add("hidden");
}

function savePhraseFromForm() {
  const idText = document.getElementById("field-id-text").value.trim();
  const enText = document.getElementById("field-en-text").value.trim();
  if (!idText || !enText) {
    alert("Please fill in both the Indonesian and English text.");
    return;
  }
  const data = {
    cat: document.getElementById("field-category").value,
    id_text: idText,
    en: enText,
    note: document.getElementById("field-note").value,
  };
  if (editingPhraseId) {
    updatePhrase(editingPhraseId, data);
  } else {
    addPhrase(data);
  }
  closePhraseForm();
  renderBrowse();
  renderHome();
}

function deletePhraseFromForm() {
  if (!editingPhraseId) return;
  if (!confirm("Delete this phrase? Its review history goes with it.")) return;
  deletePhrase(editingPhraseId);
  closePhraseForm();
  renderBrowse();
  renderHome();
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---- Suggestions (curated phrase bank Tony picks from, at his own pace) ----
//
// SUGGESTED_PHRASES comes from suggestions-data.js. Each entry has its own stable bank id (so it
// can be found again when its "+" is tapped), separate from the real phrase ids addPhrase()
// generates. "Already added" is determined by matching id_text against the user's own phrases
// (normalized/trimmed/lowercased) rather than tracked separately — so if a phrase is later
// deleted from the main deck, it naturally becomes available to add again from the bank, which
// seems like the right behavior rather than a bug to guard against.

function getAddedPhraseTextSet() {
  return new Set(phrases.map((p) => p.id_text.trim().toLowerCase()));
}

function getFilteredGroupedSuggestions(filterText) {
  const search = (filterText || document.getElementById("suggestions-search").value || "").trim().toLowerCase();
  const hideAdded = document.getElementById("suggestions-hide-added").checked;
  const addedSet = getAddedPhraseTextSet();
  const cats = {};
  SUGGESTED_PHRASES.forEach((s) => {
    if (search && !s.id_text.toLowerCase().includes(search) && !s.en.toLowerCase().includes(search)) return;
    const isAdded = addedSet.has(s.id_text.trim().toLowerCase());
    if (hideAdded && isAdded) return;
    if (!cats[s.cat]) cats[s.cat] = [];
    cats[s.cat].push(s);
  });
  return cats;
}

function renderSuggestions() {
  const container = document.getElementById("suggestions-list");
  container.innerHTML = "";
  const hideAdded = document.getElementById("suggestions-hide-added").checked;
  const cats = getFilteredGroupedSuggestions();
  const addedSet = getAddedPhraseTextSet();

  const orderedCats = SUGGESTION_CATEGORY_ORDER.filter((c) => cats[c]).concat(
    Object.keys(cats).filter((c) => !SUGGESTION_CATEGORY_ORDER.includes(c))
  );

  orderedCats.forEach((cat) => {
    const h = document.createElement("h3");
    h.className = "browse-cat";
    h.textContent = cat;
    container.appendChild(h);
    cats[cat].forEach((s) => {
      const isAdded = addedSet.has(s.id_text.trim().toLowerCase());
      const row = document.createElement("div");
      row.className = "browse-row suggestion-row";
      row.innerHTML = `
        <div class="browse-text">
          <div class="browse-id">${escapeHtml(s.id_text)}</div>
          <div class="browse-en">${escapeHtml(s.en)}</div>
          ${s.note ? `<div class="suggestion-note">${escapeHtml(s.note)}</div>` : ""}
        </div>
        <button class="suggestion-add-btn${isAdded ? " added" : ""}" data-id="${s.id}"
          aria-label="${isAdded ? "Already added" : "Add to my deck"}">${isAdded ? "✓ Added" : "➕"}</button>`;
      container.appendChild(row);
    });
  });

  if (Object.keys(cats).length === 0) {
    container.innerHTML = hideAdded
      ? '<p class="empty">You\'ve added every phrase that matches — nice work! Uncheck the filter above to browse them again.</p>'
      : '<p class="empty">No suggestions match your search.</p>';
  }
}

function addSuggestedPhrase(bankId) {
  const s = SUGGESTED_PHRASES.find((p) => p.id === bankId);
  if (!s) return;
  const alreadyAdded = getAddedPhraseTextSet().has(s.id_text.trim().toLowerCase());
  if (alreadyAdded) return; // guards against a double-tap adding a duplicate entry
  addPhrase({ cat: s.cat, id_text: s.id_text, en: s.en, note: s.note });
  renderSuggestions();
  renderHome();
}

// ---- Settings ----

function renderSettings() {
  document.getElementById("setting-direction").value = settings.direction;
  const catContainer = document.getElementById("setting-categories");
  catContainer.innerHTML = "";
  const active = activeCategories();
  categoryList().forEach((cat) => {
    const id = "cat-" + cat.replace(/\W+/g, "-");
    const wrap = document.createElement("label");
    wrap.className = "cat-check";
    wrap.innerHTML = `<input type="checkbox" id="${id}" ${active.includes(cat) ? "checked" : ""}/> ${escapeHtml(cat)}`;
    catContainer.appendChild(wrap);
  });
}

// Settings are saved the instant anything changes (checkbox, dropdown, number field) —
// there's no separate "did you remember to hit Save?" step to trip over. The Save button
// stays as an explicit confirmation for touch users, but it's a no-op safety net, not a
// requirement: switching screens without tapping it still keeps whatever you last touched.
function saveSettingsFromForm(showConfirmation) {
  settings.direction = document.getElementById("setting-direction").value;
  const checked = Array.from(document.querySelectorAll("#setting-categories input:checked")).map((cb) =>
    cb.parentElement.textContent.trim()
  );
  settings.categories = checked.length ? checked : null;
  saveSettings(settings);
  renderHome();
  if (showConfirmation) {
    const note = document.getElementById("settings-saved-note");
    note.classList.remove("hidden");
    clearTimeout(saveSettingsFromForm._t);
    saveSettingsFromForm._t = setTimeout(() => note.classList.add("hidden"), 1500);
  }
}

function resetAllProgress() {
  if (!confirm("Reset all study progress? This cannot be undone.")) return;
  cardStates = {};
  ensureAllCardsExist();
  settings = { ...DEFAULT_SETTINGS };
  saveSettings(settings);
  renderHome();
}

// ---- Backup / restore ----
//
// Everything lives only in this browser's local storage, which updating the app's files does NOT
// touch — but plenty of things a person naturally does around an update CAN wipe it (deleting and
// re-adding a home-screen icon on iOS gives it a fresh, empty storage container; clearing site data
// while troubleshooting a stale cache; switching devices; a private/incognito window). Export writes
// everything to a JSON file the user actually controls, independent of the browser; Import reads it
// back in. This is the real fix for "I keep losing my phrases," not a workaround.

function exportPhrasesBackup() {
  const payload = {
    app: "belajar-indonesia",
    exportedAt: new Date().toISOString(),
    phrases,
    cardStates,
    settings,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `belajar-indonesia-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showBackupStatus(`Exported ${phrases.length} phrase${phrases.length === 1 ? "" : "s"} ✓`);
}

function importPhrasesFromFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let data;
    try {
      data = JSON.parse(reader.result);
    } catch (e) {
      alert("That doesn't look like a valid backup file.");
      return;
    }
    if (!data || !Array.isArray(data.phrases)) {
      alert("That file doesn't look like a Belajar Indonesia backup.");
      return;
    }
    const count = data.phrases.length;
    const ok = confirm(
      `Import ${count} phrase${count === 1 ? "" : "s"} from this backup? This replaces everything ` +
        `currently in the app (phrases, progress, and settings) — it can't be undone.`
    );
    if (!ok) return;

    phrases = data.phrases.map((p) => ({
      id: p.id || generatePhraseId(),
      cat: (p.cat || "").trim() || DEFAULT_CATEGORY,
      id_text: (p.id_text || "").trim(),
      en: (p.en || "").trim(),
      note: (p.note || "").trim(),
    }));
    savePhrases(phrases);
    rebuildIndex();

    cardStates = data.cardStates && typeof data.cardStates === "object" ? data.cardStates : {};
    ensureAllCardsExist(); // fills in states for any phrase missing one, prunes anything orphaned
    saveCardStates(cardStates);

    if (data.settings && typeof data.settings === "object") {
      settings = { ...DEFAULT_SETTINGS, ...data.settings };
      saveSettings(settings);
    }

    renderHome();
    renderBrowse();
    renderSettings();
    showBackupStatus(`Imported ${phrases.length} phrase${phrases.length === 1 ? "" : "s"} ✓`);
  };
  reader.onerror = () => alert("Couldn't read that file — please try again.");
  reader.readAsText(file);
}

function showBackupStatus(text) {
  const note = document.getElementById("backup-status-note");
  if (!note) return;
  note.textContent = text;
  note.classList.remove("hidden");
  clearTimeout(showBackupStatus._t);
  showBackupStatus._t = setTimeout(() => note.classList.add("hidden"), 2500);
}

// ---------- Init ----------

function init() {
  ensureAllCardsExist();

  document.querySelectorAll(".navbtn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.screen === "study") {
        // Always (re)build the session from the current settings, so the Study tab
        // never shows a stale queue built under a filter you've since changed.
        startStudySession();
      } else {
        showScreen(btn.dataset.screen);
      }
    });
  });

  document.getElementById("btn-start-study").addEventListener("click", startStudySession);
  document.getElementById("btn-study-again").addEventListener("click", startStudySession);
  document.getElementById("study-card").addEventListener("click", (e) => {
    if (!isFlipped && !e.target.closest("#rating-buttons")) flipCard();
  });
  document.getElementById("btn-speak").addEventListener("click", (e) => {
    e.stopPropagation();
    speakIndonesian();
  });
  document.getElementById("btn-again").addEventListener("click", (e) => {
    e.stopPropagation();
    handleRating("again");
  });
  document.getElementById("btn-hard").addEventListener("click", (e) => {
    e.stopPropagation();
    handleRating("hard");
  });
  document.getElementById("btn-good").addEventListener("click", (e) => {
    e.stopPropagation();
    handleRating("good");
  });
  document.getElementById("btn-easy").addEventListener("click", (e) => {
    e.stopPropagation();
    handleRating("easy");
  });

  document.getElementById("drill-card").addEventListener("click", (e) => {
    if (!drillFlipped && !e.target.closest("#drill-buttons")) flipDrillCard();
  });
  document.getElementById("btn-drill-speak").addEventListener("click", (e) => {
    e.stopPropagation();
    speakIndonesian(drillCardId);
  });
  document.getElementById("btn-drill-again").addEventListener("click", (e) => {
    e.stopPropagation();
    renderDrillFront();
  });
  document.getElementById("btn-drill-done").addEventListener("click", (e) => {
    e.stopPropagation();
    endDrill();
  });

  document.getElementById("browse-search").addEventListener("input", () => {
    stopListening(); // the filtered set just changed under it
    renderBrowse();
  });
  document.getElementById("browse-filter-learned").addEventListener("change", () => {
    stopListening();
    renderBrowse();
  });
  if (ttsAvailable) {
    document.getElementById("listen-bar").classList.remove("hidden");
    document.getElementById("btn-listen-toggle").addEventListener("click", () => {
      if (listenState.active) stopListening();
      else startListening();
    });
    document.getElementById("btn-listen-skip").addEventListener("click", skipListen);
  }
  document.getElementById("btn-add-phrase").addEventListener("click", () => openPhraseForm(null));
  document.getElementById("btn-home-add-phrase").addEventListener("click", () => {
    showScreen("browse");
    openPhraseForm(null);
  });
  document.getElementById("browse-list").addEventListener("click", (e) => {
    const editBtn = e.target.closest(".browse-edit");
    if (editBtn) { openPhraseForm(editBtn.dataset.id); return; }
    const drillBtn = e.target.closest(".browse-drill");
    if (drillBtn) startDrill(drillBtn.dataset.id);
  });
  document.getElementById("btn-save-phrase").addEventListener("click", savePhraseFromForm);
  document.getElementById("btn-cancel-phrase").addEventListener("click", closePhraseForm);
  document.getElementById("btn-delete-phrase").addEventListener("click", deletePhraseFromForm);

  document.getElementById("suggestions-search").addEventListener("input", () => renderSuggestions());
  document.getElementById("suggestions-hide-added").addEventListener("change", () => renderSuggestions());
  document.getElementById("suggestions-list").addEventListener("click", (e) => {
    const btn = e.target.closest(".suggestion-add-btn");
    if (btn && !btn.classList.contains("added")) addSuggestedPhrase(btn.dataset.id);
  });

  document.getElementById("btn-save-settings").addEventListener("click", () => saveSettingsFromForm(true));
  document.getElementById("btn-export-phrases").addEventListener("click", exportPhrasesBackup);
  document.getElementById("btn-import-phrases").addEventListener("click", () => {
    document.getElementById("import-file-input").click();
  });
  document.getElementById("import-file-input").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) importPhrasesFromFile(file);
    e.target.value = ""; // so re-importing the same filename later still fires a change event
  });
  document.getElementById("btn-reset-progress").addEventListener("click", resetAllProgress);
  document.getElementById("setting-direction").addEventListener("change", () => saveSettingsFromForm(false));
  // Event delegation: category checkboxes are rebuilt each time renderSettings() runs,
  // so listen on their stable container rather than re-binding after every render.
  document.getElementById("setting-categories").addEventListener("change", (e) => {
    if (e.target.matches('input[type="checkbox"]')) saveSettingsFromForm(false);
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {
      /* offline registration failures are non-fatal */
    });
  }

  showScreen("home");
}

document.addEventListener("DOMContentLoaded", init);
