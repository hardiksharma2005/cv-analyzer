# API Integration Plan — SMARRTIF AI CV Analyzer
## Architecture, Third-Party Integrations & Scaling Roadmap

**Document version:** 1.0  
**Date:** June 2026  
**Author:** SMARRTIF AI Engineering  
**Status:** Design draft (internship submission)

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [LinkedIn API Integration](#2-linkedin-api-integration)
3. [GitHub API Integration](#3-github-api-integration)
4. [Tableau Public API](#4-tableau-public-api)
5. [Power BI Service API](#5-power-bi-service-api)
6. [Database Schema](#6-database-schema)
7. [Ethical AI & Compliance](#7-ethical-ai--compliance)
8. [Scaling Plan](#8-scaling-plan)

---

## 1. Architecture Overview

### 1.1 Current Architecture (Static Frontend)

The current deployed application runs entirely in the browser with no backend:

```
┌─────────────────────────────────────────────────────────────────┐
│                        User's Browser                           │
│                                                                 │
│  index.html ──[app.js pipeline]──► sessionStorage ──► dashboard │
│                                                                 │
│  JS Modules:  parser.js  scorer.js  recommender.js  github.js   │
│  CDN deps:    PDF.js v3.11  ·  Chart.js v4.4                   │
└─────────────────────────────────────────────────────────────────┘
         │                                    │
         │ PDF.js (local)          GitHub REST API (unauthenticated)
         │                                    │
         ▼                                    ▼
  Browser PDF rendering           api.github.com (60 req/hr)
```

**Limitation:** GitHub API is rate-limited at 60 req/hr per IP (unauthenticated).
All ML is client-side regex + scoring — no true NLP.

---

### 1.2 Target Architecture (Python NLP Backend)

```
┌──────────────────────────────────────────────────────────────────────┐
│                         User's Browser                               │
│                                                                      │
│   index.html ──► POST /api/analyze ──► sessionStorage ──► dashboard  │
│                                                                      │
│   Fallback: browser-side JS pipeline (offline / API unavailable)    │
└──────────────────────────────────────────────────────────────────────┘
                          │  HTTPS + CORS
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Python Flask API  (port 5000)                    │
│                                                                     │
│  cv_analyzer.py ──► nlp_engine.py (spaCy + sklearn + NLTK)         │
│                 ──► scorer.py     (TF-IDF blend + ATS simulation)   │
│                 ──► mock_integrations.py ──► [live APIs below]      │
└─────────────────────────────────────────────────────────────────────┘
         │              │              │               │
         ▼              ▼              ▼               ▼
    GitHub REST    LinkedIn API    Tableau API    Power BI API
    (live today)   (OAuth 2.0)    (Public REST)  (Azure AD OAuth)
         │              │              │               │
         └──────────────┴──────────────┴───────────────┘
                                 │
                    ┌────────────▼───────────────┐
                    │       Data Layer            │
                    │  MongoDB (analyses)         │
                    │  Redis   (cache / sessions) │
                    │  SQLite  (local dev)        │
                    └─────────────────────────────┘
```

### 1.3 Request Lifecycle for POST /api/analyze

```
Client (browser)
    │
    │  POST /api/analyze
    │  Content-Type: multipart/form-data
    │  Body: cv_file=<binary>, target_role="Data Scientist"
    │
    ▼
Flask Router (cv_analyzer.py)
    │
    ├─► Validate file type + size
    ├─► Save to /tmp (NamedTemporaryFile)
    │
    ▼
CVNLPEngine.extract_text_from_pdf() / extract_text_from_docx()
    │
    ├─► PyMuPDF / python-docx
    ├─► Text cleaning (strip control chars, collapse whitespace)
    │
    ▼
CVNLPEngine.parse_cv(text)
    │
    ├─► spaCy pipeline: tokenise → POS → NER → sents
    ├─► extract_skills_nlp()   (PhraseMatcher + NLTK stemming)
    ├─► extract_experience_nlp() (DATE entities + year regex)
    ├─► extract_education_nlp()  (ORG entities + degree patterns)
    ├─► extract_keywords()       (TF-IDF)
    ├─► analyze_writing_quality()
    └─► _calculate_profile_completeness()
    │
    ▼
CVScorer.score_all(parsed, text, role)
    │
    ├─► score_skills()      (keyword match 70% + TF-IDF 30%)
    ├─► score_experience()  (3-zone linear scale)
    ├─► score_education()   (degree level 80% + field keywords 20%)
    ├─► score_projects()    (step scale + GitHub bonus)
    ├─► score_certifications() (relaxed substring match)
    ├─► calculate_ats_score()
    └─► generate_score_report()
    │
    ▼
_build_recommendations(skills, scores, role)
    │  (reads data/recommendations.json, filters gaps, builds action plan)
    │
    ▼
GitHubAPIHelper.analyze_from_url() [optional]
    │
    ▼
JSON response → browser sessionStorage → dashboard.html renders
```

---

## 2. LinkedIn API Integration

### 2.1 Overview

LinkedIn provides the richest professional profile data of any platform.  However,
access to full profile data requires participation in the **LinkedIn Marketing
Developer Program (MDP)** or the **LinkedIn Talent Solutions API**, both of which
are invitation-only and require business justification.

For a CV analyzer tool, the most relevant use case is:
- Reading the authenticated user's own profile (basic fields — available to all apps)
- Using the data to supplement CV analysis without manual re-entry

### 2.2 OAuth 2.0 Flow

```
Step 1 — Build authorization URL
────────────────────────────────────────────────────────────────
GET https://www.linkedin.com/oauth/v2/authorization
  ?response_type=code
  &client_id={YOUR_CLIENT_ID}
  &redirect_uri={ENCODED_REDIRECT_URI}
  &state={RANDOM_CSRF_TOKEN}
  &scope=r_liteprofile%20r_emailaddress

Step 2 — User approves, LinkedIn redirects to your callback
────────────────────────────────────────────────────────────────
GET {REDIRECT_URI}
  ?code={AUTHORIZATION_CODE}
  &state={CSRF_TOKEN}

Verify state matches to prevent CSRF attacks.

Step 3 — Exchange code for access token
────────────────────────────────────────────────────────────────
POST https://www.linkedin.com/oauth/v2/accessToken
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code={AUTHORIZATION_CODE}
&redirect_uri={REDIRECT_URI}
&client_id={CLIENT_ID}
&client_secret={CLIENT_SECRET}

Response: {"access_token": "...", "expires_in": 5183944}
Tokens expire after ~60 days.

Step 4 — Call the API
────────────────────────────────────────────────────────────────
GET https://api.linkedin.com/v2/me
Authorization: Bearer {access_token}

Optional projection to fetch specific fields:
GET https://api.linkedin.com/v2/me
  ?projection=(id,localizedFirstName,localizedLastName,
               localizedHeadline,profilePicture(displayImage~:playableStreams))
```

### 2.3 Available Scopes and What They Unlock

| Scope | Availability | Data Unlocked |
|-------|-------------|---------------|
| `r_liteprofile` | All apps | Name, headline, profile picture, vanity URL |
| `r_emailaddress` | All apps | Primary email address |
| `r_fullprofile` | Partner programme only | Full positions, education, skills, recommendations |
| `r_member_social` | Partner programme only | Connections count, follower data |
| `w_member_social` | All apps | Post on user's behalf (not needed here) |

**Important:** Most useful CV data (full positions, skills list, education history)
requires `r_fullprofile` which is **partner-restricted**.  For a standalone CV
analyzer, the realistic path is:
1. Ask users to upload their LinkedIn PDF export (Settings → Privacy → How LinkedIn uses your data → Download your data)
2. Parse the PDF with `nlp_engine.extract_text_from_pdf()`

### 2.4 Key API Endpoints

```http
# Basic profile (available to all)
GET https://api.linkedin.com/v2/me

# Email address
GET https://api.linkedin.com/v2/emailAddress?q=members&projection=(elements*(handle~))

# Profile picture
GET https://api.linkedin.com/v2/me
  ?projection=(profilePicture(displayImage~:playableStreams))

# Full profile (requires r_fullprofile — partner only)
GET https://api.linkedin.com/v2/people/(id:{member_id})
  ?projection=(positions,educations,skills,recommendations)

# Company page data (requires partner access)
GET https://api.linkedin.com/v2/organizations/{orgId}
```

### 2.5 Rate Limits

| API Category | Limit |
|-------------|-------|
| Default per app | 500 calls / day |
| Per user per app | 100 calls / day |
| Burst rate | 3 calls / second |
| Token validity | ~60 days |

### 2.6 Data Mapping to CV Score Fields

```python
linkedin_profile = {
    "localizedHeadline": "Senior Data Scientist | ML | Python",
    # → maps to: parsedCV.summary (if no summary section in CV)

    "positions": [
        {"title": "Senior Data Scientist", "company": {"name": "TechCorp"}}
    ],
    # → maps to: parsedCV.experience.positions
    # → used to validate experience.total_years

    "educations": [
        {"degreeName": "Bachelor of Science", "fieldOfStudy": "Computer Science"}
    ],
    # → maps to: parsedCV.education (cross-reference / fill gaps)

    "skills": ["Python", "TensorFlow", "SQL"],
    # → merged into parsedCV.skills.detected (deduplicated)
}
```

### 2.7 Implementation Plan

```python
# Real implementation sketch (requires approved LinkedIn app)

import requests
from urllib.parse import urlencode

class LinkedInOAuth:
    AUTH_URL   = "https://www.linkedin.com/oauth/v2/authorization"
    TOKEN_URL  = "https://www.linkedin.com/oauth/v2/accessToken"
    API_BASE   = "https://api.linkedin.com/v2"

    def __init__(self, client_id: str, client_secret: str, redirect_uri: str):
        self.client_id     = client_id
        self.client_secret = client_secret
        self.redirect_uri  = redirect_uri

    def get_auth_url(self, state: str) -> str:
        params = {
            "response_type": "code",
            "client_id":     self.client_id,
            "redirect_uri":  self.redirect_uri,
            "state":         state,
            "scope":         "r_liteprofile r_emailaddress",
        }
        return f"{self.AUTH_URL}?{urlencode(params)}"

    def exchange_code(self, code: str) -> dict:
        resp = requests.post(self.TOKEN_URL, data={
            "grant_type":    "authorization_code",
            "code":          code,
            "redirect_uri":  self.redirect_uri,
            "client_id":     self.client_id,
            "client_secret": self.client_secret,
        })
        resp.raise_for_status()
        return resp.json()  # {"access_token": "...", "expires_in": 5183944}

    def get_profile(self, access_token: str) -> dict:
        headers = {"Authorization": f"Bearer {access_token}"}
        resp = requests.get(f"{self.API_BASE}/me", headers=headers)
        resp.raise_for_status()
        return resp.json()
```

---

## 3. GitHub API Integration

### 3.1 Overview

GitHub's REST API v3 is the **only live third-party integration** currently
implemented in both the JavaScript frontend (`js/github.js`) and the Python
backend (`python/mock_integrations.py → GitHubAPIHelper`).

The integration is fully functional for public profiles without authentication,
subject to rate limits.

### 3.2 Endpoints Used

```http
# User profile — always public
GET https://api.github.com/users/{username}

Response fields used:
  login, name, bio, avatar_url, public_repos,
  followers, following, created_at

# Public repositories — paginated, up to 100 per page
GET https://api.github.com/users/{username}/repos
  ?per_page=100&sort=pushed&type=owner

Response fields per repo:
  name, description, language, stargazers_count, topics,
  created_at, pushed_at, html_url, fork

# Languages breakdown (per repo — one extra call per repo)
# Currently NOT used due to rate limit; we use repo.language (primary language only)
GET https://api.github.com/repos/{username}/{repo_name}/languages

# Events (recent activity signal — not yet implemented)
GET https://api.github.com/users/{username}/events/public?per_page=30
```

### 3.3 Rate Limits

| Authentication | Requests/hour | Best for |
|---------------|--------------|---------|
| Unauthenticated (by IP) | 60 | Development, single user |
| Personal Access Token | 5,000 | Production (per-user tokens) |
| GitHub App (installation token) | 15,000 | Hosted SaaS |
| OAuth App (on behalf of user) | 5,000 per user | Multi-user SaaS |

**Current status:** Unauthenticated (60 req/hr).  Each analysis uses 2 API calls
(profile + repos), so the limit allows ~30 analyses per hour per deployment IP.

**Recommended upgrade path:**
1. Register a GitHub OAuth App at github.com/settings/developers
2. Store `GITHUB_TOKEN` as an environment variable (or per-user OAuth tokens)
3. The `GitHubAPIHelper._headers()` method already reads `GITHUB_TOKEN` if set

### 3.4 Pagination Handling

```python
# Repositories are paginated — current implementation fetches page 1 only.
# For users with > 100 repos, we miss later repos (sorted by push date,
# so the most recent 100 are captured — acceptable for scoring).

# Full pagination example for future implementation:
def fetch_all_repos(username: str, headers: dict) -> list:
    repos  = []
    page   = 1
    while True:
        resp = requests.get(
            f"https://api.github.com/users/{username}/repos",
            headers=headers,
            params={"per_page": 100, "page": page, "sort": "pushed"},
        )
        batch = resp.json()
        if not batch:
            break
        repos.extend(batch)
        # Check Link header for next page
        if 'next' not in resp.links:
            break
        page += 1
    return repos
```

### 3.5 Score Formula

The GitHub score (0–100) is computed as follows, matching both `js/github.js`
and `python/mock_integrations.py GitHubAPIHelper.analyze_from_url()`:

```
github_score =
    min(30, repo_count × 2)          # Repo volume: up to 15 repos → max 30 pts
  + min(20, total_stars / 5)          # Community recognition: 100 stars → max 20 pts
  + min(20, unique_languages × 4)     # Breadth: 5 languages → max 20 pts
  + min(15, account_age_years × 3)    # Longevity: 5+ years → max 15 pts
  + min(15, followers × 0.5)          # Influence: 30+ followers → max 15 pts
```

The GitHub score contributes a +15 point bonus to the **projects dimension** of
the CV score, capped so the dimension total does not exceed 100.

### 3.6 Topic & Language Skill Mapping

```python
# GitHub topics → canonical skill names (40 mappings defined in TOPIC_MAP)
# Example:
repo.topics = ["machine-learning", "pytorch", "nlp"]
# → detected skills: ["machine learning", "tensorflow or pytorch",
#                     "natural language processing"]

# Primary language → skills (15 language mappings in LANG_MAP)
# Example:
repo.language = "Jupyter Notebook"
# → detected skills: ["python", "data science", "pandas", "numpy"]
```

---

## 4. Tableau Public API

### 4.1 Overview

Tableau Public is a free platform for publishing interactive data visualizations.
It has a partially-documented public REST API that can be accessed without
authentication (all published content is public by design).

### 4.2 Available Endpoints

```http
Base URL: https://public.tableau.com/api/

# User profile
GET /profile/{username}

Response example:
{
  "displayName":   "Jane Smith",
  "followersCount": 120,
  "vizCount":       15
}

# Workbooks list (paginated, 12 per page by default)
GET /profile/{username}/workbooks
  ?count=100&index=0

Response: array of workbook objects with:
  id, name, description, views, favoriteCount, tags, isFeatured

# Single workbook metadata
GET /workbook/{workbook_id}

# Search public vizzes
GET /search
  ?query={keyword}&type=workbooks&language=en&orderBy=views&count=20
```

**Note:** These endpoints are **not officially documented** by Tableau/Salesforce
and are reverse-engineered from the Tableau Public website's own AJAX calls.
They may change without notice in future Tableau releases.

### 4.3 Authentication

**Tableau Public profiles:** No authentication required (fully public).

**Tableau Cloud / Server (private):**
```http
POST https://{server}/api/{api_version}/auth/signin
Content-Type: application/json

{
  "credentials": {
    "name":     "username@company.com",
    "password": "password",
    "site":     {"contentUrl": "site_name"}
  }
}

Response: {"credentials": {"token": "...", "site": {...}}}

Subsequent requests:
GET https://{server}/api/{api_version}/sites/{siteId}/workbooks
X-Tableau-Auth: {token}
```

Tableau Server API documentation: https://help.tableau.com/current/api/rest_api/en-us/REST/rest_api.htm

### 4.4 Rate Limits

- Public API: Not officially documented; ~100 requests/minute is safe
- Tableau Cloud REST API: 100 requests/minute per site (configurable)
- Embed tokens expire after 10 minutes (must refresh)

### 4.5 Data We Extract for CV Scoring

```python
tableau_profile = {
    "workbooks": [
        {
            "name":        "Sales Dashboard",
            "views":       4200,
            "favorites":   67,
            "isFeatured":  True,
            "tags":        ["sales", "kpi"],
        }
    ]
}

# Scoring dimensions:
#   viz_count    → signals Tableau skill level (more = more experienced)
#   total_views  → validates the vizzes are actually used / public-facing
#   featured     → editorial quality signal (Tableau curates featured content)
```

### 4.6 Skill Mapping from Tableau Data

```python
# Tag-based skill inference:
if any("machine" in tag or "ml" in tag for tag in workbook["tags"]):
    detected_skills.append("data visualization")  # at minimum

# If the user has Tableau Public vizzes → high confidence in Tableau skill
if viz_count >= 3:
    detected_skills.append("tableau")

# View count → signals Data Visualization competency
if total_views >= 1000:
    detected_skills.append("dashboard development")
```

---

## 5. Power BI Service API

### 5.1 Overview

Power BI has a comprehensive REST API available for workspace data, reports,
dashboards, and datasets.  Access requires authentication via Azure Active
Directory (Azure AD).

### 5.2 Azure AD App Registration

```
1. Go to https://portal.azure.com → Azure Active Directory → App registrations
2. Click "New registration"
   - Name: SMARRTIF AI CV Analyzer
   - Redirect URI: https://your-domain.com/auth/powerbi/callback
3. API Permissions → Add permissions:
   - Power BI Service → Delegated → Report.Read.All
   - Power BI Service → Delegated → Dashboard.Read.All
   - Power BI Service → Delegated → Dataset.Read.All
4. Certificates & secrets → New client secret (save immediately — shown once)
5. Note: Application (client) ID, Directory (tenant) ID, Client secret value
```

### 5.3 OAuth 2.0 Authorization Code Flow

```http
Step 1 — Redirect user to:
────────────────────────────────────────────────────────────────────
https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/authorize
  ?client_id={CLIENT_ID}
  &response_type=code
  &redirect_uri={REDIRECT_URI}
  &response_mode=query
  &scope=https://analysis.windows.net/powerbi/api/.default
  &state={CSRF_TOKEN}

Step 2 — Exchange code for token:
────────────────────────────────────────────────────────────────────
POST https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token
Content-Type: application/x-www-form-urlencoded

client_id={CLIENT_ID}
&scope=https://analysis.windows.net/powerbi/api/.default
&code={AUTH_CODE}
&redirect_uri={REDIRECT_URI}
&grant_type=authorization_code
&client_secret={CLIENT_SECRET}

Response:
{
  "access_token":  "eyJ...",
  "refresh_token": "...",
  "expires_in":    3600
}

Step 3 — Call Power BI API:
────────────────────────────────────────────────────────────────────
GET https://api.powerbi.com/v1.0/myorg/reports
Authorization: Bearer {access_token}
```

### 5.4 Key Power BI Endpoints

```http
# List all reports in My Workspace
GET https://api.powerbi.com/v1.0/myorg/reports

# List all dashboards
GET https://api.powerbi.com/v1.0/myorg/dashboards

# List all datasets
GET https://api.powerbi.com/v1.0/myorg/datasets

# List workspaces (groups) — shows shared workspaces
GET https://api.powerbi.com/v1.0/myorg/groups

# Get a specific report
GET https://api.powerbi.com/v1.0/myorg/reports/{reportId}

# Export report to file (async)
POST https://api.powerbi.com/v1.0/myorg/reports/{reportId}/ExportTo
Body: {"format": "PDF"}

# Refresh a dataset
POST https://api.powerbi.com/v1.0/myorg/datasets/{datasetId}/refreshes
```

### 5.5 Rate Limits

| Tier | Requests/hour |
|------|--------------|
| Shared capacity (free/Pro) | 200 per user |
| Premium capacity | 7,200+ per capacity unit |
| Embedded (A-SKU) | Configurable |

Requests that exceed limits receive HTTP 429 with `Retry-After` header.

### 5.6 Scoring Strategy for CV Enhancement

```python
# A candidate with Power BI workspace data → strong validation of BI skills
pbi_analysis = {
    "report_count":    5,    # more reports = more experience
    "has_rls":         True, # RLS = enterprise-level skill
    "uses_directquery": True, # real-time data = advanced skill
    "total_shared":    20,   # shared with 20 users = real business use
    "has_dataflows":   False,
}

# Skill mappings:
if pbi_analysis["report_count"] >= 3:
    boost_skill("power bi", confidence=0.90)

if pbi_analysis["has_rls"]:
    boost_skill("business intelligence", confidence=0.85)

if pbi_analysis["uses_directquery"]:
    boost_skill("sql", confidence=0.70)  # DirectQuery requires SQL knowledge
```

---

## 6. Database Schema

### 6.1 MongoDB Collections (Production)

```javascript
// Collection: analyses
// One document per CV analysis run
{
  "_id":       ObjectId,
  "sessionId": "uuid-v4",          // anonymous session identifier
  "filename":  "john_doe_cv.pdf",
  "role":      "Data Scientist",
  "timestamp": ISODate,

  // Parsed CV structure (raw_text NOT stored — privacy)
  "parsedCV": {
    "skills": {
      "detected":    ["python", "machine learning", "sql"],
      "with_scores": [{"skill": "python", "confidence": 0.95, "source": "phrase_match"}]
    },
    "experience": {
      "total_years": 3.5,
      "confidence":  "high",
      "positions":   ["Data Scientist", "Data Analyst"],
      "companies":   ["TechCorp", "Analytics Co"]
    },
    "education": {
      "degree_level":    3,
      "degree_name":     "BACHELOR",
      "institution":     "University of Technology",
      "graduation_year": 2021,
      "field_keywords":  ["computer science", "mathematics"]
    },
    "profile_completeness": {"score": 72.5}
  },

  // Score report
  "scores": {
    "overall_score": 74.2,
    "dimensions": {
      "skills":               {"score": 78, "weight": 35},
      "experience":           {"score": 68, "weight": 25},
      "education":            {"score": 70, "weight": 15},
      "projects":             {"score": 65, "weight": 15},
      "certifications":       {"score": 40, "weight":  5},
      "profile_completeness": {"score": 72, "weight":  5}
    },
    "ats_score":   82,
    "ats_grade":   "B",
    "percentile_estimate": 68.4
  },

  // GitHub integration data (null if not provided)
  "github": {
    "username":        "johndoe",
    "score":           45.5,
    "repos":           12,
    "stars":           34,
    "languages":       ["Python", "JavaScript", "SQL"],
    "detected_skills": ["python", "data science"],
    "profile_url":     "https://github.com/johndoe"
  },

  // Recommendations used
  "recommendations": {
    "skill_gaps":   [{"skill": "mlops", "priority": "high", "estimated_hours": 25}],
    "action_plan":  [{"step": 1, "title": "Learn MLOps", "hours": 25}],
    "total_gaps":   8,
    "high_priority": 3
  }
}

// Collection: users
// Only created when user creates an account (planned feature)
{
  "_id":          ObjectId,
  "email":        "user@example.com",
  "name":         "John Doe",
  "createdAt":    ISODate,
  "plan":         "free",  // free | pro | team
  "analysisIds":  [ObjectId],   // references to analyses collection
  "githubToken":  "encrypted:...",  // AES-256 encrypted
  "linkedinId":   "member_id",
}

// Collection: recommendations  (static — seeded from recommendations.json)
{
  "_id":                ObjectId,
  "skill":              "mlops",
  "gap_recommendation": "Study MLflow and Weights & Biases...",
  "course_suggestion":  "MLOps Specialization on Coursera",
  "priority":           "high",
  "estimated_hours":    25,
  "roles":              ["Data Scientist"]  // which roles this applies to
}
```

### 6.2 SQLite Schema (Local Development)

```sql
-- Local development schema (used when MongoDB is not available)

CREATE TABLE analyses (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id      TEXT    NOT NULL,
    filename        TEXT    NOT NULL,
    role            TEXT    NOT NULL,
    overall_score   REAL    NOT NULL,
    ats_score       REAL,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    scores_json     TEXT    NOT NULL,   -- full score report as JSON
    parsed_json     TEXT    NOT NULL,   -- parsed CV structure as JSON (no raw_text)
    github_json     TEXT,               -- nullable GitHub data JSON
    recs_json       TEXT                -- recommendations JSON
);

CREATE INDEX idx_analyses_session ON analyses(session_id);
CREATE INDEX idx_analyses_role    ON analyses(role);
CREATE INDEX idx_analyses_created ON analyses(created_at);

CREATE TABLE skill_gap_stats (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    skill       TEXT    NOT NULL,
    role        TEXT    NOT NULL,
    gap_count   INTEGER DEFAULT 0,   -- how many times this skill was a gap
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Aggregate query example: most common skill gaps for Data Scientists
-- SELECT skill, SUM(gap_count) as total
-- FROM skill_gap_stats
-- WHERE role = 'Data Scientist'
-- GROUP BY skill ORDER BY total DESC LIMIT 10;

CREATE TABLE rate_limit_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ip_address  TEXT    NOT NULL,
    endpoint    TEXT    NOT NULL,
    request_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 6.3 Redis Cache Keys (Production)

```
# GitHub profile cache (TTL: 1 hour — profiles don't change that fast)
Key:   github:profile:{username}
Type:  string (JSON)
TTL:   3600 seconds

# Role profiles cache (TTL: 24 hours — static data)
Key:   role:profiles
Type:  string (JSON)
TTL:   86400 seconds

# Session rate limiting (TTL: 1 minute window)
Key:   ratelimit:{ip_address}:analyze
Type:  integer (increment)
TTL:   60 seconds
Usage: INCR + EXPIRE; reject if > 5 in window

# NLP results cache for identical files (TTL: 30 minutes)
# Key is MD5 hash of file content + role
Key:   nlp:cache:{file_md5}:{role}
Type:  string (JSON)
TTL:   1800 seconds
```

---

## 7. Ethical AI & Compliance

### 7.1 Bias Detection Approach

CV analysis AI systems can inadvertently encode and amplify historical hiring
biases.  We implement the following mitigation strategies:

**Data biases we are aware of:**
1. **University prestige bias:** Our scoring rewards higher degree levels without
   accounting for institution quality.  A PhD from any institution scores the same.
   *Mitigation:* We explicitly do NOT score institution prestige — only degree level
   and field relevance.

2. **Skill keyword bias:** Scoring is entirely skills-based, not demographic.
   We never parse names, addresses, nationality, or graduation year for age estimation.
   *Mitigation:* The `_extract_contact_info()` method only checks for presence of
   contact fields (boolean flags) — never reads the actual values.

3. **English language bias:** spaCy `en_core_web_sm` is English-only.
   Non-native English writers may use simpler vocabulary, reducing `vocabulary_richness`
   scores.  *Mitigation:* `writing_quality` is a secondary signal contributing ≤ 5%
   to the overall score.  We explicitly note this limitation in the UI.

4. **Experience gap bias:** Career breaks (parenting, illness, caregiving) create
   gaps that reduce experience year totals.  *Mitigation:* We score experience on a
   generous 3-zone scale — a 3-year career with a 1-year gap scores identically to
   3 continuous years.

**Bias monitoring:**
In production, we log score distributions by role and periodically audit for
systematic score gaps.  If a subgroup of CVs consistently scores below others
with equivalent explicit qualifications, the scoring model is reviewed.

### 7.2 Transparency in Scoring

The scoring model is fully transparent to users:
- Every dimension score and weight is displayed on the dashboard
- The ATS score explains exactly which checks passed/failed
- All recommendations link to specific skill gaps, not opaque "AI decisions"
- Users can view their raw detected skills to verify extraction accuracy

We do **not** use black-box ML models for scoring — all scoring is deterministic
and explainable.  A user can reproduce their score manually from the published
formulas.

### 7.3 GDPR Compliance Notes

| Data Type | How We Handle It | Retention |
|-----------|-----------------|-----------|
| CV file content | Processed in browser (JS) or deleted from server after analysis | Not stored |
| Extracted text | Stripped before sessionStorage (`raw_text: ""`) | Session only (browser) |
| Score results | Stored in sessionStorage (browser only, no server) | Until tab closes |
| GitHub username | Used only for API call, not logged | Not stored |
| IP address | Logged for rate limiting only | 24 hours |
| Email/phone from CV | Extracted as boolean flags only (has_email: true/false) | Never stored |

**Right to deletion:** Since we store nothing server-side by default, there is
nothing to delete.  The Python backend can be configured to store analyses in
MongoDB; in that mode, a deletion endpoint must be implemented.

**Data residency:** The static frontend runs entirely in the user's browser.
No CV content leaves the device when using the JavaScript-only mode.

**GDPR Article 22 (Automated Decision-Making):** Our tool provides recommendations
and scores but does not make hiring decisions.  The score is explicitly labelled
as a self-assessment tool and advisory output.

### 7.4 Data Retention Policy

```
Category              Retention   Justification
────────────────────────────────────────────────────────────────
CV file content       0 seconds   Processed immediately, discarded
sessionStorage data   Session     Browser clears on tab close
Server temp files     0 seconds   Deleted in finally block after analysis
MongoDB analyses      90 days     Allows trend analysis; user can request deletion
Rate limit logs       24 hours    Security: track abuse patterns only
GitHub API cache      1 hour      Reduce API calls; data is public
```

### 7.5 Accessibility

The scoring interface is designed to be accessible:
- Score rings use both color and numeric values (no color-only encoding)
- All emoji are accompanied by text labels for screen readers
- Dashboard sections have `role="region"` and `aria-label` attributes
- Print styles collapse the layout for screen-reader-friendly output

---

## 8. Scaling Plan

### 8.1 Current Bottlenecks

| Component | Current Limit | Reason |
|-----------|--------------|--------|
| GitHub API | 60 req/hr | Unauthenticated |
| Python NLP | ~5 req/min | spaCy load time + sequential |
| PDF processing | <5 MB | Browser memory |
| Data storage | sessionStorage (~5 MB) | Browser API limit |

### 8.2 Redis Caching Layer

```python
# Pseudocode for caching GitHub profiles
import redis
import json
import hashlib

r = redis.Redis(host='localhost', port=6379, db=0)

def get_github_cached(username: str) -> dict | None:
    key  = f"github:profile:{username}"
    data = r.get(key)
    if data:
        return json.loads(data)
    return None

def set_github_cached(username: str, data: dict):
    key = f"github:profile:{username}"
    r.setex(key, 3600, json.dumps(data))  # 1 hour TTL

# For NLP results: hash the CV content + role
def nlp_cache_key(file_bytes: bytes, role: str) -> str:
    digest = hashlib.md5(file_bytes + role.encode()).hexdigest()
    return f"nlp:cache:{digest}"
```

### 8.3 Load Balancing

For horizontal scaling beyond a single server:

```
                    ┌─────────────────┐
Users ────────────► │  Nginx/Caddy    │
                    │  (load balancer)│
                    │  + SSL termination│
                    └─────────────────┘
                      │    │    │
              ┌───────┘    │    └────────┐
              ▼            ▼             ▼
         Flask pod 1  Flask pod 2  Flask pod 3
         (NLP engine) (NLP engine) (NLP engine)
              │            │             │
              └────────────┼─────────────┘
                           │
                    ┌──────▼──────┐
                    │   Redis     │  (shared cache, sessions)
                    └─────────────┘
                           │
                    ┌──────▼──────┐
                    │  MongoDB    │  (analysis storage)
                    │  (replica   │
                    │   set)      │
                    └─────────────┘
```

NLP models (spaCy, sklearn) are loaded once per pod at startup.  Session affinity
is NOT required because Redis holds session state (analysis results cache).

### 8.4 Docker Containerisation

```dockerfile
# Dockerfile for Python NLP backend
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for PyMuPDF
RUN apt-get update && apt-get install -y \
    libmupdf-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy and install Python dependencies
COPY python/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Download spaCy model at build time (not runtime — improves cold start)
RUN python -m spacy download en_core_web_sm

# Copy application code
COPY python/ ./python/
COPY data/   ./data/

WORKDIR /app/python

# Non-root user for security
RUN useradd --create-home appuser
USER appuser

EXPOSE 5000

# Use gunicorn for production (not Flask dev server)
CMD ["gunicorn", \
     "--workers", "4", \
     "--worker-class", "sync", \
     "--timeout", "120", \
     "--bind", "0.0.0.0:5000", \
     "cv_analyzer:app"]
```

```yaml
# docker-compose.yml for local development stack
version: "3.9"
services:
  api:
    build: .
    ports:
      - "5000:5000"
    environment:
      - GITHUB_TOKEN=${GITHUB_TOKEN}
      - FLASK_DEBUG=true
    volumes:
      - ./data:/app/data:ro

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  mongo:
    image: mongo:7
    ports:
      - "27017:27017"
    volumes:
      - mongo_data:/data/db

volumes:
  mongo_data:
```

### 8.5 Production Deployment Checklist

Before going live with the Python backend:

- [ ] Replace Flask dev server with gunicorn (4 sync workers per CPU core)
- [ ] Enable Redis caching for GitHub profiles and NLP results
- [ ] Set `GITHUB_TOKEN` environment variable (increases rate limit 83×)
- [ ] Configure `MAX_CONTENT_LENGTH = 10 * 1024 * 1024` (10 MB)
- [ ] Restrict CORS from `*` to specific allowed origins
- [ ] Enable HTTPS via reverse proxy (Nginx/Caddy) — never run Flask on HTTPS directly
- [ ] Set `FLASK_DEBUG=false` in production
- [ ] Add rate limiting middleware (Flask-Limiter) to protect `/api/analyze`
- [ ] Configure MongoDB Atlas connection string (or self-hosted replica set)
- [ ] Set up health check endpoint monitoring (GET /api/health)
- [ ] Add Sentry or similar error tracking

### 8.6 Estimated Infrastructure Costs (Starter)

| Service | Tier | Monthly Cost |
|---------|------|-------------|
| Vercel (static frontend) | Hobby (free) | $0 |
| Railway / Render (Python API) | Starter | ~$5–$7 |
| MongoDB Atlas (M0 free cluster) | Free | $0 |
| Redis (Upstash serverless) | Free tier | $0 |
| GitHub API | Public (60 req/hr) | $0 |
| **Total** | | **~$5–$7/month** |

Upgrading to handle 1,000+ analyses/day:
- Switch to Railway Pro or dedicated VPS (~$20/month)
- MongoDB Atlas M10 shared cluster (~$57/month)
- Upstash Redis Pay-per-request (~$0.20/100K commands)
- Total: ~$80/month

---

*End of document*

*This integration plan is a design document for the SMARRTIF AI CV Analyzer
internship project.  All mock data and cost estimates are illustrative.
Real API credentials must be obtained from the respective providers before
any live integration is deployed.*
