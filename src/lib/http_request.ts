import { tmpdir } from "node:os";
import { createWriteStream, WriteStream } from "node:fs";
import axios from "axios";
import request from "request";
import path from "node:path";

export async function getBuffer(url: string, options?: {body?: any, headers?: {[key: string]: string}}): Promise<Buffer> {
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
    data: Body
  }).then(({data}) => Buffer.from(data));
  // return fetch(url, {
  //   method: "GET",
  //   body: typeof Body === "object" ? JSON.stringify(Body, null, 2):Body,
  //   headers: Headers
  // }).then(res => res.arrayBuffer()).then(res => Buffer.from(res));
}

export async function getJSON<JSONReturn = any>(url: string, options?: {body?: any, headers?: {[key: string]: string}}): Promise<JSONReturn> {
  console.log(url);
  return getBuffer(url, {
    body: options?.body,
    headers: options?.headers
  }).then(res => JSON.parse(res.toString("utf8")) as JSONReturn);
}


// Create function to save directly file in disk with stream
export async function saveFile(url: string, options?: {filePath?: string|WriteStream, headers?: {[key: string]: string}}) {
  console.log(url);
  let fileSave = path.join(tmpdir(), (Math.random()*155515151).toFixed()+"_raw_oapt.data");
  const Headers = {};
  if (options) {
    if (options.filePath && typeof options.filePath === "string") fileSave = options.filePath;
    if (options.headers) Object.keys(options.headers).forEach(key => Headers[key] = options.headers[key]);
  }
  const streamFile = (typeof options?.filePath === "string"||options?.filePath === undefined)?createWriteStream(fileSave, {autoClose: true}):options?.filePath;
  return new Promise<string>((done, reject) => {
    request.get(url, {headers: Headers}).on("error", reject).pipe(streamFile).on("finish", () => done(fileSave));
  });
}
