# ShiMen Portable Package

This repository is the portable ShiMen application layout, not the development source tree.

## Start

1. Download the portable package from the release assets.
2. Keep all files and folders in the same directory.
3. Run `Lmentor.exe`.

`Lmentor.exe` launches the packaged runtime in `core/Lmentor-core.exe`. The editable application configuration and skills are kept in `CDXAgent/`. This repository tracks the portable layout and public resources; the full runnable binary package is distributed as a release asset.

## Deliberately excluded local files

The public package never contains API credentials, account authentication, conversation history, logs, caches, or machine-specific environment ownership records. These files are created locally when the application runs.

`CDXAgent/bin/codex.exe` is also excluded from normal Git history. Obtain it through the official runtime distribution and place it at the same path when preparing a fully runnable portable directory.

## Structure

- `Lmentor.exe`: portable launcher.
- `core/`: packaged application runtime and Visual C++ runtime files.
- `CDXAgent/`: editable configuration, skills, and runtime support files.
- `tools/`: bundled helper tools.
- `START.txt`: concise launch instructions.

## Notes

The portable folder must not be partially copied. Move or archive the entire directory as one unit. Python, Node.js, and optional analysis environments can be installed separately when a workflow requires them.
