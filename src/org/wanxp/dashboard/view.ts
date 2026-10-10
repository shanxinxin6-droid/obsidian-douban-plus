import {ItemView, Notice, setIcon, TFile, WorkspaceLeaf} from 'obsidian';
import type DoubanPlugin from '../main';
import {DashboardItem, DashboardOptions, DEFAULT_OPTIONS, queryItems, STATE_NAMES, stateLabel, summarize, TYPE_NAMES} from './model';
import {ConfirmModal, MigrationModal, openConfigImport} from './modals';
export const DASHBOARD_VIEW='douban-plus-dashboard';
export default class DashboardView extends ItemView {
  private results:HTMLElement;private status:HTMLElement;private stats:HTMLElement;
  private unsubscribe:()=>void;private timer:ReturnType<typeof setInterval>;
  private limit=100;private error='';private yearSelect:HTMLSelectElement;
  constructor(leaf:WorkspaceLeaf,private plugin:DoubanPlugin){super(leaf);}
  getViewType():string{return DASHBOARD_VIEW;}
  getDisplayText():string{return '豆瓣看板';}
  getIcon():string{return 'library';}
  async onOpen():Promise<void> {
    const el=this.contentEl;el.empty();el.addClass('douban-plus-dashboard');
    const heading=el.createDiv({cls:'douban-plus-heading'});heading.createEl('h2',{text:'豆瓣看板'});heading.createEl('p',{text:'你的电影、书籍与收藏，都在这里。'});
    const toolbar=el.createDiv({cls:'douban-plus-toolbar'});
    this.button(toolbar,'同步',()=>this.plugin.openDashboardSync());
    this.button(toolbar,'豆瓣搜索 / 导入',()=>this.plugin.openDashboardSearch());
    this.button(toolbar,'刷新属性',()=>{
      const items=queryItems(this.plugin.dashboardIndex.items(),this.options);
      new ConfirmModal(this.app,'刷新当前结果的属性',`将逐项获取 ${items.length} 个条目的最新数据。保留正文，沿用豆瓣请求间隔。`,()=>this.plugin.refreshDashboardItems(items),'开始刷新').open();
    });
    this.button(toolbar,'重建索引',()=>this.plugin.dashboardIndex.rebuild());
    this.button(toolbar,'补全旧笔记',()=>new MigrationModal(this.plugin).open());
    this.button(toolbar,'导入原配置',()=>openConfigImport(this.plugin));
    this.button(toolbar,'取消任务',()=>this.plugin.cancelDashboardTask());
    const filters=el.createDiv({cls:'douban-plus-filters'});
    const search=filters.createEl('input',{type:'search',placeholder:'搜索标题或个人标签'});search.value=this.options.query;search.setAttribute('aria-label','搜索标题或个人标签');
    search.oninput=()=>this.change('query',search.value);
    this.select(filters,'类型','type',{all:'全部类型',...TYPE_NAMES});
    this.select(filters,'状态','state',{all:'全部状态',...STATE_NAMES});
    const range=filters.createDiv({cls:'douban-plus-range'});range.createSpan({text:'豆瓣评分'});
    for(const key of ['minScore','maxScore'] as const){const input=range.createEl('input',{type:'number',placeholder:key==='minScore'?'最低':'最高'});input.min='0';input.max='10';input.step='0.1';input.value=this.options[key];input.setAttribute('aria-label',key==='minScore'?'最低豆瓣评分':'最高豆瓣评分');input.oninput=()=>this.change(key,input.value);}
    this.select(filters,'豆瓣评分状态','scoreState',{all:'全部评分',scored:'已有评分',unknown:'未评分'});
    this.select(filters,'个人评分','rating',{all:'全部个人评分',unknown:'未评分','1':'1 星','2':'2 星','3':'3 星','4':'4 星','5':'5 星'});
    this.select(filters,'年份依据','yearDimension',{published:'发布年份',collection:'收藏年份'});
    const years:Record<string,string>={all:'全部年份',unknown:'年份未知'};
    for(const i of this.plugin.dashboardIndex.items())for(const date of [i.publishedDate,i.collectionDate])if(date)years[date.slice(0,4)]=date.slice(0,4);
    this.select(filters,'年份','year',years);
    this.select(filters,'展示','view',{grid:'封面网格',list:'列表'});
    this.select(filters,'分组','group',{none:'不分组',type:'按类型',state:'按状态',published:'按发布年份',collection:'按收藏年份'});
    this.select(filters,'排序','sort',{recent:'最近收藏 / 文件修改',title:'标题',score:'豆瓣评分',rating:'个人评分',year:'年份'});
    this.button(filters,'重置筛选',async()=>{this.plugin.dashboardSettings.options={...DEFAULT_OPTIONS};await this.plugin.saveSettings();await this.onClose();await this.onOpen();});
    this.status=el.createDiv({cls:'douban-plus-status',attr:{role:'status','aria-live':'polite'}});
    this.stats=el.createDiv({cls:'douban-plus-stats'});this.results=el.createDiv();
    this.unsubscribe=this.plugin.dashboardIndex.subscribe(()=>this.renderResults());
    this.timer=setInterval(()=>this.renderStatus(),1000);this.renderResults();
  }
  private get options():DashboardOptions{return this.plugin.dashboardSettings.options;}
  private change<K extends keyof DashboardOptions>(key:K,value:DashboardOptions[K]):void {this.options[key]=value;this.limit=100;void this.plugin.saveSettings().catch(e=>new Notice(e.message));this.renderResults();}
  private select(el:HTMLElement,label:string,key:keyof DashboardOptions,values:Record<string,string>):void {
    const wrapper=el.createEl('label');wrapper.createSpan({text:label});const select=wrapper.createEl('select');
    select.setAttribute('aria-label',label);
    for(const [value,text] of Object.entries(values))select.createEl('option',{value,text});select.value=String(this.options[key]);
    if(key==='year')this.yearSelect=select;
    select.onchange=()=>this.change(key,select.value as any);
  }
  private button(el:HTMLElement,label:string,action:()=>unknown):void {
    const button=el.createEl('button',{text:label});button.onclick=async()=>{button.disabled=true;try{await action();this.error='';}catch(e){this.error=String(e.message || e);new Notice(this.error);}finally{button.disabled=false;this.renderStatus();}};
  }
  private renderStatus():void {
    const p=this.plugin.dashboardProgress;
    const sync=this.plugin.statusHolder?.syncStatus;
    const status=this.plugin.statusHolder?.syncStarted ? `同步${this.plugin.statusHolder.syncCancelled?'正在取消':''} ${sync?.getHasHandle() || 0}/${sync?.getTotal() || 0}` : '';
    this.status.setText([this.plugin.dashboardIndex.loading?'正在建立本地索引…':'',status,p,errorText(this.plugin.dashboardIndex.errors.size),this.error].filter(Boolean).join(' · ') || '本地数据已就绪，可离线浏览');
  }
  private renderResults():void {
    if(this.yearSelect){const years=new Set<string>();for(const i of this.plugin.dashboardIndex.items())for(const d of [i.publishedDate,i.collectionDate])if(d)years.add(d.slice(0,4));for(const year of [...years].sort().reverse())if(!Array.from(this.yearSelect.options).some(o=>o.value===year))this.yearSelect.createEl('option',{value:year,text:year});this.yearSelect.value=this.options.year;}
    this.renderStatus();const items=queryItems(this.plugin.dashboardIndex.items(),this.options);const counts=summarize(items);
    this.stats.empty();this.stats.createEl('strong',{text:`${items.length} 个条目`});
    for(const [type,count] of Object.entries(counts.types))this.stats.createSpan({text:`${TYPE_NAMES[type as keyof typeof TYPE_NAMES]} ${count}`,cls:'douban-plus-chip'});
    for(const [state,count] of Object.entries(counts.states))this.stats.createSpan({text:`${STATE_NAMES[state as keyof typeof STATE_NAMES]} ${count}`,cls:'douban-plus-chip'});
    for(const [label,count] of Object.entries(counts.unknown))if(count)this.stats.createSpan({text:`${label} ${count}`,cls:'douban-plus-chip'});
    this.results.empty();
    if(this.plugin.dashboardIndex.errors.size){const details=this.results.createEl('details');details.createEl('summary',{text:'查看属性读取失败的笔记'});for(const [path,message] of this.plugin.dashboardIndex.errors){details.createEl('p',{text:`${path}：${message}`});this.button(details,'打开笔记',async()=>{const file=this.app.vault.getAbstractFileByPath(path);if(file instanceof TFile)await this.app.workspace.getLeaf(true).openFile(file);});}}
    if(!items.length){this.results.createDiv({cls:'douban-plus-empty',text:this.plugin.dashboardIndex.loading?'正在读取笔记…':'没有匹配的条目。可以搜索导入，或补全旧笔记的基础属性。'});return;}
    const groups=new Map<string,DashboardItem[]>();
    for(const i of items.slice(0,this.limit)) {
      const group=this.options.group;const label=group==='type'?TYPE_NAMES[i.type]:group==='state'?STATE_NAMES[i.state]:group==='published'?(i.publishedDate?.slice(0,4)||'发布年份未知'):group==='collection'?(i.collectionDate?.slice(0,4)||'收藏年份未知'):'';
      groups.set(label,[...(groups.get(label)||[]),i]);
    }
    for(const [label,entries] of groups) {
      if(label)this.results.createEl('h3',{text:label});const container=this.results.createDiv({cls:`douban-plus-items douban-plus-${this.options.view}`});
      for(const i of entries)this.card(container,i);
    }
    if(items.length>this.limit)this.button(this.results,`显示更多（已展示 ${Math.min(this.limit,items.length)} / ${items.length}）`,()=>{this.limit+=100;this.renderResults();});
  }
  private card(parent:HTMLElement,i:DashboardItem):void {
    const card=parent.createEl('article',{cls:'douban-plus-card'});const cover=card.createDiv({cls:'douban-plus-cover'});
    const fallback=cover.createDiv({cls:'douban-plus-cover-fallback'});setIcon(fallback,i.type==='book'?'book-open':i.type==='music'?'music':i.type==='game'?'gamepad-2':'film');
    let src:string|undefined;
    if(i.cover && /^https?:\/\//i.test(i.cover))src=i.cover;
    else if(i.cover){const path=i.cover.replace(/^\[\[/,'').replace(/\]\]$/,'');const file=this.app.metadataCache.getFirstLinkpathDest(path,i.files[0]);if(file)src=this.app.vault.getResourcePath(file);}
    if(src){const image=cover.createEl('img',{attr:{src,alt:i.title,loading:'lazy',referrerpolicy:'no-referrer'}});image.onerror=()=>image.remove();image.onload=()=>fallback.hide();}
    const body=card.createDiv({cls:'douban-plus-card-body'});
    this.button(body,i.title,async()=>{const file=this.app.vault.getAbstractFileByPath(i.files[0]);if(!(file instanceof TFile))throw new Error('关联笔记不存在，请重建索引');await this.app.workspace.getLeaf(true).openFile(file);});
    body.createDiv({text:`${TYPE_NAMES[i.type]} · ${stateLabel(i.type,i.state)}`,cls:'douban-plus-muted'});
    body.createDiv({text:`豆瓣 ${i.score===undefined?'未评分':i.score.toFixed(1)} · 我的 ${i.rating ? `${i.rating} 星`:'未评分'}`});
    body.createDiv({text:i.collectionDate?`收藏于 ${i.collectionDate}`:`文件修改于 ${new Date(i.modifiedAt).toLocaleDateString()}`,cls:'douban-plus-muted'});
    if(i.publishedDate)body.createDiv({text:`发布于 ${i.publishedDate}`,cls:'douban-plus-muted'});
    if(i.tags.length)body.createDiv({text:i.tags.join(' · '),cls:'douban-plus-muted'});
    if(!i.managed)body.createDiv({text:'旧笔记：请先预览并补全属性',cls:'douban-plus-warning'});
    if(i.files.length>1){body.createDiv({text:`重复关联 ${i.files.length} 篇，自动更新将跳过`,cls:'douban-plus-warning'});for(const path of i.files)this.button(body,path,async()=>{const file=this.app.vault.getAbstractFileByPath(path);if(file instanceof TFile)await this.app.workspace.getLeaf(true).openFile(file);});}
    if(i.url){const a=body.createEl('a',{text:'在豆瓣打开',href:i.url});a.target='_blank';a.rel='noopener noreferrer';}
  }
  async onClose():Promise<void>{this.unsubscribe?.();clearInterval(this.timer);this.contentEl.empty();}
}
function errorText(count:number):string{return count?`${count} 篇属性读取失败，请检查笔记 YAML`:'';}
