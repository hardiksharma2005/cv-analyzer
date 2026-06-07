/**
 * js/recommender.js — Recommendation Engine
 * SMARRTIF AI CV Analyzer
 *
 * Translates scoring results into actionable, prioritised recommendations:
 *   1. Skill-gap recommendations: one resource per missing required skill
 *   2. SMARRTIF AI service tier: the most appropriate programme for the score band
 *   3. Action plan: a 3-step plan targeting the 3 weakest scoring dimensions
 *   4. Improvement time estimate: weeks to close all skill gaps at 10 hrs/week
 *
 * Data is loaded from data/recommendations.json which maps individual skills
 * to curated courses and SMARRTIF AI programme descriptions.
 *
 * Usage:
 *   const engine = new RecommendationEngine();
 *   const recs   = await engine.generate(scoringResult, 'Data Scientist');
 */

class RecommendationEngine {

  constructor() {
    /* In-memory cache: recommendations.json is fetched once per page load */
    this._recsCache = null;
  }

  /* ═══════════════════════════════════════════════════════════
     generate(scoringResult, targetRole) — Public entry point
     Orchestrates all recommendation sub-methods and returns
     a single structured object ready to render on the dashboard.
  ═══════════════════════════════════════════════════════════ */
  async generate(scoringResult, targetRole) {
    await this._loadRecommendations();

    const missingSkills   = scoringResult.dimensions?.skills?.missing_required || [];
    const overallScore    = scoringResult.total_score || 0;

    /* Build a plain { dimension: score } map for action plan generator */
    const dimScores = {};
    for (const [key, val] of Object.entries(scoringResult.dimensions || {})) {
      dimScores[key] = typeof val === 'object' ? val.score : val;
    }

    const rawSkillRecs   = this.skillGapRecommendations(missingSkills);
    const prioritised    = this.prioritizeRecommendations(rawSkillRecs);
    const serviceRec     = this.serviceRecommendations(overallScore, targetRole);
    const actionPlan     = this.generateActionPlan(dimScores);
    const timeEstimate   = this.estimateImprovementTime(missingSkills);

    return {
      skill_recommendations:  prioritised,
      service_recommendation: serviceRec,
      action_plan:            actionPlan,
      improvement_estimate:   timeEstimate,
      total_gaps:             missingSkills.length,
      overall_score:          overallScore,
      score_label:            scoringResult.label,
      target_role:            targetRole,
      generated_at:           new Date().toISOString(),
    };
  }

  /* ═══════════════════════════════════════════════════════════
     skillGapRecommendations(missingSkills)
     For each missing required skill, finds the best matching
     entry in recommendations.json using bidirectional substring
     matching. Falls back to a generic SMARRTIF AI recommendation
     if no specific entry is found.

     Returns an array of recommendation objects (unsorted).
  ═══════════════════════════════════════════════════════════ */
  skillGapRecommendations(missingSkills) {
    const db = this._recsCache || [];

    return missingSkills.map(skill => {
      const lowerSkill = skill.toLowerCase();

      /* Find the closest match in the recommendations database.
         Priority: exact match > CV skill contains DB skill > DB skill contains CV skill */
      let match = db.find(r => r.skill.toLowerCase() === lowerSkill);

      if (!match) {
        match = db.find(r => {
          const dbSkill = r.skill.toLowerCase();
          return lowerSkill.includes(dbSkill) || dbSkill.includes(lowerSkill);
        });
      }

      if (match) {
        return {
          skill,
          gap_recommendation: match.gap_recommendation,
          course_suggestion:  match.course_suggestion,
          priority:           match.priority,
          estimated_hours:    match.estimated_hours || 20,
          source:             'database',
        };
      }

      /* Generic fallback — still ties back to SMARRTIF AI services */
      return {
        skill,
        gap_recommendation:
          `Adding ${skill} to your skill set would directly strengthen your candidacy. ` +
          `SMARRTIF AI offers targeted micro-modules designed to close specific skill gaps efficiently.`,
        course_suggestion:
          `Search "${skill} course" on Coursera, Udemy, or YouTube for beginner-to-advanced resources.`,
        priority:        'medium',
        estimated_hours: 20,
        source:          'generic',
      };
    });
  }

