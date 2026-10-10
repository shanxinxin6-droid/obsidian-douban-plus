import {
	Action,
	BasicConst,
	SEARCH_ITEM_PAGE_SIZE,
	SearchHandleMode,
	SubjectHandledStatus,
	SupportType,
	SyncTypeRecords
} from "./constant/Constsant";
import {Editor, Notice, Plugin, TFile} from "obsidian";

import {DEFAULT_SETTINGS} from "./constant/DefaultSettings";
import {DoubanFuzzySuggester} from "./douban/data/search/DoubanSearchFuzzySuggestModal";
import {DoubanPluginSetting} from "./douban/setting/model/DoubanPluginSetting";
import {DoubanSearchChooseItemHandler} from "./douban/data/handler/DoubanSearchChooseItemHandler";
import {DoubanSearchModal} from "./douban/data/search/DoubanSearchModal";
import {DoubanSettingTab} from "./douban/setting/DoubanSettingTab";
import DoubanSubject from "./douban/data/model/DoubanSubject";
import {DoubanSyncModal} from "./douban/component/DoubanSyncModal";
import FileHandler from "./file/FileHandler";
import {FileUtil} from "./utils/FileUtil";
import GlobalStatusHolder from "./douban/model/GlobalStatusHolder";
import HandleContext from "./douban/data/model/HandleContext";
import HandleResult from "./douban/data/model/HandleResult";
import NetFileHandler from "./net/NetFileHandler";
import SettingsManager from "./douban/setting/SettingsManager";
import {SyncConfig} from "./douban/sync/model/SyncConfig";
import SyncHandler from "./douban/sync/handler/SyncHandler";
import UserComponent from "./douban/user/UserComponent";
import {i18nHelper} from './lang/helper';
import {log} from "src/org/wanxp/utils/Logutil";
import GithubUtil from "./utils/GithubUtil";
import {DoubanPluginOnlineData} from "./douban/setting/model/DoubanPluginOnlineData";
import SearcherV2 from "./douban/data/search/SearchV2";
import {SearchPage} from "./douban/data/model/SearchPage";
import DoubanBatchImportModal from "./douban/component/DoubanBatchImportModal";
import DoubanUrlUtil from "./utils/DoubanUrlUtil";
import DashboardIndex, {itemFromProperties} from './dashboard/index';
import {DashboardItem, DashboardSettings, defaultDashboardSettings, identityKey, normalizeType, parseIdentity} from './dashboard/model';
import {mergeProperties, propertiesFromSubject, splitNote} from './dashboard/properties';
import MigrationService from './dashboard/migration';
import DashboardView, {DASHBOARD_VIEW} from './dashboard/view';
import {MigrationModal, openConfigImport} from './dashboard/modals';
import {sleepRange} from './utils/TimeUtil';

export default class DoubanPlugin extends Plugin {
	public settings: DoubanPluginSetting;
	public doubanExtractHandler: DoubanSearchChooseItemHandler;
	public doubanStatusBar: HTMLElement;
	public fileHandler: FileHandler;
	public userComponent: UserComponent;
	public settingsManager: SettingsManager;
	public netFileHandler: NetFileHandler;
	public statusHolder: GlobalStatusHolder;
	public onlineData: DoubanPluginOnlineData;
	public settingTab: DoubanSettingTab;
	public dashboardIndex: DashboardIndex;
	public migrationService: MigrationService;
	public dashboardProgress = '';
	public dashboardCounts = {created:0, updated:0, skipped:0, failed:0};
	private dashboardReady: Promise<void> = Promise.resolve();
	private dashboardOpening: Promise<void>;
	get dashboardSettings(): DashboardSettings { return this.settings.dashboard; }


