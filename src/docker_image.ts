import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { tmpdir } from "node:os";
import tar from "tar";
import {AxiosError} from "axios";
import * as http_request from "./lib/http_request";
// https://github.com/moby/moby/blob/master/contrib/download-frozen-image-v2.sh

export const externalRegistry = /^([a-z0-9\._\-]+)\/([a-z0-9\._\-]+)\/([a-z0-9\._\-\/]+)(:(sha256:\S+|\S+|))?$/;
export type manifestOptions = {
  registryBase: string,
  repository: string,
  owner: string,
  tagDigest?: string,
  authBase?: string,
  authService?: string,
};

const defaultHeaders = {
  // "accept-encoding": "gzip",
  accept: "application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.v1+prettyjws, application/json",
}

export function prettyImage(imageName: string) {
  if (!/.*\/.*\//.test(imageName)) imageName = `library/${imageName}`;
  // Check if external registry
  if (!externalRegistry.test(imageName)) imageName = `registry-1.docker.io/${imageName}`;
  const [, registry, owner, packageNameOnly,, digest] = imageName.match(externalRegistry)||[];
  if (!owner && !packageNameOnly) throw new Error("invalid package name");
  const data: manifestOptions = {
    registryBase: registry,
    owner,
    repository: packageNameOnly,
    tagDigest: digest||"latest"
  };
  if (/docker\.io/.test(data.registryBase)) {
    data.authBase = "https://auth.docker.io";
    data.authService = "registry.docker.io";
  }
  return data;
}

export type requestToken = {
  token: string,
  access_token?: string,
  expires_in?: number,
  issued_at?: string
}

export async function getToken(options: manifestOptions) {
  // /token?scope=repository:the-bds-maneger/android_musl:pull
  let url = (options.authBase||options.registryBase)+"/token?";
  if (!/http[s]:\/\//.test(url)) url = `http://${url}`;
  if (options.authService) url += `service=${options.authService}&`
  url += `scope=repository:${options.owner}/${options.repository}:pull`;
  return (await http_request.getJSON<requestToken>(url).catch((err: AxiosError) => {
    if (err.response?.data) return Promise.reject(err.response.data.toString());
    return Promise.reject(err);
  })).token;
}

export type tagList = {
  name: string,
  tags: string[]
}

// https://hub.docker.com/v2/repositories/library/debian/tags/
export async function getTags(packageName: string) {
  const image = prettyImage(packageName);
  const token = await getToken(image);
  return http_request.getJSON<tagList>(`http://${image.registryBase}/v2/${image.owner}/${image.repository}/tags/list`, {
    headers: {
      Authorization: `Bearer ${token}`,
      ...defaultHeaders
    }
  });
}

export type manifestReponsev1 = {
  schemaVersion: 1,
  name: string,
  tag: string,
  architecture: string,
  fsLayers: {blobSum: string}[],
  history: {v1Compatibility: string}[],
  signatures: {header: {jwk: {crv: string, kid: string, kty: string, x: string, y: string}, alg: string}, signature: string, protected: string}[]
};

type manifestResponseV2Base = {
  schemaVersion: 2,
  config: {
    mediaType: "application/vnd.oci.image.config.v1+json"|"application/vnd.docker.container.image.v1+json",
    size: number,
    digest: string,
  },
  annotations?: {
    [key: string]: string
  }
}
export type manifestResponseV2 = manifestResponseV2Base & {
  schemaVersion: 2,
  mediaType?: "application/vnd.docker.distribution.manifest.v2+json",
  layers: {
    mediaType: "application/vnd.oci.image.layer.v1.tar+gzip"|"application/vnd.oci.image.layer.v1.tar+gzip",
    digest: string,
    size: number,
    annotations?: {
      [key: string]: string
    }
  }[]
}| manifestResponseV2Base & {
  mediaType?: "application/vnd.docker.distribution.manifest.list.v2+json",
  manifests: {
    mediaType: "application/vnd.docker.distribution.manifest.v2+json",
    digest: string,
    size: number,
    platform: { architecture: "arm64"|"amd64"|"i386", os: "linux"|"windows", variants?: string}
  }[]
};

export type manifestReponse = manifestResponseV2|manifestReponsev1;
export async function getManifest(packageName: string) {
  const image = prettyImage(packageName);
  const token = await getToken(image);
  return http_request.getJSON<manifestReponse>(`http://${image.registryBase}/v2/${image.owner}/${image.repository}/manifests/${image.tagDigest}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      ...defaultHeaders
    }
  }).catch((err: AxiosError) => {
    if (err.response?.data) return Promise.reject(err.response?.data?.toString());
    return Promise.reject(err);
  });
}

export async function downloadBlobs(packageName: string, options?: {arch?: string, platform?: string, rootSave?: string}) {
  const image = prettyImage(packageName);
  const packageInfo = await getManifest(packageName);
  const rootSave = options?.rootSave||path.join(tmpdir(), "oapt_"+crypto.randomBytes(8).toString("hex"));
  let platform = options?.platform||process.platform;
  let arch = options?.arch||process.arch;
  if (!fs.existsSync(rootSave)) await fs.promises.mkdir(rootSave, {recursive: true});
  if (platform === "win32") platform = "windows";
  if (arch === "x64") arch = "amd64";
  else if (arch === "x86") arch = "i368";
  else if (arch === "aarch64") arch = "arm64";

  const token = await getToken(image);
  const blobDown = async (digest: string) => {
    const file = await http_request.saveFile(`http://${image.registryBase}/v2/${image.owner}/${image.repository}/blobs/${digest}`, {filePath: path.join(rootSave, `${digest.replace(/(sha256:|)/, "")}.tar.gz`), headers: {Authorization: `Bearer ${token}`}});
    const folder = path.join(path.dirname(file), `layer_${digest.replace(/(sha256:|)/, "")}`);
    await fs.promises.mkdir(folder, {recursive: true});
    await tar.extract({file, C: folder, cwd: folder, keep: true, p: true, noChmod: false});
    return {file, folder, digest};
  };

  if (packageInfo.schemaVersion === 1) return Promise.all(packageInfo.fsLayers.map(layer => blobDown(layer.blobSum)));
  else if (packageInfo?.mediaType === "application/vnd.docker.distribution.manifest.list.v2+json") {
    const platformImage = packageInfo.manifests.find(layer => layer.platform.os === platform && (arch === "any"||layer.platform.architecture === arch));
    if (!platformImage) throw new Error("Cannot get platform package");
    return downloadBlobs(`${image.registryBase}/${image.owner}/${image.repository}:${platformImage.digest}`, {...options, rootSave});
  } else if (packageInfo.layers !== undefined) return Promise.all(packageInfo.layers.filter(layer => /(tar(\+|\.)gzip)$/.test(layer.mediaType)).map(layer => blobDown(layer.digest)));
  throw new Error("Package not valid");
}
