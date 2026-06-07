"""
python/mock_integrations.py — Mock API Integration Classes
SMARRTIF AI CV Analyzer

This module provides realistic mock implementations of third-party platform
integrations.  Each class documents:
  - What the real API call would look like
  - Authentication requirements
  - Rate limits and quotas
  - Data structures returned

These mocks are used in the /api/analyze endpoint during development.
Real implementations would replace each method body while keeping the
same interface contract.

See also: docs/api_integration_plan.md for the full integration roadmap.
"""

import re
import logging
import requests
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# GitHub — live integration helper (wraps the real GitHub REST API)
# ---------------------------------------------------------------------------

# Language → skill name mappings (mirrors js/github.js LANG_MAP)
_LANG_MAP: dict[str, list[str]] = {
    "Python":           ["python", "pandas", "numpy"],
    "Jupyter Notebook": ["python", "data science", "pandas", "numpy"],
    "R":                ["r", "statistical analysis"],
    "JavaScript":       ["javascript", "node.js"],
    "TypeScript":       ["typescript"],
    "Java":             ["java"],
    "Go":               ["go"],
    "Rust":             ["rust"],
    "C++":              ["c++"],
    "C#":               ["c#", ".net"],
    "SQL":              ["sql"],
    "Shell":            ["bash", "linux"],
    "HCL":              ["terraform", "infrastructure as code"],
    "Dockerfile":       ["docker", "containerization"],
    "YAML":             ["ci/cd pipelines", "devops"],
}

# GitHub topic → skill mappings (mirrors js/github.js TOPIC_MAP)
_TOPIC_MAP: dict[str, str] = {
    "machine-learning": "machine learning",
    "deep-learning":    "deep learning",
    "nlp":              "natural language processing",
    "data-science":     "data science",
    "tensorflow":       "tensorflow or pytorch",
    "pytorch":          "tensorflow or pytorch",
    "scikit-learn":     "scikit-learn",
    "pandas":           "pandas & numpy",
    "numpy":            "pandas & numpy",
    "react":            "javascript",
    "django":           "python",
    "flask":            "python",
    "fastapi":          "python",
    "docker":           "containerization (docker)",
    "kubernetes":       "kubernetes",
    "aws":              "cloud platforms (aws / gcp / azure)",
    "gcp":              "cloud platforms (aws / gcp / azure)",
    "azure":            "cloud platforms (aws / gcp / azure)",
    "sql":              "sql",
    "postgresql":       "relational databases (postgresql / mysql)",
    "mongodb":          "nosql",
    "redis":            "redis",
    "terraform":        "infrastructure as code (terraform / pulumi)",
    "ci-cd":            "ci/cd pipelines",
    "rest-api":         "restful api design",
    "graphql":          "graphql",
    "microservices":    "microservices architecture",
    "tableau":          "tableau",
    "powerbi":          "power bi",
    "spark":            "apache spark",
    "kafka":            "event-driven architecture (kafka / rabbitmq)",
    "airflow":          "apache airflow",
    "mlflow":           "experiment tracking (mlflow / w&b)",
    "langchain":        "langchain / llamaindex",
    "llm":              "large language models (llms)",
    "rag":              "retrieval-augmented generation (rag)",
}


