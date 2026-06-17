/* ============================================================
   AKB PORTAL — APP LOGIC
   ------------------------------------------------------------
   1) TEMPELKAN URL WEB APP GOOGLE APPS SCRIPT KAMU DI BAWAH INI.
      Cara mendapatkannya ada di langkah-langkah (Word/PDF).
============================================================ */
const CONFIG = {
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbyZRuhjf7ajr3DgTmdKXRQrwvC0jtdWlrBAMlms5s10A1j9y9cVdF0hcAvalY21hEsW/exec'
};

/* ---------------- STATE ---------------- */
const state = {
  nama: null,
  materi: [],        // [{kategori, subtopik, penjelasan}]
  soal: [],          // [{id, kategori, pertanyaan, a, b, c, d}]
  kategoriList: [],  // urutan kategori dari sheet Materi
  quiz: null         // {kategori, questions, index, answers}
};

/* ---------------- HELPERS ---------------- */
const qs = (id) => document.getElementById(id);
const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function isConfigured() {
  return !!CONFIG.APPS_SCRIPT_URL && CONFIG.APPS_SCRIPT_URL.indexOf('TEMPEL_URL') === -1;
}

function toast(message, type = '') {
  let box = qs('toastContainer');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toastContainer';
    box.className = 'toast-container';
    document.body.appendChild(box);
  }
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' is-' + type : '');
  el.textContent = message;
  box.appendChild(el);
  setTimeout(() => el.remove(), 3800);
}

function showConfigBanner() {
  if (qs('configBanner')) return;
  const main = document.querySelector('.main');
  const banner = document.createElement('div');
  banner.id = 'configBanner';
  banner.className = 'config-banner';
  banner.innerHTML =
    '⚠️ Website ini belum terhubung ke Google Sheets.<br>' +
    'Buka file <code>script.js</code>, lalu isi <code>CONFIG.APPS_SCRIPT_URL</code> ' +
    'dengan URL Web App Apps Script kamu (lihat langkah-langkah), kemudian muat ulang halaman ini.';
  main.prepend(banner);
}

function setLoading(isLoading) {
  qs('loadingOverlay').hidden = !isLoading;
}

/* ---------------- API ---------------- */
async function apiGet(params) {
  if (!isConfigured()) {
    showConfigBanner();
    return Promise.reject(new Error('Belum terhubung ke Apps Script'));
  }
  const url = new URL(CONFIG.APPS_SCRIPT_URL);
  Object.keys(params).forEach((k) => {
    if (params[k] !== undefined && params[k] !== null) url.searchParams.set(k, params[k]);
  });

  setLoading(true);
  try {
    const res = await fetch(url.toString());
    const data = await res.json();
    if (data && data.error) throw new Error(data.error);
    return data;
  } finally {
    setLoading(false);
  }
}

/* ---------------- THEME ---------------- */
function initTheme() {
  const saved = localStorage.getItem('akb_theme') || 'light';
  applyTheme(saved);
  qs('themeToggle').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    applyTheme(current === 'dark' ? 'light' : 'dark');
  });
}
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('akb_theme', theme);
  qs('themeIcon').textContent = theme === 'dark' ? '☀' : '☾';
  qs('themeLabel').textContent = theme === 'dark' ? 'Mode Terang' : 'Mode Gelap';
}

/* ---------------- NAMA / USER ---------------- */
function updateUserUI() {
  qs('userName').textContent = state.nama || 'Tamu';
  qs('userAvatar').textContent = state.nama ? state.nama.trim().charAt(0).toUpperCase() : '?';
  qs('dashGreetName').textContent = state.nama || '';
}

function openNameModal() {
  qs('nameInput').value = state.nama || '';
  qs('nameModalOverlay').hidden = false;
  qs('nameInput').focus();
}
function closeNameModal() {
  qs('nameModalOverlay').hidden = true;
}

function bindNameModal() {
  qs('nameSubmitBtn').addEventListener('click', submitNameModal);
  qs('nameInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitNameModal();
  });
  qs('userEdit').addEventListener('click', openNameModal);
}

function submitNameModal() {
  const val = qs('nameInput').value.trim();
  if (!val) {
    toast('Nama tidak boleh kosong', 'error');
    return;
  }
  state.nama = val;
  localStorage.setItem('akb_nama', val);
  updateUserUI();
  closeNameModal();
  loadDashboardProgress();
}

