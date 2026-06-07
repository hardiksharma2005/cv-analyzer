"""
python/scorer.py — CV Scoring Engine (Python / ML-enhanced)
SMARRTIF AI CV Analyzer

Mirrors the logic in js/scorer.js but adds:
  - TF-IDF secondary signal blended into skill scoring
  - ATS compatibility simulation
  - Percentile estimation and improvement potential
  - Richer score report structure

All public methods accept the parsed CV dict produced by CVNLPEngine.parse_cv()
and a role string matching a key in role_profiles.json.
"""

import json
import logging
import re
from pathlib import Path
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Role profiles — shared module-level cache
# ---------------------------------------------------------------------------
_PROFILES_PATH = Path(__file__).parent.parent / "data" / "role_profiles.json"

def _load_profiles() -> dict:
    try:
        with open(_PROFILES_PATH, encoding="utf-8") as f:
            return json.load(f).get("roles", {})
    except FileNotFoundError:
        logger.error("role_profiles.json not found")
        return {}

_ROLE_PROFILES: dict = _load_profiles()

# ---------------------------------------------------------------------------
# Score label and colour mapping — mirrors js/scorer.js getLabelAndColor()
# ---------------------------------------------------------------------------
def _score_label(score: float) -> dict:
    if score >= 85:
        return {"label": "Excellent",  "color": "#10b981", "emoji": "🌟"}
    if score >= 70:
        return {"label": "Good",       "color": "#3b82f6", "emoji": "✅"}
    if score >= 55:
        return {"label": "Fair",       "color": "#f59e0b", "emoji": "⚠️"}
    if score >= 40:
        return {"label": "Developing", "color": "#f97316", "emoji": "📈"}
    return     {"label": "Needs Work", "color": "#ef4444", "emoji": "🔧"}

# ---------------------------------------------------------------------------
# Project count → score step table (matches JS scorer exactly)
# ---------------------------------------------------------------------------
_PROJECT_STEPS = [(8, 100), (5, 85), (4, 75), (3, 65), (2, 50), (1, 30), (0, 0)]

def _project_step_score(count: int) -> float:
    for threshold, score in _PROJECT_STEPS:
        if count >= threshold:
            return float(score)
    return 0.0

# ---------------------------------------------------------------------------
# Degree level → score (matches JS scorer)
# ---------------------------------------------------------------------------
_DEGREE_SCORES = {5: 100, 4: 90, 3: 70, 2: 45, 1: 35, 0: 20}


