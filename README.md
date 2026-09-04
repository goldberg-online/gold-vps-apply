# GOLD DIS ONLINE — VPS apply pack

GES cumulative records + class grouping (A–Z) + enrollment date.

On the DigitalOcean droplet, paste this **one** command:

```bash
curl -fsSL https://raw.githubusercontent.com/goldberg-online/gold-vps-apply/main/apply.sh | bash
```

It copies 23 files into `/var/www/gold`, runs `npm run build:vps`, and restarts GOLD.