	async putToObsidian(context: HandleContext, extract: DoubanSubject) {
		if (context.previewSubject) { context.previewSubject(extract); return; }
		if (context.action === Action.Sync && !this.statusHolder.syncing()) return;
		const syncStatus = context.syncStatusHolder && context.syncStatusHolder.syncStatus ? context.syncStatusHolder.syncStatus : null;
		try {

			if (!extract) {
				log.warn(i18nHelper.getMessage('140101'));
				return;
			}
			if (context.syncActive && extract.guessType && extract.guessType != extract.type) {
				extract.handledStatus = SubjectHandledStatus.syncTypeDiffAbort;
				if (Action.Sync == context.action) {
					this.showStatus(i18nHelper.getMessage('140207', syncStatus.getHasHandle(), syncStatus.getTotal(), extract.title));
					syncStatus.failByDiffType(extract.id, extract.title);
				}else {
					console.log(i18nHelper.getMessage('140102', extract.type, extract.title, extract.guessType));
				}
				return;
			}
			if (Action.Sync == context.action) {
				this.showStatus(i18nHelper.getMessage('140207', syncStatus.getHasHandle(), syncStatus.getTotal(), extract.title));
			}else {
				this.showStatus(i18nHelper.getMessage('140204', extract.title));
			}
			if (context.mode === SearchHandleMode.FOR_CREATE && !context.syncConfig?.force && this.dashboardIndex) {
				await this.dashboardReady;
				const key = identityKey(String(extract.id), normalizeType(extract.type), extract.url);
				const existing = key && this.dashboardIndex.find(key);
				if (existing) {
					const updated = await this.updateDashboardSubject(extract, context.action === Action.Sync);
					if (syncStatus) { updated ? syncStatus.exists(extract.id,extract.title) : syncStatus.unHandle(extract.id,extract.title); }
					return;
				}
			}
			const result  = await this.doubanExtractHandler.parseText(extract, context)
			if (result) {
				await this.putContentToObsidian(context, result);
				extract.handledStatus = SubjectHandledStatus.saved;
			}
			if (Action.Sync == context.action) {
				this.showStatus(i18nHelper.getMessage('140208', syncStatus.getHasHandle(),  syncStatus.getTotal(), extract.title));
			}else {
				this.showStatus(i18nHelper.getMessage('140205', extract.title));
			}
		} catch (e) {
			log.error(i18nHelper.getMessage('140206', e.message), e);
			syncStatus!=null?syncStatus.fail(extract.id, extract.title):null;
		} finally {
			this.clearStatusBarDelay();
		}
	}

	async putContentToObsidian(context: HandleContext, result: HandleResult) {
		const {mode} = context;
		switch (mode) {
			case SearchHandleMode.FOR_CREATE:
				await this.createFile(context, result);
				break;
			case SearchHandleMode.FOR_REPLACE:
				await this.putToEditor(context.editor, result.content);
				break;
		}
	}

	async putToEditor(editor: Editor, content: string) {
		editor.replaceSelection(content);
	}

	async createFile(context: HandleContext, result: HandleResult) {
		if (context.action === Action.Sync && !this.statusHolder.syncing()) return;
		await this.dashboardReady;
		let filePath = result.filePath?result.filePath:DEFAULT_SETTINGS.dataFilePath;
		filePath = FileUtil.join(filePath, result.fileName);
		const syncStatus = context.syncStatusHolder && context.syncStatusHolder.syncStatus ? context.syncStatusHolder.syncStatus : null;
		const {subject} = result;
		let content = result.content;
		const patch = propertiesFromSubject(subject);
		const existing = this.dashboardIndex.find(identityKey(String(subject.id),normalizeType(subject.type),subject.url));
		if (existing) {
			if(existing.files.length !== 1 || !existing.managed) {this.dashboardCounts.skipped++;new Notice('旧笔记或重复关联需要先预览并补全属性');syncStatus?.unHandle(subject.id,subject.title);return;}
			const file = this.app.vault.getAbstractFileByPath(existing.files[0]);
			if (!(file instanceof TFile)) throw new Error('关联笔记已移动，请重建索引后重试');
			await this.app.vault.process(file, text => {
				if(context.action === Action.Sync && !this.statusHolder.syncing()) throw new Error('同步已取消');
				const current=splitNote(text).properties;
				if(identityKey(String(current.douban_id),normalizeType(current.douban_type),current.douban_url)!==existing.key)throw new Error('笔记关联发生变化，请重建索引');
				return mergeProperties(content,{...current,...splitNote(content).properties,...patch});
			});
			syncStatus?.replace(subject.id,subject.title);this.dashboardCounts.updated++;await this.dashboardIndex.update(file);return;
		}
		content = mergeProperties(content,patch);
		const target=this.app.vault.getAbstractFileByPath(`${filePath}.md`);
		if(target){
			this.dashboardCounts.skipped++;syncStatus?.unHandle(subject.id,subject.title);
			new Notice(`${subject.title}：目标笔记已存在，请先关联或补全属性，避免覆盖同名笔记`);return;
		}
		if (Action.Sync == context.action) {
			if (context.syncStatusHolder.syncStatus.syncConfig.force) {
				const exists:boolean = await this.fileHandler.createOrReplaceNewNoteWithData(filePath, content, context.showAfterCreate);
				if (exists) {
					syncStatus != null ? syncStatus.replace(subject.id, subject.title):null;
				}else {
					syncStatus != null ?syncStatus.create(subject.id, subject.title):null;
				}
			}else {
				const created:boolean = await this.fileHandler.createNewNoteWithData(filePath, content, context.showAfterCreate, false);
				created ?syncStatus.create(subject.id, subject.title):syncStatus.exists(subject.id, subject.title);
			}
		}else {
			await this.fileHandler.createNewNoteWithData(filePath, content, context.showAfterCreate);
		}
		const file=this.app.vault.getAbstractFileByPath(`${filePath}.md`);
		if(file instanceof TFile)await this.dashboardIndex.update(file);
		this.dashboardCounts.created++;
	}

