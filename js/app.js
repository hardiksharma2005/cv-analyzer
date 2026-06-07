/**
 * js/app.js — Main Application Controller
 * SMARRTIF AI CV Analyzer (index.html)
 *
 * Orchestrates the full analysis pipeline on index.html:
 *   File upload → CV parsing → Scoring → Recommendations
 *   → Optional GitHub analysis → sessionStorage → dashboard.html
 *
 * Initialised by index.html calling CVAnalyzerApp.init() on DOMContentLoaded.
 */

const CVAnalyzerApp = {

  /* ─── Private state ─── */
  _file:      null,   // selected File object
  _role:      null,   // selected role string
  _isRunning: false,  // prevents double-clicks on Analyze

  /* ═══════════════════════════════════════════════════════════
     init() — wires up all event listeners and restores state.
     Called once by index.html on DOMContentLoaded.
  ═══════════════════════════════════════════════════════════ */
  init() {
    /* Configure PDF.js worker to match the CDN version */
    if (typeof pdfjsLib !== 'undefined') {
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    this._setHeaderDate();
    this.handleDragDrop();
    this._bindFileInput();
    this._bindRoleSelect();
    this._bindGitHubInput();
    this._bindAnalyzeButton();
    this._bindSidebarNav();
    this._checkPreviousSession();
  },

  /* ─── Header date ─── */
  _setHeaderDate() {
    const el = document.getElementById('headerDate');
    if (el) el.textContent = '📅 ' + new Date().toLocaleDateString('en-GB',
      { month: 'short', year: 'numeric' });
  },

  /* ─── Session restore: show banner if prior results exist ─── */
  _checkPreviousSession() {
    const stored = sessionStorage.getItem('analysis_results');
    const banner = document.getElementById('lastReportBanner');
    if (stored && banner) banner.style.display = 'flex';
  },

  /* ═══════════════════════════════════════════════════════════
     handleFileUpload(file)
     Validates the selected file (type + size), then:
       - Stores the File object in this._file
       - Shows filename + size preview
       - Marks the dropzone as "has-file"
     Returns true on success, false on validation failure.
  ═══════════════════════════════════════════════════════════ */
  handleFileUpload(file) {
    const MAX_MB     = 5;
    const VALID_EXTS = /\.(pdf|doc|docx)$/i;
    const VALID_MIME = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];

    if (!VALID_MIME.includes(file.type) && !VALID_EXTS.test(file.name)) {
      this._toast('Only PDF, DOC, or DOCX files are supported.', 'error');
      return false;
    }

    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > MAX_MB) {
      this._toast(`File is ${sizeMB.toFixed(1)} MB — maximum allowed is ${MAX_MB} MB.`, 'error');
      return false;
    }

    this._file = file;

    /* Show filename + size in the file-info strip */
    const nameEl = document.getElementById('fileNameText');
    const infoEl = document.getElementById('fileInfo');
    if (nameEl) nameEl.textContent = `${file.name}  (${sizeMB.toFixed(2)} MB)`;
    if (infoEl) infoEl.style.display = 'flex';

    document.getElementById('dropzone')?.classList.add('has-file');
    return true;
  },

  /* ═══════════════════════════════════════════════════════════
     handleDragDrop()
     Full drag-and-drop implementation:
       dragenter / dragover → highlight dropzone
       dragleave / dragend  → remove highlight
       drop                 → extract file, call handleFileUpload
  ═══════════════════════════════════════════════════════════ */
  handleDragDrop() {
    const zone = document.getElementById('dropzone');
    if (!zone) return;

    /* Click anywhere on the zone opens file picker */
    zone.addEventListener('click', () => document.getElementById('fileInput')?.click());

    ['dragenter', 'dragover'].forEach(evt => {
      zone.addEventListener(evt, e => {
        e.preventDefault();
        e.stopPropagation();
        zone.classList.add('drag-over');
      });
    });

    ['dragleave', 'dragend'].forEach(evt => {
      zone.addEventListener(evt, e => {
        /* Only clear when the pointer truly exits the zone,
           not when it moves between child elements. */
        if (!zone.contains(e.relatedTarget)) zone.classList.remove('drag-over');
      });
    });

    zone.addEventListener('drop', e => {
      e.preventDefault();
      e.stopPropagation();
      zone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file) this.handleFileUpload(file);
    });
  },

  /* ─── File <input> binding ─── */
  _bindFileInput() {
    const input = document.getElementById('fileInput');
    input?.addEventListener('change', () => {
      if (input.files[0]) this.handleFileUpload(input.files[0]);
    });

    document.getElementById('removeBtn')?.addEventListener('click', e => {
      e.stopPropagation();
      this._file = null;
      const input = document.getElementById('fileInput');
      if (input) input.value = '';
      const info = document.getElementById('fileInfo');
      if (info) info.style.display = 'none';
      document.getElementById('dropzone')?.classList.remove('has-file');
    });
  },

  /* ─── Role select binding ─── */
  _bindRoleSelect() {
    const sel = document.getElementById('roleSelect');
    sel?.addEventListener('change', () => { this._role = sel.value; });
  },

  /* ─── GitHub URL input binding ─── */
  _bindGitHubInput() {
    document.getElementById('githubInput')?.addEventListener('input', function () {
      /* No validation yet — we validate at submit time */
    });
  },

  /* ─── Analyze button binding ─── */
  _bindAnalyzeButton() {
    document.getElementById('analyzeBtn')?.addEventListener('click', () => this.runAnalysis());
  },

  /* ─── Sidebar nav highlight ─── */
  _bindSidebarNav() {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', function (e) {
        if (this.getAttribute('href') === '#') e.preventDefault();
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        this.classList.add('active');
      });
    });
  },

  /* ═══════════════════════════════════════════════════════════
     validateInputs()
     Returns true only when a file is selected AND a role chosen.
     Called internally before starting the analysis pipeline.
  ═══════════════════════════════════════════════════════════ */
  validateInputs() {
    return !!(this._file && document.getElementById('roleSelect')?.value);
  },

  /* ═══════════════════════════════════════════════════════════
     updateLoadingStep(stepIndex, message)
     Updates the loading overlay to show the current pipeline step.
     Steps are 0-indexed (0 = first step, 3 = last step).
     Progress percentages: [18, 44, 70, 94].
  ═══════════════════════════════════════════════════════════ */
  updateLoadingStep(stepIndex, message) {
    const steps = document.querySelectorAll('.load-step');
    const bar   = document.getElementById('loadBarFill');
    const pct   = document.getElementById('loadPct');
    const PCTS  = [18, 44, 70, 94];

    steps.forEach((step, i) => {
      step.classList.remove('active', 'done');
      if (i < stepIndex) step.classList.add('done');
      if (i === stepIndex) {
        step.classList.add('active');
        if (message) {
          const label = step.querySelector('span:last-child');
          if (label) label.textContent = message;
        }
      }
    });

    if (bar && PCTS[stepIndex] !== undefined) {
      bar.style.width = PCTS[stepIndex] + '%';
      if (pct) pct.textContent = PCTS[stepIndex] + '%';
    }
  },

  /* ═══════════════════════════════════════════════════════════
     runAnalysis() — Main analysis pipeline
     Steps:
       0. Show overlay + parse CV text with CVParser
       1. Score with CVScorer
       2. Generate recommendations with RecommendationEngine
       3. Optionally run GitHubAnalyzer if URL provided
       4. Merge GitHub skills, store analysis_results, redirect
  ═══════════════════════════════════════════════════════════ */
  async runAnalysis() {
    if (this._isRunning) return;

    /* Input validation */
    if (!this._file) {
      this._toast('Please upload your CV first.', 'error');
      return;
    }
    const role = document.getElementById('roleSelect')?.value;
    if (!role) {
      this._toast('Please select a target role.', 'error');
      return;
    }

    this._isRunning = true;
    this._role = role;

    /* Clear any previous results */
    sessionStorage.removeItem('analysis_results');

    /* Show loading overlay */
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.style.display = 'flex';

    try {
      /* ── Step 0: Parse CV ── */
      this.updateLoadingStep(0, '📄 Extracting CV text…');
      const parser   = new CVParser();
      const parsedCV = await parser.parseFile(this._file);
      if (parsedCV.error) throw new Error(parsedCV.error);

      /* ── Step 1: Score ── */
      this.updateLoadingStep(1, '🧠 Running NLP analysis…');
      await this._delay(350);
      const scorer = new CVScorer();
      const scores = await scorer.score(parsedCV, role);

      /* ── Step 2: Recommend ── */
      this.updateLoadingStep(2, '📊 Calculating scores…');
      await this._delay(350);
      const engine = new RecommendationEngine();
      const recs   = await engine.generate(scores, role);

      /* ── Step 3: GitHub (optional) ── */
      this.updateLoadingStep(3, '💡 Generating recommendations…');
      let githubData = null;
      const githubURL = (document.getElementById('githubInput')?.value || '').trim();

      if (githubURL) {
        try {
          const gh = new GitHubAnalyzer();
          githubData = await gh.analyzeFromURL(githubURL);

          /* Merge GitHub-detected skills into parsedCV.skills.detected */
          if (githubData.detected_skills?.length) {
            const existing = new Set(parsedCV.skills.detected.map(s => s.toLowerCase()));
            githubData.detected_skills.forEach(skill => {
              if (!existing.has(skill.toLowerCase())) {
                parsedCV.skills.detected.push(skill);
                existing.add(skill.toLowerCase());
              }
            });
          }
        } catch (ghErr) {
          /* GitHub errors are non-fatal — log and continue without it */
          console.warn('[App] GitHub analysis skipped:', ghErr.message);
          this._toast(`GitHub: ${ghErr.message}`, 'info');
        }
      }

      await this._delay(350);

      /* ── Complete: build the results object ── */
      const analysisResults = {
        filename:        this._file.name,
        role,
        parsedCV:        { ...parsedCV, raw_text: '' }, // strip raw text to save storage
        scores,
        recommendations: recs,
        github:          githubData,
        timestamp:       Date.now(),
        isDemo:          false,
      };

      /* Persist to sessionStorage (best-effort, large CVs may fail) */
      try {
        sessionStorage.setItem('analysis_results', JSON.stringify(analysisResults));
      } catch (_) {
        /* If sessionStorage is full, try without certifications/projects detail */
        try {
          const slim = { ...analysisResults };
          sessionStorage.setItem('analysis_results', JSON.stringify(slim));
        } catch (__) {
          console.warn('[App] Could not persist to sessionStorage — dashboard will use demo data.');
        }
      }

      /* Complete the progress bar */
      const bar = document.getElementById('loadBarFill');
      const pct = document.getElementById('loadPct');
      if (bar) bar.style.width = '100%';
      if (pct) pct.textContent = '100%';

      /* Mark final step done */
      document.querySelectorAll('.load-step').forEach(s => {
        s.classList.remove('active');
        s.classList.add('done');
      });

      await this._delay(420);

      /* Redirect to dashboard */
      const params = new URLSearchParams({ role, filename: this._file.name });
      window.location.href = 'dashboard.html?' + params.toString();

    } catch (err) {
      console.error('[App] Analysis pipeline error:', err);
      if (overlay) overlay.style.display = 'none';
      this._isRunning = false;
      this._toast(`Analysis failed: ${err.message}`, 'error');
    }
  },

  /* ─── Helpers ─── */

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  _toast(msg, type = 'info') {
    document.querySelector('.toast')?.remove();
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = (type === 'error' ? '⚠️  ' : 'ℹ️  ') + msg;
    document.body.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('toast-show')));
    setTimeout(() => {
      el.classList.remove('toast-show');
      setTimeout(() => el.remove(), 400);
    }, 3800);
  },
};

/* ─── Global export ─── */
window.CVAnalyzerApp = CVAnalyzerApp;
