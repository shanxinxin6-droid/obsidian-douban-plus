import {readFile, mkdir, copyFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join,dirname} from 'node:path';
import {thirdPartyNotices} from './third-party-notices.mjs';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const manifest=JSON.parse(await readFile(join(root,'manifest.json'),'utf8'));
const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
const versions=JSON.parse(await readFile(join(root,'versions.json'),'utf8'));
if (!/^[a-z0-9][a-z0-9-]*$/.test(manifest.id) || !/^\d+\.\d+\.\d+$/.test(manifest.version)) throw new Error('Invalid plugin ID or release version.');
if (pkg.version!==manifest.version || versions[manifest.version]!==manifest.minAppVersion) throw new Error('package.json, manifest.json and versions.json must agree before packaging.');
const output=join(root,'dist',manifest.id);await mkdir(output,{recursive:true});
const files=['main.js','manifest.json','styles.css','LICENSE','NOTICE','INSTALL.md','SOURCE.md','THIRD_PARTY_NOTICES.txt'];
for(const name of files.slice(0,6))await copyFile(join(root,name),join(output,name));
const repository=pkg.repository.url.replace(/^git\+/, '').replace(/\.git$/, '');
const source=`# Douban Plus ${manifest.version}: corresponding source\n\nMaintainer: ${manifest.author}\nLicense: GPL-3.0-only; see LICENSE and NOTICE.\n\nSource tag: ${repository}/tree/${manifest.version}\nDownload corresponding source: ${repository}/archive/refs/tags/${manifest.version}.tar.gz\nReleases: ${repository}/releases/tag/${manifest.version}\n\nThe publisher must make this matching source tag publicly available alongside the binaries.\nThe source includes the plugin, package-lock.json, and build/package scripts.\n\nBuild with Node.js 24:\n\n\`\`\`sh\nnpm ci\nnpm run package:plugin\n\`\`\`\n\nBundled dependencies retain their licenses; see THIRD_PARTY_NOTICES.txt.\nObsidian and other external host APIs are not distributed in this bundle.\n`;
await writeFile(join(output,'SOURCE.md'),source);
const metafile=JSON.parse(await readFile(join(root,'dist','build-meta.json'),'utf8'));
await writeFile(join(output,'THIRD_PARTY_NOTICES.txt'),await thirdPartyNotices(root,metafile));
// Store-mode ZIP keeps packaging portable without a shell or an extra dependency.
const table=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
const crc=b=>{let c=0xffffffff;for(const n of b)c=table[(c^n)&255]^(c>>>8);return (c^0xffffffff)>>>0;};
const parts=[],central=[];let offset=0;
for(const file of files){
  const data=await readFile(join(output,file));const name=Buffer.from(`${manifest.id}/${file}`);const checksum=crc(data);
  const header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50,0);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);header.writeUInt32LE(checksum,14);header.writeUInt32LE(data.length,18);header.writeUInt32LE(data.length,22);header.writeUInt16LE(name.length,26);
  parts.push(header,name,data);
  const entry=Buffer.alloc(46);entry.writeUInt32LE(0x02014b50,0);entry.writeUInt16LE(20,4);entry.writeUInt16LE(20,6);entry.writeUInt16LE(0x800,8);entry.writeUInt32LE(checksum,16);entry.writeUInt32LE(data.length,20);entry.writeUInt32LE(data.length,24);entry.writeUInt16LE(name.length,28);entry.writeUInt32LE(offset,42);
  central.push(entry,name);offset+=header.length+name.length+data.length;
}
const directory=Buffer.concat(central);const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
const archive=join(root,'dist',`${manifest.id}-${manifest.version}.zip`);await writeFile(archive,Buffer.concat([...parts,directory,end]));
console.log(`Plugin package: ${archive}`);
console.log(`Release assets: ${output} (upload the files individually, plus the ZIP)`);
