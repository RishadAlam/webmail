# Security policy

## Supported scope

WebMail by Hookstack is an actively developed pilot. Security fixes target the current `main` branch; there are no supported stable releases or promised response times yet. The repository's local checks do not establish production readiness. See [STATUS.md](STATUS.md) and [deployment gates](docs/DEPLOYMENT.md).

## Report a vulnerability privately

Use [GitHub private vulnerability reporting](https://github.com/RishadAlam/webmail/security/advisories/new). Include the affected commit, a minimal reproduction using fictional accounts/messages, expected and actual behavior, and the impact. Do not open a public issue containing exploit details or private data.

Never include a real application key, provider token, password, recovery code, session cookie, database dump or original email. Redact logs before sharing them. If a credential was exposed, revoke or rotate it through the relevant owner-controlled process; deleting a public post is not sufficient.

If private reporting is temporarily unavailable, open a public issue asking for a private contact channel without disclosing the vulnerability or sensitive details.

## Deployment boundaries

Production requires PostgreSQL, HTTPS, verified database TLS, a unique application key, administrator MFA and explicit mailbox permissions. Keep keys and backups separate and test restoration. Public demo credentials and authenticator fixtures are only for local/testing mock mode.

No public signup, implicit administrator mailbox access, remote-image fetching or paid-service activation is intended. Report bypasses of these boundaries, mail loss, unsafe retry behavior, quota races and exposure of private content through history/cache as security-relevant bugs.
