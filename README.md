# @kommit/cli

Connect [Kommit](https://getkommit.ai) to your AI coding tools with a single command.

```bash
npx @kommit/cli@latest --client claude-code
```

Kommit gives your AI tools persistent project memory — specs, decisions, learnings, and context that carry across sessions.

## Quick Start

```bash
npx @kommit/cli@latest --client claude-code
```

This opens your browser to authenticate, then writes the MCP config to your user config by default. Restart your editor and Kommit is connected.

Requires Node.js 20 or newer.

## Supported Tools

| Client | Transport | Default Config Location | Project Config |
|--------|-----------|-------------------------|----------------|
| Claude Code | Native HTTP | `~/.claude.json` | `.mcp.json` |
| Cursor | Native remote URL | `~/.cursor/mcp.json` | `.cursor/mcp.json` |
| VS Code | Native HTTP | VS Code user `mcp.json` | `.vscode/mcp.json` |
| Claude Desktop | stdio | `claude_desktop_config.json` | Not supported |
| Windsurf | stdio | `~/.codeium/windsurf/mcp_config.json` | Not supported |
| Cline | stdio | VS Code global storage | Not supported |
| Zed | Native remote URL | `~/.config/zed/settings.json` | Not supported |
| Codex | Native HTTP | `~/.codex/config.toml` | Not supported |
| Goose | stdio | `~/.config/goose/config.yaml` | Not supported |
| Gemini CLI | Native HTTP | `~/.gemini/settings.json` | `.gemini/settings.json` |
| Aider | stdio | `~/.aider/mcp.yml` | `.aider.mcp.yml` |
| More clients | varies | Client-specific user config | Client-specific; unsupported clients fail clearly |

Clients with native remote transport connect directly to the Kommit API — no proxy process needed. Stdio clients use `mcp-remote` as a bridge.

## Config Scopes

Kommit CLI supports two scopes:

- `user` writes to the client user-level config and is the default.
- `project` writes to a config file in the current project when that client supports project config.

Project-scoped installs are currently supported for Claude Code, Cursor, VS Code, Gemini CLI, Aider, Droid, and OpenCode. If you request `--scope project` for a client without a project config file, the CLI fails before API-key validation or browser auth and does not write any files.

Claude Code has its own `local`, `project`, and `user` MCP terminology. In this CLI, `--scope project` maps to Claude Code's checked-in `.mcp.json` project file, while `--scope user` maps to Claude Code's user config. Claude Code's private per-project `local` scope is not exposed by this CLI. The legacy `--local` flag is kept as an alias for `--scope project`; it does not mean Claude Code's private local scope.

## Options

```
--client    AI tool to install for (interactive prompt if omitted)
--key       API key — skip browser auth (useful for CI/CD)
--scope     Config scope: user or project (default: user)
--global    Legacy alias for --scope user
--local     Legacy alias for --scope project
--name      Server name in the config (default: "kommit")
```

## Examples

```bash
# Interactive — prompts you to pick a client
npx @kommit/cli@latest

# Direct install for Cursor (project config)
npx @kommit/cli@latest --client cursor --scope project

# Headless / CI — provide key directly
npx @kommit/cli@latest --client claude-code --key km_your_key_here
```

## How It Works

1. CLI starts a local server and opens your browser to `getkommit.ai/cli-auth`
2. You log in and click "Authorize"
3. Kommit creates an API key and sends a short-lived code back to the CLI
4. CLI exchanges the code for the key and writes your config file

The API key never appears in your browser URL or history.

## Links

- [Website](https://getkommit.ai)
- [Documentation](https://getkommit.ai/docs)
- [Dashboard & Settings](https://getkommit.ai/settings)

## License

MIT
