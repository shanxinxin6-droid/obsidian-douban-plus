import {readFile, readdir} from 'node:fs/promises';
import {join} from 'node:path';

// Use the production bundle's inputs rather than including every dev dependency.
export async function thirdPartyNotices(root, metafile) {
  const packagePaths = new Set();
  for (const output of Object.values(metafile.outputs)) {
    for (const [input, details] of Object.entries(output.inputs)) {
      if (!details.bytesInOutput) continue;
      const matches = [...input.replaceAll('\\', '/').matchAll(/(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)/g)];
      const match = matches[matches.length - 1];
      if (match) packagePaths.add(input.replaceAll('\\', '/').slice(0, match.index + match[0].length));
    }
  }
  const entries = [];
  for (const packagePath of [...packagePaths].sort()) {
    const directory = join(root, packagePath);
    const pkg = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
    const files = (await readdir(directory, {withFileTypes: true}))
      .filter(file => file.isFile() && /^(?:licen[cs]e|copying|notice)(?:$|[._-])/i.test(file.name))
      .map(file => file.name).sort();
    const texts = await Promise.all(files.map(async name => `${name}\n${await readFile(join(directory, name), 'utf8')}`));
    if (!texts.length) {
      // Some older npm tarballs omit a license that the source repository supplies.
      // Only use a checked-in, reviewed notice for this exact name and version.
      const fallback = join(root, 'licenses', `${pkg.name.replaceAll('/', '__')}-${pkg.version}.LICENSE`);
      try {
        texts.push(`Maintainer-supplied upstream license copy\n${await readFile(fallback, 'utf8')}`);
      } catch {
        throw new Error(`Missing license text for bundled package ${pkg.name}@${pkg.version}; review it before distributing.`);
      }
    }
    entries.push(`${pkg.name}@${pkg.version}\nLicense: ${typeof pkg.license === 'string' ? pkg.license : JSON.stringify(pkg.license || pkg.licenses)}\n${texts.join('\n\n')}`);
  }
  if (!entries.length) throw new Error('No bundled dependency licenses found; rebuild before packaging.');
  return `Douban Plus — bundled third-party license notices\nGenerated from the production bundle. Components retain their own licenses.\n\n${entries.join('\n\n' + '='.repeat(72) + '\n\n')}\n`;
}
