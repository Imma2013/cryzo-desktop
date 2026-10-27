# Cryzo Tauri host

This package replaces the Electron host for Cryzo. It must only embed `cryzo-engine` from `native/`.
Do not launch the upstream Bun/TypeScript engine. Keep the upstream application intact for the UI compatibility port.
The initial native inspector is an internal contract-validation surface, not the public-alpha UI.
Keep all displayed English in `src/copy.ts`; translations are a later reviewed change.
Never store credentials in browser storage. Use the Rust credential command and clear the input afterwards.
Do not publish unsigned installers or enable a public release before the parity and signing gates in `native/README.md` pass.
