import { writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import Yargs from "yargs";
import * as docker_image from "./docker_image";
import * as aptManeger from "./aptManeger/index";
import { app as expressApp } from "./server";
const yargs = Yargs(process.argv.slice(2)).help().version(false).alias("h", "help").wrap(Yargs.terminalWidth());

// APT Route
yargs.command("server", "Start server", yargs => yargs.option("port", {alias: "p", type: "number", default: 8080}).parseAsync().then(options => expressApp.listen(options.port, function(){console.log("Port listen on http://%s:%f", this.address().address === "::"?"[::]":this.address().address, this.address().port)})));

// List tags
yargs.command("list", "list tags", async yargs => {
  const options = yargs.parseSync();
  const info = await docker_image.getTags(options._[1] as string);
  console.log(info.tags.slice(0, 25).join("\n"));
  return;
});

// Install Package
yargs.command("install", "Install packages", async yargs => {
  const options = yargs.options("force", {
    alias: "f",
    type: "boolean",
    default: false
  }).option("platform", {
    type: "string",
    default: process.platform
  }).option("arch", {
    type: "string",
    default: process.arch
  }).option("prefix", {
    alias: "p",
    type: "string",
    default: process.platform === "win32" ? (process.arch === "x64" ? "C:\\Program Files\\":"C:\\Program Files (x86)\\"):(process.platform === "linux"?"/":path.join(homedir(), ".oaptRoot")),
  }).parseSync();
  const [, ...packagesNames] = options._.map(String);
  const packageRes = await aptManeger.existBroken(([]).concat(...await Promise.all(packagesNames.map(packageName => aptManeger.packageResolve(packageName, {blobs: {platform: options.platform, arch: options.arch}})))));
  const res2 = await Promise.all(packageRes.map(res => docker_image.downloadBlobs(res.packageUrl).then(data => ({...res, data}))));
  return await writeFile("./install.json", JSON.stringify(res2, null, 2));
});

// Run CLI
yargs.command({command: "*", handler: () => {Yargs.showHelp();}}).parseAsync().catch(err => {
  console.log(String(err), "\n", err.stack);
  process.exit(1);
});