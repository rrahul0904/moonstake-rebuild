# Limoni Globe donor analysis → Moonstake semantic lunar control

Source studied: https://www.reddit.com/r/SideProject/s/lkwDXkKVlA and https://github.com/thebanri/limoni

## What the source is doing

The reference application is a rotating/searchable globe implemented as a Go terminal UI on top of Limoni. The important architectural idea is not the terminal rendering itself; it is the semantic control plane layered over the UI.

The reference globe:

- samples a sphere backward for each visible pixel/cell and shades it with a fixed light
- uses half-cells so one terminal character carries two vertically stacked pixels
- uses a compact Natural Earth 1:110m land mask plus multi-resolution borders
- exposes search, focus/fly-to, zoom, pinning, borders, graticules and rotation
- publishes UI elements into a semantic tree with roles, labels and values
- optionally serves that semantic tree over a Unix socket
- bridges the socket into MCP so an AI agent can find/click/type/read state by semantic selector instead of screen coordinates

## Clean-room Moonstake adaptation

Moonstake should keep its web/canvas lunar renderer. Replacing it with a terminal renderer would be a regression for the product.

The donor capability we want is the semantic contract:

- inspect current lunar view/state
- search landmarks and brand claims
- focus a landmark, claim or sector by identity
- set zoom deterministically
- select sectors by sector id
- clear selection/reset view
- return structured state after every action
- never expose a purchase/claim-finalization method through the read/control contract

The first browser-side contract is now exposed as `window.moonstakeSemantic`.

Current methods:

- `snapshot()`
- `search(query)`
- `focus(target)`
- `zoomTo(value)`
- `selectSector(id, { append })`
- `clearSelection()`
- `resetView()`

This is intentionally purchase-safe. An agent can navigate and prepare a selection, but checkout remains behind the existing authenticated/payment flow.

## Next implementation slice

1. Add an authenticated server-side session channel (SSE/WebSocket) so a remote MCP adapter can address a specific browser session.
2. Add a small `moonstake-mcp` adapter exposing semantic tools such as `search_moon`, `focus`, `select_sector`, `clear_selection`, `get_state`.
3. Return post-action state with every mutating navigation tool, mirroring the source project's settle/read-back behavior.
4. Keep payment actions out of MCP initially; require explicit in-browser confirmation for checkout.
5. Add browser UAT for command → state transitions on desktop/mobile.

## Monetization opportunities

The semantic control layer can strengthen the existing marketplace rather than become a separate product.

- **Sector sales**: keep the existing entry-price marketplace for primary claims.
- **Secondary-market take rate**: allow owners to receive offers/resell plots and charge a transaction fee.
- **Premium lunar locations**: price sectors near recognizable landmarks, curated zones or high-traffic map areas differently.
- **Pro analytics**: subscription for trend history, referrers, CTR benchmarking, campaign attribution and export.
- **Sponsored discovery**: paid placement in landmark/brand search and featured map trails, clearly labeled.
- **AI lunar concierge**: paid tier/API where founders can ask an agent to find suitable sectors, compare locations, build a shortlist and prepare a claim.
- **Launch campaigns**: fixed-price bundles that include a plot, featured board placement and timed traffic campaign.
- **Developer/API access**: metered semantic search/map API for external launch directories, communities or event pages.
- **White-label maps**: license the interactive marketplace layer to accelerators, conferences or branded online communities.

The strongest combination is marketplace revenue + secondary-market fee + recurring analytics. The agent layer is best used as an upgrade/conversion feature rather than the only revenue source.

## Boundary

This work takes product/architecture inspiration from the public behavior and documentation of the reference. It does not copy the reference's implementation code into Moonstake.
