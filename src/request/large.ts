import { requestOptions, pipeFetch } from "@http/simples";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import tar from "tar";

export async function saveFile(request: string|requestOptions & {filePath?: string}) {
  if (typeof request === "string") request = {url: request};
  const filePath = request.filePath||path.join(os.tmpdir(), `raw_${Date.now()}_${(path.parse(request.url||request.socket?.path||crypto.randomBytes(16).toString("hex"))).name}`);
  await pipeFetch({...request, waitFinish: true, stream: fs.createWriteStream(filePath, {autoClose: false})});
  return filePath;
}

export async function tarExtract(request: requestOptions & {folderPath?: string}) {
  const folderToExtract = request.folderPath||path.join(os.tmpdir(), `raw_${Date.now()}_${(path.parse(request.url||request.socket?.path||crypto.randomBytes(16).toString("hex"))).name}`);
  if (!fs.existsSync(folderToExtract)) await fs.promises.mkdir(folderToExtract, {recursive: true});
  await pipeFetch({
    ...request,
    waitFinish: true,
    stream: tar.extract({
      cwd: folderToExtract,
      noChmod: false,
      noMtime: false,
      preserveOwner: true,
      keep: true,
      p: true
    })
  });
  return folderToExtract
}
