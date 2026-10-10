import {App, normalizePath, TFile} from 'obsidian';
import {DashboardItem, DashboardSettings, identityKey, normalizeType, parseIdentity} from './model';
import {itemFromProperties} from './index';
import {mergeProperties, Properties, propertiesFromSubject, splitNote} from './properties';
import DoubanSubject from '../douban/data/model/DoubanSubject';
export interface MigrationPreview {path:string; before:string; after?:string; patch?:Properties; key?:string; issue?:string;}
export interface BackupRecord {path:string; before:string; after:string; createdAt:string;}
export function prepareMigration(path:string, before:string, settings:DashboardSettings, manualUrl?:string, subject?:DoubanSubject): MigrationPreview {
  try {
    const {properties,body} = splitNote(before);
    const explicitUrl = manualUrl || properties[settings.fields.url] || properties.douban_url;
    const candidates = [...body.matchAll(/https?:\/\/(?:[a-z]+\.)?douban\.com\/[^\s<>"\])]+/g)]
      .map(m=>parseIdentity(m[0])).filter(Boolean);
    const unique = new Map(candidates.map(i=>[`${i.namespace}:${i.id}`,i]));
    if (!explicitUrl && unique.size > 1) throw new Error('包含多个豆瓣条目链接，请手动关联');
    const url = explicitUrl || [...unique.values()][0]?.url;
    if (manualUrl && !parseIdentity(manualUrl)) throw new Error('请输入有效的豆瓣条目链接');
    const candidate = {...properties};
    if (url) candidate[properties.douban_source === 'douban' ? 'douban_url' : settings.fields.url] = url;
    const item = itemFromProperties(candidate,path,0,settings,true);
    if (!item || item.key.startsWith('unresolved:')) throw new Error('缺少可靠的条目标识，请手动关联豆瓣链接');
    if(subject && identityKey(String(subject.id),normalizeType(subject.type),subject.url) !== item.key) throw new Error('远程条目与笔记关联不一致');
    const patch = subject ? propertiesFromSubject(subject) : propertiesFromItem(item);
    // Offline migration must not claim a successful remote fetch.
    if (!subject && !item.syncedAt) delete patch.douban_synced_at;
    const after = mergeProperties(before,patch);
    return {path,before,after,patch,key:item.key};
  } catch(e) {return {path,before,issue:String(e.message || e)};}
}
export function propertiesFromItem(i:DashboardItem): Properties {
  return {douban_source:'douban',douban_schema:1,douban_id:i.id,douban_url:i.url || null,douban_type:i.type,
    douban_title:i.title,douban_cover:i.cover || null,douban_score:i.score ?? null,douban_rating:i.rating ?? null,
    douban_state:i.state,douban_published_date:i.publishedDate || null,douban_collection_date:i.collectionDate || null,douban_tags:i.tags,
    ...(i.syncedAt ? {douban_synced_at:i.syncedAt} : {})};
}
export function markDuplicatePreviews(previews:MigrationPreview[]): void {
  const keys = new Map<string,MigrationPreview[]>();
  for(const p of previews) if(p.key) keys.set(p.key,[...(keys.get(p.key)||[]),p]);
  for(const group of keys.values()) if(group.length > 1) group.forEach(p=>p.issue='多个文件关联同一条目，请处理重复关联后重试');
}
export default class MigrationService {
  constructor(private app:App, private settings:()=>DashboardSettings, private pluginId:string) {}
  get backupDir():string {return normalizePath(`${this.app.vault.configDir}/plugins/${this.pluginId}/backups`);}
  async preview(file:TFile, manualUrl?:string, subject?:DoubanSubject):Promise<MigrationPreview> {
    return prepareMigration(file.path,await this.app.vault.read(file),this.settings(),manualUrl,subject);
  }
  async apply(p:MigrationPreview):Promise<string> {
    if(p.issue || !p.patch || p.after === undefined) throw new Error(p.issue || '无可写入的预览');
    const file = this.app.vault.getAbstractFileByPath(p.path);
    if(!(file instanceof TFile)) throw new Error('文件不存在或已移动，请重新预览');
    const current = await this.app.vault.read(file);
    if(current !== p.before) throw new Error('笔记在预览后发生变化，请重新预览');
    const adapter = this.app.vault.adapter;
    if(!await adapter.exists(this.backupDir)) await adapter.mkdir(this.backupDir);
    const backupPath = `${this.backupDir}/${Date.now()}-${Math.random().toString(36).slice(2)}.json`;
    const record:BackupRecord = {path:p.path,before:p.before,after:p.after,createdAt:new Date().toISOString()};
    await adapter.write(backupPath,JSON.stringify(record));
    // The synchronous callback checks the latest content atomically with the write.
    await this.app.vault.process(file,text=>{
      if(text !== p.before) throw new Error('笔记在写入前发生变化，请重新预览');
      return p.after;
    });
    return backupPath;
  }
  async backups():Promise<string[]> {
    const a=this.app.vault.adapter;
    return await a.exists(this.backupDir) ? (await a.list(this.backupDir)).files.filter(p=>p.endsWith('.json')).sort().reverse() : [];
  }
  async readBackup(path:string):Promise<BackupRecord> {
    const clean=normalizePath(path);
    if(!clean.startsWith(`${this.backupDir}/`) || !clean.endsWith('.json')) throw new Error('备份路径无效');
    const b=JSON.parse(await this.app.vault.adapter.read(clean));
    if(typeof b.path!=='string' || typeof b.before!=='string' || typeof b.after!=='string') throw new Error('备份格式无效');
    if(b.path.startsWith('/') || b.path.split(/[\\/]/).includes('..') || !b.path.endsWith('.md')) throw new Error('备份笔记路径无效');
    return b;
  }
  async restore(path:string, expectedCurrent:string):Promise<void> {
    const b=await this.readBackup(path);const file=this.app.vault.getAbstractFileByPath(b.path);
    if(!(file instanceof TFile)) throw new Error('备份对应笔记已不存在');
    await this.app.vault.process(file,text=>{if(text!==expectedCurrent) throw new Error('笔记又发生变化，请重新预览');return b.before;});
  }
}
const CONFIG_KEYS = ['movieTemplateFile','bookTemplateFile','musicTemplateFile','noteTemplateFile','gameTemplateFile','teleplayTemplateFile','theaterTemplateFile','dateFormat','timeFormat','personNameMode','dataFilePath','dataFileNamePath','cacheImage','cacheHighQuantityImage','attachmentPath','attachmentFileName','customProperties','arraySettings','arrayLengthLimits','scoreSetting','searchDefaultType','syncHandledDataArray','arrayStart','arrayElementStart','arraySpiltV2','arrayElementEnd','arrayEnd','showAfterCreate'];
export function importableConfig(raw:unknown):Properties {
  if(!raw || typeof raw!=='object' || Array.isArray(raw)) throw new Error('原插件配置格式无效');
  const result:Properties={};
  for(const k of CONFIG_KEYS) if(Object.prototype.hasOwnProperty.call(raw,k)) result[k]=(raw as Properties)[k];
  return result;
}
