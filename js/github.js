/**
 * js/github.js — GitHub Profile Analyzer
 * SMARRTIF AI CV Analyzer
 *
 * Fetches public GitHub data via the REST API (no auth required for
 * public endpoints, subject to 60 req/hr unauthenticated rate limit).
 * Computes a GitHub profile score and maps repository languages/topics
 * to the same skill vocabulary used by CVParser.
 *
 * Usage:
 *   const gh = new GitHubAnalyzer();
 *   const result = await gh.analyzeFromURL('https://github.com/username');
 */

class GitHubAnalyzer {

  constructor() {
    this.API = 'https://api.github.com';

    /* Maps GitHub language names → parser skill vocabulary */
    this.LANG_MAP = {
      'Python':           ['python'],
      'JavaScript':       ['javascript'],
      'TypeScript':       ['typescript'],
      'R':                ['r'],
      'Java':             ['java'],
      'Scala':            ['scala', 'apache spark'],
      'Go':               ['go'],
      'Rust':             ['rust'],
      'C++':              ['c++'],
      'C#':               ['c#'],
      'Kotlin':           ['kotlin'],
      'Swift':            ['swift'],
      'Jupyter Notebook': ['python', 'data science', 'pandas', 'numpy'],
      'Shell':            ['bash', 'linux'],
      'HCL':              ['terraform', 'infrastructure as code'],
      'Dockerfile':       ['docker'],
      'YAML':             ['ci/cd'],
    };

    /* Maps GitHub topic tags → skill vocabulary */
    this.TOPIC_MAP = {
      'machine-learning':          'machine learning',
      'deep-learning':             'deep learning',
      'nlp':                       'nlp',
      'natural-language-processing': 'nlp',
      'computer-vision':           'computer vision',
      'data-science':              'data science',
      'data-analysis':             'data analysis',
      'tensorflow':                'tensorflow',
      'pytorch':                   'pytorch',
      'scikit-learn':              'scikit-learn',
      'pandas':                    'pandas',
      'fastapi':                   'fastapi',
      'flask':                     'flask',
      'django':                    'django',
      'react':                     'react',
      'docker':                    'docker',
      'kubernetes':                'kubernetes',
      'mlops':                     'mlops',
      'aws':                       'aws',
      'gcp':                       'gcp',
      'azure':                     'azure',
      'langchain':                 'langchain',
      'llm':                       'large language models',
      'rag':                       'retrieval-augmented generation',
      'transformers':              'transformers',
      'huggingface':               'hugging face',
      'sql':                       'sql',
      'postgresql':                'postgresql',
      'mongodb':                   'mongodb',
      'redis':                     'redis',
      'airflow':                   'airflow',
      'spark':                     'apache spark',
      'dbt':                       'dbt (data build tool)',
      'snowflake':                 'snowflake',
      'terraform':                 'terraform',
      'ci-cd':                     'ci/cd',
      'github-actions':            'ci/cd',
      'microservices':             'microservices',
      'rest-api':                  'rest api',
      'graphql':                   'graphql',
    };

    /* Scans repo names/descriptions for skill signals */
    this.NAME_PATTERNS = [
      [/\bml\b/i,              'machine learning'],
      [/deep.?learn/i,         'deep learning'],
      [/machine.?learn/i,      'machine learning'],
      [/\bnlp\b/i,             'nlp'],
      [/\bllm\b/i,             'large language models'],
      [/\brag\b/i,             'retrieval-augmented generation'],
      [/transformer/i,         'transformers'],
      [/\bapi\b/i,             'rest api'],
      [/docker/i,              'docker'],
      [/kubernetes|k8s/i,      'kubernetes'],
      [/data.?analy/i,         'data analysis'],
      [/data.?sci/i,           'data science'],
      [/forecast|time.?series/i,'time series'],
      [/cv|vision/i,           'computer vision'],
      [/chatbot|gpt|openai/i,  'large language models'],
    ];
  }

