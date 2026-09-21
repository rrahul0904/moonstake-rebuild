# Solar System expansion — product, research, and implementation blueprint

## Product thesis

Moonstake should become a **celestial registry and attention marketplace**, not a literal extraterrestrial real-estate company.

The Moon stays the first and deepest market. Expansion happens through staged body unlocks so liquidity, resale activity, and attention are not fragmented across millions of empty lots at launch.

A purchase represents a digital registry position / sponsorship slot on the Moonstake board. It does not convey legal title to the Moon, a planet, a moon, an asteroid, or any natural resource.

## What we are preserving from the Moonstake model

The clean-room model keeps the mechanics that make the product interesting:

- 259,200 addressable Moon lots (720 × 360)
- named ground costs more than ordinary ground
- an offer must beat last paid by at least $1, with +10% as the suggested offer
- first sale is platform registry revenue
- on resale the seller gets the original stake plus 60% of the gain
- the platform receives the remaining 40% of the gain
- body-specific market index rises as transaction value hits that board
- every lot can accumulate views, clicks, CTR, brand/name, outbound link, history, and ownership/registry history
- public leaderboard / board / explorer / user portfolio surfaces
- semantic entity control so agents can address landmarks/lots without screen-coordinate automation

The Moon-specific label "MLD" can remain part of the Moon product language. The generalized implementation uses neutral "Registry" wording for other worlds.

## Inventory taxonomy

### Surface-lot bodies

Bodies with a physical surface can use latitude/longitude lots.

Initial catalog:
- Moon
- Mars
- Mercury
- Venus
- Ceres
- Pluto
- Europa
- Titan

Each uses a 720 × 360 angular board (0.5° × 0.5° cells), producing 259,200 stable addresses per body. These cells are **not equal-area physical parcels**; they are registry coordinates. If physical-area comparisons are shown later, compute them from body radius and latitude rather than claiming identical parcel area.

### Non-land inventory

Do not sell "ground" on:
- Jupiter
- Saturn
- Uranus
- Neptune
- the Sun

These bodies do not have a conventional solid surface suitable for a land-grid product. Their future inventory should be branded differently, for example:
- observation zones
- atmospheric bands
- ring sectors
- storm sponsorships
- orbital billboard/sponsorship positions
- mission/feature cards

This avoids a scientifically misleading "Jupiter land" product and creates differentiated scarcity.

## Launch sequencing

### Phase 1 — Moon
Make the 259,200-lot economy complete and liquid before opening another surface market.

Required:
- exact MLD primary pricing
- resale offers and settlement ledger
- Moon Index
- lot history
- views/clicks/CTR
- naming / brand flags
- search and landmark premiums
- owner portfolio
- public activity feed
- verified checkout and refunds
- mobile + desktop map quality

### Phase 2 — Mars + Mercury
The first expansion. Both have well-mapped solid surfaces and strong public recognition.

Unlock conditions should be product metrics, not arbitrary calendar dates. Candidate gates:
- Moon active buyers threshold
- minimum resale volume
- minimum percentage of Moon lots transacted
- repeat-buyer threshold
- minimum 30-day board traffic

### Phase 3 — Venus + Ceres
Adds another planet and the first dwarf planet.

### Phase 4 — Pluto + Europa + Titan
Adds outer-system scarcity and strong named-feature storytelling.

### Phase 5 — Jupiter + Saturn observation markets
No land claims. Launch differentiated atmospheric/ring inventory after the surface-lot product is proven.

### Phase 6 — long-tail bodies
Only then consider:
- Ganymede
- Callisto
- Io
- Enceladus
- Triton
- selected asteroids and comets

Do not open the entire asteroid catalog. NASA lists enormous numbers of small bodies; unrestricted inventory would destroy scarcity and product comprehension.

## Index model

Every solid-body market gets its own index:

- Moon Index
- Mars Index
- Mercury Index
- etc.

Each starts at 100 and scales against that body's initial board value.

A separate **Solar Index** aggregates launched body markets. It should be presented as a Moonstake platform activity index, not a security, asset price, expected return, or investment benchmark.

The index needs a versioned published formula and historical snapshots so users cannot suspect it is manually manipulated.

## Pricing research

We need to model five pricing layers:

1. **Base lot**
   - body-specific starting price
   - never imply price is based on legal land value

2. **Named-ground premium**
   - official IAU/USGS feature
   - mission/landing-site proximity
   - rarity of named features
   - public-interest / search demand

3. **Market premium**
   - prior sale amount
   - offer floor
   - suggested +10%
   - seller/platform gain split

4. **Attention premium**
   - views
   - clicks
   - CTR
   - board rank
   - inbound searches
   - watchlists

5. **Scarcity/unlock premium**
   - only a fraction of a new body's lots should become purchasable at first
   - future releases must be published and deterministic so the platform cannot secretly change scarcity

## Geography and planetary-data research

Use authoritative public datasets rather than invented features.

### NASA / JPL
Research:
- global mosaics and texture maps
- mission imagery
- body dimensions and rotation conventions
- ephemerides / real-time body positions
- landing sites and mission locations
- body metadata

