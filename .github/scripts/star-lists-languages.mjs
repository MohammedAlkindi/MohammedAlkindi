// Generates github-star-lists.svg: a per-list language breakdown of starred
// repositories, since GitHub's star lists have no embeddable image and must
// be reconstructed from GraphQL data.
const token = process.env.GITHUB_TOKEN;
const login = process.env.GITHUB_USER;

if (!token || !login) {
  throw new Error("GITHUB_TOKEN and GITHUB_USER must be set");
}

const query = `
  query($login: String!) {
    user(login: $login) {
      lists(first: 20) {
        totalCount
        nodes {
          name
          description
          items(first: 100) {
            totalCount
            nodes {
              ... on Repository {
                primaryLanguage { name color }
              }
            }
          }
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

const esc = (s) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const fmtPct = (n) => `${parseFloat(n.toFixed(2))}%`;

const MAX_LANGUAGES = 8;

const lists = data.user.lists.nodes
  .map((list) => {
    const total = list.items.totalCount;
    const byLang = new Map();
    for (const repo of list.items.nodes) {
      if (!repo.primaryLanguage) continue;
      const { name, color } = repo.primaryLanguage;
      const entry = byLang.get(name) ?? { name, color: color ?? "#8b949e", count: 0 };
      entry.count += 1;
      byLang.set(name, entry);
    }
    const languages = [...byLang.values()]
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, MAX_LANGUAGES);
    return { name: list.name, description: list.description, total, languages };
  })
  .sort((a, b) => b.total - a.total);

// Layout
const W = 760;
const M = 40; // outer margin
const CONTENT_X = 78; // indent for list body (bar, legend, description)
const CONTENT_W = 604; // bar width, legend spans the same
const COL2_X = CONTENT_X + 312; // right legend column
const ROW_H = 26;

const FONT = `-apple-system,Segoe UI,Helvetica,Arial,sans-serif`;
const text = (x, y, content, { fill = "#c9d1d9", size = 13, weight, anchor } = {}) =>
  `<text x="${x}" y="${y}" fill="${fill}" font-family="${FONT}" font-size="${size}"${
    weight ? ` font-weight="${weight}"` : ""
  }${anchor ? ` text-anchor="${anchor}"` : ""}>${content}</text>`;

// Stacked "list" icon: three rows of dot + line
const listIcon = (x, y, color, scale = 1) => {
  const rows = [0, 5, 10]
    .map(
      (dy) =>
        `<circle cx="${x + 1.5 * scale}" cy="${y + dy * scale}" r="${1.5 * scale}" fill="${color}"/>` +
        `<rect x="${x + 6 * scale}" y="${y + (dy - 1) * scale}" width="${10 * scale}" height="${2 * scale}" rx="1" fill="${color}"/>`
    )
    .join("");
  return rows;
};

const parts = [];
let y = 0;

// Title
parts.push(text(W / 2, 42, `&#9660; Languages from star lists`, { fill: "#e6edf3", size: 20, weight: 600, anchor: "middle" }));

// "N Star lists" row
parts.push(listIcon(M, 68, "#8b949e", 1.2));
parts.push(text(M + 28, 80, `${data.user.lists.totalCount} Star lists`, { fill: "#58a6ff", size: 15, weight: 600 }));

y = 116;

for (const list of lists) {
  parts.push(listIcon(M + 16, y - 11, "#8b949e"));
  parts.push(text(CONTENT_X, y, esc(list.name), { fill: "#58a6ff", size: 15, weight: 600 }));
  y += 20;
  parts.push(text(CONTENT_X, y, `${list.total} ${list.total === 1 ? "repository" : "repositories"}`, { fill: "#8b949e", size: 12 }));
  y += 18;
  if (list.description) {
    const desc = list.description.length > 95 ? `${list.description.slice(0, 94)}…` : list.description;
    parts.push(text(CONTENT_X, y, esc(desc), { fill: "#8b949e", size: 12 }));
    y += 18;
  }

  // Stacked language bar; unshown/unknown languages fill the remainder in gray
  y += 4;
  let barX = CONTENT_X;
  const segments = [];
  for (const lang of list.languages) {
    const w = (lang.count / list.total) * CONTENT_W;
    segments.push(`<rect x="${barX.toFixed(2)}" y="${y}" width="${w.toFixed(2)}" height="8" fill="${lang.color}"/>`);
    barX += w;
  }
  if (barX < CONTENT_X + CONTENT_W - 0.5) {
    segments.push(`<rect x="${barX.toFixed(2)}" y="${y}" width="${(CONTENT_X + CONTENT_W - barX).toFixed(2)}" height="8" fill="#30363d"/>`);
  }
  parts.push(
    `<clipPath id="bar-${esc(list.name).replace(/[^a-zA-Z0-9]/g, "-")}"><rect x="${CONTENT_X}" y="${y}" width="${CONTENT_W}" height="8" rx="4"/></clipPath>` +
      `<g clip-path="url(#bar-${esc(list.name).replace(/[^a-zA-Z0-9]/g, "-")})">${segments.join("")}</g>`
  );
  y += 30;

  // Legend: two columns, row-major
  list.languages.forEach((lang, i) => {
    const colX = i % 2 === 0 ? CONTENT_X : COL2_X;
    const rowY = y + Math.floor(i / 2) * ROW_H;
    const colEnd = colX + 282;
    parts.push(`<circle cx="${colX + 5}" cy="${rowY - 4}" r="5" fill="${lang.color}"/>`);
    parts.push(text(colX + 18, rowY, esc(lang.name), { fill: "#c9d1d9", size: 13 }));
    parts.push(text(colX + 130, rowY, fmtPct((lang.count / list.total) * 100), { fill: "#8b949e", size: 12 }));
    parts.push(text(colEnd, rowY, `${lang.count}★`, { fill: "#8b949e", size: 12, anchor: "end" }));
  });
  y += Math.ceil(list.languages.length / 2) * ROW_H + 12;
}

const H = y + 8;

const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" fill="#0d1117" rx="6"/>
  ${parts.join("\n  ")}
</svg>`;

const fs = await import("node:fs/promises");
await fs.writeFile("github-star-lists.svg", svg);
