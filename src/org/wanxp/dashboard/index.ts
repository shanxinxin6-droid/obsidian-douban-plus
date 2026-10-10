import {App, TFile} from 'obsidian';
import {boundedNumber, DashboardItem, DashboardSettings, dateString, identityKey, normalizeState, normalizeType, parseIdentity} from './model';
import {Properties, splitNote} from './properties';
import {localCoverFromNote} from './covers';
export function itemFromProperties(p: Properties, path: string, modifiedAt: number, settings: DashboardSettings, scoped: boolean): DashboardItem | null {
  const managed = p.douban_source === 'douban';
  const f = settings.fields;
  const get = (name: string, key: string) => managed ? p[key] : p[f[name]];
  const url = get('url','douban_url'); const identity = parseIdentity(url);
  const id = String(get('id','douban_id') ?? identity?.id ?? '');
  if (!managed && !identity && !(scoped && /^\d+$/.test(id))) return null;
  if (!/^\d+$/.test(id)) return null;
  let type = normalizeType(get('type','douban_type'));
  if (type === 'unknown' && identity) type = identity.type;
  const key = identityKey(id,type,url) || `unresolved:${path}`;
  const tags = get('tags','douban_tags');
  return {key,id,type,title:String(get('title','douban_title') || path.split('/').pop()?.replace(/\.md$/i,'') || id),
    url:identity?.url,cover:get('cover','douban_cover') || undefined,score:boundedNumber(get('score','douban_score'),10),
    rating:boundedNumber(get('rating','douban_rating'),5),state:normalizeState(get('state','douban_state')),
    publishedDate:dateString(get('publishedDate','douban_published_date')),collectionDate:dateString(get('collectionDate','douban_collection_date')),
    tags:Array.isArray(tags) ? tags.map(String) : typeof tags === 'string' ? tags.split(/[,，]/).map(t=>t.trim()).filter(Boolean) : [],
    syncedAt:managed ? p.douban_synced_at : undefined,files:[path],managed,modifiedAt};
}
export default class DashboardIndex {
  private records = new Map<string, DashboardItem>();
  readonly errors = new Map<string,string>();
  private revisions = new Map<string,number>();
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout>;
  loading = false;
  constructor(private app: App, private settings: () => DashboardSettings, private outputFolder: () => string) {}
  subscribe(fn: () => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  notify(): void { clearTimeout(this.timer); this.timer = setTimeout(()=>this.listeners.forEach(fn=>fn()),100); }
  scoped(path: string): boolean {
    return [this.outputFolder(),...this.settings().folders].some(folder => {
      const clean = folder.replace(/\\/g,'/').replace(/^\/+|\/+$/g,'');
      return !!clean && (path === clean || path.startsWith(`${clean}/`));
    });
  }
  async rebuild(): Promise<void> {
    this.loading = true; this.notify();
    this.records.clear(); this.errors.clear();
    try {
      const files = this.app.vault.getMarkdownFiles();
      for (let i=0;i<files.length;i+=100) {
        await Promise.all(files.slice(i,i+100).map(f=>this.update(f)));
        await new Promise(resolve=>setTimeout(resolve,0));
      }
    } finally {this.loading=false;this.notify();}
  }
  async update(file: TFile): Promise<void> {
    if (file.extension !== 'md') return;
    const path = file.path; const rev = (this.revisions.get(path) || 0)+1;this.revisions.set(path,rev);
    try {
      const cached = this.app.metadataCache.getFileCache(file)?.frontmatter;
      const p = cached || splitNote(await this.app.vault.cachedRead(file)).properties;
      const record = itemFromProperties(p,path,file.stat.mtime,this.settings(),this.scoped(path));
      if(record)record.cover=localCoverFromNote(this.app,file,record.cover)?.path || record.cover;
      if (this.revisions.get(path) !== rev) return;
      if (record) this.records.set(path,record); else this.records.delete(path);
      this.errors.delete(path);
    } catch(e) { if(this.revisions.get(path) === rev) {const relevant=this.scoped(path)||this.records.has(path);this.records.delete(path);if(relevant)this.errors.set(path,String(e.message || e));} }
    this.notify();
  }
  remove(path: string): void { this.revisions.set(path,(this.revisions.get(path)||0)+1);this.records.delete(path);this.errors.delete(path);this.notify(); }
  items(): DashboardItem[] {
    const result = new Map<string,DashboardItem>();
    for(const record of this.records.values()) {
      const existing = result.get(record.key);
      if(existing) {existing.files.push(...record.files);existing.managed = existing.managed && record.managed;}
      else result.set(record.key,{...record,files:[...record.files]});
    }
    return [...result.values()];
  }
  find(key: string): DashboardItem | undefined {return this.items().find(i=>i.key === key);}
  dispose(): void {clearTimeout(this.timer);this.listeners.clear();}
}
