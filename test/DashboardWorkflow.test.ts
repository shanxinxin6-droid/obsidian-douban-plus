jest.mock('obsidian',()=>require('./mocks/obsidian'),{virtual:true});
jest.mock('../src/org/wanxp/utils/TimeUtil',()=>({sleepRange:jest.fn(async()=>{}),sleep:jest.fn(async()=>{})}));
import DoubanPlugin from '../src/org/wanxp/main';
import GlobalStatusHolder from '../src/org/wanxp/douban/model/GlobalStatusHolder';
import DashboardIndex from '../src/org/wanxp/dashboard/index';
import {DEFAULT_OPTIONS,defaultDashboardSettings} from '../src/org/wanxp/dashboard/model';
import {mergeProperties,propertiesFromSubject,splitNote} from '../src/org/wanxp/dashboard/properties';
import {DoubanAbstractSyncHandler} from '../src/org/wanxp/douban/sync/handler/DoubanAbstractSyncHandler';
import DoubanAbstractLoadHandler from '../src/org/wanxp/douban/data/handler/DoubanAbstractLoadHandler';
import {memoryApp} from './mocks/obsidian';
import {SearchHandleMode} from '../src/org/wanxp/constant/Constsant';
const subject=(id:string)=>({id,type:'movie',title:`电影${id}`,url:`https://movie.douban.com/subject/${id}/`,score:8,userState:{state:'collect'}} as any);
const config={syncType:'movie',scope:'collect',incrementalUpdate:true,force:false,dataFilePath:'Douban'} as any;

it('merges old settings and restores saved dashboard choices without losing defaults',async()=>{
  const plugin:any=Object.create(DoubanPlugin.prototype);plugin.app=memoryApp().app;
  plugin.loadData=async()=>({dataFilePath:'中文 空格',dashboard:{options:{view:'list',query:'标签'},fields:{id:'自定义ID'}}});
  await plugin.loadSettings();expect(plugin.settings.dataFilePath).toBe('中文 空格');expect(plugin.dashboardSettings.options).toEqual({...DEFAULT_OPTIONS,view:'list',query:'标签'});expect(plugin.dashboardSettings.fields.id).toBe('自定义ID');expect(plugin.dashboardSettings.fields.url).toBe('url');
  plugin.loadData=async()=>({});await plugin.loadSettings();expect(plugin.dashboardSettings.options).toEqual(DEFAULT_OPTIONS);
  plugin.loadData=async()=>({dashboard:{options:{view:'timeline',timelineYear:'2026',year:'2024',group:'type',sort:'score'}}});
  await plugin.loadSettings();expect(plugin.dashboardSettings.options).toMatchObject({view:'timeline',timelineYear:'2026',year:'2024',group:'type',sort:'score'});
});

it('coalesces concurrent dashboard opens and reuses the existing main-workspace leaf',async()=>{
  const plugin:any=Object.create(DoubanPlugin.prototype);plugin.dashboardReady=Promise.resolve();let created=false;
  const leaf={setViewState:jest.fn(async()=>{created=true;})};const workspace={getLeavesOfType:()=>created?[leaf]:[],getLeaf:jest.fn(()=>leaf),revealLeaf:jest.fn()};plugin.app={workspace};
  await Promise.all([plugin.activateDashboard(),plugin.activateDashboard(),plugin.activateDashboard()]);await plugin.activateDashboard();expect(workspace.getLeaf).toHaveBeenCalledTimes(1);expect(workspace.getLeaf).toHaveBeenCalledWith('tab');expect(leaf.setViewState).toHaveBeenCalledTimes(1);
});

it('fetches selected entries despite historical IDs and continues after a partial failure',async()=>{
  const plugin:any={settings:{syncHandledDataArray:[]},saveSettings:jest.fn()};plugin.statusHolder=new GlobalStatusHolder({} as any,plugin);plugin.statusHolder.startSync(config);await plugin.statusHolder.initHandledData();plugin.statusHolder.syncStatus.exists('1','deleted local note');
  const handler:any=Object.create(DoubanAbstractSyncHandler.prototype);handler.doubanSubjectLoadHandler={handle:jest.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(subject('2'))};
  await handler.handleItems({total:2},[{id:'1',title:'one'},{id:'2',title:'two'}],{plugin,syncStatusHolder:plugin.statusHolder});expect(handler.doubanSubjectLoadHandler.handle.mock.calls.map((c:any[])=>c[0])).toEqual(['1','2']);expect(plugin.statusHolder.syncStatus.statusHandleMap.get('fail')).toBe(1);
});