  /* ═══════════════════════════════════════════════════════════
     serviceRecommendations(overallScore, targetRole)
     Maps the overall score to the most appropriate SMARRTIF AI
     training programme tier. Four tiers:

       90–100 → Expert Mentorship Program       (top performers)
       76–89  → Advanced Specialization Track   (strong candidates)
       60–75  → Skill Enhancement Workshop      (good potential, specific gaps)
       0–59   → Intensive Training Program      (foundational development)

     Returns a single service object with description and CTA.
  ═══════════════════════════════════════════════════════════ */
  serviceRecommendations(overallScore, targetRole) {
    const SERVICES = [
      {
        range:       [90, 100],
        service:     'Expert Mentorship Program',
        icon:        '🏆',
        badge:       'Top Performer',
        description: `Your profile is exceptionally strong for the ${targetRole} role. ` +
          `SMARRTIF AI's Expert Mentorship Program pairs you 1-on-1 with a senior industry ` +
          `practitioner for personalised coaching, mock interviews, and career strategy sessions.`,
        cta:         'Apply for Expert Mentorship',
        color:       '#10b981',
      },
      {
        range:       [76, 89],
        service:     'Advanced Specialization Track',
        icon:        '🚀',
        badge:       'Strong Profile',
        description: `You have a strong foundation as a ${targetRole}. ` +
          `The SMARRTIF AI Advanced Specialization Track targets your remaining gaps ` +
          `with deep-dive, project-based modules in cutting-edge topics to make you ` +
          `a standout candidate in competitive hiring pools.`,
        cta:         'Explore Specialization Track',
        color:       '#6C3FC5',
      },
      {
        range:       [60, 75],
        service:     'Skill Enhancement Workshop',
        icon:        '📈',
        badge:       'Good Potential',
        description: `You're on the right track for ${targetRole}! ` +
          `SMARRTIF AI's Skill Enhancement Workshop delivers focused, hands-on training ` +
          `on your specific skill gaps through live sessions, project reviews, and ` +
          `a structured peer-learning community.`,
        cta:         'Join the Enhancement Workshop',
        color:       '#f59e0b',
      },
      {
        range:       [0, 59],
        service:     'Intensive Training Program',
        icon:        '🎯',
        badge:       'Development Stage',
        description: `Building a career as a ${targetRole} requires foundational investment. ` +
          `SMARRTIF AI's Intensive Training Program provides a structured 3–6 month ` +
          `curriculum covering all core competencies with mentored capstone projects ` +
          `and a job-readiness guarantee.`,
        cta:         'Start the Intensive Program',
        color:       '#ef4444',
      },
    ];

    return SERVICES.find(
      s => overallScore >= s.range[0] && overallScore <= s.range[1]
    ) || SERVICES[SERVICES.length - 1];
  }

  /* ═══════════════════════════════════════════════════════════
     prioritizeRecommendations(recommendations)
     Sorts the recommendation list by priority (high → medium → low)
     then by ascending estimated_hours (quick wins first within each
     priority tier). Limits output to the top 8 items to avoid
     overwhelming the user with an unmanageable list.
  ═══════════════════════════════════════════════════════════ */
  prioritizeRecommendations(recommendations) {
    const ORDER = { high: 0, medium: 1, low: 2 };

    return recommendations
      .sort((a, b) => {
        const pDiff = (ORDER[a.priority] ?? 1) - (ORDER[b.priority] ?? 1);
        if (pDiff !== 0) return pDiff;
        /* Within same priority: fewer hours = quicker win = comes first */
        return (a.estimated_hours || 20) - (b.estimated_hours || 20);
      })
      .slice(0, 8);
  }

