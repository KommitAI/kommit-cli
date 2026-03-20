import yargs from "yargs";
import { builder, handler, type InstallArgs } from "../src/commands/install";
import type { Argv, ArgumentsCamelCase } from "yargs";

yargs(process.argv.slice(2))
  .command({
    command: "$0",
    describe: "Install the Kommit MCP server",
    builder: (y) => builder(y as unknown as Argv<InstallArgs>),
    handler: (argv) => handler(argv as ArgumentsCamelCase<InstallArgs>),
  })
  .strict()
  .help()
  .parse();
