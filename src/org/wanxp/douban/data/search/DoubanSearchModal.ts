import {App, ButtonComponent, DropdownComponent, Modal, Setting, TextComponent} from "obsidian";

import DoubanPlugin from "../../../main";
import {i18nHelper} from "src/org/wanxp/lang/helper";
import HandleContext from "../model/HandleContext";
import {SearchTypeRecords, SupportType} from "../../../constant/Constsant";

export class DoubanSearchModal extends Modal {
	searchTerm: string;
	searchType: SupportType = SupportType.all;
	plugin: DoubanPlugin;
	context: HandleContext
	private submitted = false;

	constructor(app: App, plugin: DoubanPlugin, context: HandleContext, type: SupportType) {
		super(app);
		this.plugin = plugin;
		this.context = context;
		this.searchType = type??SupportType.all;
	}



	onOpen() {
		let {contentEl} = this;
		this.modalEl.addClass('douban-plus-search-modal');

		contentEl.createEl("h3", {text: i18nHelper.getMessage('110003')});
		const content = contentEl.createDiv("content");
		content.addClass("obsidian_douban_search_fields");

		const inputs = content.createDiv("inputs");
		const searchInput = new TextComponent(inputs).onChange((searchTerm) => {
			this.searchTerm = searchTerm;
		});
		inputs.addClass("obsidian_douban_search_input_content");
		searchInput.inputEl.setAttribute('aria-label','搜索关键词');
		searchInput.inputEl.placeholder='输入标题或关键词';

		searchInput.inputEl.addEventListener("keydown", (event) => {
			if (event.key === "Enter") {
				event.preventDefault();
				event.stopImmediatePropagation();
				this.submitted = true;
				this.close();
			}
		});
		inputs.addClass("obsidian_douban_search_input")

		const typeSelect = content.createDiv("type-select");
		const typeSelectInput = new DropdownComponent(typeSelect)
			.addOptions(SearchTypeRecords)
			.setValue(this.searchType)
			.onChange((value:SupportType) => {
			this.searchType = value;
		});
		typeSelect.addClass('obsidian_douban_search_input_type');
		typeSelectInput.selectEl.setAttribute('aria-label','搜索类型');


		const controls = contentEl.createDiv("controls");
		controls.addClass("obsidian_douban_search_controls")
				new ButtonComponent(controls)
					.setButtonText(i18nHelper.getMessage('110004'))
					.setCta()
					.onClick(() => {
						this.submitted = true;
						this.close();
					}).setClass( "obsidian_douban_search_button");
		new ButtonComponent(controls)
			.setButtonText(i18nHelper.getMessage('110005'))
			.onClick(() => {
				this.close();
			}).setClass( "obsidian_douban_cancel_button");
	}


	async onClose() {
		let {contentEl} = this;
		contentEl.empty();
		if (this.submitted && this.searchTerm) {
			await this.plugin.search(this.searchTerm, this.searchType, this.context);
		}
	}

}
