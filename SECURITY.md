# Security

codemode runs model-written code and talks to MCP servers that can act on real systems (files, a desktop, a browser, a workspace), so security reports are welcome.

**Report a vulnerability privately** through GitHub: the repository's **Security** tab, then **Report a vulnerability** (private vulnerability reporting). Please do not open a public issue for a security problem. Include what you did, what you expected and what happened; a script that reproduces it is the most useful thing you can send.

Things in scope: escaping the sandbox, reading or writing something a script should not reach, leaking credentials or tokens, bypassing the tool-definition lock, the access filters or the destructive-call notice, and the OAuth sign-in handling.

How the protections work, and what is not covered, is written down in the README (Safety) and in [docs/production.md](docs/production.md).