	async search(searchTerm: string, searchType: SupportType, context: HandleContext) {
		try {
			this.showStatus(i18nHelper.getMessage('140201', searchTerm));
			const result:SearchPage = await SearcherV2.search(searchTerm, searchType, 1, SEARCH_ITEM_PAGE_SIZE, this.settings, context.plugin.settingsManager);
			this.showStatus(i18nHelper.getMessage('140202', result.list.toString()));
			context.searchPage = result;
			new DoubanFuzzySuggester(this, context, searchTerm).showSearchPage(result);
		} catch (e) {
			log.error(i18nHelper.getMessage('140206').replace('{0}', e.message), e);
		} finally {
			this.clearStatusBarDelay();
		}
	}

	async getDoubanTextForActiveFile(context: HandleContext) {
		const activeFile = await this.app.workspace.getActiveFile();
		if (activeFile) {
			const searchTerm = activeFile.basename;
			if (searchTerm) {
				await this.search(searchTerm, SupportType.all, context);
			}
		}
	}

	async getDoubanTextForCreateNewNote(context: HandleContext) {
		new DoubanSearchModal(this.app, this, context, null).open();
	}

	async getDoubanTextForCreateNewNoteForType(context: HandleContext, type: SupportType) {
		new DoubanSearchModal(this.app, this, context, type).open();
	}

	async getDoubanTextForSearchTerm(context: HandleContext) {
		new DoubanSearchModal(this.app, this, context, null).open();
	}

	async showSyncModal(context: HandleContext) {
		new DoubanSyncModal(this.app, this, context).open();
	}

	async batchImportUrls(urls: string[], context: HandleContext) {
		let success = 0;
		const failures: string[] = [];
		for (let index = 0; index < urls.length; index++) {
			const parsed = DoubanUrlUtil.parse(urls[index]);
			this.showStatus(i18nHelper.getMessage('batchImportProgress', index + 1, urls.length));
			if (!parsed) {
				failures.push(urls[index]);
				continue;
			}
			const item = {
				id: parsed.id,
				type: parsed.type,
				title: parsed.id,
				url: parsed.url,
			} as DoubanSubject;
			try {
				const result = await this.doubanExtractHandler.handle(item, {
					...context,
					listItem: parsed.type === SupportType.theater ? item : undefined,
					showAfterCreate: false,
				});
				if (result && result.handledStatus === SubjectHandledStatus.saved) {
					success++;
				} else {
					failures.push(parsed.url);
				}
			} catch (_error) {
				failures.push(parsed.url);
			}
			if (index < urls.length - 1) {
				await new Promise(resolve => setTimeout(resolve, BasicConst.CALL_DOUBAN_DELAY));
			}
		}
		new Notice(i18nHelper.getMessage('batchImportSummary', success, failures.length, failures.join('\n')));
		this.clearStatusBarDelay();
	}

