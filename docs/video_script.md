# Demo Video Script — SMARRTIF AI CV Analyzer
## AI Tool Developer Intern | Internship Assignment Submission

**Total runtime:** 8–10 minutes  
**Recording format:** Screen share + face cam (optional)  
**Tools needed:** Browser (index.html open), VS Code, terminal

---

> **Before you start recording:**
> - Open `index.html` in your browser (via Live Server or `python -m http.server 8080`)
> - Open VS Code with the `cv-analyzer` folder
> - Have a terminal ready in the `python/` directory
> - Have Kshitiz Sharma's CV PDF ready for upload
> - Set browser zoom to 100%, resolution to 1920×1080
> - Close all notifications

---

## SECTION 1 — Introduction (60 seconds)

[SCREEN: blank or a title card with "SMARRTIF AI CV Analyzer"]

---

"Hello, and welcome to the demo of my internship project —
the **AI-powered CV Analyzer**, built for **SMARRTIF AI**.

My name is Kshitiz Sharma, and I'm submitting this as my final
deliverable for the AI Tool Developer Internship.

[PAUSE 1 second]

The problem this tool solves is simple but impactful:
most candidates don't know *why* they're not getting callbacks.
They submit a CV and hear nothing.
Our tool gives them instant, data-driven feedback —
scoring their CV across six dimensions,
detecting skill gaps against industry benchmarks,
and recommending exactly what to learn next.

[PAUSE 1 second]

The tool works entirely in the browser — no backend required,
no data leaves your device.
There's also an optional Python NLP backend powered by spaCy
and scikit-learn for deeper analysis.

[PAUSE 1 second]

Let me start by walking through the architecture,
then we'll run a live demo, and finally I'll show you the code."

---

## SECTION 2 — Architecture Walkthrough (90 seconds)

[SCREEN: VS Code — show the folder tree in the sidebar]

---

"Let's look at the project structure.

[POINT: index.html and dashboard.html]

The app has two HTML pages.
`index.html` is where the user uploads their CV and triggers the analysis.
`dashboard.html` is the results page.
These two pages communicate through the browser's `sessionStorage` —
`index.html` runs the full analysis pipeline and stores the result as JSON,
then redirects to the dashboard which only reads and renders.

[POINT: js/ folder]

Inside the `js` folder we have five modules.
`parser.js` handles PDF text extraction using PDF.js.
`scorer.js` implements the 6-dimension weighted scoring model.
`recommender.js` maps skill gaps to SMARRTIF AI course recommendations.
`github.js` calls the live GitHub REST API to analyse a candidate's portfolio.
And `app.js` orchestrates the entire pipeline.

[POINT: python/ folder]

The `python` folder contains the NLP backend.
`nlp_engine.py` uses spaCy and NLTK for entity extraction and PhraseMatcher
for skill detection.
`scorer.py` adds TF-IDF blending and ATS simulation.
`cv_analyzer.py` is the Flask server that exposes five REST endpoints.

[POINT: data/ folder]

And the `data` folder holds two JSON files:
`role_profiles.json` defines the benchmarks for each role —
required skills, education keywords, scoring weights —
and `recommendations.json` maps each skill gap to a specific course
and SMARRTIF AI service recommendation.

This three-layer architecture — frontend, NLP engine, data layer —
keeps concerns cleanly separated."

---

## SECTION 3 — Live Demo Part 1: Upload and Analysis (2 minutes)

[SCREEN: index.html open in browser — full page visible]

---

"Let's run a live demo.

This is the main dashboard — the landing page of the CV Analyzer.

[POINT: hero card]

At the top we have the hero section with the animated orbit rings —
purely decorative, showing that analysis is powered by AI.

[POINT: stat cards]

Below that are four stat cards — these are placeholder stats for the
SMARRTIF AI platform dashboard context.

[POINT: upload card on the left]

The main interaction is in this upload card on the left.
I'll drag and drop a CV file here, or I can click Browse Files.

