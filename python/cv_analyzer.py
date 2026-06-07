"""
python/cv_analyzer.py — Flask REST API Server
SMARRTIF AI CV Analyzer

Provides a Python NLP backend that the frontend can call instead of (or in
addition to) the browser-side JS pipeline.  All routes are CORS-enabled so
index.html can call the API from any origin during development.

Endpoints:
  POST /api/analyze  — full analysis pipeline (file + role)
  POST /api/parse    — CV text extraction + parsing only
  GET  /api/roles    — available role profiles from JSON
  GET  /api/health   — liveness check
  POST /api/github   — GitHub profile analysis

Run:
  python cv_analyzer.py         (Flask dev server, port 5000)
  python run.py                 (recommended — checks deps first)
"""

import os
import json
import logging
import tempfile
import traceback
from pathlib import Path

from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Environment + logging
# ---------------------------------------------------------------------------
load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------
app = Flask(__name__)

# CORS: allow all origins in dev.  In production, restrict to your Vercel domain:
#   CORS(app, origins=["https://smarrtif-cv-analyzer.vercel.app"])
CORS(app, origins="*", supports_credentials=True)

# ---------------------------------------------------------------------------
# Lazy NLP initialisation
# NLP models are heavy (~100 MB for spaCy + sklearn).  We initialise them
# once on first request rather than at import time so the server starts fast.
# ---------------------------------------------------------------------------
_nlp_engine: object | None = None
_scorer:     object | None = None

def _get_nlp_engine():
    global _nlp_engine
    if _nlp_engine is None:
        from nlp_engine import CVNLPEngine
        logger.info("Loading spaCy NLP engine…")
        _nlp_engine = CVNLPEngine()
        logger.info("NLP engine ready")
    return _nlp_engine

def _get_scorer():
    global _scorer
    if _scorer is None:
        from scorer import CVScorer
        _scorer = CVScorer()
    return _scorer

# ---------------------------------------------------------------------------
# Path helpers
# ---------------------------------------------------------------------------
_ROOT = Path(__file__).parent.parent  # f:/cv-analyzer/
_DATA = _ROOT / "data"


def _load_role_profiles() -> dict:
    """Load role profiles from the shared JSON file."""
    path = _DATA / "role_profiles.json"
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        logger.error(f"role_profiles.json not found at {path}")
        return {}


def _allowed_file(filename: str) -> bool:
    return filename.lower().endswith((".pdf", ".doc", ".docx"))


# ---------------------------------------------------------------------------
# ── GET /api/health ──────────────────────────────────────────────────────────
# ---------------------------------------------------------------------------
@app.get("/api/health")
def health():
    """
    Liveness + readiness check.

    Returns nlp_ready=false if the NLP engine hasn't been initialised yet.
    The frontend can poll this endpoint before uploading a CV to ensure the
    backend is warm.
    """
    return jsonify({
        "status":    "ok",
        "nlp_ready": _nlp_engine is not None,
        "version":   "1.0.0",
        "service":   "SMARRTIF AI CV Analyzer API",
    })


# ---------------------------------------------------------------------------
# ── GET /api/roles ───────────────────────────────────────────────────────────
# ---------------------------------------------------------------------------
@app.get("/api/roles")
def get_roles():
    """
    Return all available role profiles from role_profiles.json.

    The frontend uses this to populate the role selector dropdown dynamically
    rather than hard-coding role names in HTML.
    """
    data = _load_role_profiles()
    roles = list(data.get("roles", {}).keys())
    return jsonify({
        "roles":    roles,
        "profiles": data.get("roles", {}),
    })


# ---------------------------------------------------------------------------
# ── POST /api/parse ──────────────────────────────────────────────────────────
# ---------------------------------------------------------------------------
@app.post("/api/parse")
def parse_cv():
    """
    Accept a PDF or DOCX file and return the parsed CV structure.

    Multipart form fields:
      cv_file  (required) — the CV file

    Returns:
      {success, parsed_cv}  where parsed_cv matches the CVNLPEngine.parse_cv() output
    """
    if "cv_file" not in request.files:
        return jsonify({"success": False, "error": "No cv_file in request"}), 400

    cv_file = request.files["cv_file"]
    if not cv_file.filename or not _allowed_file(cv_file.filename):
        return jsonify({"success": False, "error": "Only PDF, DOC, DOCX files are supported"}), 400

    # Save to a temp file — NLP engines need a file path, not a stream
    suffix = Path(cv_file.filename).suffix.lower()
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            cv_file.save(tmp.name)
            tmp_path = tmp.name

        nlp = _get_nlp_engine()

        # Extract text according to file type
        if suffix == ".pdf":
            text = nlp.extract_text_from_pdf(tmp_path)
        else:
            text = nlp.extract_text_from_docx(tmp_path)

        parsed = nlp.parse_cv(text)

        return jsonify({
            "success":  True,
            "parsed_cv": parsed,
        })

    except ValueError as exc:
        return jsonify({"success": False, "error": str(exc)}), 422
    except Exception as exc:
        logger.error(f"Parse error: {exc}\n{traceback.format_exc()}")
        return jsonify({"success": False, "error": "Internal server error during parsing"}), 500
    finally:
        # Always clean up the temp file
        try:
            os.unlink(tmp_path)
        except Exception:
            pass


