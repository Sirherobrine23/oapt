import express from "express";
import * as  http from "./lib/http_request";
import { AxiosError } from 'axios';
export const app = express();
app.use(express.urlencoded({extended: true}));
app.use(express.json());

// GET /dists/{Suite}/InRelease
/*
-----BEGIN PGP SIGNED MESSAGE-----
Hash: SHA256

Origin: {string}
Label: {string}
Suite: {string}
Codename: {string}
Changelogs: {string,Optional}
Date: Thu, 15 Sep 2022 08:10:53 UTC
Valid-Until: Thu, 22 Sep 2022 08:10:53 UTC
Acquire-By-Hash: yes
Architectures: {Keys,}
Components: {Keys,}
Description: {Optional}
MD5Sum:
 {Key}  {Size} {FilePath}
SHA256:
 {Key}  {Size} {FilePath}
-----BEGIN PGP SIGNATURE-----

{PGP}
-----END PGP SIGNATURE-----
*/

// GET /dists/{Suite}/{Components}/binary-amd64/by-hash/SHA256/712ee19b50fa5a5963b82b8dd00438f59ef1f088db8e3e042f4306d2b7c89c69
/*
Archive: {string}
Origin: {string}
Label: {string}
Acquire-By-Hash: yes
Component: {string}
Architecture: {string}
*/
// GET /dists/{Suite}/by-hash/SHA256/2d6523aa1bd132fbe6436a3fb117eecaaa5de441c7da740e94d748aedb9bcd1d
/*{Binary}*/

// Create Routes APT
app.all("*", (req, res) => {
  console.log(req.method, `http://archive.ubuntu.com${req.path}`, req.body, req.query);
  http.getBuffer(`http://archive.ubuntu.com${req.path}`, {method: req.method}).then(resF => res.send(resF)).catch((err: AxiosError) => {
    res.status(err.response?.status).send(err.response?.data);
  });
});