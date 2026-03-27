# OGP Community Standards

> Open Gateway Protocol is an open, federated protocol. These standards exist to keep it that way — trustworthy, interoperable, and useful to the people building on it.

---

## Our Values

**Federated, not centralized.** No single gateway, organization, or individual controls OGP. The protocol is designed to distribute trust. Our community should reflect that.

**Transparency over secrecy.** If something is broken, say so publicly. If something is working well, share how. Protocol-level projects live or die by shared knowledge.

**Builders first.** This is a tool for people who ship things. Feedback should be concrete, criticism should be constructive, and disagreements should end with a pull request.

---

## Communication

### Be specific

Vague reports help no one. When raising an issue, include:
- OGP version (`npm show @dp-pcs/ogp version` or `ogp --version`)
- OpenClaw version (`openclaw --version`)
- What you expected vs. what happened
- Relevant log output

### Be direct

You don't need to soften every critique. If the API is confusing, say the API is confusing. If a decision was wrong, say so and explain why. Politeness is good; excessive hedging wastes everyone's time.

### Be patient with federation bugs

Multi-gateway issues are hard to reproduce. If you're reporting a federation-specific problem, sharing your sanitized `~/.ogp/config.json` (public key only — never share your private key or token) and peer list is extremely helpful.

---

## Contributing

### Issues

Use GitHub Issues for:
- Bug reports (include repro steps)
- Feature requests (include motivation and proposed interface)
- Documentation corrections

Tag issues appropriately: `bug`, `enhancement`, `docs`, `security`, `protocol`.

### Pull Requests

- Target `main` for bug fixes; open a discussion first for protocol-level changes
- Include tests for new behavior where possible
- Update documentation alongside code changes — a PR that changes CLI behavior without updating the README will be sent back
- Keep commits focused; one logical change per PR

### Protocol Changes

Changes to the OGP wire format or federation handshake are **breaking changes** and require:
1. An RFC-style issue describing the change, motivation, and migration path
2. Discussion period (minimum one week for non-security changes)
3. Version bump and CHANGELOG entry
4. Backward compatibility note in the PR

We take interoperability seriously. Don't break federation without a very good reason.

---

## Security

### Reporting vulnerabilities

**Do not open a public GitHub issue for security vulnerabilities.**

Report security issues directly to: [@lat3ntg3nius on X](https://x.com/lat3ntg3nius) via DM, or email the address in `package.json`.

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Your suggested fix (if any)

We aim to acknowledge reports within 48 hours and provide a timeline for resolution within one week.

### Key hygiene

OGP uses Ed25519 cryptographic identity. A few reminders:
- Your private key lives at `~/.ogp/keypair.json` (or macOS Keychain on v0.2.13+) — treat it like an SSH key
- Never share your OpenClaw token or OGP private key in issues, pull requests, or community channels
- Rotate your keypair (`ogp reset-keypair`) if you believe it has been compromised — notify your federated peers after

### Peer trust model

OGP uses explicit allowlisting. You must approve peers before they can message your agent. Default policy is `deny`. Never approve a peer you don't recognize.

---

## Scope Policies

OGP's `agent-comms` scope system controls what remote agents can ask your agent to do. Community-built scope configurations should:

- Default to the minimum necessary permissions
- Document what each scope allows in plain language
- Never request `write` or `execute` scopes without explicit justification

See [`docs/scopes.md`](docs/scopes.md) for the full scope reference.

---

## Code of Conduct

We don't have a lengthy CoC. The short version:

- Don't be a jerk
- Don't use community spaces to harass, spam, or self-promote excessively
- Arguments about technical merit are fine; personal attacks are not
- Maintainers may remove content or ban users who repeatedly ignore these standards

---

## Maintainer Commitments

In return, maintainers commit to:

- Responding to issues within one week (security: 48 hours)
- Explaining decisions when closing issues or rejecting PRs
- Publishing a CHANGELOG entry for every npm release
- Maintaining backward compatibility within minor versions
- Not breaking the federation protocol without a deprecation period

---

## Getting Help

- **Docs:** [`docs/`](docs/) directory in this repo
- **Quick start:** [`docs/quickstart.md`](docs/quickstart.md)
- **Articles:** [Trilogy AI CoE Substack](https://trilogyai.substack.com)
- **X / Twitter:** [@lat3ntg3nius](https://x.com/lat3ntg3nius)
- **Install:** `curl -fsSL https://latentgenius.ai/ogp/install.sh | bash`

---

*OGP is an open protocol. Build something interesting with it.*
