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
