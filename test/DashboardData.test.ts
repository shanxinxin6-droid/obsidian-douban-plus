jest.mock('obsidian',()=>require('./mocks/obsidian'),{virtual:true});
import {DashboardItem,DEFAULT_OPTIONS,defaultDashboardSettings,identityKey,parseIdentity,queryItems,summarize,dateString} from '../src/org/wanxp/dashboard/model';
import {mergeProperties,propertiesFromSubject,splitNote} from '../src/org/wanxp/dashboard/properties';
import DashboardIndex,{itemFromProperties} from '../src/org/wanxp/dashboard/index';
import MigrationService,{importableConfig,markDuplicatePreviews,prepareMigration} from '../src/org/wanxp/dashboard/migration';
import {memoryApp} from './mocks/obsidian';
const settings=defaultDashboardSettings();
const subject=(type='movie',id='1292720')=>({id,type,title:'示例: 标题',url:`https://${type==='book'?'book':'movie'}.douban.com/subject/${id}/`,score:8.2,image:'',datePublished:new Date(2024,1,3),userState:{rate:4,state:'collect',tags:['科幻'],collectionDate:new Date(2026,8,9)}} as any);
describe('dashboard identities and managed properties',()=>{
  it('shares the movie namespace with TV and keeps book IDs distinct',()=>{expect(identityKey('1','movie')).toBe(identityKey('1','teleplay'));expect(identityKey('1','book')).not.toBe(identityKey('1','movie'));});
  it.each(['https://evil-douban.com/subject/123/','javascript:alert(1)','https://movie.douban.com.evil.test/subject/123/'])('rejects unrelated URLs: %s',url=>expect(parseIdentity(url)).toBeNull());
  it('does not infer TV from a movie-domain URL and detects conflicting identity',()=>{expect(parseIdentity(subject().url).type).toBe('unknown');expect(()=>identityKey('999','movie',subject().url)).toThrow();});
  it.each(['movie','teleplay','book','music','game','theater','note'])('normalizes each supported type: %s',type=>{
    const value={...subject(type),url:undefined};expect(propertiesFromSubject(value).douban_type).toBe(type);
  });
  it('keeps unknown fields unknown rather than making zero scores or dates',()=>{const p=propertiesFromSubject({...subject(),score:0,datePublished:undefined,userState:undefined});expect(p.douban_score).toBeNull();expect(p.douban_rating).toBeNull();expect(p.douban_state).toBe('unknown');expect(p.douban_collection_date).toBeNull();expect(dateString('2024-02-31')).toBeUndefined();});
  it('protects managed identity while retaining custom fields and exact body',()=>{
    const text='\uFEFF---\r\ndouban_id: wrong\r\ncustom: 保留我\r\n---\r\n# 感想\r\n\r\n---\r\n正文';const p=propertiesFromSubject(subject());
    const updated=mergeProperties(text,p);expect(splitNote(updated).properties.custom).toBe('保留我');expect(splitNote(updated).properties.douban_id).toBe('1292720');expect(splitNote(updated).body).toBe(splitNote(text).body);expect(updated.startsWith('\uFEFF---\r\n')).toBe(true);
  });
  it('adds a header to body-only templates without interpreting body separators',()=>{const text='# 标题\n\n---\n正文';expect(splitNote(mergeProperties(text,propertiesFromSubject(subject()))).body).toBe(text);});
  it.each(['---\nnot: [valid\n---\nbody','---\n- array\n---\nbody','---\nunclosed: 1'])('rejects invalid headers',text=>expect(()=>mergeProperties(text,{})).toThrow());
});
describe('local index and search',()=>{
  const note=(id:string,type='movie',score=8)=>mergeProperties('body',propertiesFromSubject({...subject(type,id),score}));
  it('groups duplicate files and updates moved/deleted files without losing identity',async()=>{
    const m=memoryApp({'Douban/a.md':note('1'),'Douban/b.md':note('1'),'Douban/book.md':note('1','book')});const index=new DashboardIndex(m.app,()=>settings,()=> 'Douban');
    await index.rebuild();expect(index.items()).toHaveLength(2);expect(index.find('movie:1').files).toHaveLength(2);
    index.remove('Douban/a.md');const f=m.files.get('Douban/a.md');m.files.delete(f.path);const old=f.path;f.path='Moved/a.md';m.files.set(f.path,f);m.contents.set(f.path,m.contents.get(old));await index.update(f);expect(index.find('movie:1').files).toContain('Moved/a.md');
    index.remove('Douban/b.md');expect(index.find('movie:1').files).toEqual(['Moved/a.md']);index.dispose();
  });
  it('does not treat an ordinary note as a Douban item',()=>{expect(itemFromProperties({title:'电影',type:'movie'},'ordinary.md',1,settings,false)).toBeNull();expect(itemFromProperties({doubanId:'1',type:'movie'},'ordinary.md',1,settings,false)).toBeNull();});
  it('filters title/tags, rating, unknown values and years consistently',()=>{
    const a=itemFromProperties(propertiesFromSubject(subject()),'a.md',1,settings,true);const b:DashboardItem={...a,key:'movie:2',title:'另一部',score:undefined,rating:undefined,collectionDate:undefined,state:'unknown',tags:[]};const items=[a,b];
    expect(queryItems(items,{...DEFAULT_OPTIONS,query:'科幻',minScore:'8',rating:'4',year:'2026',yearDimension:'collection'})).toEqual([a]);
    expect(queryItems(items,{...DEFAULT_OPTIONS,rating:'unknown',year:'unknown',yearDimension:'collection'})).toEqual([b]);expect(summarize(items).states).toEqual({collect:1,unknown:1});
    expect(queryItems(items,{...DEFAULT_OPTIONS,scoreState:'unknown'})).toEqual([b]);expect(summarize(items).unknown['豆瓣未评分']).toBe(1);
  });
  it('records invalid YAML separately and can rebuild after deletion',async()=>{
    const m=memoryApp({'Douban/bad.md':'---\na: [\n---\nbody'});const index=new DashboardIndex(m.app,()=>settings,()=> 'Douban');await index.rebuild();expect(index.errors.size).toBe(1);m.files.clear();await index.rebuild();expect(index.errors.size).toBe(0);index.dispose();
  });
});
describe('migration and configuration',()=>{
  const old='---\ndoubanId: "1292720"\nurl: https://movie.douban.com/subject/1292720/\ncustom: keep\n---\n\n用户正文\n';
  it('previews offline migration without changing the body or claiming a fetch',()=>{const p=prepareMigration('Douban/a.md',old,settings);expect(p.issue).toBeUndefined();expect(p.patch.douban_type).toBe('unknown');expect(p.patch.douban_synced_at).toBeUndefined();expect(splitNote(p.after).body).toBe(splitNote(old).body);});
  it('supports manual association and skips ambiguous body links',()=>{const p=prepareMigration('a.md','正文',settings,'https://book.douban.com/subject/1/');expect(p.key).toBe('book:1');expect(prepareMigration('a.md','https://book.douban.com/subject/1/ https://book.douban.com/subject/2/',settings).issue).toMatch('多个');});
  it('flags duplicate previews',()=>{const p=[prepareMigration('a.md',old,settings),prepareMigration('b.md',old,settings)];markDuplicatePreviews(p);expect(p.every(v=>!!v.issue)).toBe(true);});
  it('requires a fresh preview, writes backups, restores guarded content and is idempotent',async()=>{
    const m=memoryApp({'Douban/a.md':old});const service=new MigrationService(m.app,()=>settings,'obsidian-douban-plus');const file=m.files.get('Douban/a.md');const p=await service.preview(file);expect(m.backups.size).toBe(0);
    m.contents.set(file.path,old+'new');await expect(service.apply(p)).rejects.toThrow('变化');m.contents.set(file.path,old);
    const backup=await service.apply(p);expect(m.backups.size).toBe(1);const again=await service.preview(file);expect(again.after).toBe(again.before);
    await expect(service.restore(backup,'wrong')).rejects.toThrow('变化');await service.restore(backup,p.after);expect(m.contents.get(file.path)).toBe(old);
  });
  it('excludes credentials and unknown keys when importing old config',()=>{expect(importableConfig({movieTemplateFile:'t.md',loginCookiesContent:'secret',loginHeadersContent:'secret',dashboard:{},dataFilePath:'Douban'})).toEqual({movieTemplateFile:'t.md',dataFilePath:'Douban'});expect(()=>importableConfig([])).toThrow();});
});
