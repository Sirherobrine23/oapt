import { tmpdir } from "node:os";
import fs from "node:fs";
import axios from "axios";
import got from "got";
import path from "node:path";

export async function getBuffer(url: string, options?: {method?: string,body?: any, headers?: {[key: string]: string}}): Promise<Buffer> {
  const Headers = {};
  let Body: any;
  if (options) {
    if (options.headers) Object.keys(options.headers).forEach(key => Headers[key] = options.headers[key]);
    if (options.body) Body = options.body;
  }
  // if (typeof fetch === "undefined")
  return axios.get(url, {
    responseEncoding: "arraybuffer",
    responseType: "arraybuffer",
    headers: Headers,
    data: Body,
    method: (options?.method||"GET").toUpperCase()
  }).then(({data}) => Buffer.from(data));
  // return fetch(url, {
  //   method: "GET",
  //   body: typeof Body === "object" ? JSON.stringify(Body, null, 2):Body,
  //   headers: Headers
  // }).then(res => res.arrayBuffer()).then(res => Buffer.from(res));
}

export async function getJSON<JSONReturn = any>(url: string, options?: {method?: string, body?: any, headers?: {[key: string]: string}}): Promise<JSONReturn> {
  return getBuffer(url, {
    body: options?.body,
    headers: options?.headers,
    method: options?.method
  }).then(res => JSON.parse(res.toString("utf8")) as JSONReturn);
}


// Create function to save directly file in disk with stream
export async function saveFile(url: string, options?: {filePath?: string, headers?: {[key: string]: string}}) {
  let fileSave = path.join(tmpdir(), (Math.random()*155515151).toFixed()+"_raw_oapt.data");
  const Headers = {};
  if (options) {
    if (options.filePath && typeof options.filePath === "string") fileSave = options.filePath;
    if (options.headers) Object.keys(options.headers).forEach(key => Headers[key] = options.headers[key]);
  }

  const gotStream = got.stream({url, headers: Headers, isStream: true}), fileStream = fs.createWriteStream(fileSave);
  gotStream.on("data", data => fileStream.write(data));
  await new Promise<void>((done, reject) => gotStream.on("end", () => setTimeout(done, 1000)));
  await new Promise<void>((done, reject) => fileStream.on("finish", () => setTimeout(done, 1000)));
  return fileSave;
}
