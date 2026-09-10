# Moonstake.org reverse engineering notes

## Source under study

`https://www.moonstake.org/` (public website, reviewed 2026-09-07).

## Directly observed public surface

The live page exposes the following visible product elements:

- Brand: **MOONSTAKE — Your startup. On the Moon. On the map.**
- Search placeholder: **Armstrong, Apollo 11, Tycho…**
- KPI labels: **Offices, Index, On the board, Views, Click-throughs**
- Actions: **Sign in**, **How it works**
- Hero copy: **Put your brand on Moon** / **Plant a flag for what you’re shipping**
- Interaction modes: **Move** and **Select**
- Zoom controls: `+`, `−`, **Whole Moon**
- Purchase affordance: **Lots from $1 · Buy**
- Guidance: click a place to zoom; scroll to zoom
- Surface attribution: **NASA / LRO WAC**
- Selection state: sector count, Clear, Claim price
- Main tabs: **Plot, Board, Explore, My land**
- Loading/error language: **Lighting the far side…** / **Try again**

## Additional public evidence

Fresh public launch posts from the maker/community describe Moonstake as a map where people buy lots to set up company sites, and a promotion offered one lot free to builders so they could set up an office and get traction. This reinforces the interpretation that the lot is a branded promotional placement rather than a claim of legal lunar real-estate ownership.

## Inferred product model

The public controls strongly imply:

1. The Moon is partitioned into claimable spatial lots/sectors.
2. Lots have prices and can be multi-selected.
3. A signed-in user can claim/purchase selected lots.
4. Claimed lots are associated with a startup/brand and surfaced on a board.
5. Brand impressions and outbound click-throughs are tracked.
6. Search resolves both lunar features and/or claimed brands.
7. My Land is an owner-specific inventory/dashboard.

These are behavioral inferences, not claims about Moonstake's private implementation.

## Clone-specific decisions

The following are original implementation choices because the source internals are not public:

- 64 × 32 sector grid
- deterministic sector IDs (`S-XX-YY`)
- $1 base sector price
- premium pricing around landmark/central sectors
- board ranking formula
- PBKDF2 + server session authentication
- JSON-file persistence
- demo payment adapter
- procedural lunar texture instead of redistributing Moonstake's imagery

## Fidelity target

The rebuild prioritizes the interaction model and information hierarchy over pixel-for-pixel copying. It uses an original monochrome lunar visual system that mirrors the public product's dense, map-first experience.
