/**
 * js/parser.js — CV Parsing Engine
 * SMARRTIF AI CV Analyzer
 *
 * Extracts structured data from uploaded CV files (PDF / DOCX).
 * PDF text is extracted via PDF.js; DOCX is handled by reading the
 * embedded XML text from the ZIP archive using native browser APIs.
 *
 * Usage:
 *   const parser = new CVParser();
 *   const result = await parser.parseFile(file);  // File object from <input>
 */

/* ─── Configure PDF.js worker to match the CDN version ─── */
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

class CVParser {

  constructor() {
    /**
     * MASTER_SKILLS — canonical list used for skill detection across all roles.
     * 80+ terms covering languages, frameworks, platforms, methodologies, and tools.
     * Ordered by category for maintainability; matching is case-insensitive.
     *
     * When adding new skills: prefer the canonical lowercase form users write on CVs.
     * Multi-word skills (e.g. "machine learning") use fuzzy substring matching.
     */
    this.MASTER_SKILLS = [
      /* ── Programming Languages ── */
      'python', 'r', 'sql', 'javascript', 'typescript', 'java', 'scala',
      'go', 'rust', 'c++', 'c#', 'kotlin', 'swift', 'bash', 'shell',

      /* ── Core ML / DL ── */
      'machine learning', 'deep learning', 'neural networks',
      'reinforcement learning', 'supervised learning', 'unsupervised learning',
      'transfer learning', 'gradient boosting', 'random forest',
      'tensorflow', 'pytorch', 'keras', 'scikit-learn',
      'xgboost', 'lightgbm', 'catboost',

      /* ── Data Science & Analysis ── */
      'pandas', 'numpy', 'matplotlib', 'seaborn', 'scipy', 'statsmodels',
      'statistics', 'probability', 'linear algebra', 'calculus',
      'feature engineering', 'feature selection', 'dimensionality reduction',
      'time series', 'forecasting', 'a/b testing', 'hypothesis testing',
      'data analysis', 'exploratory data analysis', 'eda',

      /* ── NLP & Generative AI ── */
      'nlp', 'natural language processing', 'spacy', 'nltk',
      'transformers', 'hugging face', 'bert', 'gpt', 'llm',
      'large language models', 'langchain', 'llamaindex',
      'prompt engineering', 'retrieval-augmented generation', 'rag',
      'vector databases', 'embeddings',

      /* ── Vector Stores / ML Ops ── */
      'pinecone', 'chromadb', 'weaviate', 'faiss', 'pgvector',
      'mlflow', 'wandb', 'weights & biases', 'mlops',
      'model deployment', 'model monitoring', 'model registry',

      /* ── Visualization & BI ── */
      'tableau', 'power bi', 'looker', 'metabase', 'superset',
      'excel', 'google sheets', 'data visualization', 'business intelligence',
      'dashboard', 'reporting',

      /* ── Databases ── */
      'postgresql', 'mysql', 'sqlite', 'mongodb', 'redis',
      'elasticsearch', 'snowflake', 'bigquery', 'redshift',
      'databricks', 'cassandra', 'neo4j', 'dynamodb',

      /* ── Data Engineering ── */
      'etl', 'elt', 'data pipeline', 'data warehouse', 'data lake',
      'dbt', 'apache airflow', 'airflow', 'apache spark', 'spark',
      'hadoop', 'kafka', 'flink', 'data modeling',

      /* ── Cloud Platforms ── */
      'aws', 'azure', 'gcp', 'google cloud', 'cloud computing',

      /* ── DevOps / Infrastructure ── */
      'docker', 'kubernetes', 'terraform', 'ansible', 'pulumi',
      'ci/cd', 'github actions', 'jenkins', 'gitlab ci',
      'infrastructure as code', 'linux', 'unix',

      /* ── Backend & APIs ── */
      'rest api', 'graphql', 'grpc', 'microservices', 'fastapi',
      'flask', 'django', 'node.js', 'express',
      'spring boot', 'system design',

      /* ── Frontend ── */
      'react', 'vue', 'angular', 'html', 'css',

      /* ── Computer Vision ── */
      'opencv', 'computer vision', 'image classification',
      'object detection', 'yolo', 'convolutional networks',

      /* ── Version Control & Collaboration ── */
      'git', 'github', 'gitlab', 'bitbucket',

      /* ── Methodology & Tools ── */
      'agile', 'scrum', 'kanban', 'jira', 'confluence',
      'figma', 'notion', 'product management',
    ];
  }