class GitHubAPIHelper:
    """
    Thin wrapper around the public GitHub REST API v3.

    Authentication:
        Unauthenticated requests: 60 requests/hour (per IP)
        Authenticated (personal access token): 5,000 requests/hour

        To use authenticated mode, set the GITHUB_TOKEN environment variable:
            export GITHUB_TOKEN=ghp_your_token_here
        The token only needs the `public_repo` read scope.

    Endpoints used:
        GET /users/{username}                — profile metadata
        GET /users/{username}/repos          — repository list (max 100)
        GET /users/{username}/events/public  — recent activity (rate signal)

    All methods are @staticmethod — no instance needed.
    """

    GITHUB_API_BASE = "https://api.github.com"

    @staticmethod
    def _headers() -> dict:
        """Build auth headers, falling back to unauthenticated if no token."""
        import os
        token = os.getenv("GITHUB_TOKEN", "")
        if token:
            return {
                "Authorization": f"token {token}",
                "Accept": "application/vnd.github.v3+json",
            }
        return {"Accept": "application/vnd.github.v3+json"}

    @staticmethod
    def _extract_username(url: str) -> str:
        """
        Parse a GitHub profile URL and extract the username.

        Accepts formats:
          https://github.com/username
          https://github.com/username/
          github.com/username
          username   (bare username)
        """
        url = url.strip().rstrip("/")
        if "github.com" in url:
            parsed = urlparse(url if "://" in url else "https://" + url)
            parts  = parsed.path.strip("/").split("/")
            if parts and parts[0]:
                return parts[0]
        # Treat as bare username if no domain
        if re.match(r"^[a-zA-Z0-9_-]+$", url):
            return url
        raise ValueError(f"Cannot extract GitHub username from: {url!r}")

    @staticmethod
    def analyze_from_url(github_url: str) -> dict:
        """
        Full GitHub profile analysis: fetch user + repos, compute score.

        This is the live implementation (not a mock) — it calls the real
        GitHub REST API.  Non-200 responses raise ValueError with a human-
        readable message so the caller can surface it to the UI.

        Returns a dict matching the shape expected by the JS dashboard:
            {
                username, score, repos, stars, followers, following,
                languages, detected_skills, top_repos, avatar_url, profile_url
            }
        """
        username = GitHubAPIHelper._extract_username(github_url)
        headers  = GitHubAPIHelper._headers()

        # ── Fetch user profile ──
        user_resp = requests.get(
            f"{GitHubAPIHelper.GITHUB_API_BASE}/users/{username}",
            headers=headers,
            timeout=10,
        )
        if user_resp.status_code == 404:
            raise ValueError(f"GitHub user '{username}' not found")
        if user_resp.status_code == 403:
            raise ValueError("GitHub API rate limit exceeded (60 req/hr for unauthenticated requests)")
        if user_resp.status_code != 200:
            raise ValueError(f"GitHub API error {user_resp.status_code}")

        user = user_resp.json()

        # ── Fetch repositories (up to 100, sorted by last pushed) ──
        repos_resp = requests.get(
            f"{GitHubAPIHelper.GITHUB_API_BASE}/users/{username}/repos",
            headers=headers,
            params={"per_page": 100, "sort": "pushed", "type": "owner"},
            timeout=10,
        )
        repos = repos_resp.json() if repos_resp.status_code == 200 else []

        # ── Aggregate language data across all repos ──
        language_counts: dict[str, int] = {}
        for repo in repos:
            lang = repo.get("language")
            if lang:
                language_counts[lang] = language_counts.get(lang, 0) + 1

        # ── Collect topics from repos ──
        all_topics: set[str] = set()
        for repo in repos:
            all_topics.update(repo.get("topics", []))

        # ── Map languages + topics → skills ──
        detected_skills: set[str] = set()
        for lang, skills in _LANG_MAP.items():
            if lang in language_counts:
                detected_skills.update(skills)
        for topic in all_topics:
            if topic in _TOPIC_MAP:
                detected_skills.add(_TOPIC_MAP[topic])

        # ── Compute GitHub score (mirrors js/github.js formula exactly) ──
        total_stars = sum(r.get("stargazers_count", 0) for r in repos)
        repo_count  = len(repos)
        followers   = user.get("followers", 0)
        account_age = 2025 - int((user.get("created_at", "2020") or "2020")[:4])

        repo_score     = min(30, repo_count * 2)
        star_score     = min(20, total_stars / 5)
        lang_score     = min(20, len(language_counts) * 4)
        age_score      = min(15, account_age * 3)
        follower_score = min(15, followers * 0.5)
        github_score   = round(repo_score + star_score + lang_score + age_score + follower_score, 1)

        # ── Top repos by stars ──
        top_repos = sorted(repos, key=lambda r: r.get("stargazers_count", 0), reverse=True)[:3]
        top_repo_summaries = [
            {
                "name":        r.get("name"),
                "description": r.get("description") or "",
                "stars":       r.get("stargazers_count", 0),
                "language":    r.get("language"),
                "url":         r.get("html_url"),
            }
            for r in top_repos
        ]

        return {
            "username":        username,
            "score":           github_score,
            "repos":           repo_count,
            "stars":           total_stars,
            "followers":       followers,
            "following":       user.get("following", 0),
            "languages":       list(language_counts.keys()),
            "detected_skills": list(detected_skills),
            "top_repos":       top_repo_summaries,
            "avatar_url":      user.get("avatar_url", ""),
            "profile_url":     f"https://github.com/{username}",
            "bio":             user.get("bio") or "",
        }


