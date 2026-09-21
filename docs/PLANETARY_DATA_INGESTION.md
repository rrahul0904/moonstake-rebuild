# Planetary data ingestion contract

Atlas 259 must not invent official geography. Named-feature pricing and search are driven by source-provenanced public planetary data.

## Authorities

Primary nomenclature authority:
- USGS Gazetteer of Planetary Nomenclature / IAU Working Group for Planetary System Nomenclature
- https://planetarynames.wr.usgs.gov/

GIS/KML downloads:
- https://planetarynames.wr.usgs.gov/GIS_Downloads

Coordinate-system reference:
- https://planetarynames.wr.usgs.gov/TargetCoordinates

Mission imagery/body data:
- NASA Planetary Data System
- NASA/JPL mission and mapping products

## Canonical Atlas coordinate convention

Atlas stores registry coordinates as:

- latitude: planetocentric
- longitude direction: positive east
- longitude domain: -180 to 180

The USGS downloadable Gazetteer GIS/KML products are generated with east longitude and planetocentric latitude. Atlas converts 0–360 east longitude into -180–180 for its internal registry grid.

Do **not** silently convert planetographic latitude from a historical source into planetocentric latitude on an ellipsoidal body. Preserve the source coordinate-system label and use a verified body-specific transformation when a source is not already in the canonical import convention.

## Feature record provenance

Every imported official feature must preserve:

- Atlas body ID
- source authority
- source feature ID
- source version/update date
- official name
- feature type
- IAU approval status
- approval date when available
- source coordinate-system label
- canonical latitude/longitude
- diameter when available
- origin/reference text when available
- stable Atlas registry position when the body uses surface positions

Stable key:

`<body>:usgs-iau:<source-feature-id>`

Changing map imagery, projection or UI labels must not change that feature identity or the registry position derived from canonical coordinates.

## Commercial rule

An IAU feature name is never sold and is never renamed by a customer.

Atlas may sell a digital registry/advertising position at or near an official feature. The UI must distinguish:

- **Official feature:** source-provenanced scientific nomenclature
- **Atlas label/brand:** user-created board content

By default, only features whose approval status is **Adopted by IAU** are eligible to drive named-ground premiums.

## Import pipeline

1. Download/cache a source version.
2. Record source checksum and retrieval date outside the user-editable content path.
3. Parse and validate source fields.
4. Normalize canonical coordinates.
5. Reject unknown bodies / invalid coordinates / non-adopted features by default.
6. Map surface features to stable body lot IDs.
7. Upsert by stable source key, never by display name alone.
8. Produce an import report: inserted / updated / unchanged / rejected.
9. Run search and pricing regression tests before publishing the new feature set.
10. Keep prior source-version metadata for auditability.

The importer must be deterministic: importing the same source version twice should not create duplicate features.
