/**
 * js/scorer.js — Multi-Dimensional CV Scoring Engine
 * SMARRTIF AI CV Analyzer
 *
 * Applies a weighted, 6-dimension scoring model to a parsed CV object.
 * Each dimension produces a 0–100 score; the weighted sum gives the
 * final overall score which maps to a performance band label.
 *
 * Dimension weights are defined per-role in data/role_profiles.json
 * so that, e.g., Projects matter more for Software Engineers than
 * for Business Analysts.
 *
 * Usage:
 *   const scorer = new CVScorer();
 *   const result = await scorer.score(parsedCV, 'Data Scientist');
 */

class CVScorer {

  constructor() {
    /* In-memory cache: role profiles are fetched once per page load */
    this._profilesCache = null;
  }

  /* ═══════════════════════════════════════════════════════════
     score(parsedCV, targetRole) — Public entry point
     Orchestrates all dimension scorers, applies weights, and
     returns a unified result object consumed by the dashboard.
  ═══════════════════════════════════════════════════════════ */
  async score(parsedCV, targetRole) {
    const profile = await this._loadRoleProfile(targetRole);
    if (!profile) {
      throw new Error(`[CVScorer] No benchmark profile found for role: "${targetRole}"`);
    }

    const w = profile.scoring_weights; // shorthand alias

    /* ── Run each dimension scorer independently ── */
    const skillResult = this.scoreSkills(
      parsedCV.skills,
      profile
    );
    const expResult = this.scoreExperience(
      parsedCV.experience,
      profile
    );
    const eduResult = this.scoreEducation(
      parsedCV.education,
      profile
    );
    const projResult = this.scoreProjects(
      parsedCV.projects,
      profile
    );
    const certResult = this.scoreCertifications(
      parsedCV.certifications,
      profile
    );
    /* Profile completeness is computed entirely inside the parser
       and stored as a 0-100 integer on the parsedCV object. */
    const complScore = parsedCV.profile_completeness || 0;

    const dimensionScores = {
      skills:               skillResult.score,
      experience:           expResult.score,
      education:            eduResult.score,
      projects:             projResult.score,
      certifications:       certResult.score,
      profile_completeness: complScore,
    };

    const weightedTotal = this.calculateWeightedTotal(dimensionScores, w);

    return {
      role:        targetRole,
      total_score: weightedTotal,
      label:       this.getScoreLabel(weightedTotal),
      color:       this.getScoreColor(weightedTotal),
      dimensions: {
        skills: {
          ...skillResult,
          weight: w.skills,
          label:  'Skills Match',
        },
        experience: {
          ...expResult,
          weight: w.experience,
          label:  'Experience',
        },
        education: {
          ...eduResult,
          weight: w.education,
          label:  'Education',
        },
        projects: {
          ...projResult,
          weight: w.projects,
          label:  'Projects',
        },
        certifications: {
          ...certResult,
          weight: w.certifications,
          label:  'Certifications',
        },
        profile_completeness: {
          score:  complScore,
          weight: w.profile_completeness,
          label:  'Profile Completeness',
        },
      },
      profile_meta: {
        role:            targetRole,
        min_experience:  profile.min_experience_years,
        required_skills: profile.required_skills,
      },
    };
  }

  /* ═══════════════════════════════════════════════════════════
     scoreSkills(detectedSkills, roleProfile)
     Compares CV skills against the role's required and nice-to-have
     skill lists using fuzzy substring matching (handles variants like
     "power bi" vs "power bi dashboard").

     Scoring formula:
       Required skills  → worth 85% of dimension score
       Nice-to-have     → worth 15% of dimension score
     This ensures a candidate missing all nice-to-haves but matching
     all required skills still achieves 85 / 100 on this dimension.

     Returns { score, matched_required[], missing_required[],
               matched_nice_to_have[], required_coverage_pct }
  ═══════════════════════════════════════════════════════════ */
  scoreSkills(detectedSkills, roleProfile) {
    const detected   = (detectedSkills.detected || []).map(s => s.toLowerCase());
    const required   = (roleProfile.required_skills    || []).map(s => s.toLowerCase());
    const niceToHave = (roleProfile.nice_to_have_skills || []).map(s => s.toLowerCase());

    /* Bidirectional substring match: handles abbreviations and compound terms.
       "power bi" matches "power bi dashboard";
       "scikit-learn" matches "sklearn". */
    const fuzzyMatch = (cvSkill, profileSkill) =>
      cvSkill === profileSkill ||
      cvSkill.includes(profileSkill) ||
      profileSkill.includes(cvSkill);

    const matchedRequired = required.filter(req =>
      detected.some(det => fuzzyMatch(det, req))
    );
    const missingRequired = required.filter(req =>
      !detected.some(det => fuzzyMatch(det, req))
    );
    const matchedNice = niceToHave.filter(nice =>
      detected.some(det => fuzzyMatch(det, nice))
    );

    const requiredScore = required.length > 0
      ? (matchedRequired.length / required.length) * 85
      : 0;
    const niceScore = niceToHave.length > 0
      ? (matchedNice.length / niceToHave.length) * 15
      : 0;

    return {
      score:                 Math.round(Math.min(requiredScore + niceScore, 100)),
      matched_required:      matchedRequired,
      missing_required:      missingRequired,
      matched_nice_to_have:  matchedNice,
      required_coverage_pct: Math.round((matchedRequired.length / Math.max(required.length, 1)) * 100),
    };
  }

