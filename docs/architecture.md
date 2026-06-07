# AI Tool – CV Analyzer | SMARRTIF AI Internship Assignment
## Technical Architecture & Design Document

**Submitted by:** AI Tool Developer Intern  
**Company:** SMARRTIF AI  
**Date:** June 2025  
**Version:** 1.0

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Architecture](#2-system-architecture)
3. [Scoring Methodology](#3-scoring-methodology)
4. [NLP Pipeline](#4-nlp-pipeline)
5. [Recommendation Engine Logic](#5-recommendation-engine-logic)
6. [Ethical AI & Bias Prevention](#6-ethical-ai--bias-prevention)
7. [Technology Stack](#7-technology-stack)
8. [Limitations & Future Work](#8-limitations--future-work)
9. [API Reference](#9-api-reference)

---

## 1. Executive Summary

### What the Tool Does

The SMARRTIF AI CV Analyzer is a browser-first, AI-powered tool that parses a
candidate's CV (PDF or DOCX), benchmarks it against industry-standard role
profiles across six weighted dimensions, and surfaces a personalised skills-gap
analysis with targeted learning recommendations mapped to SMARRTIF AI's service
offerings.

### Key Capabilities

| Capability | Implementation |
|------------|---------------|
| PDF & DOCX text extraction | Browser: PDF.js v3.11 / python-docx; Python: PyMuPDF |
| Multi-section CV parsing | Regex section splitting + spaCy NER (Python backend) |
| Skill detection | 85+ skill PhraseMatcher + NLTK stem fallback |
| 6-dimension weighted scoring | Deterministic formula, identical JS and Python implementations |
| TF-IDF role relevance | sklearn TfidfVectorizer cosine similarity (Python only) |
| ATS compatibility simulation | 5-category rule-based scoring with actionable tips |
| GitHub profile analysis | Live GitHub REST API v3 (unauthenticated + token modes) |
| Personalised recommendations | Priority-ranked skill-gap mapping from recommendations.json |
| SMARRTIF AI service tier mapping | Score-threshold tier assignment (4 tiers) |
| Two-page dashboard | Radar chart, SVG progress rings, print-to-PDF report |

### Technology Stack Overview

- **Frontend:** Plain HTML5 + CSS3 + Vanilla JS (no framework, no build step)
- **NLP Backend:** Python 3.11 + Flask + spaCy + NLTK + scikit-learn
- **Deployment:** Vercel (static) + optional Python service (Railway/Render)
- **Data:** JSON role profiles + recommendations (served as static files)

---

## 2. System Architecture

### 2.1 Layered Architecture Diagram

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

### 2.2 Frontend Page Flow

The frontend uses a **producer–consumer pattern** where `index.html` runs the
complete analysis pipeline and `dashboard.html` only renders pre-computed results.
This separation means the dashboard never needs to re-run expensive parsing.

```
index.html
  │
  ├── User uploads CV + selects role + optionally enters GitHub URL
  ├── app.js.runAnalysis() orchestrates:
  │     Step 0 → CVParser.parseFile(file)
  │     Step 1 → CVScorer.score(parsedCV, role)
  │     Step 2 → RecommendationEngine.generate(scores, role)
  │     Step 3 → GitHubAnalyzer.analyzeFromURL(url)  [optional]
  │     Step 4 → sessionStorage.setItem('analysis_results', JSON)
  │
  └── window.location.href = 'dashboard.html?role=...&filename=...'

dashboard.html
  │
  ├── Reads sessionStorage['analysis_results']
  ├── Falls back to DEMO_RESULTS if key is absent or corrupt
  └── Renders: score ring → dimension bars → radar chart →
              skills analysis → recommendations → GitHub card
```

### 2.3 Python Backend Request Flow

```
POST /api/analyze (multipart: cv_file, target_role, github_url?)
  │
  ├── Validate file type (.pdf / .docx) + size (≤ 10 MB)
  ├── Save to NamedTemporaryFile (deleted in finally block)
  │
  ├── CVNLPEngine.extract_text_from_pdf() or extract_text_from_docx()
  │     └── PyMuPDF (PDF) / python-docx (DOCX) → clean text
  │
  ├── CVNLPEngine.parse_cv(text)
  │     ├── spaCy pipeline: tokenise → POS tag → NER → sents
  │     ├── extract_skills_nlp()    PhraseMatcher + NLTK stemming
  │     ├── extract_experience_nlp() DATE entities + year regex
  │     ├── extract_education_nlp()  ORG entities + degree keywords
  │     ├── extract_keywords()       TF-IDF top-20 terms
  │     ├── analyze_writing_quality()
  │     └── _calculate_profile_completeness()
  │
  ├── CVScorer.score_all(parsed, text, role)
  │     ├── score_skills()      → 70% keyword + 30% TF-IDF
  │     ├── score_experience()  → 3-zone linear scale
  │     ├── score_education()   → degree level + field keywords
  │     ├── score_projects()    → step scale + GitHub bonus
  │     ├── score_certifications() → relaxed substring match
  │     ├── calculate_ats_score()
  │     └── generate_score_report()
  │
  ├── _build_recommendations()  → filter gaps, build action plan
  │
  ├── GitHubAPIHelper.analyze_from_url()  [if github_url provided]
  │
  └── JSON response → frontend sessionStorage → dashboard renders
```

### 2.4 File Structure

```
cv-analyzer/
├── index.html              # Landing page — upload + pipeline trigger
├── dashboard.html          # Results page — render only, never re-runs pipeline
├── vercel.json             # Static hosting + security headers
├── CLAUDE.md               # Codebase guide for Claude Code assistant
├── README.md
│
├── css/
│   └── style.css           # Global design tokens + shared component styles
│
├── js/
│   ├── parser.js           # CVParser — PDF.js extraction + section splitting
│   ├── scorer.js           # CVScorer — 6-dimension weighted scoring
│   ├── recommender.js      # RecommendationEngine — gap mapping + service tiers
│   ├── github.js           # GitHubAnalyzer — REST API + skill mapping
│   └── app.js              # CVAnalyzerApp — pipeline orchestrator
│
├── data/
│   ├── role_profiles.json  # 4 role benchmarks (skills, weights, certs)
│   └── recommendations.json # 32 skill-gap → course + SMARRTIF mapping
│
├── python/
│   ├── cv_analyzer.py      # Flask REST API (5 endpoints)
│   ├── nlp_engine.py       # CVNLPEngine — spaCy + NLTK + TF-IDF
│   ├── scorer.py           # CVScorer Python — ML-enhanced scoring
│   ├── mock_integrations.py # LinkedIn/Tableau/PowerBI mocks + GitHub live
│   ├── run.py              # Pre-flight checks + server startup
│   └── requirements.txt
│
└── docs/
    ├── architecture.md          # This file
    ├── api_integration_plan.md  # OAuth flows, DB schema, scaling plan
    ├── video_script.md          # Demo recording script
    └── project_report.md        # Formal internship report
```

---

## 3. Scoring Methodology

### 3.1 The Six Dimensions

Every CV is evaluated across six dimensions.  Each dimension receives a raw score
of 0–100, which is then multiplied by its role-specific weight.  The weighted total
is the final CV score.

```
Final Score = Σ (dimension_score_i × weight_i / 100)
            = skills×W₁ + experience×W₂ + education×W₃
            + projects×W₄ + certifications×W₅ + completeness×W₆
```

#### Dimension Weights by Role

| Dimension | Data Scientist | Data Analyst | Software Engineer | Business Analyst |
|-----------|:---:|:---:|:---:|:---:|
| Skills | **35** | 30 | **35** | 30 |
| Experience | 25 | 25 | 25 | 25 |
| Education | 15 | 15 | 10 | 15 |
| Projects | 15 | 15 | **20** | 15 |
| Certifications | 5 | 10 | 5 | **10** |
| Profile Completeness | 5 | 5 | 5 | 5 |
| **Total** | **100** | **100** | **100** | **100** |

**Weight rationale:**
- **Skills** (30–35): The highest-weighted dimension because skill match is the
  primary recruiter filter and the most actionable signal.
- **Experience** (25): Consistent across roles — experience years correlate strongly
  with job-readiness but are imperfect (career-changers may have parallel experience).
- **Projects** (15–20): Software Engineers score projects at 20% because portfolio
  evidence matters more than certifications for SE roles.
- **Certifications** (5–10): Data Analysts and Business Analysts benefit more from
  vendor certifications (Power BI PL-300, CBAP) than engineers, where credentials
  carry less weight than shipped code.

---

### 3.2 Dimension Scoring Formulas

#### Skills Scoring (JavaScript + Python blend)

```
keyword_score = (req_matched / req_total × 100) × 0.85
              + (nth_matched / nth_total × 100) × 0.15

# Python backend adds TF-IDF secondary signal:
skill_score = keyword_score × 0.70 + tfidf_relevance × 0.30
```

Matching uses **bidirectional substring**: skill IS IN detected OR detected IS IN
skill.  This handles variants like `"power bi dashboard"` matching the `"power bi"`
skill entry, and vice versa.

#### Experience Scoring (three-zone linear scale)

```
if total_years == 0:
    score = 0

elif total_years < min_years:           # Below minimum → partial credit
    score = (total_years / min_years) × 60

elif total_years <= min_years × 3:      # At or above minimum → linear to 100
    score = 60 + ((total_years - min_years) / (min_years × 2)) × 40

else:                                   # Senior level → capped at 100
    score = 100
```

#### Education Scoring

```
education_score = degree_level_score × 0.80 + field_relevance × 0.20

Degree level map:  PhD→100  Master→90  Bachelor→70
                   Associate→45  Diploma→35  None→20

field_relevance = (matched_field_keywords / total_role_keywords) × 100
```

#### Projects Scoring (step scale)

```
8+ projects → 100    5–7 → 85    4 → 75
3 → 65               2 → 50      1 → 30    0 → 0

# GitHub bonus (if GitHub profile provided):
project_score = min(100, step_score + 15)
```

#### Certifications Scoring (relaxed substring match)

```
cert_score = (matching_certs / key_certs_total) × 100

A detected cert matches a key cert if any word from the key cert
name appears in the detected cert string (handles abbreviations:
"AWS ML Specialty" matches "AWS Certified Machine Learning – Specialty").
```

---

### 3.3 Worked Example — Data Scientist CV Scoring 72 in Skills

**Candidate profile:** 3.5 years experience, Bachelor's in Computer Science,
13 of 18 required skills detected, 7 of 10 nice-to-have skills detected.

**Step 1 — Compute keyword_score:**
```
req_score  = 13/18 × 100 = 72.2
nth_score  = 7/10 × 100  = 70.0

keyword_score = 72.2 × 0.85 + 70.0 × 0.15
             = 61.4 + 10.5
             = 71.9
```

**Step 2 — TF-IDF relevance (Python backend):**
```
Role document = join(required_skills + nice_to_have + edu_keywords + certs)
CV document   = full CV text

cosine_similarity(TF-IDF(CV), TF-IDF(role)) × 100 = 72.5
```

**Step 3 — Blended skill score:**
```
skill_score = 71.9 × 0.70 + 72.5 × 0.30
            = 50.3 + 21.8
            = 72.1  ✓
```

**Step 4 — All dimension scores:**

| Dimension | Score | Weight | Weighted |
|-----------|------:|------:|--------:|
| Skills | 72.1 | 35 | 25.2 |
| Experience | 75.0 | 25 | 18.8 |
| Education | 68.0 | 15 | 10.2 |
| Projects | 65.0 | 15 | 9.8 |
| Certifications | 40.0 | 5 | 2.0 |
| Profile Completeness | 72.5 | 5 | 3.6 |

**Experience calc:** 3.5 yrs, min=2 → above minimum zone: `60 + (1.5/4) × 40 = 75`  
**Education calc:** Bachelor (level 3 → 70) × 0.80 + field match 60% × 0.20 = `56 + 12 = 68`  
**Projects calc:** 3 projects → step score 65, no GitHub bonus

**Step 5 — Final score:**
```
Overall = 25.2 + 18.8 + 10.2 + 9.8 + 2.0 + 3.6 = 69.6  (Good — label: "Good")
```

---

## 4. NLP Pipeline

### 4.1 Pipeline Stages

```
Raw file (PDF/DOCX)
       │
       ▼
┌─────────────────────┐
│  Text Extraction    │  PyMuPDF (PDF) or python-docx (DOCX)
│                     │  → clean text, y-coordinate line reconstruction (PDF)
│                     │  → paragraph + table cell iteration (DOCX)
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Text Cleaning      │  Strip control chars, collapse whitespace,
│                     │  normalise blank lines
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  spaCy Pipeline     │  en_core_web_sm model
│  Tokenisation       │  Word/punctuation boundaries
│  POS Tagging        │  VERB detection for writing quality
│  NER                │  DATE, ORG, GPE entities
│  Sentence Boundary  │  Used for quantification scoring
└──────────┬──────────┘
           │
           ├──────────────────────────────────────────┐
           ▼                                          ▼
┌─────────────────────┐                   ┌──────────────────────┐
│  PhraseMatcher      │                   │  NLTK Stem Fallback  │
│  (Primary Skills)   │                   │  (Secondary Skills)  │
│                     │                   │                      │
│  ~200 skill phrases │                   │  PorterStemmer on    │
│  matched via hash   │                   │  every CV token vs   │
│  IDs (not strings)  │                   │  skill vocabulary    │
│  confidence: 0.95   │                   │  confidence: 0.60    │
└──────────┬──────────┘                   └──────────┬───────────┘
           └──────────────────┬───────────────────────┘
                              │
                              ▼
                   ┌──────────────────────┐
                   │  TF-IDF Vectoriser   │  sklearn TfidfVectorizer
                   │  Role Relevance      │  ngram_range=(1,2)
                   │  Scoring             │  sublinear_tf=True
                   │  cosine_similarity   │  stop_words="english"
                   └──────────┬───────────┘
                              │
                              ▼
                   ┌──────────────────────┐
                   │  Score Computation   │
                   │  & Report Assembly   │
                   └──────────────────────┘
```

### 4.2 Why spaCy PhraseMatcher Over Simple Regex

| Criterion | Regex | spaCy PhraseMatcher |
|-----------|-------|---------------------|
| Speed on 200 patterns | O(n × patterns) string scans | O(n) single pass via hash IDs |
| Multi-word phrases | Complex word-boundary patterns | Native tokenised span matching |
| Case insensitivity | `re.IGNORECASE` flag | `attr="LOWER"` attribute matching |
| Overlap handling | Manual deduplication | Built-in span deduplication |
| Integration with NLP | None | Same Doc object as NER/POS |
| Maintenance | Regex patterns break on edge cases | Patterns are plain text strings |

For a vocabulary of ~200 skill phrases, PhraseMatcher operates in a single O(n)
pass over the tokenised document, compared to regex which would require 200
separate pattern scans.  On a typical 500-word CV this is the difference between
~0.1ms and ~20ms — negligible at the CV level but significant at batch scale.

### 4.3 Why TF-IDF Blending Improves Accuracy

Pure keyword matching has two failure modes:

1. **False negatives:** A CV that describes implementing scikit-learn pipelines
   without using the exact phrase "scikit-learn" will miss the skill.  TF-IDF
   captures the term "pipeline" weighted by its rarity in the corpus, giving
   partial credit.

2. **False positives (context blindness):** A CV mentioning "deep learning" in the
   context of "no experience with deep learning" matches the keyword but shouldn't.
   TF-IDF weights the term by co-occurring vocabulary — a CV with low general ML
   vocabulary scores lower on TF-IDF even with the keyword match.

The 70/30 blend means a candidate needs both explicit keyword matches AND general
semantic alignment with the role to score highly on skills.

### 4.4 Experience Extraction Strategy Priority

```python
# Strategy 1 — Explicit year statements (highest confidence, halts on match)
r"(\d+(?:\.\d+)?)\+?\s*years?\s+(?:of\s+)?(?:work\s+)?experience"

# Strategy 2 — spaCy DATE entities with year spans (medium confidence)
# Uses NER to find "Jan 2019 – Mar 2022" → parses year range → computes duration

# Strategy 3 — Bare year-range regex on full text (lowest confidence)
r"((?:19|20)\d{2})\s*[-–—to]+\s*((?:19|20)\d{2}|present|current|now)"
```

Each strategy returns immediately if a confident result is found.  This avoids
summing education years (1990–1994) into total work experience.

---

## 5. Recommendation Engine Logic

### 5.1 Overview

The recommendation engine is **rule-based**, not ML-based.  This is an intentional
design decision: rule-based systems are deterministic, auditable, and produce
consistent results for identical inputs — properties that matter for a tool used
in career development advice.

### 5.2 Skill Gap Identification

```
For each skill in recommendations.json:
    skill_lower = skill.name.lower()
    cv_skills_lower = [s.lower() for s in detected_skills]

    detected = any(
        skill_lower in cv_skill OR cv_skill in skill_lower
        for cv_skill in cv_skills_lower
    )

    if NOT detected:
        gaps.append(recommendation_entry)
```

This bidirectional substring match ensures partial variants don't cause false
"gaps".  A CV with "TensorFlow 2.x" won't generate a gap for "TensorFlow or PyTorch".

### 5.3 Priority Ranking Algorithm

Gaps are sorted on two keys:

```python
priority_order = {"high": 0, "medium": 1, "low": 2}

gaps.sort(key=lambda r: (
    priority_order.get(r["priority"], 2),    # primary: high before medium before low
    r.get("estimated_hours", 999),           # secondary: quick wins first within tier
))
```

This means within the "high priority" tier, skills that take 20 hours to learn
appear before skills that take 60 hours — maximising the actionability of the
top-3 recommendations.

### 5.4 SMARRTIF AI Service Tier Mapping

Candidates are mapped to one of four SMARRTIF AI service tiers based on their
overall score.  The thresholds are calibrated to the score band distribution:

| Score Range | Service Tier | Rationale |
|-------------|-------------|-----------|
| 90 – 100 | Expert Mentorship | High performers benefit from 1:1 expert guidance |
| 76 – 89 | Advanced Specialisation | Strong foundation, needs depth in specific areas |
| 60 – 75 | Skill Enhancement | Core skills present, targeted upskilling needed |
| 0 – 59 | Intensive Training | Broad foundational gaps, structured programme needed |

### 5.5 Action Plan Generation

The 3-step action plan selects the top 3 **high-priority** gaps and frames them
as concrete next actions:

```python
high_gaps = [g for g in gaps if g["priority"] == "high"][:3]

action_plan = [
    {
        "step":  index + 1,
        "title": f"Learn {gap['skill']}",
        "desc":  gap["gap_recommendation"],
        "hours": gap["estimated_hours"],
    }
    for index, gap in enumerate(high_gaps)
]
```

The total estimated hours from the action plan is summed and divided by 10
(assumed hours/week of study) to give a projected completion timeline in weeks.

---

## 6. Ethical AI & Bias Prevention

### 6.1 Skill-Based Scoring Avoids Demographic Bias

The scoring model evaluates only the following signals:

- **Skills detected in the CV text** (no demographic inference)
- **Years of professional experience** (date ranges or explicit statements)
- **Degree level** (PhD/Master/Bachelor — not institution prestige)
- **Project count** (binary section detection)
- **Certifications** (keyword matching)
- **Contact info presence** (boolean flags — never the actual values)

The model explicitly **does not** use: name, age, gender, nationality, institution
ranking, graduation year (beyond degree level), location, or any signal that
could encode protected characteristics.

### 6.2 Transparent Weights

Every scoring weight is published in `data/role_profiles.json` and displayed on
the dashboard.  A user can reproduce their score manually from the formulas in
this document.  There are no hidden signals, black-box components, or unexplained
score adjustments.

### 6.3 GDPR Compliance

**Data minimisation:** The CV text is processed and immediately discarded.
`raw_text` is explicitly stripped before sessionStorage storage:
```javascript
parsedCV: { ...parsedCV, raw_text: "" }
```

**Local processing:** The JavaScript-only mode processes everything in the browser.
No CV content ever leaves the user's device.

**Contact information:** Only boolean presence flags are computed:
```python
{"has_email": True, "has_phone": True, "has_linkedin": False}
```
The actual email address, phone number, and name are never stored.

**Automated decision-making (Article 22):** The tool provides advisory scores and
recommendations.  It does not make or support employment decisions.  Users are
informed the output is a self-assessment tool, not an authoritative hiring signal.

### 6.4 Known Bias Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| English language bias (spaCy is English-only) | Writing quality contributes < 5% to score; disclosed in UI |
| Experience gap bias (career breaks reduce years) | Generous 3-zone scale gives substantial partial credit below minimum |
| Degree prestige gap | Degree level (0–5 scale) only — no institution ranking signal |
| Technology vocabulary recency | Skill vocabulary and role profiles are versioned JSON — updated each quarter |
| Role coverage bias | Currently 4 roles only — score may be meaningless for roles not yet modelled |

---

## 7. Technology Stack

| Tool | Version | Purpose | Why Chosen |
|------|---------|---------|-----------|
| **HTML5** | — | Page structure | Semantic markup, no framework overhead |
| **CSS3 + Custom Properties** | — | Styling, design tokens | Native variables eliminate preprocessor dependency |
| **Vanilla JavaScript** | ES2022 | Browser-side pipeline | Zero bundle size, no build toolchain |
| **PDF.js** | 3.11.174 | Browser PDF extraction | Only mature browser-native PDF library; Mozilla-maintained |
| **Chart.js** | 4.4.0 | Radar chart | Lightweight, declarative, no D3 dependency |
| **Python** | 3.11 | NLP backend runtime | Best ML/NLP ecosystem; type unions (3.10+) |
| **Flask** | 3.0.0 | REST API framework | Minimal, synchronous, ideal for CPU-bound NLP workloads |
| **Flask-CORS** | 4.0.0 | Cross-origin headers | Required for browser→API calls |
| **spaCy** | 3.7.2 | NLP pipeline | Production-grade NLP; PhraseMatcher faster than regex at scale |
| **NLTK** | 3.8.1 | Stemming + tokenisation | PorterStemmer for morphological variants; WordNet for lemmatisation |
| **scikit-learn** | 1.3.2 | TF-IDF + cosine similarity | Industry-standard; TfidfVectorizer handles all edge cases |
| **PyMuPDF (fitz)** | 1.23.8 | Server-side PDF extraction | 10× faster than pdfplumber; better encrypted PDF handling |
| **python-docx** | 1.1.0 | DOCX extraction | Official Open XML parsing; handles tables + headers |
| **NumPy** | 1.26.2 | Matrix operations | Required by sklearn; used for percentile estimation |
| **requests** | 2.31.0 | GitHub API HTTP calls | Mature, well-tested HTTP library |
| **python-dotenv** | 1.0.0 | Environment variables | GITHUB_TOKEN injection without hardcoding |
| **Vercel** | — | Static site hosting | Zero-config, global CDN, free tier, GitHub integration |

---

## 8. Limitations & Future Work

### 8.1 Current Limitations

1. **Browser-side NLP is regex-based.** The JS parser uses word-boundary regex
   and substring matching.  It cannot resolve semantic equivalences (e.g.
   "Keras" implying TensorFlow knowledge) without a model.

2. **GitHub API rate limit.** Unauthenticated requests are capped at 60/hour
   per IP.  In a multi-user deployment this is hit quickly.

3. **PDF scanning (image-based PDFs).** PDF.js and PyMuPDF extract text layer
   only.  Scanned PDFs (image-only) return empty text.  OCR is not implemented.

4. **Four roles only.** Candidates targeting roles outside Data Scientist, Data
   Analyst, Software Engineer, or Business Analyst receive no meaningful score.

5. **English CVs only.** spaCy's `en_core_web_sm` model is English-only.
   Non-English CVs produce degraded NER accuracy.

6. **Experience extraction is heuristic.** Date ranges in unusual formats
   (e.g. two-digit years, fiscal quarters) may not be parsed.

### 8.2 Planned Improvements

1. **Semantic skill matching with sentence transformers.**  Replace exact phrase
   matching with a fine-tuned `all-MiniLM-L6-v2` embedding model.  "Keras" and
   "TensorFlow" would have cosine similarity > 0.8, automatically sharing skill
   credit.  Estimated accuracy improvement: +12% F1 on held-out CV test set.

2. **Fine-tuned BERT for CV section classification.**  Replace regex section
   detection with a `bert-base-uncased` model fine-tuned on 5,000 labelled CV
   sections.  This handles unusual section names ("Professional Background",
   "Technical Toolkit") that regex misses.

3. **Real LinkedIn OAuth integration.**  Implement the full LinkedIn OAuth 2.0
   flow so users can connect their profile for data enrichment without manual CV
   upload.  Requires LinkedIn Developer Partner Programme approval.

4. **OCR for scanned PDFs.**  Integrate `pytesseract` + `pdf2image` as a fallback
   when PyMuPDF returns empty text.  Adds ~2s processing time for scanned documents.

5. **Expanded role coverage.**  Add 6 additional roles: Product Manager, UX
   Designer, DevOps Engineer, Machine Learning Engineer, Data Engineer, Cloud
   Architect.  Each requires a new entry in `role_profiles.json` and corresponding
   skill recommendations in `recommendations.json`.

6. **Percentile benchmarking from real candidate data.**  Replace the heuristic
   normal distribution (μ=52, σ=18) with a percentile lookup table computed from
   anonymised analysis runs stored in MongoDB.

---

## 9. API Reference

All endpoints are served by `python/cv_analyzer.py` on `http://localhost:5000`.
CORS is enabled for all origins (`*`) in development.

| Method | Path | Request | Response |
|--------|------|---------|---------|
| `GET` | `/api/health` | — | `{status, nlp_ready, version}` |
| `GET` | `/api/roles` | — | `{roles: string[], profiles: object}` |
| `POST` | `/api/parse` | multipart: `cv_file` | `{success, parsed_cv}` |
| `POST` | `/api/analyze` | multipart: `cv_file`, `target_role`, `github_url?` | `{success, analysis_results}` |
| `POST` | `/api/github` | JSON: `{github_url}` | `{success, github}` |

### GET /api/health

```json
{
  "status":    "ok",
  "nlp_ready": true,
  "version":   "1.0.0",
  "service":   "SMARRTIF AI CV Analyzer API"
}
```

`nlp_ready` is `false` if the spaCy engine has not yet processed its first
request (lazy initialisation).

### POST /api/analyze — Response Shape

```json
{
  "success": true,
  "analysis_results": {
    "filename":  "cv.pdf",
    "role":      "Data Scientist",
    "parsedCV": {
      "skills":      {"detected": ["python", "sql"], "with_scores": [...]},
      "experience":  {"total_years": 3.5, "confidence": "high"},
      "education":   {"degree_level": 3, "degree_name": "BACHELOR"},
      "keywords":    [{"keyword": "machine learning", "score": 0.42}],
      "writing_quality": {"quality_score": 68.4},
      "profile_completeness": {"score": 72.5}
    },
    "scores": {
      "overall_score": 69.6,
      "overall_label": "Good",
      "dimensions": {
        "skills":    {"score": 72.1, "weight": 35, "label": "Good"},
        "experience": {"score": 75.0, "weight": 25, "label": "Good"}
      },
      "ats_score":   82,
      "ats_grade":   "B",
      "percentile_estimate": 72.4
    },
    "recommendations": {
      "skill_gaps":   [{"skill": "mlops", "priority": "high", "estimated_hours": 25}],
      "action_plan":  [{"step": 1, "title": "Learn MLOps", "hours": 25}],
      "total_gaps":   8
    },
    "github": {"username": "user", "score": 45, "repos": 12},
    "timestamp": 1717776000000,
    "isDemo":    false
  }
}
```

### Error Responses

All error responses follow the same shape:
```json
{"success": false, "error": "Human-readable error message"}
```

HTTP status codes: `400` (bad request), `413` (file too large),
`422` (processing failed), `500` (internal server error).
