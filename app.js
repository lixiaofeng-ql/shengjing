const API = "https://api.getbible.net/v2/cus";
const CACHE_NAME = "shengjing-cuv-v1";
const LS_THEME = "shengjing.theme";
const LS_FONT = "shengjing.font";
const LS_PLACE = "shengjing.place";
const LS_MARKS = "shengjing.bookmarks";

const state = {
  book: 43,
  chapter: 1,
  booksData: new Map(),
  bookLoads: new Map(),
  searchTimer: 0,
  searchId: 0,
  composing: false,
  localReady: false,
  localPromise: null,
  notes: new Map(),
  notesLoads: new Map(),
};

const SCOPE_LABEL = { ot: "旧约", nt: "新约", all: "全部" };

const $ = (id) => document.getElementById(id);

function bookByNr(nr) {
  return window.BIBLE_BOOKS.find((b) => b.nr === nr);
}

function loadJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function applyTheme() {
  const theme = localStorage.getItem(LS_THEME) || "day";
  document.documentElement.dataset.theme = theme;
}

function applyFont() {
  const size = Number(localStorage.getItem(LS_FONT) || 1.22);
  document.documentElement.style.setProperty("--reader-size", `${size}rem`);
}

async function fetchJson(url) {
  let lastErr;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`加载失败（${res.status}）`);
      return res.json();
    } catch (err) {
      lastErr = err;
      await new Promise((resolve) => setTimeout(resolve, 350 * (i + 1)));
    }
  }
  throw lastErr;
}

async function cachedFetch(url) {
  const request = new Request(url);
  try {
    const cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(request);
    if (hit) return hit.json();
    const res = await fetch(request);
    if (!res.ok) throw new Error(`加载失败（${res.status}）`);
    cache.put(request, res.clone()).catch(() => {});
    return res.json();
  } catch {
    return fetchJson(url);
  }
}

function chapterMapFromBook(raw) {
  if (!raw || typeof raw !== "object") return {};
  const source = raw.chapters ?? raw;
  const out = {};
  if (Array.isArray(source)) {
    source.forEach((ch, i) => {
      if (ch == null) return;
      const n = Number(ch.chapter ?? i + 1);
      out[n] = ch;
    });
    return out;
  }
  if (source && typeof source === "object") {
    const skip = new Set([
      "translation",
      "abbreviation",
      "lang",
      "language",
      "direction",
      "encoding",
      "nr",
      "name",
      "url",
      "sha",
      "book_name",
      "chapters",
    ]);
    for (const [key, value] of Object.entries(source)) {
      if (skip.has(key)) continue;
      const n = Number(value?.chapter ?? key);
      if (!Number.isNaN(n)) out[n] = value;
    }
  }
  return out;
}

function versesFromChapter(chapterRaw) {
  if (!chapterRaw) return [];
  let verses = chapterRaw;
  if (chapterRaw.verses) verses = chapterRaw.verses;
  if (Array.isArray(verses)) {
    return verses
      .map((v, i) => ({
        n: Number(v.verse ?? v.nr ?? i + 1),
        text: String(v.text ?? v.verse_text ?? v).trim(),
      }))
      .filter((v) => v.text);
  }
  if (typeof verses === "object") {
    return Object.entries(verses)
      .map(([k, v]) => {
        if (typeof v === "string") return { n: Number(k), text: v.trim() };
        if (v && typeof v === "object") {
          return { n: Number(v.verse ?? k), text: String(v.text ?? "").trim() };
        }
        return null;
      })
      .filter((v) => v && v.text)
      .sort((a, b) => a.n - b.n);
  }
  return [];
}

async function ensureLocalBible() {
  if (state.localReady) return;
  if (state.localPromise) return state.localPromise;
  state.localPromise = (async () => {
    const res = await fetch("data/cuv.json");
    if (!res.ok) throw new Error(`本地经文加载失败（${res.status}）`);
    const data = await res.json();
    for (const [nr, book] of Object.entries(data)) {
      const chapters = {};
      for (const [chapter, verses] of Object.entries(book.chapters || {})) {
        chapters[Number(chapter)] = verses;
      }
      state.booksData.set(Number(nr), chapters);
    }
    state.localReady = true;
  })().catch((err) => {
    state.localPromise = null;
    throw err;
  });
  return state.localPromise;
}