/* ---------------- NAVIGASI ---------------- */
function showPage(name) {
  qsa('.page').forEach((p) => p.classList.toggle('is-active', p.id === 'page-' + name));
  qsa('.nav-item[data-page]').forEach((n) => n.classList.toggle('is-active', n.dataset.page === name));
  qs('sidebar').classList.remove('is-open');

  if (name === 'dashboard') refreshDashboardStats();
  if (name === 'kuis') renderCategoryGrid();
  if (name === 'materi') renderMateriPage();
  if (name === 'leaderboard') loadLeaderboardPage();
  if (name === 'nilai') loadNilaiPage();
}

function bindNavigation() {
  qsa('.nav-item[data-page]').forEach((btn) => {
    btn.addEventListener('click', () => showPage(btn.dataset.page));
  });
  document.addEventListener('click', (e) => {
    const target = e.target.closest('[data-goto]');
    if (target) showPage(target.dataset.goto);
  });
  qs('mobileMenuBtn').addEventListener('click', () => {
    qs('sidebar').classList.toggle('is-open');
  });
}

/* ---------------- BOOTSTRAP DATA ---------------- */
async function bootstrapData() {
  const tasks = [apiGet({ action: 'getMateri' }), apiGet({ action: 'getSoal' }), apiGet({ action: 'getLeaderboard' })];
  const [materiRes, soalRes, leaderboardRes] = await Promise.allSettled(tasks);

  if (materiRes.status === 'fulfilled') {
    state.materi = materiRes.value;
    state.kategoriList = [...new Set(state.materi.map((m) => m.kategori))];
  } else {
    toast('Gagal memuat materi: periksa sheet "Materi"', 'error');
  }

  if (soalRes.status === 'fulfilled') {
    state.soal = soalRes.value;
    qs('badgeSoal').textContent = state.soal.length;
    qs('statSoal').textContent = state.soal.length;
  } else {
    toast('Gagal memuat soal: periksa sheet "Soal"', 'error');
  }

  if (leaderboardRes.status === 'fulfilled') {
    const namaUnik = new Set(leaderboardRes.value.map((r) => String(r.nama || '').toLowerCase()));
    qs('statPeserta').textContent = namaUnik.size;
  }

  loadDashboardProgress();
}

/* ---------------- DASHBOARD: PROGRES ---------------- */
async function refreshDashboardStats() {
  try {
    const rows = await apiGet({ action: 'getLeaderboard' });
    const namaUnik = new Set(rows.map((r) => String(r.nama || '').toLowerCase()));
    qs('statPeserta').textContent = namaUnik.size;
  } catch (err) { /* diam saja kalau gagal */ }
  loadDashboardProgress();
}

async function loadDashboardProgress() {
  if (!state.nama) return;
  try {
    const rows = await apiGet({ action: 'getNilaiSaya', nama: state.nama });
    if (!rows || rows.length === 0) return;
    const persenList = rows.map((r) => Number(r.persentase) || 0);
    const rata = Math.round(persenList.reduce((a, b) => a + b, 0) / persenList.length);
    const terbaik = Math.max(...persenList);

    qs('progressContent').innerHTML = `
      <div class="progress-item"><strong>${rows.length}</strong><span>Kuis diikuti</span></div>
      <div class="progress-item"><strong>${rata}%</strong><span>Rata-rata nilai</span></div>
      <div class="progress-item"><strong>${terbaik}%</strong><span>Skor terbaik</span></div>
    `;
    qs('progressCard').hidden = false;
  } catch (err) { /* diam saja kalau gagal, tidak krusial */ }
}

/* ---------------- KUIS: KATEGORI ---------------- */
const KATEGORI_ICON = { Internet: '◎', 'HTML dan CSS': '▥', PHP: '◇', 'Database MySQL': '▦', 'Perancangan Web Site Statis dan Dinamis': '▢' };

