import {ItemView, Notice, setIcon, TFile, WorkspaceLeaf} from 'obsidian';
import type DoubanPlugin from '../main';
import {DashboardItem, DashboardOptions, DEFAULT_OPTIONS, queryItems, STATE_NAMES, stateLabel, summarize, TYPE_NAMES} from './model';
import {ConfirmModal, MigrationModal, openConfigImport} from './modals';

export const DASHBOARD_VIEW='douban-plus-dashboard';
const TYPE_ICONS={movie:'film',teleplay:'tv',book:'book-open',music:'music',game:'gamepad-2',theater:'drama',note:'notebook-pen',unknown:'library'};

export default class DashboardView extends ItemView {
  private results:HTMLElement;private status:HTMLElement;private stats:HTMLElement;
  private distribution:HTMLElement;private advanced:HTMLElement;private tools:HTMLElement;
  private filterButton:HTMLButtonElement;private cancelButton:HTMLButtonElement;private layoutButton:HTMLButtonElement;private resetButton:HTMLButtonElement;
  private unsubscribe:()=>void;private timer:ReturnType<typeof setInterval>;
  private limit=100;private error='';private yearSelect:HTMLSelectElement;
  constructor(leaf:WorkspaceLeaf,private plugin:DoubanPlugin){super(leaf);}
  getViewType():string{return DASHBOARD_VIEW;}
  getDisplayText():string{return '豆瓣看板';}
  getIcon():string{return 'library';}

  async onOpen():Promise<void> {
    const el=this.contentEl;el.empty();el.addClass('douban-plus-dashboard');
    const toolbar=el.createDiv({cls:'douban-plus-toolbar',attr:{'aria-label':'收藏架工具栏'}});
    const search=toolbar.createEl('input',{cls:'douban-plus-search',type:'search',placeholder:'搜索标题或个人标签',attr:{'aria-label':'搜索标题或个人标签'}});
    search.value=this.options.query;search.oninput=()=>this.change('query',search.value);
    const quick=toolbar.createDiv({cls:'douban-plus-quick-filters'});
    this.select(quick,'类型','type',{all:'全部类型',...TYPE_NAMES},false);
    this.select(quick,'状态','state',{all:'全部状态',...STATE_NAMES},false);
    this.select(quick,'分组','group',{collection:'按收藏年份',published:'按发布年份',type:'按类型',state:'按状态',none:'不分组'},false);
    const actions=toolbar.createDiv({cls:'douban-plus-actions'});
    this.iconButton(actions,'同步','refresh-cw',()=>this.plugin.openDashboardSync()).addClass('mod-cta');
    this.iconButton(actions,'豆瓣搜索 / 导入','globe',()=>this.plugin.openDashboardSearch());
    this.layoutButton=this.iconButton(actions,'切换为列表','list',()=>this.change('view',this.options.view==='grid'?'list':'grid'));
    const statsButton=this.iconButton(actions,'收藏统计','chart-no-axes-column',()=>this.togglePanel(this.distribution,statsButton));
    statsButton.setAttribute('aria-expanded','false');
    this.filterButton=this.iconButton(actions,'详细筛选','sliders-horizontal',()=>this.togglePanel(this.advanced,this.filterButton));
    this.filterButton.setAttribute('aria-expanded','false');
    const toolsButton=this.iconButton(actions,'管理工具','settings',()=>this.togglePanel(this.tools,toolsButton));
    toolsButton.setAttribute('aria-expanded','false');
    this.cancelButton=this.iconButton(actions,'取消任务','circle-x',()=>this.plugin.cancelDashboardTask());

    this.advanced=el.createDiv({cls:'douban-plus-panel douban-plus-filters',attr:{'aria-label':'详细筛选'}});this.advanced.hidden=true;
    for(const key of ['minScore','maxScore'] as const){
      const label=key==='minScore'?'最低豆瓣评分':'最高豆瓣评分';
      const wrapper=this.advanced.createEl('label');wrapper.createSpan({text:label});
      const input=wrapper.createEl('input',{type:'number',attr:{'aria-label':label}});input.min='0';input.max='10';input.step='0.1';input.placeholder='不限';input.value=this.options[key];input.oninput=()=>this.change(key,input.value);
    }
    this.select(this.advanced,'豆瓣评分状态','scoreState',{all:'全部评分',scored:'已有评分',unknown:'未评分'});
    this.select(this.advanced,'个人评分','rating',{all:'全部个人评分',unknown:'未评分','1':'1 星','2':'2 星','3':'3 星','4':'4 星','5':'5 星'});
    this.select(this.advanced,'年份依据','yearDimension',{published:'发布年份',collection:'收藏年份'});
    this.select(this.advanced,'年份','year',{all:'全部年份',unknown:'年份未知'});
    this.select(this.advanced,'排序','sort',{recent:'最近收藏 / 文件修改',title:'标题',score:'豆瓣评分',rating:'个人评分',year:'年份'});
    this.tools=el.createDiv({cls:'douban-plus-panel douban-plus-tools',attr:{'aria-label':'管理工具'}});this.tools.hidden=true;
    this.button(this.tools,'刷新属性',()=>{
      const items=queryItems(this.plugin.dashboardIndex.items(),this.options);
      new ConfirmModal(this.app,'刷新当前结果的属性',`将逐项获取 ${items.length} 个条目的最新数据。保留正文，沿用豆瓣请求间隔。`,()=>this.plugin.refreshDashboardItems(items),'开始刷新').open();
    });
    this.button(this.tools,'重建索引',()=>this.plugin.dashboardIndex.rebuild());
    this.button(this.tools,'补全旧笔记',()=>new MigrationModal(this.plugin).open());
    this.button(this.tools,'导入原配置',()=>openConfigImport(this.plugin));
    const summary=el.createDiv({cls:'douban-plus-summary'});
    this.stats=summary.createDiv({cls:'douban-plus-stats',attr:{'aria-label':'当前结果概览'}});
    this.resetButton=this.button(summary,'重置筛选',async()=>{
      const {view,group,sort}=this.options;
      this.plugin.dashboardSettings.options={...DEFAULT_OPTIONS,view,group,sort};
      await this.plugin.saveSettings();await this.onClose();await this.onOpen();
    });this.resetButton.addClass('douban-plus-reset');
    this.distribution=el.createDiv({cls:'douban-plus-panel douban-plus-distribution'});this.distribution.hidden=true;
    this.status=el.createDiv({cls:'douban-plus-status',attr:{role:'status','aria-live':'polite'}});
    this.results=el.createDiv({cls:'douban-plus-results'});
    this.unsubscribe=this.plugin.dashboardIndex.subscribe(()=>this.renderResults());
    this.timer=setInterval(()=>this.renderStatus(),1000);this.renderResults();
  }

