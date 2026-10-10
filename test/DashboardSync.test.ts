jest.mock('obsidian',()=>require('./mocks/obsidian'),{virtual:true});
import DoubanPlugin from '../src/org/wanxp/main';
import GlobalStatusHolder from '../src/org/wanxp/douban/model/GlobalStatusHolder';
import DashboardIndex from '../src/org/wanxp/dashboard/index';
import {defaultDashboardSettings} from '../src/org/wanxp/dashboard/model';
import {mergeProperties,propertiesFromSubject,splitNote} from '../src/org/wanxp/dashboard/properties';
import {memoryApp} from './mocks/obsidian';
import {Action,SearchHandleMode} from '../src/org/wanxp/constant/Constsant';
const subject={id:'1',type:'movie',title:'电影',url:'https://movie.douban.com/subject/1/',score:8,image:'',userState:{state:'collect',rate:5,tags:[]}} as any;
describe('safe metadata sync and cancellation',()=>{
  const config={syncType:'movie',scope:'all',incrementalUpdate:true,force:false,dataFilePath:'Douban'} as any;
  it('retains the shared lock until a cancelled request has completed',async()=>{
    const holder=new GlobalStatusHolder({} as any,{settings:{},saveSettings:jest.fn()} as any);
    expect(holder.startSync(config)).toBe(true);holder.stopSync();expect(holder.syncing()).toBe(false);expect(holder.syncStarted).toBe(true);expect(holder.startSync(config)).toBe(false);await holder.completeSync();expect(holder.startSync(config)).toBe(true);
  });
  async function pluginWithNote(managed=true){
    const text=managed?mergeProperties('# 用户感想\n\n正文中的 --- 不可损坏',propertiesFromSubject(subject)):'---\ndoubanId: "1"\ntype: movie\nurl: https://movie.douban.com/subject/1/\n---\n用户感想';
    const m=memoryApp({'Moved/电影.md':text});const plugin:any=Object.create(DoubanPlugin.prototype);
    plugin.app=m.app;plugin.settings={dashboard:defaultDashboardSettings(),dataFilePath:'Douban'};plugin.dashboardCounts={created:0,updated:0,skipped:0,failed:0};plugin.statusHolder=new GlobalStatusHolder(m.app,plugin);plugin.saveSettings=jest.fn();plugin.dashboardReady=Promise.resolve();
    plugin.dashboardIndex=new DashboardIndex(m.app,()=>plugin.dashboardSettings,()=> 'Douban');await plugin.dashboardIndex.rebuild();return {plugin,m,text};
  }
  it('refreshes the moved note in place and preserves the exact body',async()=>{const {plugin,m,text}=await pluginWithNote();expect(await plugin.updateDashboardSubject({...subject,score:9})).toBe(true);const saved=m.contents.get('Moved/电影.md');expect(splitNote(saved).body).toBe(splitNote(text).body);expect(splitNote(saved).properties.douban_score).toBe(9);expect(m.files.size).toBe(1);plugin.dashboardIndex.dispose();});
  it('does not mutate cancelled, legacy or duplicate notes',async()=>{
    const managed=await pluginWithNote();managed.plugin.statusHolder.startSync(config);managed.plugin.statusHolder.stopSync();await expect(managed.plugin.updateDashboardSubject(subject,true)).rejects.toThrow('取消');expect(managed.m.contents.get('Moved/电影.md')).toBe(managed.text);managed.plugin.dashboardIndex.dispose();
    const legacy=await pluginWithNote(false);expect(await legacy.plugin.updateDashboardSubject(subject)).toBe(false);expect(legacy.m.contents.get('Moved/电影.md')).toBe(legacy.text);legacy.plugin.dashboardIndex.dispose();
  });
  it('rejects identity changes between indexing and writing',async()=>{const {plugin,m}=await pluginWithNote();m.contents.set('Moved/电影.md',mergeProperties('new body',propertiesFromSubject({...subject,id:'2',url:'https://movie.douban.com/subject/2/'})));await expect(plugin.updateDashboardSubject(subject)).rejects.toThrow('关联');plugin.dashboardIndex.dispose();});
  it('adds required fields through the real save hook for a body-only template',async()=>{
    const {plugin,m}=await pluginWithNote();let saved='';plugin.fileHandler={createNewNoteWithData:jest.fn(async(_path:string,text:string)=>{saved=text;return true;})};
    await plugin.createFile({action:Action.SearchAndCrate,mode:SearchHandleMode.FOR_CREATE},{content:'# 模板没有类型字段',filePath:'Douban',fileName:'新电视剧',subject:{...subject,id:'2',type:'teleplay',url:'https://movie.douban.com/subject/2/'}});
    expect(splitNote(saved).properties.douban_type).toBe('teleplay');expect(splitNote(saved).body).toBe('# 模板没有类型字段');plugin.dashboardIndex.dispose();
  });
  it('skips duplicate associations without modifying any file',async()=>{
    const {plugin,m,text}=await pluginWithNote();const FileCtor=m.files.get('Moved/电影.md').constructor;const file=new FileCtor('Moved/duplicate.md');m.files.set(file.path,file);m.contents.set(file.path,text);await plugin.dashboardIndex.rebuild();expect(await plugin.updateDashboardSubject(subject)).toBe(false);expect([...m.contents.values()]).toEqual([text,text]);plugin.dashboardIndex.dispose();
  });
  it('blocks force overwrite of a same-name unassociated note',async()=>{
    const {plugin,m}=await pluginWithNote();const FileCtor=m.files.get('Moved/电影.md').constructor;const file=new FileCtor('Douban/new.md');m.files.set(file.path,file);m.contents.set(file.path,'用户私人正文');plugin.statusHolder.startSync(config);
    await plugin.createFile({action:Action.Sync,syncConfig:{force:true}},{content:'replacement',filePath:'Douban',fileName:'new',subject:{...subject,id:'2',url:'https://movie.douban.com/subject/2/'}});expect(m.contents.get(file.path)).toBe('用户私人正文');plugin.dashboardIndex.dispose();
  });
});