# ---------------------------------------------------------------------------
# LinkedIn — mock integration
# ---------------------------------------------------------------------------

class LinkedInMockIntegration:
    """
    Mock implementation of LinkedIn Profile API integration.

    REAL IMPLEMENTATION REQUIREMENTS:
        Authentication:   OAuth 2.0 with Authorization Code Flow
        Required scopes:  r_liteprofile, r_emailaddress, r_member_social (partner only)
        Rate limits:      500 calls/day per app; burst limit 3 calls/second
        Documentation:    https://developer.linkedin.com/docs/rest-api

    NOTE: LinkedIn's Marketing Developer Program (MDP) is required for most
    profile data access beyond basic fields.  This is a whitelist programme
    and not available to all apps.  The mock below shows the data shape that
    the real API would return after a successful OAuth flow.

    Real OAuth flow:
        1. Redirect user to: https://www.linkedin.com/oauth/v2/authorization
           ?response_type=code&client_id={CLIENT_ID}&redirect_uri={REDIRECT_URI}
           &scope=r_liteprofile%20r_emailaddress
        2. Exchange code for token: POST https://www.linkedin.com/oauth/v2/accessToken
        3. Call API: GET https://api.linkedin.com/v2/me
           Authorization: Bearer {access_token}
        4. Call profile picture: GET https://api.linkedin.com/v2/me?projection=(profilePicture(displayImage~:playableStreams))

    See docs/api_integration_plan.md for complete OAuth diagram.
    """

    @staticmethod
    def get_profile(linkedin_url: str) -> dict:
        """
        Return a realistic mock LinkedIn profile data structure.

        Real implementation would:
            1. Extract the vanity URL slug from linkedin_url
            2. Look up the member ID via GET /v2/people/(vanityName:{slug})
            3. Fetch full profile via GET /v2/me with projection parameters
            4. Fetch positions via GET /v2/positions
            5. Fetch skills via GET /v2/skills (requires additional permission)

        Rate limit: 500 API calls per day per application.

        Args:
            linkedin_url: e.g. "https://www.linkedin.com/in/username"

        Returns:
            Mock profile dict matching real LinkedIn API response shape.
        """
        # Extract username for personalization
        slug = linkedin_url.rstrip("/").split("/")[-1] if "linkedin.com" in linkedin_url else "candidate"

        # ── Mock data — mirrors LinkedIn API v2 response structure ──
        return {
            "id":                f"mock_{slug}",
            "localizedFirstName": "Sample",
            "localizedLastName":  "Candidate",
            "localizedHeadline":  "Data Scientist | Machine Learning | Python",
            "localizedSummary":   (
                "Passionate data scientist with 3+ years of experience building "
                "ML models for production systems.  Expertise in Python, TensorFlow, "
                "and cloud-native data pipelines."
            ),
            "vanityName":         slug,
            "profilePicture":     None,  # real API returns CDN URL

            # Positions — real API: GET /v2/positions
            "positions": [
                {
                    "title":    "Data Scientist",
                    "company":  {"name": "TechCorp Ltd"},
                    "startDate": {"month": 6, "year": 2022},
                    "endDate":   None,   # current role
                    "isCurrent": True,
                    "description": "Built recommendation engine serving 2M daily users.",
                },
                {
                    "title":    "Data Analyst",
                    "company":  {"name": "Analytics Co"},
                    "startDate": {"month": 1, "year": 2021},
                    "endDate":   {"month": 5, "year": 2022},
                    "isCurrent": False,
                    "description": "Developed BI dashboards in Tableau and Power BI.",
                },
            ],

            # Education — real API: GET /v2/educations
            "educations": [
                {
                    "schoolName":    "University of Technology",
                    "degreeName":    "Bachelor of Science",
                    "fieldOfStudy":  "Computer Science",
                    "startDate":     {"year": 2017},
                    "endDate":       {"year": 2021},
                },
            ],

            # Skills — real API requires r_member_social scope (partner programme)
            "skills": [
                "Python", "Machine Learning", "TensorFlow", "SQL",
                "Tableau", "Power BI", "Statistical Analysis",
            ],

            # Connections — real API returns exact count only up to 500
            "connections": {"_total": 312},

            # Recommendations received — real API: GET /v2/recommendations
            "recommendationsReceived": 3,
        }

    @staticmethod
    def analyze_profile(profile_data: dict) -> dict:
        """
        Score a LinkedIn profile for completeness and strength.

        Scoring rubric (total 100 pts):
          headline         10 pts — presence of a descriptive headline
          summary          15 pts — presence of a detailed summary (> 50 words)
          experience       20 pts — at least 2 positions with descriptions
          skills           20 pts — at least 5 skills listed
          education        10 pts — at least 1 education entry
          connections      10 pts — 500+ connections
          recommendations  15 pts — at least 1 recommendation received

        Returns:
            {score, max_score, grade, breakdown, gaps}
        """
        breakdown = {}
        gaps      = []

        # Headline (10 pts)
        headline      = profile_data.get("localizedHeadline", "")
        headline_pts  = 10 if len(headline) > 10 else 0
        breakdown["headline"] = headline_pts
        if not headline_pts:
            gaps.append("Add a descriptive LinkedIn headline (e.g. 'Data Scientist | Python | ML')")

        # Summary (15 pts)
        summary     = profile_data.get("localizedSummary", "")
        summary_pts = 15 if len(summary.split()) > 50 else (8 if summary else 0)
        breakdown["summary"] = summary_pts
        if summary_pts < 15:
            gaps.append("Expand your LinkedIn summary to at least 50 words highlighting key achievements")

        # Experience (20 pts)
        positions    = profile_data.get("positions", [])
        exp_pts      = min(20, len(positions) * 8)  # 8 pts per position, max 20
        breakdown["experience"] = exp_pts
        if len(positions) < 2:
            gaps.append("Add at least 2 work experience entries with achievement-oriented descriptions")

        # Skills (20 pts)
        skills      = profile_data.get("skills", [])
        skill_pts   = 20 if len(skills) >= 5 else (12 if len(skills) >= 3 else 0)
        breakdown["skills"] = skill_pts
        if len(skills) < 5:
            gaps.append("Add at least 5 skills to your LinkedIn profile (recruiters filter by skills)")

        # Education (10 pts)
        educations  = profile_data.get("educations", [])
        edu_pts     = 10 if educations else 0
        breakdown["education"] = edu_pts
        if not educations:
            gaps.append("Add your educational background")

        # Connections (10 pts)
        connections      = profile_data.get("connections", {}).get("_total", 0)
        connection_pts   = 10 if connections >= 500 else (6 if connections >= 100 else 3)
        breakdown["connections"] = connection_pts
        if connections < 500:
            gaps.append("Grow your network to 500+ connections for '500+' badge visibility")

        # Recommendations (15 pts)
        recs      = profile_data.get("recommendationsReceived", 0)
        rec_pts   = 15 if recs >= 3 else (10 if recs >= 1 else 0)
        breakdown["recommendations"] = rec_pts
        if recs < 1:
            gaps.append("Request at least 1 LinkedIn recommendation from a colleague or manager")

        total     = sum(breakdown.values())
        max_score = 100
        grade     = (
            "A" if total >= 85 else
            "B" if total >= 70 else
            "C" if total >= 55 else
            "D"
        )

        return {
            "score":      total,
            "max_score":  max_score,
            "grade":      grade,
            "breakdown":  breakdown,
            "gaps":       gaps,
            "source":     "mock",  # flag so UI can show "mock data" label
        }


