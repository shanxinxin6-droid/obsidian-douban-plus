import {App, Modal, Notice, Setting, TFile} from 'obsidian';
import type DoubanPlugin from '../main';
import {dateString, normalizeState, normalizeType, stateLabel, TYPE_NAMES} from './model';
import {markDuplicatePreviews, MIGRATION_PROPERTY_NAMES, migrationChanges, MigrationChange, MigrationPreview, migrationStatus, MigrationStatus} from './migration';
import {applyConfigImport,parseConfigImport} from './config-import';
import {Properties} from './properties';

export class ConfirmModal extends Modal {
  constructor(app:App, private title:string, private text:string, private action:()=>Promise<void>, private label='确认') {super(app);}
  onOpen():void {
    this.contentEl.createEl('h2',{text:this.title});this.contentEl.createEl('pre',{text:this.text,cls:'douban-plus-preview'});
    new Setting(this.contentEl).addButton(b=>b.setButtonText(this.label).setCta().onClick(async()=>{
      b.setDisabled(true);try{await this.action();this.close();}catch(e){new Notice(String(e.message || e));b.setDisabled(false);}
    })).addButton(b=>b.setButtonText('取消').onClick(()=>this.close()));
  }
  onClose():void {this.contentEl.empty();}
}
export async function openConfigImport(plugin:DoubanPlugin,onImported?:()=>void):Promise<void> {
  new ConfigImportModal(plugin,onImported).open();
}
export class ConfigImportModal extends Modal {
  private input:HTMLTextAreaElement;private preview:HTMLElement;private status:HTMLElement;
  private confirm:HTMLButtonElement;private patch:Properties;private revision=0;private closed=false;private busy=false;
  constructor(private plugin:DoubanPlugin,private onImported?:()=>void){super(plugin.app);}
  onOpen():void {
    this.modalEl.addClass('douban-plus-config-import');const el=this.contentEl;
    el.createEl('h2',{text:'导入原豆瓣配置'});
    el.createEl('p',{text:'把旧豆瓣插件的模板路径、输出路径、字段设置和同步历史迁移到 Plus。两处导入入口功能相同；不复制笔记、模板或附件，不导入登录信息。'});
    const sources=el.createDiv({cls:'douban-plus-config-sources'});
    const read=sources.createEl('button',{text:'读取当前库的旧配置'});
    read.onclick=()=>void this.load(async()=>{
      const path=`${this.app.vault.configDir}/plugins/obsidian-douban-plugin/data.json`;
      if(!await this.app.vault.adapter.exists(path))throw new Error('当前库未找到旧插件配置，请选择 data.json 文件或在下方粘贴 JSON');
      return this.app.vault.adapter.read(path);
    });
    const fileLabel=sources.createEl('label');fileLabel.createSpan({text:'或选择 JSON 文件'});
    const file=fileLabel.createEl('input',{type:'file',attr:{accept:'.json,application/json','aria-label':'选择原插件 JSON 配置文件'}});
    file.onchange=()=>{const selected=file.files?.[0];if(selected)void this.load(()=>selected.text());};
    const inputLabel=el.createEl('label',{cls:'douban-plus-config-input-label'});inputLabel.createSpan({text:'配置 JSON · 可以粘贴或编辑后预览'});
    this.input=inputLabel.createEl('textarea',{cls:'douban-plus-config-input',attr:{'aria-label':'原插件配置 JSON',placeholder:'粘贴原插件 data.json 的内容',spellcheck:'false'}});
    this.input.oninput=()=>{this.invalidate();this.status.setText('内容已更改，请重新预览。');};
    this.status=el.createDiv({cls:'douban-plus-config-status',attr:{role:'status','aria-live':'polite'}});
    this.preview=el.createDiv({cls:'douban-plus-config-preview'});
    const actions=el.createDiv({cls:'douban-plus-config-actions'});
    const preview=actions.createEl('button',{text:'预览配置'});preview.onclick=()=>this.showPreview();
    this.confirm=actions.createEl('button',{text:'确认导入',cls:'mod-cta'});this.confirm.disabled=true;
    this.confirm.onclick=()=>void this.apply();
    actions.createEl('button',{text:'取消'}).onclick=()=>this.close();
    this.status.setText('选择一种来源，先预览，再确认导入。');
  }
  private invalidate():void {this.revision++;this.patch=undefined;this.confirm.disabled=true;this.preview.empty();}
  private async load(read:()=>Promise<string>):Promise<void> {
    if(this.busy)return;this.invalidate();this.input.value='';const revision=this.revision;this.status.setText('正在读取配置…');
    try {
      const patch=parseConfigImport(await read());if(this.closed || revision!==this.revision)return;
      this.input.value=JSON.stringify(patch,null,2);this.status.setText('已读取配置，并排除登录信息与不支持的字段。请点击“预览配置”。');
    }catch(e){if(!this.closed && revision===this.revision)this.status.setText(String(e.message || e));}
  }
  private showPreview():void {
    if(this.busy)return;this.invalidate();
    try {
      this.patch=parseConfigImport(this.input.value);this.input.value=JSON.stringify(this.patch,null,2);
      this.preview.createEl('h3',{text:'将导入的设置'});
      this.preview.createEl('pre',{text:JSON.stringify(this.patch,null,2),cls:'douban-plus-preview'});
      this.status.setText(`可导入 ${Object.keys(this.patch).length} 项设置。确认后替换 Plus 中的对应设置；旧插件原文件保留。`);
      this.confirm.disabled=false;
    }catch(e){this.status.setText(String(e.message || e));}
  }
  private async apply():Promise<void> {
    if(this.busy || !this.patch)return;this.busy=true;this.confirm.disabled=true;this.input.disabled=true;
    try {
      await applyConfigImport(this.plugin,this.patch);new Notice('配置已导入；如需同步，请在 Plus 中重新登录');this.onImported?.();this.close();
    }catch(e){this.status.setText(String(e.message || e));this.confirm.disabled=false;}
    finally{this.busy=false;this.input.disabled=false;}
  }
  onClose():void {this.closed=true;this.revision++;this.contentEl.empty();}
}
export class MigrationModal extends Modal {
  private previews:MigrationPreview[]=[];
  private selected=new Set<string>();
  private rows:HTMLElement;
  private summary:HTMLElement;
  private filters:HTMLElement;private report:HTMLElement;
  private scanButton:HTMLButtonElement;private selectButton:HTMLButtonElement;private applyButton:HTMLButtonElement;
  private filter:MigrationStatus|'all'='pending';
  private busy=false;
  private closed=false;
  private limit=100;
  constructor(private plugin:DoubanPlugin) {super(plugin.app);}
  onOpen():void {
    this.modalEl.addClass('douban-plus-migration');
    const el=this.contentEl;el.createEl('h2',{text:'迁移／修复笔记属性'});
    el.createEl('p',{text:'Plus 新导入的笔记无需操作。这里先读取旧属性和豆瓣链接，列出实际改动；只有勾选并补全才会写入，正文保留并自动备份。',cls:'douban-plus-migration-intro'});
    const options=el.createEl('details',{cls:'douban-plus-migration-options'});options.createEl('summary',{text:'扫描范围与字段映射'});
    new Setting(options).setName('扫描目录').setDesc(`当前输出目录：${this.plugin.settings.dataFilePath || '未设置'}。额外目录每行一个；修改后重新扫描。`).addTextArea(t=>t.setValue(this.plugin.dashboardSettings.folders.join('\n')).onChange(async value=>{
      this.plugin.dashboardSettings.folders=value.split('\n').map(v=>v.trim()).filter(Boolean);await this.plugin.saveSettings();
    }));
    const details=options.createEl('details');details.createEl('summary',{text:'旧笔记字段映射（通常无需修改）'});
    const names:Record<string,string>={id:'豆瓣 ID',type:'类型',url:'豆瓣链接',title:'标题',cover:'封面',score:'豆瓣评分',rating:'个人评分',state:'收藏状态',publishedDate:'发布日期',collectionDate:'收藏日期',tags:'个人标签'};
    for(const key of Object.keys(this.plugin.dashboardSettings.fields)) new Setting(details).setName(names[key] || key).addText(t=>t.setValue(this.plugin.dashboardSettings.fields[key]).onChange(async value=>{
      this.plugin.dashboardSettings.fields[key]=value.trim();await this.plugin.saveSettings();
    }));
    const actions=el.createDiv({cls:'douban-plus-migration-actions'});
    this.scanButton=actions.createEl('button',{text:'重新扫描'});this.scanButton.onclick=()=>void this.scan();
    this.selectButton=actions.createEl('button',{text:'选择／取消此分类待补全项'});this.selectButton.onclick=()=>{
      if(this.busy)return;const pending=this.visible().filter(p=>migrationStatus(p)==='pending');
      const clear=pending.every(p=>this.selected.has(p.path));pending.forEach(p=>clear?this.selected.delete(p.path):this.selected.add(p.path));this.render();
    };
    this.applyButton=actions.createEl('button',{text:'补全所选（0）',cls:'mod-cta'});this.applyButton.onclick=()=>void this.apply();
    actions.createEl('button',{text:'恢复备份'}).onclick=()=>void openBackups(this.plugin).catch(e=>new Notice(String(e.message || e)));
    this.summary=el.createDiv({cls:'douban-plus-migration-summary',attr:{role:'status','aria-live':'polite'}});
    this.report=el.createDiv({cls:'douban-plus-migration-report',attr:{role:'status','aria-live':'polite'}});this.report.hidden=true;
    this.filters=el.createDiv({cls:'douban-plus-migration-filters',attr:{'aria-label':'笔记补全状态'}});
    this.rows=el.createDiv();void this.scan();
  }
  private async scan():Promise<void> {
    if(this.busy)return;this.busy=true;this.selected.clear();this.limit=100;this.report.hidden=true;this.render();
    try {
      const files=this.app.vault.getMarkdownFiles().filter(f=>this.plugin.dashboardIndex.scoped(f.path));
      this.previews=[];
      for(let n=0;n<files.length;n+=50) {if(this.closed)return;this.previews.push(...await Promise.all(files.slice(n,n+50).map(f=>this.plugin.migrationService.preview(f))));}
      markDuplicatePreviews(this.previews);
    }catch(e){this.report.hidden=false;this.report.setText(`扫描失败：${e.message || e}`);}finally{this.busy=false;if(!this.closed)this.render();}
  }
  private visible():MigrationPreview[] {return this.previews.filter(p=>this.filter==='all' || migrationStatus(p)===this.filter);}
  private updateSelection():void {
    const count=this.selected.size;this.applyButton.setText(`补全所选（${count}）`);this.applyButton.disabled=this.busy || !count;
    this.summary.setText(this.busy?'正在处理，请等待…':`待补全 ${this.previews.filter(p=>migrationStatus(p)==='pending').length} · 需处理 ${this.previews.filter(p=>migrationStatus(p)==='blocked').length} · 无需补全 ${this.previews.filter(p=>migrationStatus(p)==='complete').length} · 已选 ${count}`);
  }
  private render():void {
    const eligible=new Set(this.previews.filter(p=>migrationStatus(p)==='pending').map(p=>p.path));
    for(const path of this.selected)if(!eligible.has(path))this.selected.delete(path);
    this.updateSelection();this.scanButton.disabled=this.busy;this.selectButton.disabled=this.busy || !this.visible().some(p=>migrationStatus(p)==='pending');
    this.filters.empty();this.rows.empty();
    for(const [key,label] of [['pending','待补全'],['blocked','需处理'],['complete','无需补全'],['all','全部']] as const){
      const count=key==='all'?this.previews.length:this.previews.filter(p=>migrationStatus(p)===key).length;
      const button=this.filters.createEl('button',{text:`${label} ${count}`,attr:{'aria-pressed':String(this.filter===key)}});button.disabled=this.busy;
      button.onclick=()=>{this.filter=key;this.limit=100;this.render();};
    }
    const visible=this.visible();
    if(!visible.length)this.rows.createEl('p',{text:this.busy?'正在生成预览…':!this.previews.length?'未找到可扫描的笔记。请展开“扫描范围与字段映射”检查目录。':this.filter==='pending'?'当前没有待补全笔记；需要人工确认的文件在“需处理”中。':'当前分类没有笔记。',cls:'douban-plus-migration-empty'});
    for(const p of visible.slice(0,this.limit)) {
      const status=migrationStatus(p);const changes=migrationChanges(p);
      const row=this.rows.createDiv({cls:'douban-plus-migration-row'});
      const header=row.createDiv({cls:'douban-plus-migration-row-header'});const label=header.createEl('label');const check=label.createEl('input',{type:'checkbox'});
      check.setAttribute('aria-label',`选择补全 ${p.path}`);check.disabled=this.busy || status!=='pending';check.checked=this.selected.has(p.path);
      check.onchange=()=>{check.checked?this.selected.add(p.path):this.selected.delete(p.path);this.updateSelection();};
      label.createEl('strong',{text:p.path.split('/').pop()});header.createSpan({text:status==='pending'?`新增 ${changes.filter(c=>c.added).length} · 调整 ${changes.filter(c=>!c.added).length}`:status==='blocked'?'需先处理':'无需补全',cls:'douban-plus-badge'});
      row.createDiv({text:p.path,cls:'douban-plus-migration-path'});
      const typeLabel=p.patch?.douban_type==='unknown' && String(p.patch?.douban_url).startsWith('https://movie.douban.com/')?'影视类型待确认':TYPE_NAMES[p.patch?.douban_type as keyof typeof TYPE_NAMES] || '未分类';
      if(p.issue){row.createEl('p',{text:p.issue,cls:'douban-plus-warning'});
        if(p.issue.includes('缺少可靠'))row.createEl('p',{text:'尚不能确认这是豆瓣条目。普通笔记或同步报告可忽略；需要关联的笔记再输入豆瓣链接。',cls:'douban-plus-migration-note'});}
      else row.createEl('p',{text:status==='complete'?'看板基础属性无需修改；这不表示所有资料均已获取。':`${typeLabel} · 豆瓣 ID ${p.patch.douban_id} · 仅写入下列属性改动`,cls:'douban-plus-migration-note'});
      if(status==='pending'){
        const internal=new Set(['douban_source','douban_schema','douban_id','douban_url']);
        const empty=(c:MigrationChange)=>c.after==null || c.after==='' || c.after==='unknown' || Array.isArray(c.after) && !c.after.length;
        const content=changes.filter(c=>!internal.has(c.key));const available=content.filter(c=>!empty(c));const missing=content.filter(empty);
        if(available.length)this.changeTable(row,available,p);
        if(missing.length){const unavailable=row.createEl('details');unavailable.createEl('summary',{text:`暂无信息：${missing.map(c=>MIGRATION_PROPERTY_NAMES[c.key] || c.key).join('、')}`});
          unavailable.createEl('p',{text:'离线补全会保留这些值为未知或空值，不会猜测；可展开下方“关联与联网补全”获取资料。',cls:'douban-plus-migration-note'});this.changeTable(unavailable,missing,p);}
        const identity=changes.filter(c=>internal.has(c.key));if(identity.length){const details=row.createEl('details');details.createEl('summary',{text:`关联与格式标记（${identity.length} 项）`});this.changeTable(details,identity,p);}
      }
      if(status!=='complete'){
        const tools=row.createEl('details',{cls:'douban-plus-migration-associate'});tools.createEl('summary',{text:'关联与联网补全'});
        tools.createEl('p',{text:'缺少 ID 或关联不明确时输入链接。联网只获取预览，仍需勾选后补全。',cls:'douban-plus-migration-note'});
        const actions=tools.createDiv({cls:'douban-plus-migration-actions'});
        const link=actions.createEl('input',{type:'url',placeholder:'豆瓣条目链接（已有明确关联可留空）',attr:{'aria-label':`关联 ${p.path}`}});link.disabled=this.busy;
        const associate=actions.createEl('button',{text:'预览关联'});associate.disabled=this.busy;associate.onclick=()=>void this.resolve(p,link.value,false);
        const remote=actions.createEl('button',{text:'联网获取预览'});remote.disabled=this.busy;remote.onclick=()=>void this.resolve(p,link.value,true);
      }
    }
    if(this.limit<visible.length)this.rows.createEl('button',{text:`显示更多（剩余 ${visible.length-this.limit} 篇）`}).onclick=()=>{this.limit+=100;this.render();};
  }
  private changeTable(parent:HTMLElement,changes:MigrationChange[],p:MigrationPreview):void {
    const table=parent.createEl('table',{cls:'douban-plus-migration-changes'});const heading=table.createEl('thead').createEl('tr');
    for(const name of ['属性','现在','补全后'])heading.createEl('th',{text:name,attr:{scope:'col'}});
    const body=table.createEl('tbody');
    const value=(key:string,v:unknown)=>{
      if(v===undefined)return '未设置';if(v===null || v==='')return '暂无信息';
      if(key==='douban_type')return TYPE_NAMES[normalizeType(v)];
      if(key==='douban_state')return stateLabel(normalizeType(p.patch?.douban_type),normalizeState(v));
      if(Array.isArray(v))return v.length?v.map(String).join('、'):'暂无标签';
      if(v instanceof Date)return dateString(v) || '无效日期';return String(v);
    };
    for(const c of changes){const row=body.createEl('tr');row.createEl('th',{text:MIGRATION_PROPERTY_NAMES[c.key] || c.key,attr:{scope:'row',title:c.key}});
      row.createEl('td',{text:value(c.key,c.before)});row.createEl('td',{text:`${c.added?'新增':'调整'} · ${value(c.key,c.after)}`});}
  }
  private async resolve(p:MigrationPreview,url:string,remote:boolean):Promise<void> {
    if(this.busy)return;this.busy=true;this.render();
    try {
      const file=this.app.vault.getAbstractFileByPath(p.path);if(!(file instanceof TFile))throw new Error('笔记已不存在');
      let next=await this.plugin.migrationService.preview(file,url || undefined);
      if(remote) {
        if(next.issue)throw new Error(next.issue);
        const subject=await this.plugin.fetchDashboardSubject(next.patch.douban_url);
        if(!subject)throw new Error('获取条目失败，本地笔记未修改');
        next=await this.plugin.migrationService.preview(file,url || undefined,subject);
      }
      if(this.closed)return;this.previews[this.previews.indexOf(p)]=next;this.selected.delete(p.path);markDuplicatePreviews(this.previews);
    }catch(e){new Notice(String(e.message || e));}finally{this.busy=false;if(!this.closed)this.render();}
  }
  private async apply():Promise<void> {
    if(this.busy)return;const previews=this.previews.filter(p=>this.selected.has(p.path));if(!previews.length){new Notice('请先勾选需要补全的笔记');return;}
    this.busy=true;this.render();let success=0;const errors:string[]=[];
    try {
      for(const p of previews) {
        if(this.closed)break;
        try {
          const existing=this.plugin.dashboardIndex.find(p.key);
          if(existing?.files.some(path=>path!==p.path))throw new Error('另有笔记关联此条目，请先处理重复关联');
          await this.plugin.migrationService.apply(p);success++;
          this.previews[this.previews.indexOf(p)]={...p,before:p.after,changes:[]};
        } catch(e){errors.push(`${p.path}: ${e.message || e}`);p.issue=String(e.message || e);}
      }
      await this.plugin.dashboardIndex.rebuild();
      this.report.hidden=false;this.report.setText(`成功 ${success}，失败 ${errors.length}${errors.length?'\n'+errors.join('\n'):''}`);this.selected.clear();
      new Notice(`补全完成：成功 ${success}，失败 ${errors.length}`);
    }finally{this.busy=false;if(!this.closed)this.render();}
  }
  onClose():void {this.closed=true;this.contentEl.empty();}
}
export async function openBackups(plugin:DoubanPlugin):Promise<void> {
  const modal=new Modal(plugin.app);modal.contentEl.createEl('h2',{text:'恢复补全备份'});
  const paths=await plugin.migrationService.backups();
  if(!paths.length)modal.contentEl.createEl('p',{text:'尚无补全备份'});
  for(const path of paths) {
    const record=await plugin.migrationService.readBackup(path);
    new Setting(modal.contentEl).setName(record.path).setDesc(record.createdAt).addButton(b=>b.setButtonText('查看恢复预览').onClick(async()=>{
      try {
        const file=plugin.app.vault.getAbstractFileByPath(record.path);if(!(file instanceof TFile))throw new Error('笔记已不存在');
        const current=await plugin.app.vault.read(file);
        const warning=current===record.after?'笔记与补全后的内容一致。':'笔记在补全后又有修改，恢复会覆盖下面显示的当前内容。';
        new ConfirmModal(plugin.app,'恢复前对照',`${warning}\n\n当前内容：\n${current}\n\n将恢复为：\n${record.before}`,async()=>{
          await plugin.migrationService.restore(path,current);await plugin.dashboardIndex.update(file);new Notice('备份已恢复');
        },'恢复这个备份').open();
      }catch(e){new Notice(String(e.message || e));}
    }));
  }
  modal.open();
}
