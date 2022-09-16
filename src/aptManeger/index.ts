import { resolveBlobs, blobsOptions, prettyImage } from "../docker_image";
import { compareVersions } from "compare-versions";

export type packageInfo = {
  packageUrl: string,
  version?: string,
  packageType?: "depedencie"
};

export async function packageResolve(packageName: string, option?: {blobs?: blobsOptions}): Promise<packageInfo[]> {
  let packages: packageInfo[] = [];
  const res = await resolveBlobs(packageName, option?.blobs);
  const packageConfig = res.digest.config?.Labels||res.manifest.annotations||{};
  packages.push({
    packageUrl: res.image.fullImageUrl,
    version: packageConfig["org.oapt.version"]
  });
  if (packageConfig["org.oapt.depencies"]) return packages.concat(...(await Promise.all(packageConfig["org.oapt.depencies"].split(",").map(packageName => packageResolve(packageName.trim()).then(res => res.map(res => {res.packageType = "depedencie"; return res;}))))));
  return packages;
}

export async function existBroken(packagesList: packageInfo[]) {
  let resolvedPackages: packageInfo[] = [];
  for (const pkg of packagesList) {
    const pkg2 = resolvedPackages.find(pkg2 => (prettyImage(pkg.packageUrl).fullImage === prettyImage(pkg2.packageUrl).fullImage));
    if (!!pkg2) {
      if (!pkg2.version) continue;
      const resVer = compareVersions(pkg.version, pkg2.version);
      if (resVer === 0||resVer === -1) continue;
      else {
        resolvedPackages = resolvedPackages.filter(pkg => pkg.packageUrl !== pkg2.packageUrl);
        resolvedPackages.push(pkg);
      }
    } else resolvedPackages.push(pkg);
  }
  return resolvedPackages;
}