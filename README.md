# India AI Data Center Tracker

An interactive map + directory tracking AI, GPU-cloud, and hyperscale data
center projects being built and operated across India — who's building them,
where, how big, and how far along.

**[Live demo →](https://pantinarajesh.github.io/aidatacentermapping/)**

![status](https://img.shields.io/badge/status-active--tracking-brightgreen)

## What it does

- **Map view** — every facility plotted on India, marker size scaled to power
  capacity (MW), color-coded by status (operational / under construction /
  planned), clustered when zoomed out.
- **Hover or click** any marker for a quick popup; click through (or click a
  list/table row) for a full detail panel: operator, parent group, capacity,
  GPU/compute specs, disclosed investment, partners, timeline, and — critically
  — **linked sources** for every claim.
- **Table view** — the same dataset as a sortable spreadsheet, with a
  one-click CSV export of whatever's currently filtered.
- **Timeline view** — every announcement grouped by year, most recent first.
- **Capital Flows view** — which financial investors (PE, sovereign, pension,
  development funds — CPP Investments, Blackstone, TPG, IFC, Alpha Wave
  Global, Carlyle, Anchorage Capital) are backing which operators, not just
  who's building what.
- **Policy & Incentives view** — national and state programs (the $100B Adani
  pledge, the IndiaAI Mission GPU pool, UP's Data Centre Policy) tracked
  separately from the physical facilities they enable.
- **Conflict flagging** — facilities where public sources disagree (e.g. two
  different investment figures for the same project) get a visible ⚠ badge
  and an explanation, instead of the tracker silently picking one number.
- **Sustainability layer** — land footprint, power source, and cooling tech
  where disclosed, filterable and shown in the detail panel.
- **Filters** — by status, operator, state/UT, facility type, and sustainability
  data availability, plus free-text search across name/operator/city.
- **Summary stats bar** — total facilities, aggregate MW capacity, disclosed
  investment, states covered, distinct operators, conflicting-report count,
  and data snapshot date.
- **Open data** — a "Data & API" panel with one-click JSON/CSV downloads of
  the full dataset and the raw endpoint URL, so anyone can build on it
  directly without scraping the site.
- **Public changelog** — what changed in the dataset or features, in-app.
- **No backend required** — pure static HTML/CSS/JS, so it runs anywhere
  (open the file directly, any static host, GitHub Pages, Netlify, Vercel).

## Why this shape

AI data center investment in India is moving fast and every operator reports
numbers differently (MW vs. GPUs vs. ₹crore vs. USD, "announced" vs. "under
construction" used loosely). Rather than pretend to a precision the sector
doesn't have, the app:

- Keeps the dataset as **flat, human-editable JSON** (`data/datacenters.json`)
  separate from the code, so adding/correcting an entry never touches the app.
- Requires a **source URL per fact** where possible, surfaced directly in the
  UI — so anyone can verify a number instead of trusting the aggregator.
- Treats missing data as **"Unknown"**, never a guess.
- Ships a **validation script** (`scripts/validate-data.js`) that runs in CI
  on every push, catching bad lat/lng (outside India), missing required
  fields, duplicate IDs, or wrong types before they reach the site.
- Has an explicit **"Suggest an update"** link in the header (wired to open a
  pre-filled GitHub issue) because this dataset will go stale — that's
  expected, and the fix path should be one click.

## Running locally

No build step. Any static file server works, e.g.:

```bash
npx serve .
# or
python3 -m http.server 8080
```

Then open `http://localhost:8080` (or whatever port). Opening `index.html`
directly via `file://` also works, except `fetch()` of the JSON may be
blocked by some browsers' local file security policy — use a local server if
the map loads with zero markers.

## Updating the dataset

Edit `data/datacenters.json`. Each entry follows this shape:

```json
{
  "id": "unique-slug",
  "name": "Facility / project name",
  "operator": "Company operating it",
  "parentGroup": "Parent conglomerate, if any",
  "city": "City",
  "state": "State or Union Territory",
  "lat": 28.4744,
  "lng": 77.5040,
  "status": "operational | under_construction | planned | announced",
  "type": "AI/GPU Cloud Data Center | Hyperscale Data Center | ...",
  "capacityMW": 250,
  "gpuCount": "16,000+ Nvidia H100",
  "investmentUSD": 1000000000,
  "investmentDisplay": "$1B+",
  "announcedDate": "2023-10",
  "expectedCompletion": "2025",
  "partners": ["Nvidia"],
  "investors": [{ "name": "TPG", "amountUSD": 1000000000, "note": "Optional context" }],
  "sustainability": { "landAcres": 264, "powerSource": "Renewable (solar PPA)", "coolingType": "Liquid cooling" },
  "isPolicy": false,
  "conflictNote": "Only set when sources genuinely disagree on a figure — explain the discrepancy, don't just pick one silently.",
  "description": "One or two sentences of context.",
  "sources": [{ "title": "Publication — headline", "url": "https://..." }]
}
```

Only `id`, `name`, `operator`, and `status` are required — leave any other
field out (or use `null`/omit) if unknown; the UI renders "Unknown" /
"Undisclosed" rather than a blank. `lat`/`lng` are required for a pin to
appear on the map; without them the facility still shows in the sidebar list,
table, timeline, and (if applicable) the Capital Flows / Policy views.

- `investors` is for **financial** backers (PE, sovereign, pension, development
  funds) — keep tech/government partners in `partners` instead; an entry
  shows up in the Capital Flows view only if it has `investors`.
- `sustainability` is free-form (`landAcres`, `powerSource`, `coolingType`,
  `note` — include only the ones you have data for); its presence alone
  drives the "Sustainability data available" filter.
- `isPolicy: true` marks a national/state program (not a physical facility)
  for the Policy & Incentives view — don't set it on regular facilities.

After editing, validate:

```bash
node scripts/validate-data.js
```

This checks required fields, flags coordinates outside India's bounding box
(a common geocoding mistake), and catches duplicate IDs.

### Finding coordinates

Use any geocoder (e.g. OpenStreetMap Nominatim) on the specific locality
(e.g. "Greater Noida, Uttar Pradesh"), not just the city center — data
centers are often in dedicated tech parks/SEZs on the outskirts.

## Deploying

A GitHub Actions workflow (`.github/workflows/deploy.yml`) validates the
dataset and deploys the site to **GitHub Pages** on every push to `main`.
Enable Pages in the repo settings (Source: GitHub Actions) and it will
publish automatically. Any other static host (Netlify, Vercel, S3 + CloudFront)
works too — there's nothing to build.

## Project structure

```
index.html                  Page shell — topbar, nav tabs, stats bar, sidebar, all view panes, detail panel, modals
css/style.css                All styling (light/dark aware via prefers-color-scheme)
js/app.js                    App logic: data loading, filtering, map/table/timeline/capital/policy rendering, CSV export
data/datacenters.json        The dataset — edit this to add/update facilities
data/changelog.json          Entries shown in the in-app Changelog modal — add one per meaningful update
scripts/validate-data.js     Schema + sanity validation, run locally and in CI
.github/workflows/deploy.yml CI validation + GitHub Pages deploy
vendor/                      Self-hosted Leaflet, Leaflet.markercluster, and Inter — see THIRD-PARTY-NOTICES.md
LICENSE                      MIT license for the original code (see "Legal" below for the dataset's own terms)
```

## Stack

- [Leaflet](https://leafletjs.com/) + [Leaflet.markercluster](https://github.com/Leaflet/Leaflet.markercluster) for the map (CARTO basemap tiles, OpenStreetMap data)
- [Inter](https://rsms.me/inter/) typeface
- Vanilla JS, no framework/build step
- Plain JSON as the data layer

Leaflet, Leaflet.markercluster, and Inter are all vendored locally under
`vendor/` (not loaded from a CDN) — this keeps the site fully self-contained,
avoids sending visitor IPs to a third party on every page load just to fetch
a font or a library, and keeps it working if a CDN is ever down. See
[`vendor/THIRD-PARTY-NOTICES.md`](vendor/THIRD-PARTY-NOTICES.md) for each
library's license. Map tiles are the one thing still fetched live (from
CARTO), since tile sets are too large to bundle — attributed on-page per
OpenStreetMap's and CARTO's license terms.

## Legal

- **License**: the original code (HTML/CSS/JS) is MIT-licensed — see
  [`LICENSE`](LICENSE). The compiled dataset (`data/datacenters.json`,
  `data/changelog.json`) is released separately with no rights reserved
  (CC0-equivalent) — reuse it for anything, commercial included; see the
  in-app "Data & API" panel for details.
- **Not affiliated**: this is an independently compiled tracker, not
  affiliated with, endorsed by, or sponsored by any operator, investor, or
  government body it lists. Company and product names are trademarks of
  their respective owners, used here only in a descriptive/factual sense.
- **Not advice**: nothing on this site is investment, financial, or legal
  advice. Figures are self-reported by operators or estimated by journalists
  and change often — verify against the linked primary source before relying
  on any number.

## Ideas for extending this

- A "growth over time" chart (cumulative announced MW by quarter) — the Timeline view's data is already shaped for this.
- Per-state choropleth of total announced capacity.
- Water-use disclosures per facility (only power source and land are tracked today).
- Automated headline-scanning to flag new candidate facilities for manual review before they're added.
- Email/RSS alerts on new facilities or status changes.

## Disclaimer

This is an independently compiled tracker built from public announcements,
company press releases, and news coverage. It is **not** affiliated with,
endorsed by, or sourced from any company listed. Figures — especially MW,
GPU counts, and investment amounts — are self-reported by operators or
estimated by journalists and change frequently; treat every number as
approximate and check the linked source before relying on it. Coordinates
are geocoded to the best available public locality description and may be
approximate for facilities that haven't disclosed an exact address.
