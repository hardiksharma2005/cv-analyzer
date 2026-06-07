# SMARRTIF AI — CV Analyzer

![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=flat&logo=python&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES2022-F7DF1E?style=flat&logo=javascript&logoColor=black)
![Flask](https://img.shields.io/badge/Flask-3.0-000000?style=flat&logo=flask&logoColor=white)
![spaCy](https://img.shields.io/badge/spaCy-3.7-09A3D5?style=flat&logo=spacy&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-Deployed-000000?style=flat&logo=vercel&logoColor=white)

An AI-powered CV analysis tool that parses resumes, benchmarks them against
industry-standard role profiles across 6 weighted dimensions, and surfaces
personalised learning recommendations mapped to SMARRTIF AI's course catalogue.

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

## Supported Roles

| Role | Key Skills |
|------|-----------|
| **Data Scientist** | Python, Machine Learning, Deep Learning, LLMs, MLOps, spaCy, Vector Databases |
| **Data Analyst** | SQL, Power BI, Tableau, dbt, Snowflake, ETL, A/B Testing |
| **Software Engineer** | Kubernetes, Docker, CI/CD, Microservices, TypeScript, System Design |
| **Business Analyst** | Requirements Gathering, JIRA, Stakeholder Management, BPMN, Gap Analysis |

---
<<<<<<< HEAD

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
=======
>>>>>>> 04ffb403de3d12a5d83beeff0480e059415f6891
