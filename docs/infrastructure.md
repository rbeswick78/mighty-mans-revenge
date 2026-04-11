# Infrastructure Documentation

## Overview

Mighty Man's Revenge uses a split deployment model:
- **Client:** Firebase Hosting (global CDN for static assets)
- **Server:** Google Cloud Compute Engine VM in us-east1-b (low latency for NY/NJ players)

## GCE VM Setup

### Instance Configuration

| Setting     | Value                              |
| ----------- | ---------------------------------- |
| Type        | e2-small (2 vCPU, 2 GB memory)    |
| Region      | us-east1-b                         |
| OS          | Ubuntu 22.04 LTS                   |
| Boot disk   | 20 GB SSD                          |
| IP          | Static external IP (reserved)      |

### Firewall Rules

Create VPC firewall rules for the instance:

| Rule Name                   | Direction | Protocol | Ports         | Source    | Purpose                                  |
| --------------------------- | --------- | -------- | ------------- | --------- | ---------------------------------------- |
| allow-ssh                   | Ingress   | TCP      | 22            | 0.0.0.0/0 | SSH access                               |
| allow-http                  | Ingress   | TCP      | 80            | 0.0.0.0/0 | HTTP redirect to HTTPS                   |
| allow-https                 | Ingress   | TCP      | 443           | 0.0.0.0/0 | HTTPS for signaling                      |
| allow-geckos-udp            | Ingress   | UDP      | 1025-65535    | 0.0.0.0/0 | WebRTC UDP data channels (Geckos.io)     |
| allow-health                | Ingress   | TCP      | 3001          | CI runner | Health check endpoint (restrict to CI)   |

```bash
gcloud compute firewall-rules create allow-geckos-udp \
  --direction=INGRESS --priority=1000 --network=default \
  --action=ALLOW --rules=udp:1025-65535 --source-ranges=0.0.0.0/0 \
  --target-tags=game-server

gcloud compute firewall-rules create allow-https \
  --direction=INGRESS --priority=1000 --network=default \
  --action=ALLOW --rules=tcp:80,tcp:443 --source-ranges=0.0.0.0/0 \
  --target-tags=game-server
```

### Node.js Installation

```bash
# Install Node.js 20 via NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify
node --version  # v20.x
npm --version
```

### PM2 Setup

```bash
# Install PM2 globally
sudo npm install -g pm2

# Start the server
cd /opt/mighty-mans-revenge
pm2 start dist/index.js --name mighty-mans-revenge

# Configure PM2 to start on boot
pm2 startup systemd
pm2 save

# Useful PM2 commands
pm2 status                   # Check running processes
pm2 logs mighty-mans-revenge # View logs
pm2 restart mighty-mans-revenge
pm2 stop mighty-mans-revenge
```

### Environment Variables

Create `/opt/mighty-mans-revenge/.env`:

```bash
PORT=3000
HEALTH_PORT=3001
LOG_LEVEL=info
ADMIN_API_KEY=<generate-a-secure-key>
```

PM2 reads `.env` automatically, or use an ecosystem file:

```js
// ecosystem.config.cjs
module.exports = {
  apps: [{
    name: 'mighty-mans-revenge',
    script: 'dist/index.js',
    env: {
      PORT: 3000,
      HEALTH_PORT: 3001,
      LOG_LEVEL: 'info',
    },
  }],
};
```

### SSL Setup with Certbot

```bash
# Install Certbot
sudo apt-get install -y certbot

# Obtain certificate (replace with your domain)
sudo certbot certonly --standalone -d game.yourdomain.com

# Certificates are stored at:
#   /etc/letsencrypt/live/game.yourdomain.com/fullchain.pem
#   /etc/letsencrypt/live/game.yourdomain.com/privkey.pem

# Auto-renewal is configured by Certbot automatically
# Test renewal:
sudo certbot renew --dry-run
```

Note: Geckos.io handles its own HTTPS signaling server. Pass the cert paths via environment variables or configuration if needed for production HTTPS.

## Deployment Process

### Client (Firebase Hosting)

Automated via GitHub Actions (`.github/workflows/deploy-client.yml`):

1. Push to `main` with changes in `client/**` or `shared/**`
2. CI builds the client: `pnpm --filter @game/client build`
3. Deploys `client/dist/` to Firebase Hosting using the Firebase GitHub Action
4. Firebase serves assets globally with CDN caching

Manual deployment:

```bash
pnpm --filter @game/client build
cd client
npx firebase deploy --only hosting
```

### Server (GCE VM)

Automated via GitHub Actions (`.github/workflows/deploy-server.yml`):

1. Push to `main` with changes in `server/**` or `shared/**`
2. CI builds the server: `pnpm --filter @game/server build`
3. Build artifacts are rsynced to the GCE VM via SSH
4. PM2 restarts the server process
5. Post-deploy health check verifies the server is responding

Manual deployment:

```bash
pnpm --filter @game/server build
rsync -avz server/dist/ deploy@<SERVER_IP>:/opt/mighty-mans-revenge/dist/
ssh deploy@<SERVER_IP> "cd /opt/mighty-mans-revenge && npm install --production && pm2 restart mighty-mans-revenge"
```

## Rollback Procedure

### Client Rollback

Firebase Hosting keeps previous deployment versions:

```bash
# List recent deployments
npx firebase hosting:channel:list

# Rollback via the Firebase Console:
# Firebase Console -> Hosting -> Release History -> select previous version -> Rollback
```

### Server Rollback

1. SSH into the GCE VM
2. PM2 keeps the previous process state; for code rollback:

```bash
ssh deploy@<SERVER_IP>

# Option 1: Revert to previous git state
cd /opt/mighty-mans-revenge
git log --oneline -5           # Find the commit to revert to
git checkout <previous-sha>
npm install --production
pm2 restart mighty-mans-revenge

# Option 2: If using rsync deploys, restore from backup
cp -r /opt/mighty-mans-revenge-backup/* /opt/mighty-mans-revenge/
pm2 restart mighty-mans-revenge
```

3. Verify health: `curl http://localhost:3001/health`

## Monitoring

### Health Check Endpoint

`GET http://<SERVER_IP>:3001/health`

Returns:
```json
{
  "status": "healthy",
  "uptime": 3600,
  "tickRate": 20,
  "connections": 4,
  "activeMatches": 2
}
```

- Returns HTTP 200 when healthy, HTTP 503 if the tick loop has stalled (no tick in 2+ seconds)
- No authentication required
- Used by the CD pipeline for post-deploy verification

### Admin Dashboard

`GET http://<SERVER_IP>:3001/admin` (HTML) or `GET http://<SERVER_IP>:3001/admin/status` (JSON)

Protected by `ADMIN_API_KEY` (pass as `x-api-key` header or `?key=` query parameter).

Shows:
- Server uptime, tick rate, memory/CPU usage
- Active connections and matchmaking queue length
- Active matches with player names and scores
- Recent match history (last 20 matches)

The HTML page auto-refreshes every 5 seconds.

### PM2 Monitoring

```bash
pm2 monit                          # Real-time dashboard
pm2 logs mighty-mans-revenge       # Stream logs
pm2 logs mighty-mans-revenge --lines 100  # Last 100 lines
```

### Log Format

Server logs use Pino structured JSON format:

```json
{"level":"info","time":"2026-04-11T12:00:00.000Z","service":"mighty-mans-revenge","module":"network","msg":"Player connected","playerId":"abc-123","playerCount":3}
```

Child loggers tag events by module: `network`, `matchmaking`, `gameLoop`, `match`, `admin`.