	async onload() {
		console.log("----douban-plugins-load------")
		await this.loadSettings();
		if (this.settings.statusBar) {
			this.doubanStatusBar = this.addStatusBarItem();
		}

		
		this.addCommand({
			id: "searcher-douban-import-and-create-file",
			name: i18nHelper.getMessage("110101"),
			callback: () =>
				this.getDoubanTextForCreateNewNoteForType({plugin: this,
					mode: SearchHandleMode.FOR_CREATE,
					settings: this.settings,
					userComponent: this.userComponent,
				netFileHandler: this.netFileHandler,
				showAfterCreate:this.settings.showAfterCreate,
				action: Action.SearchAndCrate}, this.settings.searchDefaultType),
		});

		this.addCommand({
			id: "batch-import-douban-urls",
			name: i18nHelper.getMessage("batchImportCommand"),
			callback: () => new DoubanBatchImportModal(this.app, this, {
				plugin: this,
				mode: SearchHandleMode.FOR_CREATE,
				settings: this.settings,
				userComponent: this.userComponent,
				netFileHandler: this.netFileHandler,
				showAfterCreate: false,
				action: Action.SearchAndCrate,
			}).open(),
		});

		this.addCommand({
			id: "searcher-douban-and-input-current-file",
			name: i18nHelper.getMessage("110002"),
			editorCallback: (editor: Editor) =>
				this.getDoubanTextForSearchTerm({plugin: this,
					mode: SearchHandleMode.FOR_REPLACE,
					settings: this.settings,
					editor: editor,
					userComponent: this.userComponent,
					netFileHandler: this.netFileHandler,
				action: Action.SearchAndReplace}),
		});

		this.addCommand({
			id: "searcher-douban-by-current-file-name",
			name: i18nHelper.getMessage("110001"),
			editorCallback: (editor: Editor) =>
				this.getDoubanTextForActiveFile({plugin: this,
					mode: SearchHandleMode.FOR_REPLACE,
					settings: this.settings,
					editor: editor,
					userComponent: this.userComponent,
					netFileHandler: this.netFileHandler,
				action: Action.SearchEditorAndReplace}),
		});

		this.addCommand({
			id: "sync-douban-import-and-create-file",
			name: i18nHelper.getMessage("110103"),
			callback: () =>
				this.showSyncModal({plugin: this,
					mode: SearchHandleMode.FOR_CREATE,
					settings: this.settings,
					userComponent: this.userComponent,
					netFileHandler: this.netFileHandler,
				action: Action.Sync,
				syncStatusHolder: this.statusHolder}),
		});

		this.addCommand({
			id: "searcher-douban-import-and-create-file-movie-tv",
			name: i18nHelper.getMessage("110102"),
			callback: () =>
				this.getDoubanTextForCreateNewNoteForType({plugin: this,
					mode: SearchHandleMode.FOR_CREATE,
					settings: this.settings,
					userComponent: this.userComponent,
					netFileHandler: this.netFileHandler,
					showAfterCreate:this.settings.showAfterCreate,
					action: Action.SearchAndCrate}, SupportType.movie),
		});

		this.addCommand({
			id: "searcher-douban-import-and-create-file-book",
			name: i18nHelper.getMessage("110104"),
			callback: () =>
				this.getDoubanTextForCreateNewNoteForType({plugin: this,
					mode: SearchHandleMode.FOR_CREATE,
					settings: this.settings,
					userComponent: this.userComponent,
					netFileHandler: this.netFileHandler,
					showAfterCreate:this.settings.showAfterCreate,
					action: Action.SearchAndCrate}, SupportType.book),
		});

		this.addCommand({
			id: "searcher-douban-import-and-create-file-music",
			name: i18nHelper.getMessage("110105"),
			callback: () =>
				this.getDoubanTextForCreateNewNoteForType({plugin: this,
					mode: SearchHandleMode.FOR_CREATE,
					settings: this.settings,
					userComponent: this.userComponent,
					netFileHandler: this.netFileHandler,
					showAfterCreate:this.settings.showAfterCreate,
					action: Action.SearchAndCrate}, SupportType.music),
		});

		this.addCommand({
			id: "searcher-douban-import-and-create-file-game",
			name: i18nHelper.getMessage("110106"),
			callback: () =>
				this.getDoubanTextForCreateNewNoteForType({plugin: this,
					mode: SearchHandleMode.FOR_CREATE,
					settings: this.settings,
					userComponent: this.userComponent,
					netFileHandler: this.netFileHandler,
					showAfterCreate:this.settings.showAfterCreate,
					action: Action.SearchAndCrate}, SupportType.game),
		});




		this.settingsManager = new SettingsManager(this.app, this);
		// this.fetchOnlineData(this.settingsManager);
		this.userComponent = new UserComponent(this.settingsManager);
		this.netFileHandler = new NetFileHandler(this.fileHandler);
		this.userComponent.assumeLoggedIn();

		this.settingTab = new DoubanSettingTab(this.app, this);
		this.addSettingTab(this.settingTab);
		this.statusHolder = new GlobalStatusHolder(this.app, this);
		this.dashboardIndex = new DashboardIndex(this.app,()=>this.dashboardSettings,()=>this.settings.dataFilePath);
		let indexReady:()=>void;
		this.dashboardReady=new Promise(resolve=>{indexReady=resolve;});
		this.migrationService = new MigrationService(this.app,()=>this.dashboardSettings,this.manifest.id);
		this.registerView(DASHBOARD_VIEW,leaf=>new DashboardView(leaf,this));
		this.addRibbonIcon('library','打开豆瓣看板',()=>void this.activateDashboard());
		this.addCommand({id:'open-douban-dashboard',name:'打开豆瓣看板',callback:()=>void this.activateDashboard()});
		this.addCommand({id:'migrate-douban-notes',name:'预览并补全旧笔记属性',callback:()=>new MigrationModal(this).open()});
		this.addCommand({id:'import-original-douban-settings',name:'从原豆瓣插件导入配置',callback:()=>void openConfigImport(this).catch(e=>new Notice(e.message))});
		this.registerEvent(this.app.metadataCache.on('changed',file=>void this.dashboardIndex.update(file)));
		this.registerEvent(this.app.vault.on('rename',(file,oldPath)=>{this.dashboardIndex.remove(oldPath);if(file instanceof TFile)void this.dashboardIndex.update(file);}));
		this.registerEvent(this.app.vault.on('delete',file=>this.dashboardIndex.remove(file.path)));
		this.app.workspace.onLayoutReady(()=>{
			void this.dashboardIndex.rebuild().catch(e=>new Notice(`索引建立失败：${e.message || e}`)).finally(indexReady);
		});
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		const defaults=defaultDashboardSettings();const saved=this.settings.dashboard;
		this.settings.dashboard={...defaults,...saved, options:{...defaults.options,...saved?.options},fields:{...defaults.fields,...saved?.fields}};
		// The compact cover shelf replaces the legacy list layout.
		const view=String(this.settings.dashboard.options.view);
		this.settings.dashboard.options.view=view==='list'||view==='cover'?'cover':view==='timeline'?'timeline':'grid';
		this.doubanExtractHandler = new DoubanSearchChooseItemHandler(this.app, this);
		this.fileHandler = new FileHandler(this.app);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}


