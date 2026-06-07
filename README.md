# SMARRTIF AI — CV Analyzer

![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=flat&logo=python&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES2022-F7DF1E?style=flat&logo=javascript&logoColor=black)
![Flask](https://img.shields.io/badge/Flask-3.0-000000?style=flat&logo=flask&logoColor=white)
![spaCy](https://img.shields.io/badge/spaCy-3.7-09A3D5?style=flat&logo=spacy&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-Deployed-000000?style=flat&logo=vercel&logoColor=white)

An AI-powered CV analysis tool that parses resumes, benchmarks them against
industry-standard role profiles across 6 weighted dimensions, and surfaces
personalised learning recommendations mapped to SMARRTIF AI's course catalogue.

<!-- Add demo GIF here -->

---

## Quick Start

```bash
# 1. Serve the static frontend (no build step needed)
python -m http.server 8080
# Open http://localhost:8080

# 2. (Optional) Start the Python NLP backend
cd python
python run.py
# API available at http://localhost:5000

# 3. Deploy to Vercel
npx vercel deploy
```

---

## Features

- ✅ **Browser-first** — works entirely in the browser, no backend required
- ✅ **PDF & DOCX support** — PDF.js (browser) + PyMuPDF / python-docx (Python)
- ✅ **6-dimension weighted scoring** — Skills, Experience, Education, Projects, Certifications, Completeness
- ✅ **NLP skill detection** — 85+ skills via spaCy PhraseMatcher + NLTK stemming
- ✅ **TF-IDF role relevance** — sklearn cosine similarity secondary scoring signal
- ✅ **ATS compatibility simulation** — 5-category ATS scoring with actionable tips
- ✅ **Live GitHub integration** — REST API v3 portfolio analysis + skill inference
- ✅ **32 skill-gap recommendations** — priority-ranked, mapped to SMARRTIF AI services
- ✅ **Radar chart dashboard** — Chart.js spider chart + SVG progress rings
- ✅ **Mock integrations** — LinkedIn, Tableau, Power BI architecture with OAuth docs
- ✅ **Print to PDF** — dashboard print styles for offline reports
- ✅ **GDPR compliant** — no CV data stored server-side; raw text stripped from sessionStorage

---

## Screenshot

<!-- Add screenshot here -->

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   FRONTEND LAYER                     │
│         index.html  ←→  dashboard.html              │
│    CVParser.js | CVScorer.js | RecommendationEngine  │
└──────────────────┬──────────────────────────────────┘
                   │ sessionStorage / URL params
┌──────────────────▼──────────────────────────────────┐
│                  AI/NLP ENGINE (Python)              │
│     nlp_engine.py | scorer.py | cv_analyzer.py       │
│         spaCy | NLTK | scikit-learn | PyMuPDF        │
└──────────────────┬──────────────────────────────────┘
                   │ REST API (Flask)
┌──────────────────▼──────────────────────────────────┐
│              INTEGRATIONS LAYER                      │
│   GitHub API (Live) | LinkedIn/Tableau/PowerBI(Mock) │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│                DATA LAYER                            │
│      role_profiles.json | recommendations.json       │
│          MongoDB (planned) | SQLite (local)          │
└─────────────────────────────────────────────────────┘
```

**Page flow:** `index.html` runs the complete analysis pipeline and writes
`analysis_results` to `sessionStorage`.  `dashboard.html` reads and renders —
it never re-runs the pipeline.

---

## File Structure

```
cv-analyzer/
├── index.html              # Upload page + pipeline trigger
├── dashboard.html          # Results page (render only)
├── vercel.json             # Static hosting + security headers
├── CLAUDE.md               # Codebase guide for Claude Code
│
├── css/
│   └── style.css           # Design tokens + shared component styles
│
├── js/
│   ├── parser.js           # CVParser — PDF.js text extraction + skill detection
│   ├── scorer.js           # CVScorer — 6-dimension weighted scoring
│   ├── recommender.js      # RecommendationEngine — gap → recommendation mapping
│   ├── github.js           # GitHubAnalyzer — REST API + skill inference
│   └── app.js              # CVAnalyzerApp — pipeline orchestrator
│
├── data/
│   ├── role_profiles.json  # 4 role benchmarks (skills, weights, certifications)
│   └── recommendations.json # 32 skill-gap entries with SMARRTIF AI service mappings
│
├── python/
│   ├── cv_analyzer.py      # Flask REST API (5 endpoints)
│   ├── nlp_engine.py       # CVNLPEngine — spaCy + NLTK + TF-IDF
│   ├── scorer.py           # CVScorer Python — ATS simulation + percentile
│   ├── mock_integrations.py # LinkedIn/Tableau/PowerBI mocks + live GitHub helper
│   ├── run.py              # Pre-flight checks + server startup script
│   └── requirements.txt
│
└── docs/
    ├── architecture.md          # Technical architecture + scoring methodology
    ├── api_integration_plan.md  # OAuth flows, DB schema, scaling roadmap
    ├── video_script.md          # Demo recording script (8–10 min)
    └── project_report.md        # Formal internship project report
```

---

## Scoring Model

Each CV is scored across 6 dimensions with role-specific weights:

| Dimension | Data Scientist | Data Analyst | Software Engineer | Business Analyst |
|-----------|:---:|:---:|:---:|:---:|
| Skills | 35% | 30% | 35% | 30% |
| Experience | 25% | 25% | 25% | 25% |
| Education | 15% | 15% | 10% | 15% |
| Projects | 15% | 15% | 20% | 15% |
| Certifications | 5% | 10% | 5% | 10% |
| Completeness | 5% | 5% | 5% | 5% |

**Score bands:** Excellent (85–100) · Good (70–84) · Fair (55–69) · Developing (40–54) · Needs Work (0–39)

---

## Python NLP API

The optional Python backend exposes 5 REST endpoints on `http://localhost:5000`:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Liveness check — `{status, nlp_ready}` |
| `GET` | `/api/roles` | Available role profiles + scoring weights |
| `POST` | `/api/parse` | Extract + parse CV (multipart: `cv_file`) |
| `POST` | `/api/analyze` | Full pipeline (multipart: `cv_file`, `target_role`, `github_url?`) |
| `POST` | `/api/github` | GitHub profile analysis (JSON: `{github_url}`) |

### Install Python dependencies

```bash
cd python
pip install -r requirements.txt
python -m spacy download en_core_web_sm
python run.py
```

### Optional: Increase GitHub API rate limit (60 → 5,000 req/hr)

```bash
# Set a GitHub Personal Access Token (only needs public_repo read scope)
export GITHUB_TOKEN=ghp_your_token_here
python run.py
```

---

## Supported Roles

| Role | Key Skills |
|------|-----------|
| **Data Scientist** | Python, Machine Learning, Deep Learning, LLMs, MLOps, spaCy, Vector Databases |
| **Data Analyst** | SQL, Power BI, Tableau, dbt, Snowflake, ETL, A/B Testing |
| **Software Engineer** | Kubernetes, Docker, CI/CD, Microservices, TypeScript, System Design |
| **Business Analyst** | Requirements Gathering, JIRA, Stakeholder Management, BPMN, Gap Analysis |

---

## Adding a New Role

1. Add a new entry to `data/role_profiles.json` following the existing schema
2. Add a matching `<option>` to the `#roleSelect` dropdown in both `index.html` and `dashboard.html`
3. Add relevant entries to `data/recommendations.json` for the new role's skill gaps
4. No code changes required in any JS or Python module

---

## Privacy & Ethics

- **No data leaves the browser** in JavaScript-only mode
- **CV raw text is stripped** before sessionStorage: `parsedCV: { ...parsed, raw_text: "" }`
- **Scoring uses only skill/experience signals** — no name, age, gender, or institution prestige
- **All weights are published** and visible on the dashboard — fully transparent
- **No automated hiring decisions** — the tool is an advisory self-assessment instrument

See `docs/architecture.md` for the full Ethical AI & Bias Prevention section.

---

## Deploy to Vercel

```bash
# One-command deploy
npx vercel deploy

# Or via GitHub integration:
# 1. Push to GitHub
# 2. Import at vercel.com/new
# 3. No build settings needed — Vercel auto-detects static output
```

The Python backend can be deployed to [Railway](https://railway.app),
[Render](https://render.com), or any VPS running Python 3.11+.

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Follow the conventions in `CLAUDE.md`
4. Open a pull request against `main`

Data file updates (`role_profiles.json`, `recommendations.json`) are especially
welcome as the job market evolves — no code changes required.

---

## License

© 2025 SMARRTIF AI. All rights reserved.

*Built as an internship project by Hardik Sharma, AI Tool Developer Intern.*