# ---------------------------------------------------------------------------
# ── POST /api/analyze ────────────────────────────────────────────────────────
# ---------------------------------------------------------------------------
@app.post("/api/analyze")
def analyze_cv():
    """
    Full analysis pipeline: parse → score → return results.

    Multipart form fields:
      cv_file      (required)  — the CV file (PDF/DOCX)
      target_role  (required)  — role string matching a key in role_profiles.json
      github_url   (optional)  — GitHub profile URL for bonus scoring

    Returns the complete analysis_results object matching the sessionStorage
    contract defined in CLAUDE.md, so the JS dashboard can consume it unchanged.
    """
    # ── Validate inputs ──
    if "cv_file" not in request.files:
        return jsonify({"success": False, "error": "No cv_file in request"}), 400

    cv_file     = request.files["cv_file"]
    target_role = request.form.get("target_role", "").strip()
    github_url  = request.form.get("github_url",  "").strip()

    if not cv_file.filename or not _allowed_file(cv_file.filename):
        return jsonify({"success": False, "error": "Only PDF, DOC, DOCX files are supported"}), 400

    profiles = _load_role_profiles().get("roles", {})
    if target_role not in profiles:
        return jsonify({
            "success": False,
            "error":   f"Unknown role '{target_role}'. Valid roles: {list(profiles)}",
        }), 400

    suffix = Path(cv_file.filename).suffix.lower()
    tmp_path = None

    try:
        # ── Step 1: Extract text ──
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            cv_file.save(tmp.name)
            tmp_path = tmp.name

        nlp = _get_nlp_engine()
        logger.info(f"[Analyze] Extracting text from {cv_file.filename!r}")

        if suffix == ".pdf":
            text = nlp.extract_text_from_pdf(tmp_path)
        else:
            text = nlp.extract_text_from_docx(tmp_path)

        if not text.strip():
            return jsonify({"success": False, "error": "Could not extract any text from the file"}), 422

        # ── Step 2: Parse ──
        logger.info(f"[Analyze] Parsing CV for role: {target_role}")
        parsed = nlp.parse_cv(text)

        # ── Step 3: Score ──
        logger.info("[Analyze] Scoring…")
        scorer = _get_scorer()
        scores = scorer.score_all(parsed, text, target_role)

        # ── Step 4: Recommendations ──
        # Load the recommendations JSON and build a minimal recs structure.
        # In production this would delegate to a Python port of RecommendationEngine.
        recs = _build_recommendations(
            parsed.get("skills", {}).get("detected", []),
            scores,
            target_role,
        )

        # ── Step 5: GitHub (optional) ──
        github_data = None
        if github_url:
            try:
                from mock_integrations import GitHubAPIHelper
                github_data = GitHubAPIHelper.analyze_from_url(github_url)
                logger.info(f"[Analyze] GitHub score: {github_data.get('score')}")
            except Exception as gh_exc:
                logger.warning(f"[Analyze] GitHub analysis skipped: {gh_exc}")

        # ── Assemble result ──
        result = {
            "filename":        cv_file.filename,
            "role":            target_role,
            "parsedCV":        {**parsed, "raw_text": ""},  # strip raw text
            "scores":          scores,
            "recommendations": recs,
            "github":          github_data,
            "timestamp":       _now_ms(),
            "isDemo":          False,
        }

        return jsonify({"success": True, "analysis_results": result})

    except ValueError as exc:
        return jsonify({"success": False, "error": str(exc)}), 422
    except Exception as exc:
        logger.error(f"[Analyze] Pipeline error: {exc}\n{traceback.format_exc()}")
        return jsonify({"success": False, "error": "Internal server error during analysis"}), 500
    finally:
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except Exception:
                pass


