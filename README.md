# Trilok

Browser-based TypeScript development repository.

This source snapshot is made available for build and test workflows. It is not offered as a public SDK, supported library, or community development project.

**Rights:** Original Trilok code and content are proprietary and reserved by their respective rightsholders. Publishing source code here does not grant an open-source license. Third-party components and assets retain their own licenses and permissions. See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

External contributions, feature requests, and support requests are not being solicited.

## Project architecture and roadmap

Trilok currently uses Three.js/TypeScript as its **active**, browser-accessible Gameplay Lab and procedural Character Studio. The browser remains the implementation and validation environment for C6.3–C9, including runtime character generation and baked asset exports. Unity/C# is a **future** production migration, not a current build dependency. Browser Character Studio is retired only after a future Unity implementation demonstrates full runtime/editor generation, bake and saved-recipe parity.

- [Architecture and current engine boundaries](docs/architecture.md)
- [Browser-first and future-Unity architecture decision](docs/architecture-browser-first-unity-portability.md)
- [Migration-readiness structural/CI audit](docs/migration-readiness-cleanup-audit-2026-11-21.md)
- [Character Studio roadmap (C0–C9)](docs/character-studio-roadmap.md)
- [C6.3 locomotion implementation record](docs/character-studio-c6-3-locomotion.md)

Engine-independent packages are checked with `pnpm portability:verify`; this is an import-boundary gate, not evidence of a working Unity port.