Primary sources:
- NASA Planetary Data System (PDS)
- NASA Solar System Exploration
- JPL planetary maps / Eyes / SPICE where appropriate

### USGS / IAU Gazetteer
Use the Gazetteer of Planetary Nomenclature for:
- official feature names
- feature types
- lat/lon
- approval status
- naming origin
- body/system membership

Store the source and source version on every imported named feature.

### Coordinate rules
Before importing a new body, record:
- east-positive vs west-positive convention
- 0–360 vs -180–180 longitude conversion
- planetocentric vs planetographic latitude
- body-fixed reference frame
- map projection used by the display layer

A stable registry ID must never change when a map texture or projection changes.

## Legal and trust research

### Core positioning
The product must state clearly:
- registry purchases are digital/commemorative placements
- they do not convey sovereign rights or legal title to celestial territory
- they do not convey mineral/water/resource rights
- official scientific feature names remain official names; user labels are board labels only
- the platform is not NASA, USGS, IAU, a government agency, or an official land registry

### International space law
The Outer Space Treaty should be part of launch counsel review, especially Article II's non-appropriation rule.

### U.S. space-resource law
U.S. law recognizes rights in certain **recovered resources** subject to applicable law; that should not be marketed as a right to own celestial land. Moonstake should stay out of resource-right claims entirely unless a future physical-space business is separately created and reviewed.

### Consumer / marketplace law
Before real-money resale launches, counsel should review:
- consumer-protection and advertising claims
- payout / marketplace rules
- tax reporting
- sanctions / restricted jurisdictions
- refund policy
- payment-processor requirements
- whether any product language could make the registry look like an investment contract, gambling product, or regulated financial instrument

Marketing should emphasize collecting, identity, naming, discovery, advertising, and community — not expected profit.

## Reverse-engineering matrix: capture everything

For every Moonstake.org behavior we observe, record:

### Discovery
- landing-page copy
- onboarding
- map defaults
- search
- landmark navigation
- first interaction
- mobile behavior

### Map
- projection
- lot resolution
- zoom thresholds
- labels
- hover states
- selection behavior
- claimed/unclaimed rendering
- named ground
- coordinates
- flag/brand placement
- activity visualization

### Lot detail
- identifier
- current holder
- last paid
- minimum offer
- suggested offer
- history
- views
- clicks
- outbound URL
- naming
- timestamps
- share URL

### Primary sale
- quote
- premium logic
- reservation/hold
- checkout
- success/failure
- duplicate purchase conflict
- refunds
- fee ledger

### Resale
- offer creation
- offer floor
- expiration
- acceptance
- payout
- seller gain
- platform fee
- history update
- notifications
- cancellations / disputes

### Index
- exact formula
- inputs
- update cadence
- chart history
- body-level vs platform-level index
- anti-manipulation rules

### Accounts
- signup/login
- portfolio
- offers received
- offers sent
- transaction history
- saved/watchlisted lots
- profile/brand
- payout account

### Growth
- shareable lot pages
- referral attribution
- leaderboards
- trending lots
- recently sold
- biggest gainers
- most viewed
- most clicked
- launch countdowns for new bodies

### Admin / moderation
- prohibited content
- link safety
- impersonation
- trademark complaints
- takedowns
- refund workflow
- fraud flags
- chargeback handling
- reserved official/scientific names

### Technical
- API inventory
- database entities
- concurrency guarantees
- idempotency
- caching
- analytics
- search index
- image pipeline
- payment webhooks
- payout reconciliation
- audit logs
- abuse/rate limits
- browser/mobile performance

## Data model target

Core entities should become body-agnostic:

- celestial_bodies
- body_features
- lots
- lot_labels
- lot_holders / registry_entries
- offers
- transactions
- settlements
- body_indices
- index_snapshots
- lot_events
- watchlists
- outbound_clicks
- moderation_cases
- body_unlocks

Never encode "Moon" into the primary key of generalized tables.

## Architecture direction

Keep:
- server-authoritative quote and transaction calculations
- atomic conflict checks
- idempotent payments
- immutable transaction history
- auditable settlement breakdown

Add:
- body catalog service
- feature-ingestion pipeline
- projection/coordinate adapter per body
- multi-body search
- body-specific index snapshots
- body launch configuration
- global Solar Index
- per-body cache namespace
- URL shape such as /moon/L-..., /mars/MARS-..., /europa/EUROPA-...

## Immediate implementation state

The branch `feat/solar-system-market` now includes a first generalized market engine in `src/celestial-market.mjs`.

It:
- preserves the Moon MLD economics
- creates globally unique body lot IDs
- supports future body-specific base pricing
- keeps gas giants and the Sun out of the surface-lot model
- exposes per-body indices and a Solar Index
- provides a phased launch plan

The existing Moon UI still uses its legacy 64 × 32 interaction grid. Migrating the visible map and transaction APIs onto the canonical 720 × 360 lot model is the next correctness slice before a public launch.