# ---------------------------------------------------------------------------
# ── POST /api/github ─────────────────────────────────────────────────────────
# ---------------------------------------------------------------------------
@app.post("/api/github")
def analyze_github():
    """
    Fetch and score a GitHub profile.

    JSON body:
      {"github_url": "https://github.com/username"}

    Returns the same GitHub score object shape as js/github.js GitHubAnalyzer
    so the dashboard can render it without changes.
    """
    body = request.get_json(force=True, silent=True) or {}
    github_url = body.get("github_url", "").strip()

    if not github_url:
        return jsonify({"success": False, "error": "github_url is required"}), 400

    try:
        from mock_integrations import GitHubAPIHelper
        result = GitHubAPIHelper.analyze_from_url(github_url)
        return jsonify({"success": True, "github": result})
    except ValueError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400
    except Exception as exc:
        logger.error(f"GitHub analysis error: {exc}")
        return jsonify({"success": False, "error": str(exc)}), 500


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------
def _now_ms() -> int:
    import time
    return int(time.time() * 1000)


def _build_recommendations(
    detected_skills: list[str],
    scores: dict,
    role: str,
) -> dict:
    """
    Build a recommendations object from the recommendations.json data file,
    filtering to skills not detected in the CV and ordering by priority.

    This mirrors the JS RecommendationEngine logic in Python so the API
    response matches the same shape the dashboard expects.
    """
    recs_path = _DATA / "recommendations.json"
    try:
        with open(recs_path, encoding="utf-8") as f:
            all_recs = json.load(f)
    except FileNotFoundError:
        return {"skill_gaps": [], "general": "", "action_plan": []}

    skill_recs    = all_recs.get("skill_recommendations", [])
    general_recs  = all_recs.get("general_recommendations", {})
    detected_lower = {s.lower() for s in detected_skills}

    # Find skill gaps: skills in recommendations that the CV doesn't mention
    gaps = []
    for rec in skill_recs:
        skill = rec.get("skill", "").lower()
        # Bidirectional substring match — same logic as JS
        already_has = any(skill in d or d in skill for d in detected_lower)
        if not already_has:
            gaps.append(rec)

    # Sort: high priority first, then by estimated_hours ascending
    priority_order = {"high": 0, "medium": 1, "low": 2}
    gaps.sort(key=lambda r: (
        priority_order.get(r.get("priority", "low"), 2),
        r.get("estimated_hours", 999),
    ))

    # Select general recommendation based on overall score
    overall = scores.get("overall_score", 0)
    if overall >= 75:
        general_msg = general_recs.get("high", "")
    elif overall >= 50:
        general_msg = general_recs.get("medium", "")
    else:
        general_msg = general_recs.get("low", "")

    # Build a 3-step action plan from the top 3 high-priority gaps
    high_gaps = [g for g in gaps if g.get("priority") == "high"][:3]
    action_plan = [
        {
            "step":  i + 1,
            "title": f"Learn {g['skill']}",
            "desc":  g.get("gap_recommendation", ""),
            "hours": g.get("estimated_hours", 20),
        }
        for i, g in enumerate(high_gaps)
    ]

    return {
        "skill_gaps":    gaps[:10],   # top 10 gaps
        "general":       general_msg,
        "action_plan":   action_plan,
        "total_gaps":    len(gaps),
        "high_priority": len([g for g in gaps if g.get("priority") == "high"]),
    }


# ---------------------------------------------------------------------------
# Error handlers
# ---------------------------------------------------------------------------
@app.errorhandler(404)
def not_found(e):
    return jsonify({"error": "Endpoint not found", "status": 404}), 404

@app.errorhandler(405)
def method_not_allowed(e):
    return jsonify({"error": "Method not allowed", "status": 405}), 405

@app.errorhandler(413)
def too_large(e):
    return jsonify({"error": "File too large (max 10 MB)", "status": 413}), 413


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    debug = os.getenv("FLASK_DEBUG", "true").lower() == "true"

    logger.info("=" * 60)
    logger.info("  SMARRTIF AI CV Analyzer — Python NLP Backend")
    logger.info("=" * 60)
    logger.info(f"  Starting on http://localhost:{port}")
    logger.info(f"  Debug mode: {debug}")
    logger.info("")
    logger.info("  Endpoints:")
    logger.info(f"    GET  http://localhost:{port}/api/health")
    logger.info(f"    GET  http://localhost:{port}/api/roles")
    logger.info(f"    POST http://localhost:{port}/api/parse")
    logger.info(f"    POST http://localhost:{port}/api/analyze")
    logger.info(f"    POST http://localhost:{port}/api/github")
    logger.info("=" * 60)

    app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024  # 10 MB limit
    app.run(host="0.0.0.0", port=port, debug=debug)
