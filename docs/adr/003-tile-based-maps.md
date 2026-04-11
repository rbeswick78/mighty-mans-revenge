# ADR-003: Tile-Based Maps with JSON Format

## Context

The game needs a map system that supports collision detection, spawn points, and pickup locations. Maps must be usable by both the client (for rendering and prediction) and the server (for authoritative collision). The system should be simple enough for a small team to create new maps without specialized tools.

Options considered:
- Free-form polygon maps: flexible visuals but complex collision, hard to author
- Tile-based maps: grid-aligned, simple collision, easy to author in any JSON/text editor
- Procedural generation: interesting but unpredictable for competitive balance

## Decision

Maps are tile-based, stored as JSON files in `/shared/maps/`. Each map is a 2D grid of tiles with typed properties:

- `floor` -- walkable space
- `wall` -- impassable, blocks bullets and movement
- `cover_low` -- blocks movement, does not block bullets (provides partial cover)
- `spawn_point` -- player spawn locations
- `pickup_spawn` -- ammo/health pickup locations

Maps are designed to fit entirely in the viewport (no scrolling), keeping the arena tight and action-focused for 1v1. A collision grid is generated from tile data at load time and shared by both client and server.

## Consequences

**Positive:**
- Simple O(1) collision lookups via grid indexing -- no complex polygon intersection
- Maps are human-readable JSON, editable in any text editor
- Shared between client and server with zero transformation
- Easy to add new maps: create a JSON file, add to the map registry
- Grid-based design naturally produces balanced, symmetrical arenas

**Negative:**
- Less visual variety compared to free-form geometry
- Tile boundaries can feel rigid; requires careful art to disguise the grid
- Map size is constrained to fit in viewport, limiting large-scale map design
- Diagonal movement against tile edges can produce awkward sliding behavior
