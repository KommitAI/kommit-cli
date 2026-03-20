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

This opens your browser to authenticate, then writes the MCP config to your project. Restart your editor and Kommit is connected.

## Supported Tools

| Client | Transport | Config Location |
|--------|-----------|-----------------|
| Claude Code | Native URL | `.mcp.json` |
| Cursor | Native URL | `.cursor/mcp.json` |
| VS Code | Native URL | `.vscode/mcp.json` |
| Claude Desktop | stdio | `claude_desktop_config.json` |
| Windsurf | stdio | `~/.codeium/windsurf/mcp_config.json` |
| Cline | stdio | VS Code global storage |
| Zed | stdio | `~/.config/zed/settings.json` |
| Codex | stdio | `~/.codex/config.toml` |
| Goose | stdio | `~/.config/goose/config.yaml` |
| Gemini CLI | stdio | `~/.gemini/settings.json` |
| Aider | stdio | `~/.aider/mcp.yml` |
| And more... | | |

Clients with Native URL transport connect directly to the Kommit API — no proxy process needed. Stdio clients use `mcp-remote` as a bridge.

## Options

```
--client    AI tool to install for (interactive prompt if omitted)
--key       API key — skip browser auth (useful for CI/CD)
--global    Write to global config instead of project-local
--name      Server name in the config (default: "kommit")
```

## Examples

```bash
# Interactive — prompts you to pick a client
npx @kommit/cli@latest

# Direct install for Cursor (global config)
npx @kommit/cli@latest --client cursor --global

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
