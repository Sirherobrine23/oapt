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

async function getToken(options: manifestOptions) {
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
      Authorization: `Bearer ${token}`
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
  layers: [
    {
      mediaType: "application/vnd.docker.image.rootfs.diff.tar.gzip"|"application/vnd.oci.image.layer.v1.tar"|"application/vnd.oci.image.layer.v1.tar+gzip"|"application/vnd.oci.image.layer.v1.tar+zstd"|"application/vnd.oci.image.layer.nondistributable.v1.tar"|"application/vnd.oci.image.layer.nondistributable.v1.tar+gzip"|"application/vnd.oci.image.layer.nondistributable.v1.tar+zstd",
      size: number,
      digest: string
    }
  ]
};

export type manifestResponsev2_1 = {
  mediaType: string,
  schemaVersion: 2,
  manifests: {
    mediaType: "application/vnd.docker.distribution.manifest.v2+json",
    digest: string,
    size: number,
    platform: { architecture: string, os: string, variant?: string }
  }[]
};

export type manifestResponsev2_2 = {
  mediaType: "application/vnd.docker.distribution.manifest.v2+json",
  schemaVersion: 2,
  config: {
    mediaType: "application/vnd.docker.container.image.v1+json",
    digest: string,
    size: number
  },
  layers: [
    {
      mediaType: "application/vnd.docker.image.rootfs.diff.tar.gzip",
      digest: string,
      size: number
    }
  ]
}

export type manifestReponse = manifestReponsev1|manifestReponsev2|manifestResponsev2_1|manifestResponsev2_2;
export async function getManifest(packageName: string) {
  const image = prettyImage(packageName);
  const token = await getToken(image);
  return http_request.getJSON<manifestReponse>(`http://${image.registryBase}/v2/${image.owner}/${image.repository}/manifests/${image.tagDigest}`, {
    headers: {
      Authorization: `Bearer ${token}`
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
  } else if (packageInfo.mediaType === "") {}
  throw new Error("Uncated");
}