  private get options():DashboardOptions{return this.plugin.dashboardSettings.options;}
  private change<K extends keyof DashboardOptions>(key:K,value:DashboardOptions[K]):void {
    this.options[key]=value;this.limit=100;void this.plugin.saveSettings().catch(e=>new Notice(e.message));this.renderResults();
  }
  private select(el:HTMLElement,label:string,key:keyof DashboardOptions,values:Record<string,string>,showLabel=true):void {
    const wrapper=el.createEl('label');if(showLabel)wrapper.createSpan({text:label});
    const select=wrapper.createEl('select',{attr:{'aria-label':label,title:label}});
    for(const [value,text] of Object.entries(values))select.createEl('option',{value,text});select.value=String(this.options[key]);
    if(key==='year')this.yearSelect=select;
    select.onchange=()=>this.change(key,select.value as any);
  }
  private button(el:HTMLElement,label:string,action:()=>unknown):HTMLButtonElement {
    const button=el.createEl('button',{text:label});button.onclick=async()=>{
      button.disabled=true;try{await action();this.error='';}catch(e){this.error=String(e.message || e);new Notice(this.error);}
      finally{button.disabled=false;this.renderStatus();}
    };return button;
  }
  private iconButton(el:HTMLElement,label:string,icon:string,action:()=>unknown):HTMLButtonElement {
    const button=this.button(el,'',action);button.addClass('douban-plus-icon-button');button.setAttribute('aria-label',label);button.title=label;setIcon(button,icon);return button;
  }
  private togglePanel(panel:HTMLElement,button:HTMLButtonElement):void {
    panel.hidden=!panel.hidden;button.setAttribute('aria-expanded',String(!panel.hidden));
  }
  private filterCount():number {
    return (['query','type','state','minScore','maxScore','rating','scoreState','year'] as const).filter(key=>this.options[key]!==DEFAULT_OPTIONS[key]).length;
  }
  private renderStatus():void {
    if(!this.status)return;
    const holder=this.plugin.statusHolder;const sync=holder?.syncStatus;
    const message=[this.plugin.dashboardIndex.loading?'正在建立本地索引…':'',holder?.syncStarted?`同步${holder.syncCancelled?'正在取消':''} ${sync?.getHasHandle() || 0}/${sync?.getTotal() || 0}`:'',this.plugin.dashboardProgress,errorText(this.plugin.dashboardIndex.errors.size),this.error].filter(Boolean).join(' · ');
    this.status.setText(message);this.status.hidden=!message;this.cancelButton.hidden=!holder?.syncStarted;
  }
  private metric(icon:string,text:string,title:string):void {
    const metric=this.stats.createSpan({cls:'douban-plus-metric',attr:{title}});setIcon(metric.createSpan(),icon);metric.createSpan({text});
  }
  private renderResults():void {
    const all=this.plugin.dashboardIndex.items();
    const years=new Set<string>();for(const i of all)for(const date of [i.publishedDate,i.collectionDate])if(date)years.add(date.slice(0,4));
    const selected=this.options.year;this.yearSelect.empty();
    for(const [value,text] of [['all','全部年份'],['unknown','年份未知'],...[...years].sort().reverse().map(y=>[y,y])])this.yearSelect.createEl('option',{value,text});
    // Retain the saved selection even if its last matching note was removed.
    if(!Array.from(this.yearSelect.options).some(o=>o.value===selected))this.yearSelect.createEl('option',{value:selected,text:selected});
    this.yearSelect.value=selected;
    this.renderStatus();const items=queryItems(all,this.options);const counts=summarize(items);
    this.stats.empty();this.metric('library',`${items.length} 个条目`,'当前筛选结果，可离线浏览');
    this.metric('files',`${new Set(items.flatMap(i=>i.files)).size} 篇笔记`,'当前结果关联的本地笔记');
    this.metric('calendar-days',`${new Set(items.filter(i=>i.collectionDate).map(i=>i.collectionDate.slice(0,4))).size} 个收藏年份`,'有明确收藏日期的年份数');
    this.metric('check-check',`${items.filter(i=>i.managed).length} 项已关联`,'已补全看板基础属性的条目');
    const active=this.filterCount();this.resetButton.hidden=!active;
    this.filterButton.classList.toggle('is-filtered',active>0);this.filterButton.title=active?`详细筛选 · ${active} 项条件`:'详细筛选';
    const layoutLabel=this.options.view==='grid'?'切换为列表':'切换为卡片';
    this.layoutButton.setAttribute('aria-label',layoutLabel);this.layoutButton.title=layoutLabel;setIcon(this.layoutButton,this.options.view==='grid'?'list':'layout-grid');
    this.distribution.empty();
    for(const [label,values] of [['类型分布',Object.entries(counts.types).map(([type,count])=>`${TYPE_NAMES[type as keyof typeof TYPE_NAMES]} ${count}`)],['收藏状态',Object.entries(counts.states).map(([state,count])=>`${STATE_NAMES[state as keyof typeof STATE_NAMES]} ${count}`)],['未知信息',Object.entries(counts.unknown).filter(([,count])=>count).map(([name,count])=>`${name} ${count}`)]] as [string,string[]][]){
      if(!values.length)continue;const row=this.distribution.createDiv({cls:'douban-plus-distribution-row'});row.createSpan({text:label,cls:'douban-plus-muted'});for(const text of values)row.createSpan({text,cls:'douban-plus-chip'});
    }
    this.results.empty();
    if(this.plugin.dashboardIndex.errors.size){const details=this.results.createEl('details');details.createEl('summary',{text:'查看属性读取失败的笔记'});for(const [path,message] of this.plugin.dashboardIndex.errors){details.createEl('p',{text:`${path}：${message}`});this.button(details,'打开笔记',()=>this.openNote(path));}}
    if(!items.length){
      const empty=this.results.createDiv({cls:'douban-plus-empty'});setIcon(empty.createDiv(),active?'search':'library');
      empty.createEl('h3',{text:this.plugin.dashboardIndex.loading?'正在读取笔记…':active?'没有匹配的收藏':'你的收藏架还是空的'});
      empty.createEl('p',{text:active?'试试其他关键词，或重置筛选条件。':'搜索并导入豆瓣条目，或在管理工具中补全旧笔记。'});
      if(!active)this.button(empty,'豆瓣搜索 / 导入',()=>this.plugin.openDashboardSearch());return;
    }
    const groups=new Map<string,DashboardItem[]>();
    for(const i of items){
      const group=this.options.group;const label=group==='type'?TYPE_NAMES[i.type]:group==='state'?STATE_NAMES[i.state]:group==='published'?(i.publishedDate?.slice(0,4)||'发布年份未知'):group==='collection'?(i.collectionDate?.slice(0,4)||'收藏年份未知'):'';
      if(!groups.has(label))groups.set(label,[]);groups.get(label).push(i);
    }
    const entries=[...groups];const byYear=this.options.group==='published'||this.options.group==='collection';
    if(byYear)entries.sort(([a],[b])=>/^\d{4}$/.test(a)?(/^\d{4}$/.test(b)?b.localeCompare(a):-1):(/^\d{4}$/.test(b)?1:a.localeCompare(b)));
    let remaining=this.limit;
    for(const [label,group] of entries){
      if(remaining<=0)break;const section=this.results.createEl('section',{cls:'douban-plus-group'});
      if(label){const heading=section.createEl('h3',{cls:'douban-plus-group-heading'});heading.createSpan({text:byYear&&/^\d{4}$/.test(label)?`${label} 年`:label});heading.createSpan({text:String(group.length),cls:'douban-plus-group-count'});}
      const container=section.createDiv({cls:`douban-plus-items douban-plus-${this.options.view}`});
      for(const i of group.slice(0,remaining))this.card(container,i);remaining-=group.length;
    }
    if(items.length>this.limit)this.button(this.results,`显示更多（已展示 ${Math.min(this.limit,items.length)} / ${items.length}）`,()=>{this.limit+=100;this.renderResults();}).addClass('douban-plus-load-more');
  }
  private async openNote(path:string):Promise<void> {
    const file=this.app.vault.getAbstractFileByPath(path);if(!(file instanceof TFile))throw new Error('关联笔记不存在，请重建索引');await this.app.workspace.getLeaf(true).openFile(file);
  }
  private card(parent:HTMLElement,i:DashboardItem):void {
    const card=parent.createEl('article',{cls:'douban-plus-card'});
    const cover=this.button(card,'',()=>this.openNote(i.files[0]));cover.addClass('douban-plus-cover');cover.setAttribute('aria-label',`打开封面对应笔记：${i.title}`);
    const fallback=cover.createDiv({cls:'douban-plus-cover-fallback'});setIcon(fallback,TYPE_ICONS[i.type]);
    let src:string|undefined;
    if(i.cover && /^https?:\/\//i.test(i.cover))src=i.cover;
    else if(i.cover){const path=i.cover.replace(/^\[\[/,'').replace(/\]\]$/,'');const file=this.app.metadataCache.getFirstLinkpathDest(path,i.files[0]);if(file)src=this.app.vault.getResourcePath(file);}
    if(src){const image=cover.createEl('img',{attr:{src,alt:i.title,loading:'lazy',referrerpolicy:'no-referrer'}});image.onerror=()=>image.remove();image.onload=()=>fallback.hide();}
    const body=card.createDiv({cls:'douban-plus-card-body'});
    const title=this.button(body,i.title,()=>this.openNote(i.files[0]));title.addClass('douban-plus-card-title');title.title=i.title;
    const badges=body.createDiv({cls:'douban-plus-badges'});
    badges.createSpan({text:i.managed?'已关联':'待补全',cls:`douban-plus-badge${i.managed?'':' douban-plus-warning'}`});
    badges.createSpan({text:TYPE_NAMES[i.type],cls:'douban-plus-badge'});badges.createSpan({text:stateLabel(i.type,i.state),cls:'douban-plus-badge'});
    body.createDiv({text:`豆瓣 ${i.score===undefined?'未评分':i.score.toFixed(1)} · 我的 ${i.rating?`${i.rating} 星`:'未评分'}`,cls:'douban-plus-card-meta'});
    const date=body.createDiv({cls:'douban-plus-card-meta douban-plus-card-date'});
    date.createSpan({text:i.collectionDate?`收藏于 ${i.collectionDate}`:`文件修改于 ${new Date(i.modifiedAt).toLocaleDateString()}`});
    if(i.url){const link=date.createEl('a',{href:i.url,attr:{'aria-label':`在豆瓣打开：${i.title}`,title:'在豆瓣打开'}});link.target='_blank';link.rel='noopener noreferrer';setIcon(link,'external-link');}
    if(i.publishedDate)body.createDiv({text:`发布于 ${i.publishedDate}`,cls:'douban-plus-card-meta douban-plus-muted'});
    if(i.tags.length)body.createDiv({text:i.tags.join(' · '),cls:'douban-plus-card-tags',attr:{title:i.tags.join(' · ')}});
    if(i.files.length>1){const details=body.createEl('details',{cls:'douban-plus-warning'});details.createEl('summary',{text:`重复关联 ${i.files.length} 篇，自动更新将跳过`});for(const path of i.files)this.button(details,path,()=>this.openNote(path));}
    this.iconButton(card,`打开笔记：${i.title}`,'book-open',()=>this.openNote(i.files[0])).addClass('douban-plus-card-open');
  }
  async onClose():Promise<void>{this.unsubscribe?.();clearInterval(this.timer);this.contentEl.empty();}
}
function errorText(count:number):string{return count?`${count} 篇属性读取失败，请检查笔记 YAML`:'';}
