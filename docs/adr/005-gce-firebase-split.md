# ADR-005: GCE VM for Server, Firebase Hosting for Client

## Context

The game has two distinct deployment needs:

1. **Game server:** Must run a persistent Node.js process with WebRTC support, UDP port access, and low-latency connections to players in the NY/NJ area. Needs a stable IP address for WebRTC signaling.

2. **Game client:** Static HTML/JS/CSS assets built by Vite. Needs fast delivery with proper caching. No server-side rendering or dynamic content.

Options considered:
- Single VM for both: simple but mixes concerns, static assets served inefficiently
- Cloud Run / Cloud Functions: serverless, but WebRTC requires persistent connections and UDP ports that serverless platforms don't support
- GCE VM + Firebase Hosting: dedicated VM for game logic, CDN for static assets

## Decision

- **Server:** Google Cloud Compute Engine e2-small VM in us-east1-b. This region provides low latency to the NY/NJ player base. The VM runs the Node.js game server with PM2 for process management.

- **Client:** Firebase Hosting with global CDN. Static assets are deployed automatically on push to main. Immutable assets (JS/CSS) get aggressive caching (1 year), while `index.html` uses no-cache to ensure players always get the latest version.

## Consequences

**Positive:**
- us-east1 provides ~10-20ms latency to NY/NJ, ideal for competitive gameplay
- Firebase Hosting CDN delivers client assets quickly worldwide (if friends visit from elsewhere)
- Separation of concerns: server deployment doesn't affect client caching, and vice versa
- Firebase free tier is generous for a small friends-only game
- e2-small is cost-effective (~$15/month) for a low-traffic hobby project

**Negative:**
- Two deployment targets to manage instead of one
- GCE VM requires manual setup (Node.js, PM2, SSL, firewall) compared to managed platforms
- VM must be kept updated (OS patches, Node.js upgrades)
- No auto-scaling: if the game grows beyond ~20 concurrent players, the e2-small may need upgrading
- Client and server versions must be kept compatible; shared package helps but doesn't eliminate the risk of version mismatch during rolling deploys
