# Data sources

The implementation uses CelesTrak GP/OMM documentation and elements, SATCAT, and the CelesTrak launch boxscore: https://celestrak.org/NORAD/documentation/gp-data-formats.php, https://celestrak.org/satcat/, and https://celestrak.org/satcat/launch-boxscore.php. NASA Orbital Debris and NASA CARA provide explanatory sources. Launch Library 2 is a future integration reference, not a live dependency in this offline build: https://ll.thespacedevs.com/docs.

The current bundled real snapshot is labeled `celestrak-groups-2026-10-24`. It combines the documented `active`, `cosmos-2251-debris`, `fengyun-1c-debris`, `iridium-33-debris`, and `last-30-days` groups, deduplicated by NORAD catalog ID, and joins SATCAT metadata. The refresh records retrieval time, epoch range, source URLs, and coverage in `data/real-snapshot-provenance.json`. CelesTrak did not expose a `GROUP=all` endpoint during refresh, so coverage is explicitly partial. `satellite.js` 7.1.0 propagates the OMM records with SGP4.

The local Earth texture is the `earth_atmos_2048.jpg` texture distributed with the Three.js examples repository, bundled locally at `client/earth-texture.jpg` so the globe does not depend on a runtime CDN. Source reference: https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg. It is used as a local visual asset; the app does not claim the texture is a live Earth observation.

The refresh provenance is stored in `data/real-snapshot-provenance.json`: retrieval time `2026-10-24T09:31:11.728Z`, 19,476 orbital records, 71,132 SATCAT metadata records, and the five named CelesTrak groups listed above. The snapshot is partial by design because CelesTrak did not expose a public `GROUP=all` endpoint during refresh.
