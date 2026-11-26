// Offline browser bundle, also used by unbundled web/ development pages.
import {build} from 'esbuild';
import {copyFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
await build({stdin:{contents:'export {gzipSync,Gunzip} from "fflate/browser"; export {sha256} from "@noble/hashes/sha256";',resolveDir:root},bundle:true,minify:true,format:'esm',platform:'browser',target:'es2020',outfile:root+'web/vendor/save-codec.js'});
await copyFile(root+'node_modules/fflate/LICENSE',root+'web/vendor/FFLATE-LICENSE.txt');
await copyFile(root+'node_modules/@noble/hashes/LICENSE',root+'web/vendor/NOBLE-HASHES-LICENSE.txt');
