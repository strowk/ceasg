# NOTICE

**ceasg — Visual Mermaid Editor**
Copyright (C) 2026 ceasg contributors.

This program is free software: you can redistribute it and/or modify it under the terms of
the **GNU General Public License, version 3 or (at your option) any later version**
(GPL-3.0-or-later). See [LICENSE](LICENSE) for the full text. This program is distributed
in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied
warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.

## Third-party code

### Mermaid Flow (obsidian-mermaid-flow)

The flowchart engine in `src/core/` is **ported from Mermaid Flow**, an Obsidian plugin by
THANSHEER, licensed under GPL-3.0-or-later.

- Source: https://github.com/THANSHEER/obsidian-mermaid-flow
- Copyright (C) THANSHEER and Mermaid Flow contributors.
- License: GPL-3.0-or-later.

The following files are ports of the corresponding files in that project. They are copied
largely verbatim; the only changes are relative import paths and a small DOM accessor shim
(`src/core/dom.ts`) so the code runs in a VS Code webview instead of Obsidian. Each file
carries an attribution header.

- `src/core/model.ts`
- `src/core/diagramType.ts`
- `src/core/textMetrics.ts`
- `src/core/nodeGeometry.ts`
- `src/core/shapes.ts`
- `src/core/parser.ts`
- `src/core/serializer.ts`
- `src/core/layout.ts`
- `src/core/alignTools.ts`
- `src/core/themePalette.ts`

The hidden `%% mermaid-flow:pos %%` layout-comment convention is also adopted from Mermaid
Flow so that files remain interoperable between the two tools.

Because these files are a derivative work of GPL-3.0-or-later code, the entire ceasg
extension — including its newly written code (the VS Code host, the webview WYSIWYG canvas,
and the message protocol) — is licensed under GPL-3.0-or-later.

## Runtime dependencies

- [Mermaid](https://mermaid.js.org/) — diagram rendering (MIT).
- [dagre](https://github.com/dagrejs/dagre) (`@dagrejs/dagre`) — graph layout (MIT).
