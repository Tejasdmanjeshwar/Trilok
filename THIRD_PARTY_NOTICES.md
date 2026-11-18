# Trilok — Third-Party Notices and Asset Provenance

This document distinguishes the **rights reserved in original Trilok code**
(see [LICENSE](LICENSE)) from material licensed by third parties. Trilok
does not claim exclusive copyright over that third-party material.

**Scope:** evidence-based inventory of directly declared dependencies and
pinned original MakeHuman assets on the C5.5-audited `main` branch (2026-11-17).
It is **not a complete lockfile-level / transitive SBOM or a final commercial
release clearance**. Source and build outputs must be audited again for every
release and whenever dependencies or assets change.

## 1. Bundled MakeHuman anatomy data — CC0-1.0

- **Source/creators:** MakeHuman Community / Data Collection AB; Joel Palmius;
  Jonas Hauquier, as credited by the original bundled graphical assets.
- **Source repository:** https://github.com/makehumancommunity/makehuman
- **Pinned source revision:** `a8bc2d54ff0ac92e78ff71431b1023eda42bf482`
- **License for bundled graphical assets:** Creative Commons CC0 1.0 Universal.
  https://creativecommons.org/publicdomain/zero/1.0/
- **Upstream licensing evidence:**
  https://github.com/makehumancommunity/makehuman/blob/a8bc2d54ff0ac92e78ff71431b1023eda42bf482/LICENSE.md
  and
  https://github.com/makehumancommunity/makehuman/blob/a8bc2d54ff0ac92e78ff71431b1023eda42bf482/LICENSE.ASSETS.md
- **Original content acquired at build time:** `makehuman/data/3dobjs/base.obj`;
  `makehuman/data/rigs/default.mhskel`;
  `makehuman/data/rigs/default_weights.mhw`; pinned facial
  `.target` files; and 846 pinned native body/macro `.target` files with their
  official modifier metadata. The exact source, byte sizes, and Git blob
  identities are checked by `assets/makehuman-core.json`,
  `assets/makehuman-facial-v1.json` and
  `assets/makehuman-body-v1.json` and their corresponding fetch scripts.
  The base mesh is identified by SHA-256
  `8e761e6624b8f54536409135d1636da63b32486a90d4897f84e121d144f6fb4c`.
- **Bundled native body corpus:** The merged C3.6 body/macro atlas has
  846 pinned MakeHuman targets declared in `assets/makehuman-body-v1.json`,
  sourced from the same immutable upstream revision above. Its fetch/build
  verifies official source metadata and content identities. Exact-main
  GitHub Verify #44106663782 reported 846 source targets verified (cached)
  and generated the production asset chunks. This is source identity
  verification, **not** a full distributed-bundle SBOM, final release asset
  inventory, or an independent Cloudflare deployment verification.
- **Processing:** These CC0 assets are downloaded and converted to
  Three.js-compatible runtime data; source identities are checked at ingest.

**Important program/data boundary:** The MakeHuman *application source
code* is under AGPL-3.0-or-later, separately from CC0 graphical assets.
Trilok's stated build flow obtains the original CC0 data; this notice
does not authorize copying or incorporating AGPL program code into a
proprietary application. An independent review of any source-derived
implementation is required before commercial release.

CC0 does not legally require attribution. The original source and creator
credits above are retained voluntarily for provenance and transparency.
Neither CC0 nor any of the other licenses listed here is overridden by
the Trilok proprietary notice.

## 2. Runtime dependency — Three.js

| Component | Declared range | License | Source / license evidence |
| --- | --- | --- | --- |
| `three` (including `OrbitControls` and other Three.js addons) | `^0.180.0` | MIT | https://github.com/mrdoob/three.js/blob/dev/LICENSE |

**Upstream notice:** Copyright © 2010–2026 three.js authors.

The following is the MIT license grant and disclaimer applicable to this
component (retained for runtime/source distributions):

> Permission is hereby granted, free of charge, to any person obtaining a
> copy of this software and associated documentation files (the "Software"),
> to deal in the Software without restriction, including without limitation
> the rights to use, copy, modify, merge, publish, distribute, sublicense,
> and/or sell copies of the Software, and to permit persons to whom the
> Software is furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included
> in all copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
> OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
> MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
> IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
> CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
> TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
> SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

The full unmodified upstream license is linked above. The generated
browser bundle should expose this notices document without treating
Three.js as proprietary Trilok code.

## 3. Direct development and build tools

These dependencies are declared by the root workspace, or used directly
as build/test tools; they are **not themselves the original Trilok engine**.
The license reported here is based on each upstream project or package
metadata, not a resolved package-lock inventory.

| Package/tool | Declared range/version | Upstream license | Primary upstream source |
| --- | --- | --- | --- |
| `typescript` | `^5.8.3` | Apache-2.0 | https://github.com/microsoft/TypeScript/blob/main/LICENSE.txt |
| `vite` | `^6.3.5` | MIT | https://github.com/vitejs/vite/blob/main/LICENSE |
| `vitest` | `^3.2.4` | MIT | https://github.com/vitest-dev/vitest/blob/main/LICENSE |
| `@playwright/test` | `^1.56.1` | Apache-2.0 | https://github.com/microsoft/playwright/blob/main/LICENSE |
| `wrangler` | `^4.135.0` | MIT OR Apache-2.0 (package metadata; verify installed release) | https://github.com/cloudflare/workers-sdk/tree/main/packages/wrangler |
| `@types/three` | `^0.180.0` | MIT (DefinitelyTyped project) | https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/LICENSE |
| `@types/node` | `^22.15.0` | MIT (DefinitelyTyped project) | https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/LICENSE |
| `pnpm` | `10.20.0` (package manager) | MIT | https://github.com/pnpm/pnpm |

The workspace-internal `@trilok/*` packages are not third-party npm
projects; ownership of each original source file still needs confirmation.
Any separate files or third-party code they contain must retain their
own license.

## 4. Deliberately excluded experimental art

Rejected C3.5 branches and reference-only 3D models are **not** part of the
approved `main` runtime asset list. In particular, do not silently bundle
a CC BY-licensed Hanuman GLB-derived atlas, or any model carrying
noncommercial/no-derivatives terms, when assembling a proprietary build.
No permission to relicense those works is claimed here. An internal
reference-rights audit is maintained separately; this public notices file
does not incorporate those models or source-derived code.

## 5. Required pre-release verification

1. Confirm legal ownership/permission for all Trilok-original contributions.
2. Install using the now-committed pnpm lockfile (pnpm 10.20.0); generate a **full transitive**
   SBOM and SPDX/license report for the exact installed versions. The
   audited repository does **not** contain a `pnpm-lock.yaml`; caret ranges
   alone cannot establish the final dependency/license set.
3. Copy required upstream copyright and license texts for all substantial
   third-party code **actually distributed** in the web bundle or source
   snapshot. Check source maps, WASM, fonts, browser assets, templates and
   transitive dependencies. Include any applicable Apache-2.0 NOTICE files.
4. Revalidate MakeHuman source/pin, plus commercial permission for any new
   meshes, textures, sounds, faces, or references.
5. Confirm deployed `/THIRD_PARTY_NOTICES.txt` matches this source notice
   and is accessible with the actual Cloudflare build identity.
6. Have qualified counsel review a commercially published license/rights
   notice and the source-contribution ownership chain.

**This inventory is an honest starting point, not a claim of complete legal
compliance or clearance to publish a formerly private Git repository.**