function renderCategoryGrid() {
  const grid = qs('categoryGrid');
  if (!state.materi.length && !state.soal.length) {
    grid.innerHTML = '<p class="muted">Belum ada data. Pastikan Apps Script sudah terhubung.</p>';
    return;
  }

  const kategoriSumber = state.kategoriList.length ? state.kategoriList : [...new Set(state.soal.map((s) => s.kategori))];
  let html = '';

  kategoriSumber.forEach((kat) => {
    const jumlah = state.soal.filter((s) => s.kategori === kat).length;
    const icon = KATEGORI_ICON[kat] || '▣';
    html += `
      <button class="category-card" data-kategori="${escapeHtml(kat)}" ${jumlah === 0 ? 'disabled style="opacity:.5;cursor:not-allowed;"' : ''}>
        <div class="category-icon">${icon}</div>
        <strong>${escapeHtml(kat)}</strong>
        <span>${jumlah} soal</span>
      </button>`;
  });

  if (state.soal.length > 0) {
    html += `
      <button class="category-card" data-kategori="">
        <div class="category-icon">★</div>
        <strong>Semua Kategori</strong>
        <span>${state.soal.length} soal campuran</span>
      </button>`;
  }

  grid.innerHTML = html;
  qsa('.category-card[data-kategori]', grid).forEach((card) => {
    card.addEventListener('click', () => {
      if (card.disabled) return;
      startQuiz(card.dataset.kategori);
    });
  });
}

/* ---------------- KUIS: PLAYER ---------------- */
async function startQuiz(kategori) {
  try {
    const questions = await apiGet({ action: 'getSoal', kategori: kategori || '' });
    if (!questions.length) {
      toast('Belum ada soal untuk kategori ini', 'error');
      return;
    }
    state.quiz = { kategori: kategori || 'Semua Kategori', questions, index: 0, answers: {} };
    qs('kuisCategoryView').hidden = true;
    qs('kuisResultView').hidden = true;
    qs('kuisPlayerView').hidden = false;
    renderQuestion();
  } catch (err) {
    toast('Gagal memuat soal kuis', 'error');
  }
}

function renderQuestion() {
  const { questions, index } = state.quiz;
  const q = questions[index];

  qs('quizProgressLabel').textContent = `Soal ${index + 1}/${questions.length}`;
  qs('quizProgressFill').style.width = `${((index) / questions.length) * 100}%`;
  qs('quizKategoriLabel').textContent = q.kategori;
  qs('quizQuestion').textContent = q.pertanyaan;

  const opts = [['A', q.a], ['B', q.b], ['C', q.c], ['D', q.d]];
  qs('quizOptions').innerHTML = opts.map(([letter, text]) => `
    <button class="quiz-option" data-letter="${letter}">
      <span class="opt-letter">${letter}</span><span>${escapeHtml(text)}</span>
    </button>`).join('');

  qsa('.quiz-option', qs('quizOptions')).forEach((btn) => {
    btn.addEventListener('click', () => selectOption(btn, q.id));
  });

  qs('quizNextBtn').disabled = true;
  qs('quizNextBtn').textContent = index === questions.length - 1 ? 'Lihat Hasil' : 'Selanjutnya';
}

function selectOption(btn, questionId) {
  qsa('.quiz-option', qs('quizOptions')).forEach((b) => b.classList.remove('is-selected'));
  btn.classList.add('is-selected');
  state.quiz.answers[questionId] = btn.dataset.letter;
  qs('quizNextBtn').disabled = false;
}

function bindQuizControls() {
  qs('quizNextBtn').addEventListener('click', () => {
    const quiz = state.quiz;
    if (quiz.index < quiz.questions.length - 1) {
      quiz.index++;
      renderQuestion();
    } else {
      finishQuiz();
    }
  });
  qs('quizCancelBtn').addEventListener('click', () => {
    state.quiz = null;
    qs('kuisPlayerView').hidden = true;
    qs('kuisCategoryView').hidden = false;
  });
  qs('resultRetryBtn').addEventListener('click', () => {
    const lastKategori = state.quiz ? state.quiz.kategori : null;
    startQuiz(lastKategori === 'Semua Kategori' ? '' : lastKategori);
  });
}

async function finishQuiz() {
  const quiz = state.quiz;
  if (!state.nama) { openNameModal(); return; }

  const jawabanStr = Object.entries(quiz.answers).map(([id, letter]) => `${id}:${letter}`).join(',');

  try {
    const hasil = await apiGet({
      action: 'submitKuis',
      nama: state.nama,
      kategori: quiz.kategori,
      jawaban: jawabanStr
    });

    qs('kuisPlayerView').hidden = true;
    qs('kuisResultView').hidden = false;
    qs('resultPersentase').textContent = `${hasil.persentase}%`;
    qs('resultDetail').textContent = `Kamu menjawab benar ${hasil.skor} dari ${hasil.total} soal kategori "${quiz.kategori}". Skor sudah tersimpan ke leaderboard.`;
    toast('Skor berhasil disimpan!', 'success');
  } catch (err) {
    toast('Gagal mengirim skor. Coba lagi.', 'error');
  }
}

