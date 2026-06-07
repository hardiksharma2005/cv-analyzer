# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development

**No build step.** Serve the project root with any static file server:

```bash
# Python
python -m http.server 8080

# Node
npx serve .

# VS Code — right-click index.html → Open with Live Server
```

**Deploy to Vercel:**
```bash
npx vercel deploy
```

`vercel.json` configures static hosting with security headers and 1-hour cache on `/data/` JSON files.

## Architecture

Two-page static app. All JavaScript runs entirely in the browser — no backend, no build tool, no framework.

### Page flow

```
index.html  ──[app.js runs pipeline]──►  sessionStorage["analysis_results"]
                                                  │
                                                  ▼
                                         dashboard.html
                                    (reads & renders; never re-runs pipeline)
```

### Script load order (both pages — order is critical)

```html
pdf.js CDN          ← must come before parser.js sets the worker URL
chart.js CDN        ← only used by dashboard.html radar chart
js/parser.js
js/scorer.js
js/recommender.js
js/github.js
js/app.js
```

All classes are exposed as `window.*` globals (no ES modules). `app.js` does **not** auto-init — `index.html` calls `CVAnalyzerApp.init()` on `DOMContentLoaded`.

### JS module responsibilities

| File | Class | Role |
|------|-------|------|
| `js/parser.js` | `CVParser` | PDF.js text extraction; regex section splitting; master skill list scan; experience/education/project/cert detection |
| `js/scorer.js` | `CVScorer` | Fetches `data/role_profiles.json`; 6-dimension weighted scoring; score labels and colors |
| `js/recommender.js` | `RecommendationEngine` | Fetches `data/recommendations.json`; skill→course mapping; SMARRTIF AI service tier selection; action plan generation |
| `js/github.js` | `GitHubAnalyzer` | GitHub REST API (unauthenticated, 60 req/hr limit); language/topic→skill mapping; profile score |
| `js/app.js` | `CVAnalyzerApp` | Orchestrates the full pipeline on `index.html`; writes `analysis_results` to sessionStorage; redirects |

### sessionStorage contract

`app.js` writes one key after a successful analysis:

```js
sessionStorage.setItem('analysis_results', JSON.stringify({
  filename,          // string
  role,              // "Data Scientist" | "Data Analyst" | "Software Engineer" | "Business Analyst"
  parsedCV,          // CVParser output (raw_text stripped to save space)
  scores,            // CVScorer output — includes dimensions.{skills,experience,education,projects,certifications,profile_completeness}
  recommendations,   // RecommendationEngine output
  github,            // GitHubAnalyzer output, or null
  timestamp,         // Date.now()
  isDemo,            // false
}));
```

`dashboard.html` reads this key. If absent or unparseable it falls back to `DEMO_RESULTS` (hardcoded at the top of the dashboard script).

### Scoring model

Each role in `data/role_profiles.json` carries a `scoring_weights` object whose values sum to 100. `CVScorer.calculateWeightedTotal` applies `Σ (dimension_score × weight / 100)`. Weights deliberately differ per role (e.g. Software Engineer has `projects: 20`; Business Analyst has `certifications: 10`).

The 6 dimensions and their scoring logic:
- **skills** — bidirectional fuzzy substring match; required skills worth 85%, nice-to-have 15%
- **experience** — three-zone linear scale around `min_experience_years`; partial credit below minimum
- **education** — degree level (80%) + field-keyword relevance (20%); level 0–5 maps to 20–100
- **projects** — step scale on count + 15-point GitHub bonus
- **certifications** — relaxed substring match against `key_certifications` list
- **profile_completeness** — computed entirely in `CVParser`; not re-scored

### Data files

`data/role_profiles.json` — role benchmarks. Adding a new role requires a matching `<option>` in both HTML files' `#roleSelect`.

`data/recommendations.json` — `skill_recommendations` array. Each entry needs `skill`, `gap_recommendation`, `course_suggestion`, `priority` (`high`/`medium`/`low`), and `estimated_hours`. The recommender does bidirectional substring matching on `skill`, so canonical lowercase names are important.

### CSS design tokens

All colours, radii, shadows, and transitions live as CSS custom properties in `css/style.css` `:root`. Dashboard-specific and index-specific styles live in inline `<style>` blocks within each HTML file rather than in `style.css`.

Key tokens: `--primary: #6C3FC5`, `--secondary: #00B4D8`, `--gradient: linear-gradient(135deg, #6C3FC5, #00B4D8)`, `--bg: #f0f2f7`, `--card-bg: #ffffff`.

### PDF parsing notes

`CVParser._extractPdfText` uses PDF.js and reconstructs line breaks by comparing vertical `y` coordinates of adjacent text items (gap > 5px = new line). `_extractDocxText` first tries `<w:t>` XML tag extraction, then falls back to printable-ASCII run extraction — the fallback is lossy for complex DOCX formatting.

The master skill list in `CVParser` uses word-boundary regex for multi-word skills and a stricter no-adjacent-letter pattern for single-character skills (`r`, `go`) to avoid false matches inside other words.