class CVScorer:
    """
    Compute 6-dimension weighted CV scores with ML-enhanced secondary signals.

    Usage:
        scorer  = CVScorer()
        parsed  = nlp_engine.parse_cv(text)
        results = scorer.score_all(parsed, cv_text, role)
    """

    def __init__(self):
        # Lazy-import to avoid loading NLP engine unless needed
        self._nlp_engine = None

    def _get_nlp_engine(self):
        """Lazy initialise the NLP engine (avoids double-loading spaCy)."""
        if self._nlp_engine is None:
            from nlp_engine import CVNLPEngine
            self._nlp_engine = CVNLPEngine()
        return self._nlp_engine

    # -----------------------------------------------------------------------
    # score_all — orchestrator
    # -----------------------------------------------------------------------
    def score_all(self, parsed_cv: dict, cv_text: str, role: str) -> dict:
        """
        Compute all 6 dimensions, apply role weights, and return the full report.

        Args:
            parsed_cv: Output of CVNLPEngine.parse_cv()
            cv_text:   Full raw text (for TF-IDF computation)
            role:      Target role string (must exist in role_profiles.json)

        Returns:
            Complete scoring dict ready to be stored in sessionStorage (via API)
            or rendered directly.
        """
        profile = _ROLE_PROFILES.get(role)
        if not profile:
            raise ValueError(f"Unknown role: {role!r}. Available: {list(_ROLE_PROFILES)}")

        weights = profile.get("scoring_weights", {})

        # Compute each dimension
        skill_score = self.score_skills(
            parsed_cv.get("skills", {}).get("detected", []),
            profile,
            cv_text,
        )
        exp_score   = self.score_experience(
            parsed_cv.get("experience", {}).get("total_years", 0),
            profile,
        )
        edu_score   = self.score_education(
            parsed_cv.get("education", {}),
            profile,
        )
        proj_score  = self.score_projects(
            parsed_cv.get("projects", []),
            github_bonus=0,  # GitHub bonus applied by caller if available
        )
        cert_score  = self.score_certifications(
            parsed_cv.get("certifications", []),
            profile,
        )
        comp_score  = parsed_cv.get("profile_completeness", {}).get("score", 50)

        dimensions = {
            "skills":               skill_score,
            "experience":           exp_score,
            "education":            edu_score,
            "projects":             proj_score,
            "certifications":       cert_score,
            "profile_completeness": comp_score,
        }

        # Weighted total — Σ (dim_score × weight / 100)
        weighted_total = sum(
            dimensions[dim] * weights.get(dim, 0) / 100
            for dim in dimensions
        )

        ats_result  = self.calculate_ats_score(parsed_cv)
        tfidf_score = 0.0
        try:
            tfidf_score = self._get_nlp_engine().calculate_tfidf_relevance(cv_text, role)
        except Exception as exc:
            logger.warning(f"TF-IDF relevance skipped: {exc}")

        report = self.generate_score_report(
            dimensions, weights, weighted_total, ats_result, tfidf_score, role
        )
        return report

    # -----------------------------------------------------------------------
    # Dimension: Skills
    # -----------------------------------------------------------------------
    def score_skills(
        self,
        detected_skills: list[str],
        profile: dict,
        cv_text: str = "",
    ) -> float:
        """
        Hybrid skill scoring: 70% bidirectional keyword match + 30% TF-IDF.

        Keyword match logic (mirrors js/scorer.js exactly):
          - Required skills worth 85% of keyword score
          - Nice-to-have worth 15%
          - Matching uses bidirectional substring: skill IS IN detected OR
            detected IS IN skill (handles "power bi" ↔ "power bi dashboard")

        TF-IDF secondary signal:
          Only computed when cv_text is provided.  Adds up to 30 points to the
          final score without inflating the keyword component.

        Args:
            detected_skills: List of skill strings from CVNLPEngine.
            profile:         Role profile dict from role_profiles.json.
            cv_text:         Optional raw CV text for TF-IDF signal.

        Returns:
            Skill score 0–100.
        """
        required      = [s.lower() for s in profile.get("required_skills", [])]
        nice_to_have  = [s.lower() for s in profile.get("nice_to_have_skills", [])]
        detected_lower = [s.lower() for s in detected_skills]

        def _matches(skill: str, detected: list[str]) -> bool:
            """Bidirectional substring match — same logic as JS."""
            for d in detected:
                if skill in d or d in skill:
                    return True
            return False

        # Required skills (85% of keyword component)
        req_matched = sum(1 for s in required if _matches(s, detected_lower))
        req_score   = (req_matched / len(required) * 100) if required else 0

        # Nice-to-have skills (15% of keyword component)
        nth_matched = sum(1 for s in nice_to_have if _matches(s, detected_lower))
        nth_score   = (nth_matched / len(nice_to_have) * 100) if nice_to_have else 0

        keyword_score = req_score * 0.85 + nth_score * 0.15

        # Blend: 70% keyword + 30% TF-IDF
        if cv_text:
            try:
                role_name = next(
                    (r for r, p in _ROLE_PROFILES.items() if p is profile), None
                )
                if role_name:
                    nlp = self._get_nlp_engine()
                    tfidf = nlp.calculate_tfidf_relevance(cv_text, role_name)
                    return round(keyword_score * 0.70 + tfidf * 0.30, 1)
            except Exception:
                pass  # fall back to pure keyword score

        return round(keyword_score, 1)

    # -----------------------------------------------------------------------
    # Dimension: Experience
    # -----------------------------------------------------------------------
    def score_experience(self, total_years: float, profile: dict) -> float:
        """
        Three-zone linear scoring around the role's minimum experience requirement.

        Zones:
          Below minimum: 0 → 60 (partial credit, scales linearly)
          At minimum:    60
          Above minimum: 60 → 100 (scales linearly up to 3× minimum)
          Above 3×:      capped at 100

        This matches the JS scorer's zone logic.
        """
        min_yrs = profile.get("min_experience_years", 2)
        if min_yrs <= 0:
            return 100.0

        if total_years <= 0:
            return 0.0

        if total_years < min_yrs:
            # Partial credit: linear 0→60
            return round((total_years / min_yrs) * 60, 1)

        if total_years <= min_yrs * 3:
            # Above minimum: linear 60→100
            excess_ratio = (total_years - min_yrs) / (min_yrs * 2)
            return round(60 + excess_ratio * 40, 1)

        return 100.0

    # -----------------------------------------------------------------------
    # Dimension: Education
    # -----------------------------------------------------------------------
    def score_education(self, education: dict, profile: dict) -> float:
        """
        Education score = degree level score (80%) + field relevance (20%).

        Degree level: integer 0–5 mapped to 20–100 via _DEGREE_SCORES table.
        Field relevance: ratio of detected field keywords that match the role's
        education_keywords list, scaled 0–100.
        """
        degree_level = education.get("degree_level", 0)
        level_score  = _DEGREE_SCORES.get(degree_level, 20)

        # Field keyword relevance
        role_edu_keywords = [k.lower() for k in profile.get("education_keywords", [])]
        detected_fields   = [k.lower() for k in education.get("field_keywords", [])]

        field_score = 0.0
        if role_edu_keywords and detected_fields:
            matched = sum(
                1 for k in detected_fields
                if any(k in rk or rk in k for rk in role_edu_keywords)
            )
            field_score = min(100, (matched / len(role_edu_keywords)) * 100)

        return round(level_score * 0.80 + field_score * 0.20, 1)

    # -----------------------------------------------------------------------
    # Dimension: Projects
    # -----------------------------------------------------------------------
    def score_projects(self, projects: list, github_bonus: float = 0) -> float:
        """
        Step-scale scoring on project count, with an optional GitHub bonus.

        GitHub bonus: +15 points (capped so total ≤ 100), awarded when the
        caller has successfully fetched and scored a GitHub profile.
        """
        base_score = _project_step_score(len(projects))
        total      = min(100, base_score + github_bonus)
        return round(total, 1)

    # -----------------------------------------------------------------------
    # Dimension: Certifications
    # -----------------------------------------------------------------------
    def score_certifications(self, certifications: list[str], profile: dict) -> float:
        """
        Relaxed substring match of detected certifications against the role's
        key_certifications list.

        "Relaxed" means: a detected cert matches if any word from the key cert
        name appears in the detected cert string (handles abbreviations).
        """
        key_certs     = [c.lower() for c in profile.get("key_certifications", [])]
        detected_lower = [c.lower() for c in certifications]

        if not key_certs or not detected_lower:
            return 0.0

        matched = 0
        for kc in key_certs:
            # Check if any word of the key cert appears in any detected cert
            kc_words = set(kc.split())
            for dc in detected_lower:
                dc_words = set(dc.split())
                if kc_words & dc_words:  # non-empty intersection
                    matched += 1
                    break

        score = (matched / len(key_certs)) * 100
        return round(score, 1)

    # -----------------------------------------------------------------------
    # ATS compatibility score
    # -----------------------------------------------------------------------
    def calculate_ats_score(self, parsed_cv: dict) -> dict:
        """
        Simulate ATS (Applicant Tracking System) compatibility scoring.

        ATS parsers are notoriously rigid.  This function checks for signals
        that indicate a CV is ATS-friendly:

          Standard section headers  (30 pts) — ATS needs to find your sections
          Contact information        (20 pts) — name, email, phone required
          Keyword density            (20 pts) — enough role-relevant terms
          Proper structure signals   (15 pts) — consistent date formats, no tables
          Content length             (15 pts) — not too short, not too long

        Returns:
            {score, grade, issues, tips}
        """
        issues = []
        tips   = []
        score  = 0

        # Section headers (30 pts)
        detected_sections = parsed_cv.get("sections_detected", [])
        critical_sections = {"experience", "skills", "education", "contact"}
        missing           = critical_sections - set(detected_sections)
        section_pts       = (len(critical_sections) - len(missing)) / len(critical_sections) * 30
        score += section_pts
        if missing:
            issues.append(f"Missing section headers: {', '.join(missing)}")
            tips.append("Add clearly labelled section headings (Experience, Skills, Education, Contact)")

        # Contact information (20 pts)
        contact = parsed_cv.get("contact_info", {})
        contact_pts = sum(5 for v in contact.values() if v)  # 5 pts per field, max 20
        score += min(20, contact_pts)
        if not contact.get("has_email"):
            issues.append("Email address not detected")
            tips.append("Include your email address in plain text (not inside an image/table)")
        if not contact.get("has_phone"):
            issues.append("Phone number not detected")

        # Keyword density (20 pts)
        n_skills = len(parsed_cv.get("skills", {}).get("detected", []))
        if n_skills >= 15:
            score += 20
        elif n_skills >= 8:
            score += 12
            tips.append("Add more specific technical skills to improve keyword density")
        elif n_skills >= 3:
            score += 6
            issues.append("Low skill keyword density — ATS may not match you to role requirements")
        else:
            issues.append("Very few skills detected — CV may be filtered out by ATS")
            tips.append("List your technical skills explicitly in a dedicated Skills section")

        # Structure signals (15 pts) — proxy: multiple sections + reasonable word count
        word_count    = parsed_cv.get("word_count", 0)
        has_sections  = len(detected_sections) >= 4
        structure_pts = 0
        if has_sections:
            structure_pts += 8
        if 250 <= word_count <= 900:
            structure_pts += 7
        elif word_count > 900:
            tips.append("CV is quite long — ATS may truncate; aim for 400–800 words")
        score += structure_pts

        # Content length (15 pts)
        if 300 <= word_count <= 700:
            score += 15
        elif 200 <= word_count < 300 or 700 < word_count <= 1000:
            score += 10
        else:
            score += 5
            if word_count < 200:
                issues.append("CV is very short — add more detail to each section")

        score = round(min(100, score), 1)
        grade = (
            "A" if score >= 85 else
            "B" if score >= 70 else
            "C" if score >= 55 else
            "D" if score >= 40 else
            "F"
        )

        return {
            "score":  score,
            "grade":  grade,
            "issues": issues,
            "tips":   tips,
        }

    # -----------------------------------------------------------------------
    # Score report generation
    # -----------------------------------------------------------------------
    def generate_score_report(
        self,
        dimensions: dict,
        weights: dict,
        weighted_total: float,
        ats_result: dict,
        tfidf_score: float,
        role: str,
    ) -> dict:
        """
        Assemble a complete scoring report.

        The percentile estimate uses a heuristic normal distribution assumption:
        we model the population average as 52 with std ≈ 18, so a score of 70
        maps to roughly the 84th percentile.  In production this would be derived
        from a real candidate database.

        Improvement potential estimates how many points could be gained by
        filling the most impactful gaps (skills + experience, highest-weight dims).
        """
        # Per-dimension labels
        dimension_labels = {
            dim: {**_score_label(score), "score": round(score, 1), "weight": weights.get(dim, 0)}
            for dim, score in dimensions.items()
        }

        # Percentile (heuristic normal distribution: μ=52, σ=18)
        mu, sigma  = 52, 18
        z_score    = (weighted_total - mu) / sigma
        # CDF approximation using error function
        percentile = round(50 * (1 + float(np.tanh(z_score * 0.8))), 1)
        percentile = max(1, min(99, percentile))

        # Improvement potential: gaps in top-weighted dimensions
        improvement_potential = 0
        sorted_dims = sorted(weights.items(), key=lambda x: x[1], reverse=True)
        for dim, weight in sorted_dims[:3]:  # top 3 weighted dimensions
            gap = 100 - dimensions.get(dim, 0)
            improvement_potential += gap * weight / 100

        overall_label = _score_label(weighted_total)

        return {
            # Overall
            "overall_score":          round(weighted_total, 1),
            "overall_label":          overall_label["label"],
            "overall_color":          overall_label["color"],
            "overall_emoji":          overall_label["emoji"],

            # Per-dimension breakdown
            "dimensions":             dimension_labels,

            # Secondary signals
            "ats_score":              ats_result.get("score", 0),
            "ats_grade":              ats_result.get("grade", "F"),
            "ats_issues":             ats_result.get("issues", []),
            "ats_tips":               ats_result.get("tips", []),
            "tfidf_relevance":        tfidf_score,

            # Derived insights
            "percentile_estimate":    percentile,
            "improvement_potential":  round(improvement_potential, 1),
            "target_role":            role,

            # Raw weights for transparency
            "scoring_weights":        weights,
        }
