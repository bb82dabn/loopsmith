# Nginx Proxy Manager host

Create one Proxy Host after the LoopSmith user service is healthy locally. Keep internal host identifiers, certificate identifiers, and origin addresses in private deployment records.

| Setting | Value |
| --- | --- |
| Domain Names | Your public LoopSmith hostname |
| Scheme | `http` |
| Forward Hostname / IP | Private LoopSmith origin address |
| Forward Port | `4173` |
| Cache Assets | Off (the application supplies immutable asset headers) |
| Block Common Exploits | On |
| Websockets Support | On (safe for Vite workers; no persistent socket is required) |

Required security baseline:

- Configure Cloudflare SSL/TLS mode as **Full (strict)**.
- Enable **Force SSL** and HTTP/2 on the Nginx Proxy Manager host.
- Enable HSTS only after HTTPS is verified for the hostname and every covered subdomain.
- Restrict origin port `4173` at the host firewall to the reverse proxy address. Never expose it directly to the internet.
- Apply connection and request rate limits at Cloudflare or Nginx Proxy Manager.

Verification:

```sh
curl -fsS http://PRIVATE_ORIGIN_ADDRESS:4173/healthz
curl -fsS https://PUBLIC_HOSTNAME/healthz
curl -fsSI http://PUBLIC_HOSTNAME/healthz
```

The final command must redirect to HTTPS. The HTTPS response must include `Strict-Transport-Security`, `Content-Security-Policy`, and `X-Content-Type-Options` headers.