async function refreshFixture(){
  const texts={'Douban/1.md':mergeProperties('自写正文一',propertiesFromSubject(subject('1'))),'Douban/2.md':mergeProperties('自写正文二',propertiesFromSubject(subject('2')))};
  const m=memoryApp(texts);const plugin:any=Object.create(DoubanPlugin.prototype);plugin.app=m.app;plugin.settings={dashboard:defaultDashboardSettings(),dataFilePath:'Douban'};plugin.saveSettings=jest.fn();plugin.checkLogin=jest.fn(async()=>true);plugin.statusHolder=new GlobalStatusHolder(m.app,plugin);plugin.dashboardIndex=new DashboardIndex(m.app,()=>plugin.dashboardSettings,()=> 'Douban');await plugin.dashboardIndex.rebuild();return {m,plugin,texts};
}
it('keeps failed refresh data intact while refreshing other selected notes',async()=>{
  const {plugin,m,texts}=await refreshFixture();plugin.fetchDashboardSubject=jest.fn(async(url:string)=>{if(url.includes('/1/'))throw new Error('访问受限');return {...subject('2'),score:9};});
  await plugin.refreshDashboardItems(plugin.dashboardIndex.items());expect(m.contents.get('Douban/1.md')).toBe(texts['Douban/1.md']);expect(splitNote(m.contents.get('Douban/2.md')).body).toBe('自写正文二');expect(splitNote(m.contents.get('Douban/2.md')).properties.douban_score).toBe(9);expect(plugin.dashboardCounts).toEqual({created:0,updated:1,skipped:0,failed:1});expect(plugin.statusHolder.syncStarted).toBe(false);plugin.dashboardIndex.dispose();
});
it('stops writes and subsequent requests when a refresh is cancelled in flight',async()=>{
  const {plugin,m,texts}=await refreshFixture();let resolve:(value:any)=>void;let started:()=>void;const entered=new Promise<void>(r=>started=r);
  plugin.fetchDashboardSubject=jest.fn(()=>{started();return new Promise(r=>resolve=r);});const running=plugin.refreshDashboardItems(plugin.dashboardIndex.items());await entered;plugin.cancelDashboardTask();expect(plugin.statusHolder.startSync(config)).toBe(false);resolve(subject('1'));await running;
  expect(plugin.fetchDashboardSubject).toHaveBeenCalledTimes(1);expect(Object.fromEntries(m.contents)).toEqual(texts);expect(plugin.dashboardProgress).toContain('取消');expect(plugin.statusHolder.syncStarted).toBe(false);plugin.dashboardIndex.dispose();
});
it('does not request or change notes after login has expired',async()=>{
  const {plugin,m,texts}=await refreshFixture();plugin.checkLogin=async()=>false;plugin.fetchDashboardSubject=jest.fn();await expect(plugin.refreshDashboardItems(plugin.dashboardIndex.items())).rejects.toThrow('登录');expect(plugin.fetchDashboardSubject).not.toHaveBeenCalled();expect(Object.fromEntries(m.contents)).toEqual(texts);plugin.dashboardIndex.dispose();
});

it.each(['# 感想\n\n---\n正文\n\n---\n结尾','\uFEFF---\r\ncustom: 保留\r\n---\r\n正文\r\n---\r\n尾部'])('renders only leading template YAML, leaving body separators intact: %s',async template=>{
  const handler:any=Object.create(DoubanAbstractLoadHandler.prototype);handler.getTemplate=async()=>template;handler.buildVariableMap=()=>new Map();handler.parseUserInfo=()=>{};handler.parseVariable=()=>{};handler.saveImage=async()=>{};handler.parsePartText=(s:string)=>s;handler.parsePartYml=jest.fn((s:string)=>s);
  const result=await handler.parse(subject('1'),{mode:SearchHandleMode.FOR_REPLACE});expect(result.content).toBe(template);expect(handler.parsePartYml).toHaveBeenCalledTimes(template.startsWith('#')?0:1);if(!template.startsWith('#'))expect(handler.parsePartYml.mock.calls[0][0]).toBe('---\r\ncustom: 保留\r\n---');
});