async function loadBook(nr) {
  if (!state.localReady) {
    try {
      await ensureLocalBible();
    } catch {
      /* fall back to network */
    }
  }
  if (state.booksData.has(nr)) return state.booksData.get(nr);
  if (state.bookLoads.has(nr)) return state.bookLoads.get(nr);
  const pending = cachedFetch(`${API}/${nr}.json`)
    .then((raw) => {
      const chapters = chapterMapFromBook(raw);
      state.booksData.set(nr, chapters);
      return chapters;
    })
    .finally(() => state.bookLoads.delete(nr));
  state.bookLoads.set(nr, pending);
  return pending;
}

async function loadChapterVerses(book, chapter) {
  const chapters = await loadBook(book);
  const fromBook = versesFromChapter(chapters[String(chapter)] || chapters[chapter]);
  if (fromBook.length || state.localReady) return fromBook;
  const raw = await cachedFetch(`${API}/${book}/${chapter}.json`);
  return versesFromChapter(raw);
}

function renderBooks() {
  const q = $("book-filter").value.trim();
  const nav = $("book-nav");
  const groups = [
    ["旧约", "ot"],
    ["新约", "nt"],
  ];
  nav.innerHTML = groups
    .map(([label, key]) => {
      const books = window.BIBLE_BOOKS.filter(
        (b) => b.testament === key && (!q || b.name.includes(q) || b.short.includes(q))
      );
      if (!books.length) return "";
      return `<div class="testament">${label}</div>${books
        .map(
          (b) =>
            `<button class="book-btn ${b.nr === state.book ? "active" : ""}" data-book="${b.nr}">
              <span>${b.name}</span><small>${b.chapters}章</small>
            </button>`
        )
        .join("")}`;
    })
    .join("");
}

function setMenu(open) {
  $("sidebar").classList.toggle("open", open);
  $("scrim").hidden = !open;
}

function markKey(book, chapter, verse) {
  return `${book}:${chapter}:${verse}`;
}

function bookmarks() {
  return loadJson(LS_MARKS, []);
}

function toggleBookmark(book, chapter, verse, text) {
  const list = bookmarks();
  const key = markKey(book, chapter, verse);
  const idx = list.findIndex((m) => m.key === key);
  if (idx >= 0) list.splice(idx, 1);
  else {
    const b = bookByNr(book);
    list.unshift({
      key,
      book,
      chapter,
      verse,
      label: `${b.short} ${chapter}:${verse}`,
      text: text.slice(0, 80),
    });
  }
  saveJson(LS_MARKS, list);
}

function isBookmarked(book, chapter, verse) {
  const key = markKey(book, chapter, verse);
  return bookmarks().some((m) => m.key === key);
}

function sanitizeNoteHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/ on\w+="[^"]*"/gi, "")
    .replace(/<(?!\/?(p|ul|ol|li|em|strong|br|blockquote|h3|h4)\b)[^>]+>/gi, "");
}

async function loadNotes(book) {
  if (state.notes.has(book)) return state.notes.get(book);
  if (state.notesLoads.has(book)) return state.notesLoads.get(book);
  const pending = fetch(`data/notes/${book}.json`)
    .then((res) => {
      if (!res.ok) throw new Error("no notes");
      return res.json();
    })
    .then((data) => {
      state.notes.set(book, data);
      return data;
    })
    .catch(() => {
      state.notes.set(book, { chapters: {} });
      return state.notes.get(book);
    })
    .finally(() => state.notesLoads.delete(book));
  state.notesLoads.set(book, pending);
  return pending;
}

function notesFor(book, chapter, verse) {
  const data = state.notes.get(book);
  const list = data?.chapters?.[String(chapter)] || [];
  if (!verse) return list;
  return list.filter((n) => verse >= Number(n.s) && verse <= Number(n.e || n.s));
}

function renderNoteList(items) {
  if (!items.length) {
    $("note-list").innerHTML = `<p class="status">这一处暂无注解。可先打开创世记，有注解的节号旁会出现「注」。</p>`;
    return;
  }
  $("note-list").innerHTML = items
    .map(
      (n) =>
        `<article class="note-item"><h3>${escapeHtml(n.t || "注解")}</h3><div>${sanitizeNoteHtml(n.h)}</div></article>`
    )
    .join("");
}