  /* ═══════════════════════════════════════════════════════════
     generateActionPlan(dimensionScores)
     Identifies the 3 lowest-scoring dimensions and returns a
     concrete, role-agnostic action for each. Steps are labelled
     "Immediate", "Short-term", and "Medium-term" to help the
     candidate sequence their effort.

     This focuses coaching on the dimensions that will move
     the needle most, rather than telling everyone to do everything.
  ═══════════════════════════════════════════════════════════ */
  generateActionPlan(dimensionScores) {
    /* Meta: human-readable labels and concrete actions per dimension */
    const DIM_META = {
      skills: {
        label:  'Technical Skills',
        action: 'Enrol in targeted online courses and build at least one portfolio project per missing skill to demonstrate practical ability.',
      },
      experience: {
        label:  'Work Experience',
        action: 'Pursue internships, contract projects, or open-source contributions to accumulate hands-on professional experience.',
      },
      education: {
        label:  'Education',
        action: 'Consider relevant certifications or a postgraduate qualification to strengthen academic credentials for this role.',
      },
      projects: {
        label:  'Projects Portfolio',
        action: 'Build 3–5 end-to-end projects and publish them on GitHub with clear READMEs demonstrating the required technical skills.',
      },
      certifications: {
        label:  'Certifications',
        action: 'Obtain 1–2 industry-recognised certifications aligned with your target role within the next 3 months.',
      },
      profile_completeness: {
        label:  'CV Completeness',
        action: 'Add a concise professional summary, quantify your achievements with metrics, and ensure every section of your CV is fully filled out.',
      },
    };

    /* Sort dimensions ascending by score — lowest score = most urgent gap */
    const sorted = Object.entries(dimensionScores)
      .sort(([, a], [, b]) => a - b)
      .slice(0, 3);

    const PRIORITY_LABELS = ['Immediate', 'Short-term', 'Medium-term'];

    return sorted.map(([dim, score], idx) => ({
      step:          idx + 1,
      dimension:     dim,
      label:         DIM_META[dim]?.label  || dim,
      current_score: score,
      target_score:  Math.min(score + 30, 100), // realistic +30 points target
      action:        DIM_META[dim]?.action || `Work on improving your ${dim} to raise your overall score.`,
      priority:      PRIORITY_LABELS[idx],
    }));
  }

  /* ═══════════════════════════════════════════════════════════
     estimateImprovementTime(missingSkills)
     Sums per-skill hour estimates from recommendations.json,
     then converts to weeks assuming a 10-hour study week.
     This helps candidates understand the total commitment
     required to become competitive.

     Falls back to a 20-hour estimate for unknown skills.

     Returns { total_hours, weeks, months, skill_count, breakdown }
  ═══════════════════════════════════════════════════════════ */
  estimateImprovementTime(missingSkills) {
    if (!missingSkills.length) {
      return {
        total_hours: 0,
        weeks:       0,
        months:      0,
        skill_count: 0,
        breakdown:   'No skill gaps detected — your profile is well-aligned with the role requirements.',
      };
    }

    const db = this._recsCache || [];
    let totalHours = 0;

    for (const skill of missingSkills) {
      const lower = skill.toLowerCase();
      const match = db.find(r => {
        const rs = r.skill.toLowerCase();
        return rs === lower || lower.includes(rs) || rs.includes(lower);
      });
      totalHours += match?.estimated_hours ?? 20; // 20h default for unknown skills
    }

    /* Assuming a learner dedicates ~10 hours per week alongside other commitments */
    const weeks  = Math.ceil(totalHours / 10);
    const months = parseFloat((weeks / 4.33).toFixed(1));

    return {
      total_hours: totalHours,
      weeks,
      months,
      skill_count: missingSkills.length,
      breakdown:
        `~${totalHours} total study hours across ${missingSkills.length} skill gap(s) ` +
        `at 10 hrs/week ≈ ${weeks} weeks (${months} months).`,
    };
  }

  /* ═══════════════════════════════════════════════════════════
     _loadRecommendations() — internal caching fetch
     Fetches data/recommendations.json once and caches the
     skill_recommendations array for all subsequent lookups.
  ═══════════════════════════════════════════════════════════ */
  async _loadRecommendations() {
    if (this._recsCache !== null) return;
    const res  = await fetch('data/recommendations.json');
    const data = await res.json();
    this._recsCache = data.skill_recommendations || [];
  }
}

/* ─── Expose globally ─── */
window.RecommendationEngine = RecommendationEngine;