/* ---------------- NILAI SAYA ---------------- */
async function loadNilaiPage() {
  if (!state.nama) { openNameModal(); return; }
  try {
    const rows = await apiGet({ action: 'getNilaiSaya', nama: state.nama });
    if (!rows.length) {
      qs('nilaiEmpty').hidden = false;
      qs('nilaiTableWrap').hidden = true;
      return;
    }
    qs('nilaiEmpty').hidden = true;
    qs('nilaiTableWrap').hidden = false;
    qs('nilaiTableBody').innerHTML = rows.map((r) => `
      <tr>
        <td>${formatWaktu(r.waktu)}</td>
        <td>${escapeHtml(r.kategori)}</td>
        <td>${r.skor}/${r.totalSoal}</td>
        <td>${r.persentase}%</td>
      </tr>`).join('');
  } catch (err) {
    toast('Gagal memuat riwayat nilai', 'error');
  }
}

/* ---------------- LEADERBOARD ---------------- */
async function loadLeaderboardPage() {
  try {
    const rows = await apiGet({ action: 'getLeaderboard' });
    if (!rows.length) {
      qs('leaderboardBody').innerHTML = '<tr><td colspan="5" class="muted">Belum ada data leaderboard.</td></tr>';
      return;
    }
    qs('leaderboardBody').innerHTML = rows.map((r, i) => {
      const isMe = state.nama && String(r.nama).toLowerCase() === state.nama.toLowerCase();
      return `
        <tr class="${isMe ? 'is-me' : ''}">
          <td>${i + 1}</td>
          <td>${escapeHtml(r.nama)}</td>
          <td>${escapeHtml(r.kategori)}</td>
          <td>${r.skor}/${r.totalSoal}</td>
          <td>${r.persentase}%</td>
        </tr>`;
    }).join('');
  } catch (err) {
    toast('Gagal memuat leaderboard', 'error');
  }
}

/* ---------------- MATERI ---------------- */
function renderMateriPage() {
  const wrap = qs('materiList');
  if (!state.materi.length) {
    wrap.innerHTML = '<p class="muted">Belum ada materi. Pastikan sheet "Materi" sudah terisi.</p>';
    return;
  }

  const grouped = {};
  state.materi.forEach((m) => {
    if (!grouped[m.kategori]) grouped[m.kategori] = [];
    grouped[m.kategori].push(m);
  });

  let first = true;
  wrap.innerHTML = Object.keys(grouped).map((kat) => {
    const items = grouped[kat];
    const isOpen = first; first = false;
    const body = items.map((it) => `
      <div class="materi-subitem">
        <strong>${escapeHtml(it.subtopik)}</strong>
        ${it.penjelasan ? `<p>${escapeHtml(it.penjelasan)}</p>` : ''}
      </div>`).join('');
    return `
      <div class="materi-group ${isOpen ? 'is-open' : ''}">
        <div class="materi-group-header">
          <h3>${escapeHtml(kat)}</h3>
          <span class="count">${items.length} subtopik</span>
        </div>
        <div class="materi-group-body">${body}</div>
      </div>`;
  }).join('');

  qsa('.materi-group-header', wrap).forEach((header) => {
    header.addEventListener('click', () => header.closest('.materi-group').classList.toggle('is-open'));
  });
}

/* ---------------- UTIL ---------------- */
function formatWaktu(value) {
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value || '');
  return d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

/* ---------------- INIT ---------------- */
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  bindNavigation();
  bindNameModal();
  bindQuizControls();

  const savedNama = localStorage.getItem('akb_nama');
  if (savedNama) {
    state.nama = savedNama;
    updateUserUI();
  } else {
    openNameModal();
  }

  if (!isConfigured()) {
    showConfigBanner();
    qs('badgeSoal').textContent = '0';
    qs('statSoal').textContent = '0';
    qs('statPeserta').textContent = '0';
    return;
  }

  bootstrapData();
});