async function openNotes(verse) {
  const data = await loadNotes(state.book);
  const info = bookByNr(state.book);
  const items = notesFor(state.book, state.chapter, verse);
  $("note-title").textContent = verse
    ? `${info.name} ${state.chapter}:${verse} 注解`
    : `${info.name} ${state.chapter} 注解`;
  $("note-source").textContent = data.source ? `来源：${data.source}（繁体）` : "";
  renderNoteList(items);
  $("note-panel").hidden = false;
}

function parseHash() {
  const m = location.hash.match(/^#\/?(\d+)(?:\/(\d+))?(?:\/(\d+))?/);
  if (!m) return null;
  return {
    book: Number(m[1]),
    chapter: Number(m[2] || 1),
    verse: m[3] ? Number(m[3]) : undefined,
  };
}

function writeHash(book, chapter, verse) {
  const next = verse ? `#/${book}/${chapter}/${verse}` : `#/${book}/${chapter}`;
  if (location.hash !== next) history.replaceState(null, "", next);
}

function renderChapterPicks(info, chapter) {
  $("chapter-picks").innerHTML = Array.from({ length: info.chapters }, (_, i) => {
    const n = i + 1;
    return `<button type="button" class="${n === chapter ? "active" : ""}" data-chapter="${n}">${n}</button>`;
  }).join("");
}

function showHome() {
  $("home").hidden = false;
  $("chapter-view").hidden = true;
  if (location.hash) history.replaceState(null, "", location.pathname + location.search);
  renderBooks();
}

async function showChapter(book, chapter, highlightVerse, fromHash) {
  const info = bookByNr(book);
  if (!info) return;
  chapter = Math.min(Math.max(1, chapter), info.chapters);
  state.book = book;
  state.chapter = chapter;
  saveJson(LS_PLACE, { book, chapter });
  if (!fromHash) writeHash(book, chapter, highlightVerse);

  $("home").hidden = true;
  $("chapter-view").hidden = false;
  $("chapter-title").textContent = `${info.name} ${chapter}`;
  renderChapterPicks(info, chapter);
  $("verses").innerHTML = `<p class="status">正在载入经文…</p>`;
  renderBooks();
  setMenu(false);

  try {
    const [verses] = await Promise.all([loadChapterVerses(book, chapter), loadNotes(book)]);
    if (!verses.length) throw new Error("这一章没有经文数据");
    $("verses").innerHTML = verses
      .map((v) => {
        const marked = isBookmarked(book, chapter, v.n) ? " bookmarked" : "";
        const hasNote = notesFor(book, chapter, v.n).length;
        const noteBtn = hasNote
          ? `<button type="button" class="verse-note" data-note-verse="${v.n}" aria-label="查看注解">注</button>`
          : "";
        return `<p class="verse${marked}" id="v-${v.n}" data-verse="${v.n}">
          <span class="verse-num" title="点击收藏">${v.n}</span>${v.text}${noteBtn}
        </p>`;
      })
      .join("");
    if (highlightVerse) {
      const el = document.getElementById(`v-${highlightVerse}`);
      if (el) {
        el.style.background = "color-mix(in srgb, var(--gold) 28%, transparent)";
        el.scrollIntoView({ block: "center" });
      }
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  } catch (err) {
    $("verses").innerHTML = `<p class="error">无法加载经文。请检查网络后重试。<br>${escapeHtml(err.message)}</p>
      <button class="btn" id="btn-retry">重新加载</button>`;
  }
}

async function renderDaily() {
  const day = Math.floor(Date.now() / 86400000);
  const ref = window.DAILY_REFS[day % window.DAILY_REFS.length];
  const [book, chapter, verse] = ref;
  const info = bookByNr(book);
  $("daily-ref").textContent = `${info.name} ${chapter}:${verse}`;
  $("daily-ref").dataset.ref = JSON.stringify(ref);
  try {
    const verses = await loadChapterVerses(book, chapter);
    const hit = verses.find((v) => v.n === verse);
    $("daily-verse").textContent = hit ? hit.text : "点击继续阅读，开始今天的经文。";
  } catch {
    $("daily-verse").textContent = "需要联网加载和合本经文。加载后可离线阅读已打开的书卷。";
  }
}

function renderBookmarkList() {
  const list = bookmarks();
  $("bookmark-list").innerHTML = list.length
    ? list
        .map(
          (m) =>
            `<div class="bookmark-row">
              <button class="bookmark-item" data-key="${m.key}">
                <strong>${escapeHtml(m.label)}</strong>
                <div>${escapeHtml(m.text)}</div>
              </button>
              <button class="bookmark-remove" data-remove="${m.key}" aria-label="删除书签">✕</button>
            </div>`
        )
        .join("")
    : `<p class="status">还没有书签。阅读时点击节号即可收藏。</p>`;
}

function verseTextAt(el) {
  return el.textContent.replace(/^\s*\d+/, "").trim();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

function searchScope() {
  return document.querySelector('input[name="search-scope"]:checked')?.value || "all";
}

function booksForScope(scope) {
  if (scope === "ot") return window.BIBLE_BOOKS.filter((b) => b.testament === "ot");
  if (scope === "nt") return window.BIBLE_BOOKS.filter((b) => b.testament === "nt");
  return window.BIBLE_BOOKS;
}

const TRAD_SIMP = {
  愛: "爱",
  見: "见",
  國: "国",
  與: "与",
  來: "来",
  對: "对",
  從: "从",
  這: "这",
  還: "还",
  為: "为",
  無: "无",
  書: "书",
  經: "经",
  門: "门",
  東: "东",
  個: "个",
  們: "们",
  說: "说",
  話: "话",
  時: "时",
  會: "会",
  過: "过",
  發: "发",
  義: "义",
  禮: "礼",
  禱: "祷",
  應: "应",
  當: "当",
  稱: "称",
  顯: "显",
  靈: "灵",
  穌: "稣",
  萬: "万",
  麼: "么",
  後: "后",
  於: "于",
  並: "并",
  裡: "里",
  裏: "里",
  著: "着",
  聖: "圣",
  約: "约",
  啟: "启",
  馬: "马",
  亞: "亚",
  爾: "尔",
  願: "愿",
  憐: "怜",
  憫: "悯",
  贖: "赎",
  寶: "宝",
  實: "实",
  傳: "传",
  詩: "诗",
  據: "据",
};

const TRAD_RE = new RegExp(`[${Object.keys(TRAD_SIMP).join("")}]`, "g");

function normalizeForSearch(s) {
  return String(s)
    .normalize("NFKC")
    .replace(/[\s\u00a0\u3000]+/g, "")
    .replace(/[「」『』“”‘’"'，。；：、！？,.!?;:]/g, "")
    .replace(TRAD_RE, (ch) => TRAD_SIMP[ch] || ch)
    .toLowerCase();
}

function parseReference(q) {
  const raw = String(q).trim().replace(/\s+/g, "").replace(/：/g, ":").replace(/第/g, "").replace(/[章節节]/g, (ch) => (ch === "章" ? ":" : ""));
  const keys = [];
  for (const b of window.BIBLE_BOOKS) {
    keys.push({ key: b.name, book: b });
    keys.push({ key: b.short, book: b });
  }
  keys.sort((a, b) => b.key.length - a.key.length);
  for (const item of keys) {
    if (!raw.startsWith(item.key)) continue;
    const rest = raw.slice(item.key.length);
    const m = rest.match(/^(\d+)(?::(\d+))?$/);
    if (!m) continue;
    const chapter = Number(m[1]);
    const verse = m[2] ? Number(m[2]) : undefined;
    if (chapter < 1 || chapter > item.book.chapters) continue;
    return { book: item.book.nr, name: item.book.name, chapter, verse };
  }
  return null;
}

function scanBook(book, chapters, qNorm) {
  const hits = [];
  for (const [ch, raw] of Object.entries(chapters)) {
    for (const v of versesFromChapter(raw)) {
      if (normalizeForSearch(v.text).includes(qNorm)) {
        hits.push({ book: book.nr, name: book.name, chapter: Number(ch), verse: v.n, text: v.text });
      }
    }
  }
  return hits;
}

function paintSearch(box, hits, q, status) {
  const shown = [...hits]
    .sort((a, b) => a.book - b.book || a.chapter - b.chapter || a.verse - b.verse)
    .slice(0, 80);
  const mark = escapeHtml(q);
  const list = shown
    .map((h) => {
      let body = escapeHtml(h.text);
      if (mark && body.includes(mark)) body = body.replaceAll(mark, `<mark>${mark}</mark>`);
      return `<button class="result" data-book="${h.book}" data-chapter="${h.chapter}" data-verse="${h.verse}">
          <strong>${h.name} ${h.chapter}:${h.verse}</strong>
          <div>${body}</div>
        </button>`;
    })
    .join("");
  box.innerHTML = `<p class="status">${status}</p>${list}`;
}

function orderBooks(books) {
  const current = bookByNr(state.book);
  const rest = books.filter((b) => b.nr !== state.book);
  const cached = rest.filter((b) => state.booksData.has(b.nr));
  const pending = rest.filter((b) => !state.booksData.has(b.nr));
  return [...(current && books.some((b) => b.nr === current.nr) ? [current] : []), ...cached, ...pending];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function searchBookList(id, books, q, qNorm, hits, box, scope, failed, total) {
  const cached = books.filter((b) => state.booksData.has(b.nr));
  const pending = books.filter((b) => !state.booksData.has(b.nr));
  let done = 0;

  const scanOne = async (book) => {
    if (id !== state.searchId) return;
    try {
      const chapters = await loadBook(book.nr);
      if (id !== state.searchId) return;
      if (hits.length < 80) hits.push(...scanBook(book, chapters, qNorm));
    } catch {
      failed.push(book);
    }
    done += 1;
    if (id !== state.searchId) return;
    if (done === total || done % 6 === 0 || hits.length >= 80) {
      paintSearch(
        box,
        hits,
        q,
        `正在搜索${SCOPE_LABEL[scope]} · ${book.name}（${done}/${total} 卷，已找到 ${Math.min(hits.length, 80)} 条）…`
      );
    }
  };

  for (const book of cached) {
    await scanOne(book);
    if (id !== state.searchId) return;
  }

  let cursor = 0;
  async function worker() {
    while (cursor < pending.length) {
      if (id !== state.searchId) return;
      const book = pending[cursor++];
      if (!book) return;
      await scanOne(book);
      await sleep(60);
    }
  }
  await Promise.all(Array.from({ length: Math.min(2, pending.length) }, worker));
}

async function runSearch() {
  state.composing = false;
  const q = $("search-input").value.trim();
  const box = $("search-results");
  const id = ++state.searchId;
  try {
    await ensureLocalBible();
  } catch {
    /* keep API fallback */
  }
  const ref = parseReference(q);
  if (ref) {
    box.innerHTML = `<p class="status">正在打开 ${ref.name} ${ref.chapter}${ref.verse ? `:${ref.verse}` : ""}…</p>`;
    try {
      const verses = await loadChapterVerses(ref.book, ref.chapter);
      if (id !== state.searchId) return;
      const picked = ref.verse ? verses.filter((v) => v.n === ref.verse) : verses.slice(0, 3);
      if (!picked.length) throw new Error("没有这一节");
      const hits = picked.map((v) => ({
        book: ref.book,
        name: ref.name,
        chapter: ref.chapter,
        verse: v.n,
        text: v.text,
      }));
      paintSearch(box, hits, q, `已定位到 ${ref.name} ${ref.chapter}${ref.verse ? `:${ref.verse}` : ""}，点击结果打开。`);
      return;
    } catch (err) {
      if (id !== state.searchId) return;
      box.innerHTML = `<p class="error">无法打开该章节。${escapeHtml(err.message)}</p>`;
      return;
    }
  }

  const qNorm = normalizeForSearch(q);
  if (qNorm.length < 1) {
    box.innerHTML = `<p class="status">输入关键词后点搜索，或按回车。章节示例：约3:16</p>`;
    return;
  }
  const scope = searchScope();
  const hits = [];
  const failed = [];
  const books = orderBooks(booksForScope(scope));
  box.innerHTML = `<p class="status">正在搜索${SCOPE_LABEL[scope]}「${escapeHtml(q)}」…</p>`;
  try {
    await searchBookList(id, books, q, qNorm, hits, box, scope, failed, books.length);
    if (failed.length && id === state.searchId && hits.length < 80) {
      const retry = failed.splice(0, failed.length);
      await sleep(300);
      await searchBookList(id, retry, q, qNorm, hits, box, scope, failed, books.length);
    }
    if (id !== state.searchId) return;
    const extra = failed.length ? ` 有 ${failed.length} 卷未能加载，可再点一次搜索。` : "";
    if (!hits.length) {
      const hint =
        scope === "all"
          ? " 试试更短的词，或用「约3:16」这种章节写法。"
          : ` 若词条在${scope === "nt" ? "旧约" : "新约"}，请改选对应范围或「全部」。`;
      box.innerHTML = `<p class="status">在${SCOPE_LABEL[scope]}中没有找到「${escapeHtml(q)}」。${hint}${extra}</p>`;
      return;
    }
    const more = hits.length > 80 ? `（仅显示前 80 条）` : "";
    paintSearch(box, hits, q, `在${SCOPE_LABEL[scope]}中找到 ${Math.min(hits.length, 80)} 条${more}。${extra}`);
  } catch (err) {
    if (id !== state.searchId) return;
    box.innerHTML = `<p class="error">${escapeHtml(err.message)}</p>`;
  }
}

function bind() {
  $("book-nav").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-book]");
    if (btn) showChapter(Number(btn.dataset.book), 1);
  });
  $("book-filter").addEventListener("input", renderBooks);
  $("btn-menu").addEventListener("click", () => setMenu(!$("sidebar").classList.contains("open")));
  $("scrim").addEventListener("click", () => setMenu(false));
  $("btn-prev").addEventListener("click", () => {
    if (state.chapter > 1) showChapter(state.book, state.chapter - 1);
    else if (state.book > 1) {
      const prev = bookByNr(state.book - 1);
      showChapter(prev.nr, prev.chapters);
    }
  });
  $("btn-next").addEventListener("click", () => {
    const info = bookByNr(state.book);
    if (state.chapter < info.chapters) showChapter(state.book, state.chapter + 1);
    else if (state.book < 66) showChapter(state.book + 1, 1);
  });
  $("btn-continue").addEventListener("click", () => {
    const place = loadJson(LS_PLACE, { book: 43, chapter: 1 });
    showChapter(place.book, place.chapter);
  });
  $("btn-john").addEventListener("click", () => showChapter(43, 1));
  $("btn-genesis").addEventListener("click", () => showChapter(1, 1));
  $("btn-home").addEventListener("click", showHome);
  $("btn-home").addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      showHome();
    }
  });
  $("chapter-picks").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-chapter]");
    if (btn) showChapter(state.book, Number(btn.dataset.chapter));
  });
  $("verses").addEventListener("click", (e) => {
    if (e.target.id === "btn-retry") showChapter(state.book, state.chapter);
    const noteBtn = e.target.closest("[data-note-verse]");
    if (noteBtn) openNotes(Number(noteBtn.dataset.noteVerse));
  });
  $("btn-notes").addEventListener("click", () => openNotes());
  $("note-close").addEventListener("click", () => ($("note-panel").hidden = true));
  $("note-panel").addEventListener("click", (e) => {
    if (e.target === $("note-panel")) $("note-panel").hidden = true;
  });
  const openDaily = () => {
    const ref = JSON.parse($("daily-ref").dataset.ref || "[43,1,1]");
    showChapter(ref[0], ref[1], ref[2]);
  };
  $("daily-verse").addEventListener("click", openDaily);
  $("daily-ref").addEventListener("click", openDaily);
  $("font-up").addEventListener("click", () => {
    const size = Math.min(1.8, Number(localStorage.getItem(LS_FONT) || 1.22) + 0.08);
    localStorage.setItem(LS_FONT, String(size));
    applyFont();
  });
  $("font-down").addEventListener("click", () => {
    const size = Math.max(0.95, Number(localStorage.getItem(LS_FONT) || 1.22) - 0.08);
    localStorage.setItem(LS_FONT, String(size));
    applyFont();
  });
  $("btn-theme").addEventListener("click", () => {
    const next = (localStorage.getItem(LS_THEME) || "day") === "day" ? "night" : "day";
    localStorage.setItem(LS_THEME, next);
    applyTheme();
  });
  $("verses").addEventListener("click", (e) => {
    const num = e.target.closest(".verse-num");
    if (!num) return;
    const verseEl = num.closest(".verse");
    const n = Number(verseEl.dataset.verse);
    toggleBookmark(state.book, state.chapter, n, verseTextAt(verseEl));
    verseEl.classList.toggle("bookmarked");
  });
  $("btn-bookmark-chapter").addEventListener("click", () => {
    const first = document.querySelector(".verse");
    const text = first ? verseTextAt(first) : $("chapter-title").textContent;
    toggleBookmark(state.book, state.chapter, 1, text);
    if (first) first.classList.toggle("bookmarked");
  });
  $("btn-search").addEventListener("click", () => {
    $("search-panel").hidden = false;
    state.composing = false;
    $("search-input").focus();
  });
  $("search-close").addEventListener("click", () => ($("search-panel").hidden = true));
  $("btn-run-search").addEventListener("click", () => {
    state.composing = false;
    clearTimeout(state.searchTimer);
    runSearch();
  });
  $("search-input").addEventListener("compositionstart", () => {
    state.composing = true;
  });
  $("search-input").addEventListener("compositionend", (e) => {
    state.composing = false;
    if (e.target.value.trim()) {
      clearTimeout(state.searchTimer);
      state.searchTimer = setTimeout(runSearch, 80);
    }
  });
  $("search-input").addEventListener("input", (e) => {
    if (e.isComposing) return;
    state.composing = false;
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(runSearch, 280);
  });
  $("search-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      state.composing = false;
      clearTimeout(state.searchTimer);
      runSearch();
    }
  });
  $("search-scope").addEventListener("change", () => {
    state.composing = false;
    clearTimeout(state.searchTimer);
    runSearch();
  });
  $("search-results").addEventListener("click", (e) => {
    const item = e.target.closest("[data-book]");
    if (!item) return;
    $("search-panel").hidden = true;
    showChapter(Number(item.dataset.book), Number(item.dataset.chapter), Number(item.dataset.verse));
  });
  $("btn-bookmarks").addEventListener("click", () => {
    renderBookmarkList();
    $("bookmark-panel").hidden = false;
  });
  $("bookmark-close").addEventListener("click", () => ($("bookmark-panel").hidden = true));
  $("bookmark-list").addEventListener("click", (e) => {
    const remove = e.target.closest("[data-remove]");
    if (remove) {
      saveJson(
        LS_MARKS,
        bookmarks().filter((m) => m.key !== remove.dataset.remove)
      );
      renderBookmarkList();
      return;
    }
    const item = e.target.closest("[data-key]");
    if (!item) return;
    const [book, chapter, verse] = item.dataset.key.split(":").map(Number);
    $("bookmark-panel").hidden = true;
    showChapter(book, chapter, verse);
  });
  $("search-panel").addEventListener("click", (e) => {
    if (e.target === $("search-panel")) $("search-panel").hidden = true;
  });
  $("bookmark-panel").addEventListener("click", (e) => {
    if (e.target === $("bookmark-panel")) $("bookmark-panel").hidden = true;
  });
  window.addEventListener("hashchange", () => {
    const loc = parseHash();
    if (loc) showChapter(loc.book, loc.chapter, loc.verse, true);
    else showHome();
  });
  document.addEventListener("keydown", (e) => {
    if (
      $("search-panel").hidden === false ||
      $("bookmark-panel").hidden === false ||
      $("note-panel").hidden === false
    ) {
      if (e.key === "Escape") {
        $("search-panel").hidden = true;
        $("bookmark-panel").hidden = true;
        $("note-panel").hidden = true;
      }
      return;
    }
    if (e.key === "ArrowLeft") $("btn-prev").click();
    if (e.key === "ArrowRight") $("btn-next").click();
  });
}

