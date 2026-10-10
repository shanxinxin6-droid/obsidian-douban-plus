import {App, Modal, Notice, Setting, TFile} from 'obsidian';
import type DoubanPlugin from '../main';
import {TYPE_NAMES} from './model';
import {importableConfig, markDuplicatePreviews, MigrationPreview} from './migration';

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
export async function openConfigImport(plugin:DoubanPlugin):Promise<void> {
  const path=`${plugin.app.vault.configDir}/plugins/obsidian-douban-plugin/data.json`;
  if(!await plugin.app.vault.adapter.exists(path)) throw new Error('当前笔记库中未找到原豆瓣插件配置');
  const patch=importableConfig(JSON.parse(await plugin.app.vault.adapter.read(path)));
  new ConfirmModal(plugin.app,'从原豆瓣插件导入配置',`导入模板、输出路径及字段配置；登录凭据不导入。请在 Plus 中重新登录。\n\n${JSON.stringify(patch,null,2)}`,async()=>{
    Object.assign(plugin.settings,patch);await plugin.saveSettings();
    await plugin.dashboardIndex.rebuild();new Notice('配置已导入，请在插件设置中重新登录');
  },'导入配置').open();
}
export class MigrationModal extends Modal {
  private previews:MigrationPreview[]=[];
  private selected=new Set<string>();
  private rows:HTMLElement;
  private summary:HTMLElement;
  private busy=false;
  private closed=false;
  private limit=100;
  constructor(private plugin:DoubanPlugin) {super(plugin.app);}
  onOpen():void {
    this.modalEl.addClass('douban-plus-migration');
    const el=this.contentEl;el.createEl('h2',{text:'补全旧笔记'});
    el.createEl('p',{text:'先预览，勾选后写入基础属性。正文保留，每次写入前保存备份。影视链接需要远程补全才能区分电影和电视剧。'});
    new Setting(el).setName('扫描目录').setDesc('包含原输出目录；额外目录每行一个。').addTextArea(t=>t.setValue(this.plugin.dashboardSettings.folders.join('\n')).onChange(async value=>{
      this.plugin.dashboardSettings.folders=value.split('\n').map(v=>v.trim()).filter(Boolean);await this.plugin.saveSettings();
    }));
    const details=el.createEl('details');details.createEl('summary',{text:'旧笔记字段映射'});
    const names:Record<string,string>={id:'豆瓣 ID',type:'类型',url:'豆瓣链接',title:'标题',cover:'封面',score:'豆瓣评分',rating:'个人评分',state:'收藏状态',publishedDate:'发布日期',collectionDate:'收藏日期',tags:'个人标签'};
    for(const key of Object.keys(this.plugin.dashboardSettings.fields)) new Setting(details).setName(names[key] || key).addText(t=>t.setValue(this.plugin.dashboardSettings.fields[key]).onChange(async value=>{
      this.plugin.dashboardSettings.fields[key]=value.trim();await this.plugin.saveSettings();
    }));
    new Setting(el).addButton(b=>b.setButtonText('重新扫描 / 预览').onClick(()=>this.scan()))
      .addButton(b=>b.setButtonText('选择可补全项').onClick(()=>{if(this.busy)return;this.previews.filter(p=>!p.issue&&p.after!==p.before).forEach(p=>this.selected.add(p.path));this.render();}))
      .addButton(b=>b.setButtonText('补全所选笔记').setCta().onClick(()=>this.apply()))
      .addButton(b=>b.setButtonText('恢复备份').onClick(()=>openBackups(this.plugin)));
    this.summary=el.createDiv();this.rows=el.createDiv();void this.scan();
  }
  private async scan():Promise<void> {
    if(this.busy)return;this.busy=true;this.summary.setText('正在扫描…');this.selected.clear();this.limit=100;
    try {
      const files=this.app.vault.getMarkdownFiles().filter(f=>this.plugin.dashboardIndex.scoped(f.path));
      this.previews=[];
      for(let n=0;n<files.length;n+=50) {if(this.closed)return;this.previews.push(...await Promise.all(files.slice(n,n+50).map(f=>this.plugin.migrationService.preview(f))));}
      markDuplicatePreviews(this.previews);if(!this.closed)this.render();
    }catch(e){new Notice(String(e.message || e));}finally{this.busy=false;}
  }
  private render():void {
    this.rows.empty();this.summary.setText(`共 ${this.previews.length} 篇，已选 ${this.selected.size} 篇。${this.previews.length?'':'请先设置扫描目录。'}`);
    for(const p of this.previews.slice(0,this.limit)) {
      const row=this.rows.createDiv({cls:'douban-plus-migration-row'});
      const label=row.createEl('label');const check=label.createEl('input',{type:'checkbox'});
      check.disabled=!!p.issue || p.before===p.after;check.checked=this.selected.has(p.path);
      check.onchange=()=>{check.checked?this.selected.add(p.path):this.selected.delete(p.path);this.summary.setText(`共 ${this.previews.length} 篇，已选 ${this.selected.size} 篇`);};
      label.appendText(` ${p.path}`);
      const typeLabel=p.patch?.douban_type==='unknown' && String(p.patch?.douban_url).startsWith('https://movie.douban.com/')?'影视类型待确认':TYPE_NAMES[p.patch?.douban_type as keyof typeof TYPE_NAMES] || '未分类';
      row.createEl('p',{text:p.issue || (p.after===p.before?'属性已完整，无需修改':`将补充 ${typeLabel} · ID ${p.patch?.douban_id}`)});
      if(p.patch) {const details=row.createEl('details');details.createEl('summary',{text:'查看拟写入属性'});details.createEl('pre',{text:JSON.stringify(p.patch,null,2),cls:'douban-plus-preview'});}
      const link=row.createEl('input',{type:'url',placeholder:'输入豆瓣链接以手动关联'});link.setAttribute('aria-label',`关联 ${p.path}`);
      const associate=row.createEl('button',{text:'预览关联'});associate.onclick=()=>void this.resolve(p,link.value,false);
      const remote=row.createEl('button',{text:'远程补全 / 确认类型'});remote.onclick=()=>void this.resolve(p,link.value,true);
    }
    if(this.limit<this.previews.length)this.rows.createEl('button',{text:'显示更多'}).onclick=()=>{this.limit+=100;this.render();};
  }
  private async resolve(p:MigrationPreview,url:string,remote:boolean):Promise<void> {
    if(this.busy)return;this.busy=true;
    try {
      const file=this.app.vault.getAbstractFileByPath(p.path);if(!(file instanceof TFile))throw new Error('笔记已不存在');
      let next=await this.plugin.migrationService.preview(file,url || undefined);
      if(remote) {
        if(next.issue)throw new Error(next.issue);
        const subject=await this.plugin.fetchDashboardSubject(next.patch.douban_url);
        if(!subject)throw new Error('获取条目失败，本地笔记未修改');
        next=await this.plugin.migrationService.preview(file,url || undefined,subject);
      }
      this.previews[this.previews.indexOf(p)]=next;this.selected.delete(p.path);markDuplicatePreviews(this.previews);this.render();
    }catch(e){new Notice(String(e.message || e));}finally{this.busy=false;}
  }
  private async apply():Promise<void> {
    if(this.busy)return;const previews=this.previews.filter(p=>this.selected.has(p.path));if(!previews.length){new Notice('请先勾选需要补全的笔记');return;}
    this.busy=true;let success=0;const errors:string[]=[];
    try {
      for(const p of previews) {
        if(this.closed)break;
        try {
          const existing=this.plugin.dashboardIndex.find(p.key);
          if(existing?.files.some(path=>path!==p.path))throw new Error('另有笔记关联此条目，请先处理重复关联');
          await this.plugin.migrationService.apply(p);success++;
        } catch(e){errors.push(`${p.path}: ${e.message || e}`);}
      }
      await this.plugin.dashboardIndex.rebuild();
      this.summary.setText(`成功 ${success}，失败 ${errors.length}${errors.length?'\n'+errors.join('\n'):''}`);this.selected.clear();
      new Notice(`补全完成：成功 ${success}，失败 ${errors.length}`);
    }finally{this.busy=false;}
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