# ---------------------------------------------------------------------------
# Tableau Public — mock integration
# ---------------------------------------------------------------------------

class TableauMockIntegration:
    """
    Mock implementation of Tableau Public profile API.

    REAL IMPLEMENTATION:
        Tableau Public exposes a REST API for public profiles.
        Base URL: https://public.tableau.com/api/

        Endpoints:
          GET /profile/{username}/workbooks  — list of published workbooks/vizzes
          GET /workbook/{workbook_id}        — workbook metadata (views, favorites)
          GET /profile/{username}            — public profile info

        Authentication:
            Tableau Public profiles are fully public — no authentication required.
            The Tableau Server REST API (for private Server/Cloud) requires:
              POST /api/{version}/auth/signin with credentials
              Then use X-Tableau-Auth header for subsequent requests.

        Rate limits: Not officially documented for Public; ~100 req/min is safe.

    NOTE: Tableau also offers Metadata API (GraphQL) and VizQL Data Service for
    more granular data access from Tableau Cloud.
    """

    @staticmethod
    def get_public_profile(tableau_url: str) -> dict:
        """
        Return mock Tableau Public profile data.

        Real implementation:
            username = tableau_url.split("/profile/")[-1].split("/")[0]
            resp = requests.get(
                f"https://public.tableau.com/api/profile/{username}/workbooks",
                headers={"Content-Type": "application/json"}
            )
            return resp.json()

        Args:
            tableau_url: e.g. "https://public.tableau.com/profile/username"

        Returns:
            Mock profile dict matching Tableau Public API shape.
        """
        username = tableau_url.rstrip("/").split("/")[-1]

        return {
            "username":    username,
            "displayName": f"{username.title()} (Tableau Public)",
            "followersCount": 85,
            "followingCount": 40,
            "totalViews":   12400,
            "workbooks": [
                {
                    "id":          "wb_001",
                    "name":        "Sales Performance Dashboard",
                    "description": "Interactive sales KPI dashboard with regional breakdown",
                    "views":       4200,
                    "favorites":   67,
                    "isFeatured":  True,
                    "createdAt":   "2023-08-15",
                    "tags":        ["sales", "kpi", "interactive"],
                },
                {
                    "id":          "wb_002",
                    "name":        "COVID-19 Global Trends",
                    "description": "Time-series analysis of global pandemic data",
                    "views":       8100,
                    "favorites":   142,
                    "isFeatured":  False,
                    "createdAt":   "2022-03-01",
                    "tags":        ["healthcare", "time-series", "public data"],
                },
                {
                    "id":          "wb_003",
                    "name":        "E-Commerce Customer Segmentation",
                    "description": "RFM analysis and customer clustering",
                    "views":       1900,
                    "favorites":   31,
                    "isFeatured":  True,
                    "createdAt":   "2024-01-20",
                    "tags":        ["e-commerce", "clustering", "rfm"],
                },
            ],
        }

    @staticmethod
    def analyze_visualizations(profile_data: dict) -> dict:
        """
        Score Tableau profile based on portfolio quality and reach.

        Scoring (100 pts):
          Number of vizzes     40 pts — more public work = higher visibility
          Total views/favorites 30 pts — audience engagement proxy
          Featured content     30 pts — editorial quality signal

        Real implementation would also score:
          - Interactivity level (parameters, actions, filters)
          - Data source complexity (joins, calculated fields)
          - Viz type diversity (maps, scatter, custom)
        """
        workbooks = profile_data.get("workbooks", [])
        n_vizzes  = len(workbooks)
        viz_pts   = min(40, n_vizzes * 10)  # 10 pts per viz, max 40

        total_views   = sum(w.get("views", 0) for w in workbooks)
        total_favs    = sum(w.get("favorites", 0) for w in workbooks)
        engagement    = min(30, (total_views / 1000 * 8) + (total_favs / 10 * 5))

        featured      = sum(1 for w in workbooks if w.get("isFeatured"))
        featured_pts  = min(30, featured * 15)

        score = round(min(100, viz_pts + engagement + featured_pts), 1)

        return {
            "score":           score,
            "viz_count":       n_vizzes,
            "total_views":     total_views,
            "total_favorites": total_favs,
            "featured_count":  featured,
            "top_viz":         workbooks[0] if workbooks else None,
            "source":          "mock",
        }