function registerPwa() {
  if (window.Capacitor?.isNativePlatform?.()) return;
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
  const bar = $("install-bar");
  const btn = $("btn-install");
  const text = $("install-text");
  if (!bar) return;
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
  if (standalone || localStorage.getItem("shengjing.hideInstall")) {
    bar.hidden = true;
    return;
  }
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const android = /android/i.test(navigator.userAgent);
  let deferred;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e;
    text.textContent = "安装到主屏幕后，可像 App 一样全屏打开。";
    btn.hidden = false;
    bar.hidden = false;
  });
  if (ios) {
    text.textContent = "苹果手机：用 Safari 打开，点底部分享 → 添加到主屏幕。";
    btn.hidden = true;
    bar.hidden = false;
  } else if (android) {
    text.textContent = "安卓：用 Chrome 打开，点菜单「安装应用」或「添加到主屏幕」。也可安装 APK。";
    btn.hidden = true;
    bar.hidden = false;
  }
  btn.addEventListener("click", async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice.catch(() => {});
    deferred = null;
    bar.hidden = true;
  });
  $("install-close").addEventListener("click", () => {
    bar.hidden = true;
    localStorage.setItem("shengjing.hideInstall", "1");
  });
}

applyTheme();
applyFont();
bind();
registerPwa();
renderBooks();
renderDaily();
ensureLocalBible().catch(() => {});
const start = parseHash();
if (start) showChapter(start.book, start.chapter, start.verse, true);
