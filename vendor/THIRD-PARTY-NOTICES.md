# Third-party notices

This project vendors (bundles a local copy of) the following third-party
software instead of loading it from an external CDN at runtime — this keeps
the site fully self-contained, avoids leaking visitor IP addresses to CDN
operators on every page load, and keeps it working even if a CDN is down.
Each retains its own original license, reproduced in full in its directory.

| Library | Version | License | Location |
|---|---|---|---|
| [Leaflet](https://leafletjs.com/) | 1.9.4 | BSD-2-Clause | [`leaflet/LICENSE`](./leaflet/LICENSE) |
| [Leaflet.markercluster](https://github.com/Leaflet/Leaflet.markercluster) | 1.5.3 | MIT | [`leaflet.markercluster/LICENSE`](./leaflet.markercluster/LICENSE) |
| [Inter](https://rsms.me/inter/) typeface | latest (latin subset) | SIL Open Font License 1.1 | [`fonts/inter/LICENSE`](./fonts/inter/LICENSE) |

None of these projects are affiliated with or endorse this site; they're
used here under the terms of their respective licenses.

## Map tiles and data

Map tiles are served live from CARTO's basemap CDN (not vendored, since tile
sets are far too large to bundle) using OpenStreetMap data:

- © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors
  (data licensed under the [Open Database License](https://opendatacommons.org/licenses/odbl/))
- © [CARTO](https://carto.com/attributions) (basemap styling)

Attribution for both is displayed in the map's bottom-right corner on every
page load, per their license requirements.