  /* ═══════════════════════════════════════════════════════════
     scoreExperience(experienceData, roleProfile)
     Awards full marks when experience is 2× the minimum and
     gives meaningful partial credit for candidates who are close.

     Scale:
       0 years detected    →  5   (parser found work content, low confidence)
       0 → minYears        →  5–70  (linear partial credit)
       minYears → 2×min    →  70–100 (linear overcorrection bonus)
       ≥ 2× minimum        →  100

     Returns { score, detected_years, required_years,
               confidence, meets_minimum }
  ═══════════════════════════════════════════════════════════ */
  scoreExperience(experienceData, roleProfile) {
    const minYears = roleProfile.min_experience_years || 1;
    const cvYears  = experienceData.years || 0;

    let score;
    if (cvYears >= minYears * 2) {
      score = 100;
    } else if (cvYears >= minYears) {
      /* Map [minYears, 2×minYears] → [70, 100] linearly */
      const ratio = (cvYears - minYears) / minYears;
      score = Math.round(70 + ratio * 30);
    } else if (cvYears > 0) {
      /* Map [0, minYears] → [5, 70] linearly */
      score = Math.round(5 + (cvYears / minYears) * 65);
    } else {
      /* Confidence penalty when no dates found at all */
      score = experienceData.confidence === 'low' ? 5 : 15;
    }

    return {
      score:          Math.min(score, 100),
      detected_years: cvYears,
      required_years: minYears,
      confidence:     experienceData.confidence || 'low',
      meets_minimum:  cvYears >= minYears,
    };
  }

  /* ═══════════════════════════════════════════════════════════
     scoreEducation(educationData, roleProfile)
     Combines degree level (80%) with field relevance (20%).

     Degree level → score mapping:
       PhD         → 100
       Masters     → 90
       Bachelors   → 70
       Associate   → 45
       High School → 35
       Not found   → 20   (penalises but doesn't zero-out)

     Returns { score, degree_level, degree_label,
               relevant_fields[], field_match }
  ═══════════════════════════════════════════════════════════ */
  scoreEducation(educationData, roleProfile) {
    const LEVEL_SCORES = { 5: 100, 4: 90, 3: 70, 2: 45, 1: 35, 0: 20 };

    const degreeLevel = educationData.degree_level || 0;
    const levelScore  = LEVEL_SCORES[degreeLevel] ?? 20;

    /* Field relevance: compare detected study fields against role edu keywords */
    const eduKeywords    = (roleProfile.education_keywords || []).map(k => k.toLowerCase());
    const detectedFields = (educationData.all_fields || []).map(f => f.toLowerCase());

    const relevantFields = detectedFields.filter(field =>
      eduKeywords.some(kw => field.includes(kw) || kw.includes(field))
    );
    /* Score 100 if ≥ 1 relevant field; 40 baseline for no match
       (a degree in any field shows academic capacity) */
    const fieldScore = relevantFields.length > 0 ? 100 : 40;

    const score = Math.round(levelScore * 0.80 + fieldScore * 0.20);

    return {
      score,
      degree_level:    degreeLevel,
      degree_label:    educationData.degree_label || 'Not Detected',
      relevant_fields: relevantFields,
      field_match:     relevantFields.length > 0,
    };
  }

  /* ═══════════════════════════════════════════════════════════
     scoreProjects(projectData, roleProfile)
     Rewards both project quantity and GitHub presence.
     GitHub is a strong proxy for code quality and habit of
     sharing work publicly, which employers value highly.

     Count scale: 0→0, 1→30, 2→50, 3→65, 4→75, 5+→85, 8+→100
     GitHub bonus contributes up to +15 points (capped at 100).

     Returns { score, project_count, has_github, github_url }
  ═══════════════════════════════════════════════════════════ */
  scoreProjects(projectData, roleProfile) {
    const count     = projectData.count || 0;
    const hasGithub = projectData.has_github || false;

    const COUNT_SCORES = [
      [8, 100], [5, 85], [4, 75], [3, 65], [2, 50], [1, 30], [0, 0],
    ];
    const countScore = (COUNT_SCORES.find(([min]) => count >= min) || [0, 0])[1];

    /* GitHub presence is worth up to 15 points on top of count score */
    const githubBonus = hasGithub ? 15 : 0;
    const score = Math.min(Math.round(countScore * 0.85 + githubBonus), 100);

    return {
      score,
      project_count: count,
      has_github:    hasGithub,
      github_url:    projectData.github_url || null,
    };
  }