	async onunload() {
		this.statusHolder?.stopSync();
		this.dashboardIndex?.dispose();
		if (this.statusHolder?.syncStatus) {
			await this.statusHolder.onunload();
		}
	}





	showStatus(origin: string) {
		if (!this.settings.statusBar || !this.doubanStatusBar) {
			return;
		}
		this.doubanStatusBar.empty();
		this.doubanStatusBar.setText(origin);
	}

	clearStatusBarDelay() {
		if (!this.settings.statusBar || !this.doubanStatusBar) {
			return;
		}
		setTimeout(() => this.doubanStatusBar.empty(), BasicConst.CLEAN_STATUS_BAR_DELAY)
	}

	async sync(context: HandleContext) {
		const {syncConfig}  = context;
		this.dashboardCounts={created:0,updated:0,skipped:0,failed:0};
		this.dashboardProgress='';
			try {
			const result:boolean = await this.checkLogin(context);
			if (!result) {
				this.dashboardProgress='请在 Douban Plus 设置中重新登录，本地数据已保留';
				return;
			}
			// @ts-ignore
			new Notice(i18nHelper.getMessage('140301', SyncTypeRecords[syncConfig.syncType]));
			this.initSyncDefaultSettings(syncConfig);
			await this.dashboardReady;
			await context.syncStatusHolder.initHandledData();
			// @ts-ignore
			this.showStatus(i18nHelper.getMessage('140203', SyncTypeRecords[syncConfig.syncType]));
			const syncHandler = new SyncHandler(this.app, this, syncConfig, context);
			await syncHandler.sync();
			this.dashboardProgress=this.statusHolder.syncCancelled?'同步已取消':`同步完成：新增 ${this.dashboardCounts.created}，属性更新 ${this.dashboardCounts.updated}，跳过 ${this.dashboardCounts.skipped}，失败 ${this.statusHolder.syncStatus.statusHandleMap.get('fail' as any) || 0}`;
			new Notice(this.dashboardProgress);
		} catch (e) {
			this.dashboardProgress=`同步失败：${e.message || e}`;
			new Notice(this.dashboardProgress);
			log.error(i18nHelper.getMessage('140206', e.message), e);
		} finally {
			await context.plugin.statusHolder.completeSync();
			this.clearStatusBarDelay();
			context.syncActive = false;
			}
	}