  /* ═══════════════════════════════════════════════════════════
     fetchProfile(username)
     Calls GET /users/{username} and returns a normalised profile.
     Throws descriptive errors for 404 (not found) and 403 (rate limit).
  ═══════════════════════════════════════════════════════════ */
  async fetchProfile(username) {
    const res = await fetch(`${this.API}/users/${encodeURIComponent(username)}`);

    if (!res.ok) {
      if (res.status === 404) throw new Error(`GitHub user "${username}" not found. Check the URL and try again.`);
      if (res.status === 403) throw new Error('GitHub API rate limit reached (60 req/hr for unauthenticated requests). Try again in a minute.');
      throw new Error(`GitHub API error ${res.status} for user "${username}".`);
    }

    const d = await res.json();
    return {
      username:     d.login,
      name:         d.name || d.login,
      bio:          d.bio  || null,
      public_repos: d.public_repos  || 0,
      followers:    d.followers     || 0,
      following:    d.following     || 0,
      created_at:   d.created_at,
      avatar_url:   d.avatar_url,
      html_url:     d.html_url,
      location:     d.location     || null,
      company:      d.company      || null,
      blog:         d.blog         || null,
    };
  }

  /* ═══════════════════════════════════════════════════════════
     fetchRepositories(username)
     Calls GET /users/{username}/repos (sorted by last updated,
     capped at 30 repos to stay well within rate limits).
     Returns a normalised array of repo objects.
  ═══════════════════════════════════════════════════════════ */
  async fetchRepositories(username) {
    const url = `${this.API}/users/${encodeURIComponent(username)}/repos?sort=updated&per_page=30`;
    const res = await fetch(url);

    if (!res.ok) {
      if (res.status === 404) throw new Error(`No public repositories found for "${username}".`);
      if (res.status === 403) throw new Error('GitHub API rate limit reached. Try again in a minute.');
      throw new Error(`GitHub API error ${res.status} while fetching repositories.`);
    }

    const data = await res.json();
    return data.map(r => ({
      name:             r.name,
      description:      r.description || null,
      language:         r.language    || null,
      stargazers_count: r.stargazers_count || 0,
      forks_count:      r.forks_count      || 0,
      topics:           r.topics           || [],
      updated_at:       r.updated_at,
      html_url:         r.html_url,
      is_fork:          r.fork || false,
    }));
  }

  /* ═══════════════════════════════════════════════════════════
     analyzeProfile(profile, repos)
     Computes a composite GitHub score (0–100) across 5 dimensions:

       1. public_repos   (max 30): 1 pt per repo
       2. stars_received (max 20): ÷5 total stars, cap 20
       3. lang_diversity (max 20): 4 pts per unique language
       4. account_age    (max 15): 3 pts per year, cap 15
       5. followers      (max 15): 0.5 pt per follower, cap 15

     Returns score, breakdown, top 5 repos by stars, language list.
  ═══════════════════════════════════════════════════════════ */
  analyzeProfile(profile, repos) {
    const repoScore  = Math.min(profile.public_repos, 30);

    const totalStars = repos.reduce((s, r) => s + (r.stargazers_count || 0), 0);
    const starScore  = Math.min(totalStars / 5, 20);

    const uniqueLangs = [...new Set(repos.map(r => r.language).filter(Boolean))];
    const langScore   = Math.min(uniqueLangs.length * 4, 20);

    const ageYears   = (Date.now() - new Date(profile.created_at)) / (1000 * 60 * 60 * 24 * 365.25);
    const ageScore   = Math.min(ageYears * 3, 15);

    const followerScore = Math.min(profile.followers * 0.5, 15);

    const score = Math.min(
      Math.round(repoScore + starScore + langScore + ageScore + followerScore),
      100
    );

    const topRepositories = [...repos]
      .filter(r => !r.is_fork)               // own repos rank higher
      .sort((a, b) => b.stargazers_count - a.stargazers_count)
      .slice(0, 5);

    return {
      score,
      breakdown: {
        repos:     Math.round(repoScore),
        stars:     Math.round(starScore),
        languages: Math.round(langScore),
        age:       Math.round(ageScore),
        followers: Math.round(followerScore),
      },
      detected_languages:  uniqueLangs,
      top_repositories:    topRepositories,
      total_stars:         totalStars,
      account_age_years:   Math.round(ageYears * 10) / 10,
    };
  }