  /* ═══════════════════════════════════════════════════════════
     parseFile(file) — Public entry point
     Detects file type, extracts raw text, returns a structured
     CV object ready for the scoring engine.
  ═══════════════════════════════════════════════════════════ */
  async parseFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    let rawText = '';

    try {
      if (ext === 'pdf') {
        rawText = await this._extractPdfText(file);
      } else {
        // DOCX / DOC: unpack embedded XML and pull readable text
        rawText = await this._extractDocxText(file);
      }
    } catch (err) {
      console.error('[CVParser] Extraction failed:', err);
    }

    // Normalise whitespace for consistent downstream regex matching
    rawText = rawText.replace(/\r\n/g, '\n').replace(/[ \t]{2,}/g, ' ').trim();

    if (rawText.length < 50) {
      return { error: 'Could not extract readable text from this file. Try pasting your CV as plain text.' };
    }

    const sections    = this.extractSections(rawText);
    const skills      = this.extractSkills(rawText);
    const experience  = this.extractExperience(rawText);
    const education   = this.extractEducation(rawText);
    const projects    = this.extractProjects(rawText);
    const certs       = this.extractCertifications(rawText);
    const completeness = this.calculateProfileCompleteness(sections);

    return {
      raw_text:             rawText,
      char_count:           rawText.length,
      word_count:           rawText.split(/\s+/).filter(Boolean).length,
      sections,
      skills,
      experience,
      education,
      projects,
      certifications:       certs,
      profile_completeness: completeness,
    };
  }

  /* ═══════════════════════════════════════════════════════════
     _extractPdfText(file)
     Uses PDF.js to iterate pages and join all text items.
     PDF.js renders each page's text content as an array of
     {str, transform} items; we join them preserving line breaks.
  ═══════════════════════════════════════════════════════════ */
  async _extractPdfText(file) {
    if (typeof pdfjsLib === 'undefined') {
      throw new Error('PDF.js library not loaded. Include the CDN script before parser.js.');
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    const pageStrings = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page    = await pdf.getPage(pageNum);
      const content = await page.getTextContent();

      /* Reconstruct line breaks by comparing vertical (y) position
         of consecutive text items — large y-gaps indicate a new line. */
      let prevY = null;
      const lineBuffer = [];
      let currentLine  = '';

      for (const item of content.items) {
        if (!item.str) continue;

        const y = item.transform[5]; // vertical position

        if (prevY !== null && Math.abs(y - prevY) > 5) {
          lineBuffer.push(currentLine.trim());
          currentLine = '';
        }
        currentLine += item.str + ' ';
        prevY = y;
      }
      if (currentLine.trim()) lineBuffer.push(currentLine.trim());

      pageStrings.push(lineBuffer.join('\n'));
    }

    return pageStrings.join('\n\n--- Page Break ---\n\n');
  }

  /* ═══════════════════════════════════════════════════════════
     _extractDocxText(file)
     A DOCX file is a ZIP archive containing word/document.xml.
     We use the browser FileReader to read the binary, then extract
     all text between <w:t> XML tags — the actual paragraph text nodes.
     Falls back to ASCII-run extraction if the approach yields too little.
  ═══════════════════════════════════════════════════════════ */
  async _extractDocxText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const binary = e.target.result;

          /* Strategy 1: Extract <w:t>…</w:t> XML text nodes.
             DOCX XML stores all paragraph text in <w:t> elements. */
          const wtMatches = binary.match(/<w:t[^>]*>([^<]+)<\/w:t>/g);
          if (wtMatches && wtMatches.length > 10) {
            const text = wtMatches
              .map(tag => tag.replace(/<[^>]+>/g, ''))
              .join(' ')
              .replace(/\s{2,}/g, '\n');
            return resolve(text);
          }

          /* Strategy 2: Fallback — extract printable ASCII runs ≥ 4 chars.
             Less accurate but handles older DOC formats without XML structure. */
          const runs = [];
          let run = '';
          for (let i = 0; i < Math.min(binary.length, 500_000); i++) {
            const code = binary.charCodeAt(i);
            if (code >= 32 && code < 127) {
              run += binary[i];
            } else {
              if (run.length >= 4) runs.push(run.trim());
              run = '';
            }
          }
          if (run.length >= 4) runs.push(run.trim());

          const text = runs
            .filter(r => !/^[<>\\/\[\]{}=@]+$/.test(r)) // discard pure XML/binary noise
            .join(' ')
            .replace(/\s{3,}/g, '\n');

          resolve(text);
        } catch (err) {
          reject(err);
        }
      };

      reader.onerror = reject;
      reader.readAsBinaryString(file);
    });
  }

  /* ═══════════════════════════════════════════════════════════
     extractSections(rawText)
     Splits the raw CV text into named sections by detecting
     common heading patterns. Returns an object keyed by section.

     Detection heuristic: a heading is a short line (< 50 chars)
     with no trailing sentence punctuation that matches a known
     section keyword regex.
  ═══════════════════════════════════════════════════════════ */
  extractSections(rawText) {
    const sectionDefs = [
      { key: 'contact_info',   regex: /^(?:contact|personal\s*(?:info(?:rmation)?|details?)|about\s*me)$/i },
      { key: 'summary',        regex: /^(?:summary|profile|objective|about|overview|introduction|executive\s*summary|professional\s*(?:summary|profile))$/i },
      { key: 'skills',         regex: /^(?:skills?|technical\s*skills?|competenc(?:y|ies)|technologies|tech(?:nical)?\s*stack|tools?\s*(?:&|and)\s*technologies?)$/i },
      { key: 'experience',     regex: /^(?:(?:work|professional|relevant)\s*)?(?:experience|history|employment|career|positions?|roles?)$/i },
      { key: 'education',      regex: /^(?:education(?:al)?\s*(?:background|history)?|academic(?:s|\s*background)?|qualifications?|degrees?|universities?)$/i },
      { key: 'projects',       regex: /^(?:(?:key|personal|side|notable)\s*)?projects?(?:\s*&\s*portfolio)?$|^portfolio$/i },
      { key: 'certifications', regex: /^(?:certifications?|licen[sc]es?|credentials?|courses?\s*(?:&|and)\s*certifications?|training|achievements?)$/i },
    ];

    const sections = Object.fromEntries(
      ['contact_info','summary','skills','experience','education','projects','certifications','other']
        .map(k => [k, []])
    );

    const lines = rawText.split('\n');
    let current = 'other';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) { sections[current].push(''); continue; }

      /* Candidate heading: short, no sentence-ending punctuation,
         and doesn't start with a bullet/number list marker */
      const isHeadingCandidate =
        trimmed.length < 55 &&
        !/[.?!,;]$/.test(trimmed) &&
        !/^[-•*\d]/.test(trimmed);

      if (isHeadingCandidate) {
        const matched = sectionDefs.find(({ regex }) => regex.test(trimmed));
        if (matched) {
          current = matched.key;
          continue; // omit the heading line from section body
        }
      }

      sections[current].push(trimmed);
    }

    // Convert arrays to trimmed strings
    return Object.fromEntries(
      Object.entries(sections).map(([k, lines]) => [k, lines.join('\n').trim()])
    );
  }

  /* ═══════════════════════════════════════════════════════════
     extractSkills(text)
     Scans the full CV text against the master skills list.
     Uses word-boundary-aware regex to avoid false matches
     (e.g. "r" should not match inside "infrastructure").

     Returns { detected[], count, coverage_pct }
  ═══════════════════════════════════════════════════════════ */
  extractSkills(text) {
    const lower    = text.toLowerCase();
    const detected = [];

    for (const skill of this.MASTER_SKILLS) {
      if (detected.includes(skill)) continue;

      const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      /* Very short skills (≤ 2 chars) need stricter boundary checks
         to avoid e.g. "r" matching "performance" or "infrastructure". */
      const pattern = skill.length <= 2
        ? new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, 'i')
        : new RegExp(`\\b${escaped}\\b`, 'i');

      if (pattern.test(lower)) {
        detected.push(skill);
      }
    }

    return {
      detected,
      count:        detected.length,
      coverage_pct: Math.round((detected.length / this.MASTER_SKILLS.length) * 100),
    };
  }

  /* ═══════════════════════════════════════════════════════════
     extractExperience(text)
     Detects years of experience from two patterns:
       1. Explicit: "5 years of experience" / "5+ years"
       2. Date ranges: "Jan 2019 – Mar 2023", "2020–Present"

     For date ranges, overlapping periods are NOT de-duplicated
     (a simple sum is used) — this is intentional because CVs
     typically list sequential roles, not concurrent ones.

     Returns { years, months, entries[], confidence, method }
  ═══════════════════════════════════════════════════════════ */
  extractExperience(text) {
    /* ── Strategy 1: Explicit "X years" statement ── */
    const explicitPattern = /(\d+(?:\.\d+)?)\s*\+?\s*years?\s*(?:of\s+)?(?:experience|exp\.?|work(?:ing)?)/gi;
    const explicitMatches = [...text.matchAll(explicitPattern)];

    if (explicitMatches.length > 0) {
      // Use the largest number found (most likely the total)
      const years = Math.max(...explicitMatches.map(m => parseFloat(m[1])));
      return {
        years,
        months:     Math.round(years * 12),
        entries:    explicitMatches.map(m => m[0]),
        confidence: 'high',
        method:     'explicit_statement',
      };
    }

    /* ── Strategy 2: Date range parsing ── */
    const MONTH_MAP = {
      jan:1,january:1, feb:2,february:2, mar:3,march:3,
      apr:4,april:4,   may:5,            jun:6,june:6,
      jul:7,july:7,    aug:8,august:8,   sep:9,september:9,
      oct:10,october:10, nov:11,november:11, dec:12,december:12,
    };

    const now        = new Date();
    const curYear    = now.getFullYear();
    const curMonth   = now.getMonth() + 1;

    /*
     * Pattern captures optional month name before each year, and accepts
     * em-dash, en-dash, hyphen, or "to" as range separators.
     * Examples matched: "Jan 2019 – Mar 2023", "2020-2022", "June 2021 to Present"
     */
    const rangeRe = /(?:([a-z]+)\s+)?(\d{4})\s*(?:–|—|-|to)\s*(?:([a-z]+)\s+)?(\d{4}|present|current|now)/gi;
    const matches = [...text.matchAll(rangeRe)];

    let totalMonths = 0;
    const entries   = [];
    const seen      = new Set();

    for (const m of matches) {
      const startMonthStr = (m[1] || '').toLowerCase();
      const startYear     = parseInt(m[2]);
      const endMonthStr   = (m[3] || '').toLowerCase();
      const endRaw        = m[4].toLowerCase();

      // Sanity-check the year
      if (startYear < 1970 || startYear > curYear + 1) continue;

      const startMonth = MONTH_MAP[startMonthStr] || 1;
      let   endYear, endMonth;

      if (['present', 'current', 'now'].includes(endRaw)) {
        endYear  = curYear;
        endMonth = curMonth;
      } else {
        endYear  = parseInt(endRaw);
        if (endYear < startYear || endYear > curYear + 1) continue;
        endMonth = MONTH_MAP[endMonthStr] || 12;
      }

      const key = `${startYear}${startMonth}:${endYear}${endMonth}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const months = (endYear - startYear) * 12 + (endMonth - startMonth);
      if (months > 0 && months < 480) { // cap at 40 years
        totalMonths += months;
        entries.push(m[0]);
      }
    }

    const years = parseFloat((totalMonths / 12).toFixed(1));
    return {
      years,
      months:     totalMonths,
      entries,
      confidence: entries.length > 0 ? 'medium' : 'low',
      method:     'date_range',
    };
  }

  /* ═══════════════════════════════════════════════════════════
     extractEducation(text)
     Detects highest degree level and relevant field of study.
     Degree levels are assigned a numeric value (1–5) so the
     scorer can apply a continuous scale rather than a lookup.

     Returns { degree_level, degree_label, field, all_fields, keywords_found }
  ═══════════════════════════════════════════════════════════ */
  extractEducation(text) {
    /* Degree definitions ordered highest → lowest.
       The first match at the highest level wins. */
    const DEGREES = [
      { level: 5, label: 'PhD / Doctorate',  pattern: /\b(?:ph\.?d\.?|doctorate|d\.phil|doctor\s+of\s+philosophy)\b/i },
      { level: 4, label: 'Masters',          pattern: /\b(?:m\.?s\.?c?\.?|master(?:'?s)?|m\.?eng\.?|mba|m\.?b\.?a\.?|mtech|m\.?phil\.?|postgraduate\s+(?:diploma|degree))\b/i },
      { level: 3, label: 'Bachelors',        pattern: /\b(?:b\.?s\.?c?\.?|b\.?eng\.?|bachelor(?:'?s)?|b\.?tech\.?|b\.?a\.?|undergraduate|honours?\s+degree)\b/i },
      { level: 2, label: 'Associate / HND',  pattern: /\b(?:diploma|associate(?:'?s)?|hnd|hnc|foundation\s+degree)\b/i },
      { level: 1, label: 'High School',      pattern: /\b(?:high\s+school|secondary\s+school|gcse|a-levels?|matric(?:ulation)?)\b/i },
    ];

    let best = { level: 0, label: 'Not Detected' };
    for (const deg of DEGREES) {
      if (deg.pattern.test(text) && deg.level > best.level) {
        best = deg;
      }
    }

    /* Field of study detection — order matters; more specific fields first */
    const FIELDS = [
      'machine learning', 'artificial intelligence', 'data science',
      'computer science', 'software engineering', 'information technology',
      'information systems', 'management information systems',
      'business analytics', 'business administration',
      'statistics', 'applied mathematics', 'mathematics',
      'operations research', 'quantitative methods',
      'electrical engineering', 'computer engineering', 'engineering',
      'economics', 'finance', 'physics', 'computational science',
    ];

    const lower          = text.toLowerCase();
    const detected_fields = FIELDS.filter(f => new RegExp(`\\b${f}\\b`, 'i').test(lower));

    return {
      degree_level:  best.level,
      degree_label:  best.label,
      field:         detected_fields[0] || 'Unknown',
      all_fields:    detected_fields,
      keywords_found: detected_fields,
    };
  }

  /* ═══════════════════════════════════════════════════════════
     extractProjects(text)
     Estimates project count from bullet patterns and explicit
     "project" mentions. Also detects GitHub presence as a
     strong positive signal for technical candidates.

     Returns { count, has_github, github_url, project_names }
  ═══════════════════════════════════════════════════════════ */
  extractProjects(text) {
    /* Direct "project" mentions (heading + body references) */
    const directMentions = (text.match(/\bproject\b/gi) || []).length;

    /* GitHub link detection */
    const githubMatch = text.match(
      /(?:https?:\/\/)?(?:www\.)?github\.com\/[\w-]+(?:\/[\w.\-]+)?/i
    );

    /* Extract lines from the Projects section as candidate project names */
    const lines        = text.split('\n');
    const projectNames = [];
    let inProjects     = false;

    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;

      // Enter projects section
      if (/^(?:(?:key|personal|side|notable)\s*)?projects?(?:\s*&\s*portfolio)?$/i.test(t)) {
        inProjects = true;
        continue;
      }
      // Exit when another major section header appears
      if (inProjects && /^(?:experience|education|skills?|certifications?|contact)/i.test(t) && t.length < 40) {
        inProjects = false;
        continue;
      }

      if (inProjects) {
        // Project names: not a bullet, not too long, capitalised-ish
        const isBulletBody = /^[-•*]\s+.{30,}/.test(t);
        if (!isBulletBody && t.length >= 5 && t.length <= 90) {
          projectNames.push(t.replace(/^[-•*]\s*/, ''));
          if (projectNames.length >= 8) break;
        }
      }
    }

    /* Estimate total project count via several signals */
    const bulletCount   = (text.match(/^[-•*]\s+\S/gm) || []).length;
    const estimatedCount = Math.min(
      Math.max(projectNames.length, Math.ceil(directMentions * 0.6), Math.floor(bulletCount / 5)),
      20 // hard cap to avoid inflated scores
    );

    return {
      count:             estimatedCount,
      has_github:        !!githubMatch,
      github_url:        githubMatch ? githubMatch[0] : null,
      project_names:     projectNames.slice(0, 5),
      raw_mention_count: directMentions,
    };
  }

  /* ═══════════════════════════════════════════════════════════
     extractCertifications(text)
     Scans for known certification keywords and generic
     "Certified …" patterns. Both exact and substring matching
     are used since certification names vary in practice.

     Returns { detected[], all_mentions[], count, has_certifications }
  ═══════════════════════════════════════════════════════════ */
  extractCertifications(text) {
    const CERT_KEYWORDS = [
      /* Cloud */
      'aws certified', 'azure certified', 'google cloud certified',
      'solutions architect', 'cloud practitioner', 'aws developer',
      'azure fundamentals', 'azure data engineer', 'azure ai',
      /* ML / Data */
      'tensorflow developer', 'tensorflow certificate',
      'google professional machine learning engineer',
      'databricks certified',
      'snowflake snowpro', 'dbt certified', 'dbt developer',
      /* BI */
      'power bi certified', 'pl-300',
      'tableau desktop specialist', 'tableau data analyst',
      'microsoft certified data analyst',
      /* DevOps */
      'ckad', 'cka', 'docker certified associate',
      'hashicorp terraform associate',
      /* PM */
      'pmp', 'prince2', 'certified scrum master', 'csm', 'psm',
      'certified product owner', 'cspo',
      /* Platforms (course-completion certs) */
      'coursera', 'datacamp', 'udemy', 'edx', 'udacity',
      'fast.ai', 'linkedin learning',
      /* General IT */
      'comptia', 'cissp', 'ceh', 'itil', 'ccna',
      'linux foundation', 'deep learning specialization',
      'machine learning specialization', 'mlops specialization',
    ];

    const lower   = text.toLowerCase();
    const detected = CERT_KEYWORDS.filter(kw => lower.includes(kw));

    /* Also capture any line that contains "Certified" followed by 3–35 word chars */
    const genericMatches = (text.match(/\bCertified\s+[\w\s]{3,35}/g) || [])
      .map(m => m.trim())
      .filter(m => m.length < 60);

    const all = [...new Set([...detected, ...genericMatches])];

    return {
      detected,
      all_mentions:      all,
      count:             detected.length,
      has_certifications: detected.length > 0,
    };
  }

  /* ═══════════════════════════════════════════════════════════
     calculateProfileCompleteness(sections)
     Rewards the presence and richness of each CV section.
     A "rich" section has ≥ 60 words. Returns a score 0–100.

     Weights reflect importance: Experience > Skills > Education
     > Contact/Summary > Projects/Certs.
  ═══════════════════════════════════════════════════════════ */
  calculateProfileCompleteness(sections) {
    const WEIGHTS = {
      contact_info:   10,
      summary:        10,
      skills:         25,
      experience:     30,
      education:      15,
      projects:        5,
      certifications:  5,
    };

    let total = 0;

    for (const [key, weight] of Object.entries(WEIGHTS)) {
      const content = (sections[key] || '').trim();
      if (!content) continue;

      const words = content.split(/\s+/).filter(Boolean).length;

      // Tiered completeness score for this section
      const sectionScore =
        words >= 60 ? 1.00 :
        words >= 30 ? 0.85 :
        words >= 10 ? 0.60 :
        words >= 1  ? 0.30 : 0;

      total += weight * sectionScore;
    }

    return Math.round(Math.min(total, 100));
  }
}

/* ─── Expose globally — no ES module syntax to maintain browser compatibility ─── */
window.CVParser = CVParser;