	async activateDashboard():Promise<void> {
		if(this.dashboardOpening)return this.dashboardOpening;
		this.dashboardOpening=(async()=>{
			await this.dashboardReady;
			let leaf=this.app.workspace.getLeavesOfType(DASHBOARD_VIEW)[0];
			if(!leaf){leaf=this.app.workspace.getLeaf('tab');await leaf.setViewState({type:DASHBOARD_VIEW,active:true});}
			this.app.workspace.revealLeaf(leaf);
		})().finally(()=>{this.dashboardOpening=undefined;});
		return this.dashboardOpening;
	}
	private dashboardContext():HandleContext {
		return {plugin:this,mode:SearchHandleMode.FOR_CREATE,settings:this.settings,userComponent:this.userComponent,
			netFileHandler:this.netFileHandler,showAfterCreate:false,action:Action.Sync,syncStatusHolder:this.statusHolder};
	}
	openDashboardSync():void {void this.showSyncModal(this.dashboardContext());}
	openDashboardSearch():void {const context=this.dashboardContext();context.action=Action.SearchAndCrate;context.showAfterCreate=this.settings.showAfterCreate;void this.getDoubanTextForCreateNewNoteForType(context,this.settings.searchDefaultType);}
	cancelDashboardTask():void {if(this.statusHolder.syncStarted){this.statusHolder.stopSync();this.dashboardProgress='正在取消，请等待当前请求结束';}}
	hasDashboardSubject(id:string,type:string):boolean {return !!this.dashboardIndex?.find(identityKey(String(id),normalizeType(type)));}
	async fetchDashboardSubject(url:string):Promise<DoubanSubject> {
		const identity=parseIdentity(url);if(!identity)throw new Error('请输入有效的豆瓣条目链接');
		const context=this.dashboardContext();let subject:DoubanSubject;
		context.previewSubject=value=>{subject=value;};context.action=Action.SearchAndCrate;
		await this.doubanExtractHandler.handle({id:identity.id,type:identity.type==='unknown'?'movie':identity.type} as DoubanSubject,context);
		if(!subject)throw new Error('获取条目失败，请检查登录或网络；本地数据已保留');
		return subject;
	}
	async updateDashboardSubject(subject:DoubanSubject,checkCancellation=false):Promise<boolean> {
		const key=identityKey(String(subject.id),normalizeType(subject.type),subject.url);
		const item=this.dashboardIndex.find(key);
		if(!item || !item.managed || item.files.length!==1){this.dashboardCounts.skipped++;new Notice(`${subject.title}：请先补全旧笔记或处理重复关联`);return false;}
		const file=this.app.vault.getAbstractFileByPath(item.files[0]);
		if(!(file instanceof TFile))throw new Error('关联笔记已不存在，请重建索引');
		// Validate malformed YAML before invoking the public property writer.
		splitNote(await this.app.vault.read(file));
		await this.app.fileManager.processFrontMatter(file,frontmatter=>{
			if(checkCancellation&&!this.statusHolder.syncing())throw new Error('同步已取消');
			const current=itemFromProperties(frontmatter,file.path,file.stat.mtime,this.dashboardSettings,true);
			if(!current?.managed || current.key!==key)throw new Error('笔记关联发生变化，请重新预览');
			Object.assign(frontmatter,propertiesFromSubject(subject));
		});
		this.dashboardCounts.updated++;await this.dashboardIndex.update(file);return true;
	}
	async refreshDashboardItems(items:DashboardItem[]):Promise<void> {
		if(this.statusHolder.syncStarted)throw new Error('已有同步任务正在运行');
		if(!items.length)return;
		if(!await this.checkLogin(this.dashboardContext()))throw new Error('请先在插件设置中登录豆瓣');
		const config={syncType:'movie',scope:'all',incrementalUpdate:true,force:false,dataFilePath:this.settings.dataFilePath} as SyncConfig;
		if(!this.statusHolder.startSync(config))return;
		this.dashboardCounts={created:0,updated:0,skipped:0,failed:0};this.statusHolder.syncStatus.totalNum(items.length);
		try {
			for(const item of items) {
				if(!this.statusHolder.syncing())break;
				try {
					if(!item.managed || item.files.length!==1 || !item.url){this.dashboardCounts.skipped++;}
					else {const subject=await this.fetchDashboardSubject(item.url);if(!this.statusHolder.syncing())break;await this.updateDashboardSubject(subject,true);}
				} catch(e){this.dashboardCounts.failed++;this.dashboardProgress=`${item.title}：${e.message || e}`;}
				this.statusHolder.syncStatus.handled(1);
				if(this.statusHolder.syncing())await sleepRange(BasicConst.CALL_DOUBAN_DELAY,BasicConst.CALL_DOUBAN_DELAY+BasicConst.CALL_DOUBAN_DELAY_RANGE);
			}
			this.dashboardProgress=`${this.statusHolder.syncCancelled?'刷新已取消':'刷新完成'}：更新 ${this.dashboardCounts.updated}，跳过 ${this.dashboardCounts.skipped}，失败 ${this.dashboardCounts.failed}`;
		}finally{await this.statusHolder.completeSync();}
	}
	async checkLogin(context: HandleContext):Promise<boolean> {
		this.settingsManager.debug('主界面:同步时的登录状态检测');
		const uc = context.userComponent;
		// If assumed-logged-in but not verified, verify now (sync needs real user ID)
		if (uc.isLogin() && !uc.isVerified()) {
			await uc.login();
		}
		// If has saved credentials but not logged in, try login
		if (uc.needLogin()) {
			await uc.login();
		}
		if (!uc.isLogin()) {
			this.settingsManager.debug('主界面:同步时的登录状态检测完成: 尝试获取用户信息失败');
			new Notice(i18nHelper.getMessage('140303'));
			return false;
		}
		return true;
	}


	private initSyncDefaultSettings(syncConfig: SyncConfig) {
		syncConfig.dataFilePath = syncConfig.dataFilePath ? syncConfig.dataFilePath : DEFAULT_SETTINGS.dataFilePath;
		syncConfig.templateFile = syncConfig.templateFile ? syncConfig.templateFile : '';
		syncConfig.attachmentPath = syncConfig.attachmentPath ? syncConfig.attachmentPath : DEFAULT_SETTINGS.attachmentPath;
		syncConfig.dataFileNamePath = syncConfig.dataFileNamePath ? syncConfig.dataFileNamePath : DEFAULT_SETTINGS.dataFileNamePath;
	}

}
