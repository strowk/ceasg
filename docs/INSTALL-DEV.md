# Installing the local dev build

The local build shares the extension id `ceasg.ceasg` with the published
version, so installing the VSIX **replaces** the marketplace copy.

1. Build the VSIX (from the `extension/` folder):

   pnpm run package
   pnpm exec vsce package

2. Install it, overwriting the installed version:

   code --install-extension ceasg-0.2.0.vsix --force

3. Reload VS Code (Command Palette → "Developer: Reload Window").

4. Disable or uninstall any separate Mermaid **Markdown preview** extension so
   ceasg is the sole renderer, then open a Markdown preview (Ctrl+Shift+V).

To go back to the published version: uninstall ceasg, then reinstall it from the
Marketplace.