[CLICK: Browse Files — select Kshitiz Sharma's CV PDF]

"I'm uploading my CV — a Data Scientist profile."

[SCREEN: file appears in the dropzone with filename and size]

"Great — the CV has been selected.
You can see the filename and file size displayed.

[POINT: role dropdown]

Now I select the target role.
I'm going for Data Scientist.

[SELECT: 'Data Scientist' in the dropdown]

[POINT: GitHub input field]

Optionally, I can add my GitHub profile URL.
This will trigger a live API call to GitHub to score my portfolio.

[TYPE: https://github.com/kshitiz-sharma in the GitHub field]
[Note: replace with actual GitHub username if different]

[POINT: Analyze CV button]

Now I click Analyze.

[CLICK: Analyze CV button]

[SCREEN: loading overlay appears with 4-step animation]

Watch the loading overlay —
Step 1: Extracting CV text using PDF.js
Step 2: Running NLP analysis — skill detection, experience extraction
Step 3: Calculating scores — running the weighted formula
Step 4: Generating recommendations — matching gaps to our course catalogue

And at the same time, it's making a live API call to GitHub
to fetch my repository data.

The whole pipeline runs in under 3 seconds for a typical CV."

[SCREEN: loading completes, progress bar fills to 100%, then redirects]

---

## SECTION 4 — Live Demo Part 2: Dashboard Walkthrough (2 minutes)

[SCREEN: dashboard.html — full results page]

---

"And here's the results dashboard.

[POINT: score ring at top]

The large circular ring at the top shows the overall CV score —
in this case, let's say I scored 69.6 out of 100,
which puts me in the 'Good' band.

The score is computed using a weighted formula across 6 dimensions.
For a Data Scientist role, Skills carries the most weight at 35%.

[POINT: dimension mini-bars below the ring]

Below the ring you can see all six dimensions and their individual scores:
Skills, Experience, Education, Projects, Certifications,
and Profile Completeness.

Each bar is colour-coded — green for Excellent, blue for Good,
amber for Fair, orange for Developing, red for Needs Work.

[POINT: radar chart — right side of screen]

On the right, the radar chart gives a visual shape of the candidate profile.
A balanced hexagon means well-rounded.
My profile shows a slight weakness in Certifications —
I haven't listed industry certifications in my CV.

[SCROLL DOWN: to skills section]

This section shows detected skills on the left —
all the skills our NLP engine found in the CV text —
and missing skills on the right — the gaps against the Data Scientist profile.

[POINT: a detected skill chip]

Each detected skill chip is shown in green.
The missing skills are shown in red — these are the recommended focus areas.

[SCROLL DOWN: to recommendations section]

Here are the prioritised recommendations.
High priority gaps appear first, sorted by estimated learning time —
so quick wins come before long courses.

Each recommendation card shows the skill name,
what the gap means for this role,
a specific course suggestion,
and the estimated hours to bridge the gap.

[SCROLL DOWN: to action plan]

The 3-step action plan at the bottom distils the top 3 high-priority gaps
into concrete next steps, with a total estimated timeline in weeks.

[POINT: SMARRTIF AI service card]

And finally — the SMARRTIF AI service recommendation.
Based on my score of 69.6, I'm in the Skill Enhancement tier,
which maps to a specific SMARRTIF AI programme.
This is the direct connection between the CV analysis and the business offering."

---

## SECTION 5 — Code Walkthrough (2 minutes)

[SCREEN: VS Code — open js/parser.js]

---

"Let me show you the key code behind the analysis.

[SCROLL TO: extractSkills method in parser.js, around line 80]

This is the `_extractSkills` method in `CVParser`.
It scans the CV text against a master skill list of 85+ skills.

[POINT: the skill matching loop]

For each skill in the list, we use a word-boundary regex —
`\b` for multi-word skills like 'machine learning',
and a stricter no-adjacent-letter pattern for single-character skills
like 'R' or 'Go', to avoid matching inside words like 'infrastructure'.

[SCREEN: VS Code — open js/scorer.js]

Now let's look at the scorer.

[SCROLL TO: calculateWeightedTotal or the skills scoring section]

The `_scoreSkills` method implements bidirectional substring matching.
We check both directions — does the skill appear in the detected skills,
AND does any detected skill appear in the skill name.
This handles common variations without needing a synonym dictionary.

[POINT: the weighted total calculation]

And `calculateWeightedTotal` applies the formula:
for each dimension, multiply the dimension score by its weight,
divide by 100, and sum.
Simple, deterministic, auditable.

[SCREEN: VS Code — open python/nlp_engine.py]

Now let's look at the Python NLP engine for comparison.

[SCROLL TO: extract_skills_nlp method, around line 150]

This is `extract_skills_nlp` in `CVNLPEngine`.
It runs two strategies.

[POINT: PhraseMatcher block]

First, the spaCy PhraseMatcher.
We pre-compiled 200 skill patterns into the matcher at startup.
A single call to `self._matcher(doc)` finds all matches in one pass —
much faster than running 200 regex patterns separately.
Matches from the PhraseMatcher get a confidence score of 0.95.

[POINT: NLTK stemming block]

Second, the NLTK stemming fallback.
We stem every content word in the CV using PorterStemmer,
then check if the stemmed version matches any skill in our vocabulary.
This catches morphological variants — 'containerising' maps to 'container'
which maps to the Docker skill.
Stemming matches get a lower confidence of 0.60.

The result is a list of skills with confidence scores,
allowing downstream filtering by threshold."

---

## SECTION 6 — Recommendation Engine (1 minute)

[SCREEN: VS Code — open js/recommender.js]

---

"The recommendation engine is deliberately rule-based, not ML-based.

[SCROLL TO: generate method]

It loads the 32 entries in `recommendations.json`,
filters out skills already detected in the CV,
then sorts the remaining gaps by priority — high first —
and within each priority tier, by estimated hours ascending,
so the quickest wins appear first.

[POINT: service tier logic]

The SMARRTIF AI service tier is assigned by score threshold:
90-100 maps to Expert Mentorship,
76-89 to Advanced Specialisation,
60-75 to Skill Enhancement,
and 0-59 to Intensive Training.

[POINT: action plan generation]

The action plan takes the top 3 high-priority gaps
and formats them as concrete steps with estimated completion times.

The simplicity is intentional —
rule-based systems are explainable,
which matters when giving career advice."

---

## SECTION 7 — GitHub Integration (30 seconds)

[SCREEN: dashboard.html — scroll to GitHub card]

---

"The GitHub card on the dashboard shows the live API results.

[POINT: GitHub score ring]

This mini score ring shows the GitHub profile score —
computed from repository count, total stars, language diversity,
account age, and follower count.

[POINT: language chips]

The detected languages are shown as chips,
and any skills inferred from GitHub topics —
like 'machine-learning' topic mapping to the 'Machine Learning' skill —
are merged into the main detected skills list before scoring.

Unlike LinkedIn and Tableau which are mock integrations,
GitHub is fully live —
it calls `api.github.com` in real time.

[POINT: terminal briefly]

[SHOW: terminal with python run.py running — briefly]

The Python backend has a `GitHubAPIHelper` class that wraps the same
API calls and handles rate limiting, error messages,
and the 60-request-per-hour unauthenticated limit gracefully."

---

## SECTION 8 — Ethical AI (30 seconds)

[SCREEN: browser — scroll to score breakdown on dashboard]

---

"Before I close, a quick note on the ethical AI design.

[POINT: dimension weights visible on dashboard]

Every scoring weight is visible on the dashboard.
There are no hidden signals.

The model scores only skills, experience years, degree level,
project count, certifications, and contact completeness.

It explicitly does not use name, nationality, institution prestige,
graduation year for age inference, or any other demographic signal.

The CV text is stripped before sessionStorage storage —
raw text never persists.

And the output is clearly labelled as an advisory self-assessment tool,
not a hiring decision system.

The full ethical AI and GDPR compliance notes are documented
in `docs/architecture.md`."

---

## SECTION 9 — Closing (30 seconds)

[SCREEN: back to full dashboard with score visible]

---

"To summarise what I've built:

A two-page browser application with a Python NLP backend,
implementing a 6-dimension weighted CV scoring model,
live GitHub API integration,
32 skill-gap recommendations mapped to SMARRTIF AI services,
and an ethical-first scoring design with full transparency.

Planned improvements include semantic skill matching
with sentence transformer embeddings,
a fine-tuned BERT model for section classification,
and real LinkedIn OAuth integration.

Thank you to SMARRTIF AI for this internship opportunity.
This project has given me hands-on experience in
NLP engineering, REST API design, and building tools
that have real impact on people's career outcomes.

[PAUSE]

The full source code, documentation, and API integration plan
are available in the project repository.

Thank you for watching."

[SCREEN: fade to project repository or title card]

---

> **Post-recording checklist:**
> - Trim dead air at start/end
> - Ensure code is readable at 1080p (font size ≥ 16px in VS Code)
> - Add captions/subtitles for accessibility
> - Export at 1080p 30fps, H.264
> - File name: `smarrtif_ai_cv_analyzer_demo.mp4`
