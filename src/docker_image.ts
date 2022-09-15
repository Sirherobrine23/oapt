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
  accept: "application/vnd.docker.distribution.manifest.v2+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.v1+prettyjws, application/json, application/vnd.oci.image.manifest.v1+json",
  "accept-encoding": "gzip"
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

export type manifestReponsev2 = {
  schemaVersion: 2,
  mediaType: string,
  config: {
    mediaType: string,
    size: number,
    digest: string
  },
  layers?: {
    mediaType: string,
    digest: string,
    size: number
  }[],
  manifests?: {
    mediaType: string,
    digest: string,
    size: number,
    platform: { architecture: string, os: string, variant?: string }
  }[]
};

export type manifestReponse = manifestReponsev1|manifestReponsev2;
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

export async function downloadBlobs(packageName: string) {
  const image = prettyImage(packageName);
  const token = await getToken(image);
  const packageInfo = await getManifest(packageName);
  if (packageInfo.schemaVersion === 1) {
    return Promise.all(packageInfo.fsLayers.map(async layer => {
      return http_request.saveFile(`http://${image.registryBase}/v2/${image.owner}/${image.repository}/blobs/${layer.blobSum}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
    }));
  } else if (packageInfo.schemaVersion === 2 && !!(packageInfo.layers||packageInfo.manifests)) {
    if (packageInfo.manifests) {
      const platformImage = packageInfo.manifests.find(layer => {
        let platform = process.platform;
        if (platform === "win32") platform = "windows" as "win32";
        if (layer.platform.os === platform) return true;
        return false;
      });
      if (!platformImage) throw new Error("Cannot get platform package");
      return downloadBlobs(`${image.registryBase}/${image.owner}/${image.repository}:${platformImage.digest}`);
    } else if (packageInfo.layers) {
      return Promise.all(packageInfo.layers.map(async layer => {
        console.log(layer.digest, layer.mediaType);
        return http_request.saveFile(`http://${image.registryBase}/v2/${image.owner}/${image.repository}/blobs/${layer.digest}`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
      }));
    }
  }
  throw new Error("Uncated");
}
