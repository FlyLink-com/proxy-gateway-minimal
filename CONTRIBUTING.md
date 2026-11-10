# Contributing to FlyLink Gateway

Thank you for taking the time to review the project and suggest improvements.

## Before contributing

- Read the [project README](README.md) and [Community & Developer Guide](docs/COMMUNITY_GUIDE.md).
- Search existing Issues and Pull Requests before opening a new one.
- Keep changes focused. Separate unrelated refactors, feature work, and documentation changes.
- Describe the problem, intended behavior, affected module, and validation evidence in the Pull Request.
- Do not include secrets, credentials, customer data, raw subscription URLs, private keys, or production configuration.

## License status

There is currently no LICENSE file at the repository root. Public visibility does not grant permission to copy, modify, redistribute, or commercially use the code.

Until the maintainers publish a license and clarify contribution terms, use Issues for discussion and ask the maintainers before submitting substantial code contributions. This guide does not create a license, CLA, or other intellectual-property agreement.

## Development

Use a supported Node.js version declared in the root package.json and install dependencies from the lockfiles.

~~~bash
npm ci

# Inspect the CLI without invoking production operations
npm run cli -- capabilities
npm run cli -- commands

# Run the root server-source test suite
npm test
~~~

For Admin UI changes:

~~~bash
npm ci --prefix admin
npm run admin:test
~~~

Run the relevant build and verification command for the surface you changed. For Worker changes, follow the local-only instructions in [workers/control-plane/README.md](workers/control-plane/README.md).

## Documentation-only changes

Follow the C-tier documentation baseline:

~~~bash
npm run docs:authority:check
npm run docs:authority:strict
git diff --check origin/master...HEAD
~~~

Do not trigger extra CI or application test suites for a documentation-only change unless the change modifies command contracts, generated examples, or validation tooling.

## Pull Request checklist

- [ ] The change has one clear purpose and a narrow file scope.
- [ ] User-visible behavior and compatibility effects are described.
- [ ] Documentation is updated where needed.
- [ ] Required focused tests or documentation checks have been run.
- [ ] Validation results distinguish passed, skipped, and not-run checks.
- [ ] No secrets, customer data, or private operational material are included.
- [ ] Production, provider, database, node, and deployment operations are not implied by a source-only change.

## Security reports

Do not disclose vulnerability details in a public Issue or Pull Request. Follow the private reporting process in [SECURITY.md](SECURITY.md).