  /* ═══════════════════════════════════════════════════════════
     detectSkillsFromGitHub(repos)
     Maps repository languages, topics, and name/description keywords
     to the canonical skill vocabulary used by CVParser.
     Returns a deduplicated array of skill strings.
  ═══════════════════════════════════════════════════════════ */
  detectSkillsFromGitHub(repos) {
    const skills = new Set();

    for (const repo of repos) {
      /* Language → skills */
      if (repo.language) {
        const mapped = this.LANG_MAP[repo.language];
        if (mapped) mapped.forEach(s => skills.add(s));
      }

      /* Topics → skills */
      for (const topic of (repo.topics || [])) {
        const mapped = this.TOPIC_MAP[topic.toLowerCase()];
        if (mapped) {
          skills.add(mapped);
        } else {
          /* Unknown topics added as-is (normalised) */
          const normalised = topic.replace(/-/g, ' ').toLowerCase();
          if (normalised.length > 2) skills.add(normalised);
        }
      }

      /* Name / description keyword patterns */
      const text = `${repo.name} ${repo.description || ''}`;
      for (const [pattern, skill] of this.NAME_PATTERNS) {
        if (pattern.test(text)) skills.add(skill);
      }
    }

    return [...skills];
  }

  /* ═══════════════════════════════════════════════════════════
     generateGitHubRecommendations(score, repos)
     Returns 2 targeted suggestions based on the profile score band.
  ═══════════════════════════════════════════════════════════ */
  generateGitHubRecommendations(score, repos) {
    if (score < 40) {
      return [
        { type: 'public_projects', priority: 'high',
          message: 'Build and publish more public projects. Aim for at least 10 repositories with clear READMEs demonstrating your technical skills.' },
        { type: 'readme', priority: 'high',
          message: 'Add detailed README files explaining the project purpose, tech stack, and setup instructions. Quality beats quantity for recruiters.' },
      ];
    }
    if (score < 70) {
      return [
        { type: 'topics', priority: 'medium',
          message: 'Add relevant topics/tags to all repositories to improve discoverability and signal your technology focus areas to recruiters.' },
        { type: 'descriptions', priority: 'medium',
          message: 'Ensure every repository has a one-line description. A brief, clear description dramatically improves profile quality signals.' },
      ];
    }
    return [
      { type: 'opensource', priority: 'low',
        message: 'Contribute to popular open-source projects in your domain to increase visibility and demonstrate collaborative coding skills.' },
      { type: 'community', priority: 'low',
        message: 'Share your best projects in developer communities (LinkedIn, HackerNews, Reddit r/MachineLearning) to attract stars and followers.' },
    ];
  }

  /* ═══════════════════════════════════════════════════════════
     analyzeFromURL(githubURL)
     Extracts the username from a GitHub URL and runs the full
     analysis pipeline: fetch → analyze → detect skills → recommend.
  ═══════════════════════════════════════════════════════════ */
  async analyzeFromURL(githubURL) {
    const match = githubURL.match(/github\.com\/([A-Za-z0-9_.-]+)/i);
    if (!match || !match[1]) {
      throw new Error('Invalid GitHub URL. Expected format: https://github.com/username');
    }
    const username = match[1];

    /* Fetch profile and repos in parallel */
    const [profile, repos] = await Promise.all([
      this.fetchProfile(username),
      this.fetchRepositories(username),
    ]);

    const analysis = this.analyzeProfile(profile, repos);
    const detectedSkills = this.detectSkillsFromGitHub(repos);
    const recommendations = this.generateGitHubRecommendations(analysis.score, repos);

    return {
      username,
      profile,
      repositories:     repos,
      analysis,
      detected_skills:  detectedSkills,
      recommendations,
    };
  }
}

/* ─── Global export ─── */
window.GitHubAnalyzer = GitHubAnalyzer;
