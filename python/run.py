"""
python/run.py — Server Startup Script
SMARRTIF AI CV Analyzer

Performs pre-flight checks before starting the Flask server:
  1. Python version check (3.10+ required for type union syntax)
  2. Required packages installed
  3. spaCy model downloaded
  4. Data files present

Run from the project root or the python/ directory:
    python python/run.py
    cd python && python run.py
"""

import sys
import subprocess
import importlib
from pathlib import Path

# ---------------------------------------------------------------------------
# Colour helpers for terminal output (no external deps)
# ---------------------------------------------------------------------------
def _green(s: str) -> str:   return f"\033[92m{s}\033[0m"
def _red(s: str) -> str:     return f"\033[91m{s}\033[0m"
def _yellow(s: str) -> str:  return f"\033[93m{s}\033[0m"
def _bold(s: str) -> str:    return f"\033[1m{s}\033[0m"
def _cyan(s: str) -> str:    return f"\033[96m{s}\033[0m"

def _ok(msg: str):   print(f"  {_green('✓')} {msg}")
def _warn(msg: str): print(f"  {_yellow('⚠')} {msg}")
def _fail(msg: str): print(f"  {_red('✗')} {msg}")
def _info(msg: str): print(f"  {_cyan('→')} {msg}")


# ---------------------------------------------------------------------------
# Check 1: Python version
# ---------------------------------------------------------------------------
def check_python_version():
    print(_bold("\n[1/4] Checking Python version…"))
    major, minor = sys.version_info[:2]
    if major < 3 or (major == 3 and minor < 10):
        _fail(f"Python {major}.{minor} detected. Python 3.10+ is required.")
        _info("Install Python 3.10+ from https://python.org/downloads")
        sys.exit(1)
    _ok(f"Python {major}.{minor}.{sys.version_info.micro} ✓")


# ---------------------------------------------------------------------------
# Check 2: Required packages
# ---------------------------------------------------------------------------
REQUIRED_PACKAGES = [
    ("flask",        "Flask"),
    ("flask_cors",   "Flask-CORS"),
    ("fitz",         "PyMuPDF"),
    ("docx",         "python-docx"),
    ("spacy",        "spaCy"),
    ("nltk",         "NLTK"),
    ("sklearn",      "scikit-learn"),
    ("pandas",       "pandas"),
    ("numpy",        "NumPy"),
    ("requests",     "requests"),
    ("dotenv",       "python-dotenv"),
]

OPTIONAL_PACKAGES = [
    ("transformers", "transformers (HuggingFace)"),
    ("torch",        "PyTorch"),
]

def check_packages():
    print(_bold("\n[2/4] Checking installed packages…"))
    all_ok = True
    missing = []

    for import_name, display_name in REQUIRED_PACKAGES:
        try:
            importlib.import_module(import_name)
            _ok(display_name)
        except ImportError:
            _fail(f"{display_name} not installed")
            missing.append(display_name)
            all_ok = False

    for import_name, display_name in OPTIONAL_PACKAGES:
        try:
            importlib.import_module(import_name)
            _ok(f"{display_name} (optional)")
        except ImportError:
            _warn(f"{display_name} not installed (optional — heavy download, skip if not needed)")

    if not all_ok:
        print()
        _fail("Some required packages are missing.")
        _info("Install them with:")
        # Resolve path to requirements.txt regardless of cwd
        req_path = Path(__file__).parent / "requirements.txt"
        print(f"\n    pip install -r {req_path}\n")
        sys.exit(1)


# ---------------------------------------------------------------------------
# Check 3: spaCy model
# ---------------------------------------------------------------------------
def check_spacy_model():
    print(_bold("\n[3/4] Checking spaCy model…"))
    try:
        import spacy
        spacy.load("en_core_web_sm")
        _ok("spaCy model 'en_core_web_sm' is ready")
    except OSError:
        _warn("spaCy model 'en_core_web_sm' not found — downloading…")
        result = subprocess.run(
            [sys.executable, "-m", "spacy", "download", "en_core_web_sm"],
            capture_output=True,
            text=True,
        )
        if result.returncode == 0:
            _ok("spaCy model downloaded successfully")
        else:
            _fail("Failed to download spaCy model:")
            print(result.stderr)
            _info("Try manually: python -m spacy download en_core_web_sm")
            sys.exit(1)
    except Exception as exc:
        _fail(f"Unexpected error checking spaCy model: {exc}")
        sys.exit(1)


# ---------------------------------------------------------------------------
# Check 4: Data files
# ---------------------------------------------------------------------------
def check_data_files():
    print(_bold("\n[4/4] Checking data files…"))
    root      = Path(__file__).parent.parent
    data_dir  = root / "data"
    required  = [
        data_dir / "role_profiles.json",
        data_dir / "recommendations.json",
    ]
    all_ok = True
    for f in required:
        if f.exists():
            _ok(f.name)
        else:
            _fail(f"{f} not found")
            all_ok = False

    if not all_ok:
        _fail("Missing data files. Run from the project root (f:/cv-analyzer/).")
        sys.exit(1)


# ---------------------------------------------------------------------------
# Start server
# ---------------------------------------------------------------------------
def start_server():
    port = 5000
    print()
    print(_bold("=" * 60))
    print(_bold("  SMARRTIF AI CV Analyzer — NLP Backend"))
    print(_bold("=" * 60))
    print()
    print(f"  Starting Flask server on port {port}…")
    print()
    print(f"  {_cyan('Available endpoints:')}")
    print(f"    GET  http://localhost:{port}/api/health")
    print(f"    GET  http://localhost:{port}/api/roles")
    print(f"    POST http://localhost:{port}/api/parse    (multipart: cv_file)")
    print(f"    POST http://localhost:{port}/api/analyze  (multipart: cv_file, target_role)")
    print(f"    POST http://localhost:{port}/api/github   (json: github_url)")
    print()
    print(f"  {_yellow('Note:')} The NLP engine loads lazily on the first request (~3–5s warm-up).")
    print(f"  {_yellow('Note:')} Set GITHUB_TOKEN env var to increase GitHub API rate limit to 5,000/hr.")
    print()
    print(_bold("=" * 60))
    print()

    # Add the python/ directory to sys.path so imports work from any cwd
    python_dir = str(Path(__file__).parent)
    if python_dir not in sys.path:
        sys.path.insert(0, python_dir)

    # Import and run the Flask app
    from cv_analyzer import app
    app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024  # 10 MB
    app.run(host="0.0.0.0", port=port, debug=True, use_reloader=False)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    print()
    print(_bold("  SMARRTIF AI — CV Analyzer Backend Pre-flight Check"))

    check_python_version()
    check_packages()
    check_spacy_model()
    check_data_files()

    print()
    print(_green("  All checks passed!"))
    start_server()
