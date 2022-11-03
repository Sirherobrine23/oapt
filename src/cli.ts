#!/usr/bin/env node
import yargs from "yargs";
yargs(process.argv.slice(2)).help().alias("h", "help").wrap(yargs.terminalWidth()).demandCommand().parseAsync();
