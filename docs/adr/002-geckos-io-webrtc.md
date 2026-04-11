# ADR-002: Geckos.io for WebRTC Networking

## Context

A browser-based competitive shooter requires low-latency networking. The two main options for browser real-time communication are WebSocket (TCP) and WebRTC data channels (UDP-like).

WebSocket is simpler to set up but runs over TCP, which means head-of-line blocking and retransmission delays. For a fast-paced shooter sending 20 state updates per second, a single dropped packet stalls all subsequent packets until retransmission completes. This causes noticeable hitches.

WebRTC data channels support unreliable/unordered delivery, behaving like UDP. Lost packets are simply skipped, and newer state overwrites older state. This is exactly what a real-time game needs: the latest state is always more valuable than a stale retransmitted one.

## Decision

We use Geckos.io, a Node.js library that provides WebRTC unreliable data channels between a Node server and browser clients. It handles the WebRTC signaling handshake (via a built-in HTTP signaling server) and exposes a simple event-based API similar to Socket.IO.

Messages are sent as unreliable/unordered by default, with an option for reliable delivery when needed (e.g., match start/end events).

## Consequences

**Positive:**
- UDP-like latency: no head-of-line blocking, dropped packets don't stall newer data
- Built-in signaling server simplifies WebRTC setup
- Familiar Socket.IO-like API reduces learning curve
- Works in all modern browsers without plugins

**Negative:**
- WebRTC setup is more complex than WebSocket: requires STUN/TURN configuration for NAT traversal
- UDP port range must be open in the firewall (complicates hosting configuration)
- Smaller community and ecosystem compared to WebSocket libraries
- Debugging WebRTC connection issues is harder than debugging WebSocket
- The library is maintained by a small team; we accept the risk for the latency benefits
