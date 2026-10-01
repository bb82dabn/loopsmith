# Security policy

## Supported versions

Security fixes target the latest stable 1.x release. Older releases and modified deployments are not separately maintained.

## Report a vulnerability privately

Use [GitHub's private vulnerability reporting form](https://github.com/bb82dabn/loopsmith/security/advisories/new). Do not disclose exploit details, credentials, or private project data in public issues. If the form is unavailable, ask the maintainer for a private reporting channel without including the vulnerability details.

Include the affected release/commit, browser or Node version, reproduction steps, impact, and a minimal sanitized proof of concept. There is no guaranteed response-time SLA or bug bounty.

## Deployment considerations

LoopSmith performs composition, audio rendering, and exports in the browser. The optional Node server serves static files; there are no application accounts, database, or secret configuration requirements.

- Use supported browsers and Node versions; keep dependencies current.
- Serve public installations over HTTPS and apply the documented origin/proxy restrictions.
- Treat downloaded project files as untrusted input; report validation bypasses or resource-exhaustion bugs.
- Verify release checksums before deploying.
- Do not publish internal tool state, raw corpus data, or temporary release-transfer directories.

See [deploy/nginx-proxy-manager.md](deploy/nginx-proxy-manager.md) for hosting guidance.
