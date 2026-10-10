import {App, TFile} from 'obsidian';

const IMAGE_EXTENSION=/^(?:avif|bmp|gif|jpe?g|png|svg|webp)$/i;

export function resolveLocalCover(app:App,source:TFile,reference:unknown):TFile|undefined {
  if(typeof reference!=='string')return undefined;
  const path=reference.trim().replace(/^!?\[\[/,'').replace(/\]\]$/,'').split('|')[0].replace(/^<|>$/g,'');
  if(!path || /^(?:https?:|data:|app:|file:)/i.test(path))return undefined;
  const file=app.metadataCache.getFirstLinkpathDest?.(path,source.path) || app.vault.getAbstractFileByPath(path);
  return file instanceof TFile && IMAGE_EXTENSION.test(file.extension)?file:undefined;
}

/** Recover only explicitly labelled cover embeds, never an arbitrary body image. */
export function localCoverFromNote(app:App,source:TFile,reference:unknown):TFile|undefined {
  const current=resolveLocalCover(app,source,reference);
  if(current)return current;
  for(const embed of app.metadataCache.getFileCache(source)?.embeds || []) {
    if(!/^(?:image|cover|poster|封面)$/i.test(embed.displayText || '') && !/^!\[(?:image|cover|poster|封面)\]\(/i.test(embed.original || ''))continue;
    const file=resolveLocalCover(app,source,embed.link);
    if(file)return file;
  }
  return undefined;
}
