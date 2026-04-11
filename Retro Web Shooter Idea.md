**Objective:** Develop a simple, two-player web-based shooter game featuring late 1980s-style graphics, focusing on extremely smooth, low-latency gameplay.

**Technology Stack:**

- **Graphics Engine:** Phaser.js (ideal for retro arcade physics, sprite sheets, and pixel art rendering via WebGL/Canvas).  
- **Authoritative Server:** Node.js (runs a lightweight hidden physics loop).  
- **Networking:** WebRTC Data Channels using Geckos.io for low-latency, UDP-style messaging between the browser and server.

**Core Architecture & Networking Strategy:** The game must utilize an authoritative client-server model to prevent cheating and ensure synchronization. The server will compute true positions, hit detection, and broadcast the official game state (the "tick") 20-30 times per second.

**Crucial Latency-Compensation Techniques:** To mask network delays and ensure a responsive feel, the implementation must include the following techniques:

1. **Client-Side Prediction:** When a player inputs a command (e.g., moves or shoots), the local browser immediately simulates and renders the action without waiting for server confirmation.  
2. **Server Reconciliation:** The server is the absolute referee. If the server's authoritative state disagrees with the client's predicted state (e.g., the player actually collided with a wall or was shot), the local game must quietly and seamlessly correct the player's position.  
3. **Entity Interpolation:** Because server updates arrive discretely (e.g., 20 ticks per second), the opponent's movements must be smoothly interpolated between network updates to avoid jittery animation on the screen.  
4. **Lag Compensation (Server-Side Rewind):** Implement a 'favor the shooter' design philosophy (as outlined in Valve's Source Multiplayer Networking). The server must keep a short history of player positions. When a 'shoot' or 'tag' command is received, the server should rewind the game state based on the player's ping at that exact millisecond to verify if the hit was valid in the shooter's past reality, ensuring the game feels fair and highly responsive.Retro Web Shooter Game Prompt

**Visuals:** Ensure all assets and visual rendering strictly adhere to a late 1980s retro aesthetic (pixel art, limited color palette, chiptune-style visual feedback).  
