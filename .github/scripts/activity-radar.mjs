// Generates github-activity-radar.svg: a 4-axis (commits/issues/PRs/reviews)
// breakdown chart, since GitHub's native "Activity overview" chart has no
// public API or embeddable image and must be reconstructed from GraphQL data.
const token = process.env.GITHUB_TOKEN;
const login = process.env.GITHUB_USER;

if (!token || !login) {
  throw new Error("GITHUB_TOKEN and GITHUB_USER must be set");
}

const query = `
  query($login: String!) {
    user(login: $login) {
      contributionsCollection {
        totalCommitContributions
        totalIssueContributions
        totalPullRequestContributions
        totalPullRequestReviewContributions
        contributionCalendar {
          totalContributions
        }
      }
    }
  }
`;

const res = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: {
    Authorization: `bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ query, variables: { login } }),
});

if (!res.ok) {
  throw new Error(`GitHub API request failed: ${res.status} ${await res.text()}`);
}

const { data, errors } = await res.json();
if (errors) {
  throw new Error(`GraphQL errors: ${JSON.stringify(errors)}`);
}

const c = data.user.contributionsCollection;
const counts = {
  codeReview: c.totalPullRequestReviewContributions,
  issues: c.totalIssueContributions,
  pullRequests: c.totalPullRequestContributions,
  commits: c.totalCommitContributions,
};
const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
const pct = Object.fromEntries(
  Object.entries(counts).map(([k, v]) => [k, (v / total) * 100])
);

const cx = 300;
const cy = 165;
const maxR = 110;

const axisPoint = (pct, angleDeg) => {
  const r = (pct / 100) * maxR;
  const rad = (angleDeg * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
};

// N = code review, E = issues, S = pull requests, W = commits
const pN = axisPoint(pct.codeReview, -90);
const pE = axisPoint(pct.issues, 0);
const pS = axisPoint(pct.pullRequests, 90);
const pW = axisPoint(pct.commits, 180);

const fmtPct = (n) => (n >= 1 ? `${Math.round(n)}%` : n > 0 ? "<1%" : "0%");

const svg = `<svg width="600" height="330" viewBox="0 0 600 330" xmlns="http://www.w3.org/2000/svg">
  <rect width="600" height="330" fill="#0d1117" rx="6"/>
  <text x="30" y="36" fill="#c9d1d9" font-family="-apple-system,Segoe UI,Helvetica,Arial,sans-serif" font-size="16" font-weight="600">Activity overview</text>
  <text x="30" y="58" fill="#8b949e" font-family="-apple-system,Segoe UI,Helvetica,Arial,sans-serif" font-size="12">${c.contributionCalendar.totalContributions} contributions in the last year</text>

  <line x1="${cx}" y1="${cy - maxR}" x2="${cx}" y2="${cy + maxR}" stroke="#30363d" stroke-width="1"/>
  <line x1="${cx - maxR}" y1="${cy}" x2="${cx + maxR}" y2="${cy}" stroke="#30363d" stroke-width="1"/>

  <polygon points="${pN.join(",")} ${pE.join(",")} ${pS.join(",")} ${pW.join(",")}" fill="#39d35333" stroke="#39d353" stroke-width="2" stroke-linejoin="round"/>

  <circle cx="${pN[0]}" cy="${pN[1]}" r="4" fill="#39d353"/>
  <circle cx="${pE[0]}" cy="${pE[1]}" r="4" fill="#39d353"/>
  <circle cx="${pS[0]}" cy="${pS[1]}" r="4" fill="#39d353"/>
  <circle cx="${pW[0]}" cy="${pW[1]}" r="4" fill="#39d353"/>

  <text x="${cx}" y="${cy - maxR - 14}" fill="#c9d1d9" font-family="-apple-system,Segoe UI,Helvetica,Arial,sans-serif" font-size="13" text-anchor="middle">Code review</text>
  <text x="${cx + maxR + 12}" y="${cy + 4}" fill="#c9d1d9" font-family="-apple-system,Segoe UI,Helvetica,Arial,sans-serif" font-size="13" text-anchor="start">Issues</text>
  <text x="${cx}" y="${cy + maxR + 26}" fill="#c9d1d9" font-family="-apple-system,Segoe UI,Helvetica,Arial,sans-serif" font-size="13" text-anchor="middle">Pull requests</text>
  <text x="${cx - maxR - 12}" y="${cy + 4}" fill="#c9d1d9" font-family="-apple-system,Segoe UI,Helvetica,Arial,sans-serif" font-size="13" text-anchor="end">Commits</text>

  <text x="${cx}" y="${cy - maxR - 30}" fill="#39d353" font-family="-apple-system,Segoe UI,Helvetica,Arial,sans-serif" font-size="13" font-weight="600" text-anchor="middle">${fmtPct(pct.codeReview)}</text>
  <text x="${cx + maxR + 12}" y="${cy - 14}" fill="#39d353" font-family="-apple-system,Segoe UI,Helvetica,Arial,sans-serif" font-size="13" font-weight="600" text-anchor="start">${fmtPct(pct.issues)}</text>
  <text x="${cx}" y="${cy + maxR + 42}" fill="#39d353" font-family="-apple-system,Segoe UI,Helvetica,Arial,sans-serif" font-size="13" font-weight="600" text-anchor="middle">${fmtPct(pct.pullRequests)}</text>
  <text x="${cx - maxR - 12}" y="${cy - 14}" fill="#39d353" font-family="-apple-system,Segoe UI,Helvetica,Arial,sans-serif" font-size="13" font-weight="600" text-anchor="end">${fmtPct(pct.commits)}</text>
</svg>`;

const fs = await import("node:fs/promises");
await fs.writeFile("github-activity-radar.svg", svg);