# ---------------------------------------------------------------------------
# Power BI — mock integration
# ---------------------------------------------------------------------------

class PowerBIMockIntegration:
    """
    Mock implementation of Power BI Service API integration.

    REAL IMPLEMENTATION:
        Authentication: Azure Active Directory (AAD) OAuth 2.0
        App Registration: create an app in Azure Portal, grant Power BI permissions
        Required permissions: Report.Read.All, Dashboard.Read.All, Dataset.Read.All
        Consent type: Delegated (on behalf of user) or Application (service principal)

        OAuth flow:
            1. Register app at https://portal.azure.com → Azure Active Directory
            2. Redirect user to:
               https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/authorize
               ?client_id={CLIENT_ID}&response_type=code
               &scope=https://analysis.windows.net/powerbi/api/.default
            3. Exchange code: POST https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token
            4. API base: https://api.powerbi.com/v1.0/myorg/

        Key endpoints:
            GET /v1.0/myorg/reports              — list reports
            GET /v1.0/myorg/dashboards           — list dashboards
            GET /v1.0/myorg/datasets             — list datasets
            GET /v1.0/myorg/groups               — list workspaces
            POST /v1.0/myorg/reports/{id}/Export — export report to PDF/PPTX

        Rate limits: Officially 200 requests per hour per user; Premium ≥ 7,200/hr.

    NOTE: Power BI Public (powerbi.com/view) does NOT have an official public API.
    Embedding requires either an Embed token (capacity-based) or user authentication.
    """

    @staticmethod
    def get_workspace_profile(pbi_url: str) -> dict:
        """
        Return mock Power BI workspace/profile data.

        Real implementation would:
            1. Authenticate via Azure AD (see class docstring)
            2. GET https://api.powerbi.com/v1.0/myorg/dashboards
            3. GET https://api.powerbi.com/v1.0/myorg/reports
            4. Aggregate metadata

        Args:
            pbi_url: Power BI share link or workspace URL.

        Returns:
            Mock workspace dict.
        """
        return {
            "workspace_name": "Analytics Portfolio",
            "reports": [
                {
                    "id":          "rpt_001",
                    "name":        "Regional Sales Analysis",
                    "pages":       7,
                    "hasRLS":      True,   # Row-Level Security enabled
                    "embedUrl":    "https://app.powerbi.com/view?r=...",
                    "datasetType": "DirectQuery",
                    "sharedWith":  12,
                },
                {
                    "id":          "rpt_002",
                    "name":        "HR Workforce Dashboard",
                    "pages":       4,
                    "hasRLS":      False,
                    "embedUrl":    "https://app.powerbi.com/view?r=...",
                    "datasetType": "Import",
                    "sharedWith":  5,
                },
            ],
            "dashboards": [
                {
                    "id":          "dash_001",
                    "displayName": "Executive KPI Dashboard",
                    "tilesCount":  8,
                    "isReadOnly":  False,
                    "sharedWith":  20,
                },
            ],
            "datasets": [
                {
                    "id":               "ds_001",
                    "name":             "Sales Data Warehouse",
                    "refreshSchedule":  "Daily at 06:00 UTC",
                    "tablesCount":      12,
                    "isRefreshable":    True,
                    "configuredBy":     "admin@company.com",
                },
            ],
        }

    @staticmethod
    def analyze_dashboards(profile_data: dict) -> dict:
        """
        Score Power BI portfolio based on report complexity and sharing reach.

        Scoring (100 pts):
          Dashboard complexity  40 pts — page count, RLS, DirectQuery usage
          Sharing reach         30 pts — number of users dashboards are shared with
          Dataset sophistication 30 pts — refreshable datasets, table count

        Real implementation would also evaluate:
          - DAX measure complexity (via dataset analysis)
          - Row-Level Security implementation (security best practice)
          - Premium feature usage (paginated reports, AI visuals)
          - Deployment pipeline configuration (dev → test → prod)
        """
        reports    = profile_data.get("reports", [])
        dashboards = profile_data.get("dashboards", [])
        datasets   = profile_data.get("datasets", [])

        # Complexity score
        total_pages    = sum(r.get("pages", 0) for r in reports)
        rls_count      = sum(1 for r in reports if r.get("hasRLS"))
        dq_count       = sum(1 for r in reports if r.get("datasetType") == "DirectQuery")
        complexity_pts = min(40, total_pages * 3 + rls_count * 5 + dq_count * 4)

        # Reach score
        total_shared  = sum(r.get("sharedWith", 0) for r in reports)
        total_shared += sum(d.get("sharedWith", 0) for d in dashboards)
        reach_pts     = min(30, total_shared * 1.5)

        # Dataset sophistication
        refreshable = sum(1 for ds in datasets if ds.get("isRefreshable"))
        table_total = sum(ds.get("tablesCount", 0) for ds in datasets)
        dataset_pts = min(30, refreshable * 10 + table_total * 1)

        score = round(min(100, complexity_pts + reach_pts + dataset_pts), 1)

        return {
            "score":           score,
            "report_count":    len(reports),
            "dashboard_count": len(dashboards),
            "dataset_count":   len(datasets),
            "total_pages":     total_pages,
            "rls_enabled":     rls_count > 0,
            "source":          "mock",
        }