  /* ═══════════════════════════════════════════════════════════
     scoreCertifications(certData, roleProfile)
     Compares detected certifications against the role's preferred
     list using relaxed substring matching (certification names
     vary widely in how they appear on CVs).

     Baseline: 25 if any cert detected, 10 if none.
     Role match bonus: up to 75 additional points.

     Returns { score, matched_certs[], total_detected,
               has_certifications }
  ═══════════════════════════════════════════════════════════ */
  scoreCertifications(certData, roleProfile) {
    const roleCerts   = (roleProfile.key_certifications || []).map(c => c.toLowerCase());
    const cvDetected  = (certData.detected      || []).map(c => c.toLowerCase());
    const cvMentions  = (certData.all_mentions  || []).map(c => c.toLowerCase());

    /* A cert "matches" if there is any substring overlap with the role cert name */
    const matchedRole = roleCerts.filter(rc =>
      cvDetected.some(cc => cc.includes(rc) || rc.includes(cc)) ||
      cvMentions.some(am => am.includes(rc) || rc.includes(am))
    );

    const hasCerts  = cvDetected.length > 0 || cvMentions.length > 0;
    const baseScore = hasCerts ? 25 : 10;

    const matchScore = roleCerts.length > 0
      ? (matchedRole.length / roleCerts.length) * 75
      : (hasCerts ? 40 : 0); // partial credit when no role certs defined

    return {
      score:             Math.min(Math.round(baseScore + matchScore), 100),
      matched_certs:     matchedRole,
      total_detected:    certData.count || 0,
      has_certifications: certData.has_certifications || false,
    };
  }

  /* ═══════════════════════════════════════════════════════════
     calculateWeightedTotal(scores, weights)
     Applies role-specific percentage weights.
     weights values must sum to 100 (enforced in role_profiles.json).

     Formula: Σ (dimension_score × weight_pct / 100)
  ═══════════════════════════════════════════════════════════ */
  calculateWeightedTotal(scores, weights) {
    let total = 0;
    for (const [dim, weight] of Object.entries(weights)) {
      total += ((scores[dim] || 0) * weight) / 100;
    }
    return Math.round(Math.min(total, 100));
  }

  /* ═══════════════════════════════════════════════════════════
     getScoreLabel(score) — Performance band labels
     Bands are calibrated against typical recruiter thresholds:
       90–100: passes senior/specialist bars
       76–89:  strong candidate, likely to interview
       61–75:  competitive with specific gaps
       41–60:  developing, needs targeted upskilling
       0–40:   foundational work required
  ═══════════════════════════════════════════════════════════ */
  getScoreLabel(score) {
    if (score >= 90) return 'Expert';
    if (score >= 76) return 'Strong';
    if (score >= 61) return 'Proficient';
    if (score >= 41) return 'Developing';
    return 'Needs Work';
  }

  /* ═══════════════════════════════════════════════════════════
     getScoreColor(score) — Hex color for UI indicators
     Uses a traffic-light palette:
       Green  → candidate is competitive
       Blue   → solid but not top-tier
       Amber  → developing, gaps visible
       Red    → significant gaps present
  ═══════════════════════════════════════════════════════════ */
  getScoreColor(score) {
    if (score >= 76) return '#10b981'; // Emerald — Strong / Expert
    if (score >= 61) return '#3b82f6'; // Blue    — Proficient
    if (score >= 41) return '#f59e0b'; // Amber   — Developing
    return '#ef4444';                   // Red     — Needs Work
  }

  /* ═══════════════════════════════════════════════════════════
     _loadRoleProfile(targetRole) — internal caching fetch
     Fetches role_profiles.json once and caches the result.
     Returns the profile object for the requested role, or null.
  ═══════════════════════════════════════════════════════════ */
  async _loadRoleProfile(targetRole) {
    if (!this._profilesCache) {
      const res  = await fetch('data/role_profiles.json');
      const data = await res.json();
      this._profilesCache = data.roles || {};
    }
    return this._profilesCache[targetRole] || null;
  }
}

/* ─── Expose globally ─── */
window.CVScorer = CVScorer;
