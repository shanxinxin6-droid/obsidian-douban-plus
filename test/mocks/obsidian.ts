const yaml=require('js-yaml');
export const parseYaml=(text:string)=>yaml.load(text);
export const stringifyYaml=(value:unknown)=>yaml.dump(value,{lineWidth:-1,noRefs:true});
export const getLanguage=()=> 'zh-CN';
export const Platform={isDesktopApp:true,isDesktop:true,isIosApp:false};
export const normalizePath=(value:string)=>value.replace(/\\/g,'/');
export const Notice=jest.fn();
export const moment=(value:any)=>({format:()=>String(value),toDate:()=>new Date(value)});
export class TFile {extension='md';stat={mtime:1,ctime:1,size:0};basename:string;constructor(public path:string){this.basename=path.split('/').pop()?.replace(/\.md$/,'') || path;}}
export class App {}
export class Plugin {}
export class ItemView {}
export class Modal {}
export class PluginSettingTab {}
export class FuzzySuggestModal {}
export class SuggestModal {}
export class AbstractInputSuggest {}
export class TextComponent {}
export class TextAreaComponent {}
export class ValueComponent {}
export class ButtonComponent {}
export class DropdownComponent {}
export class SearchComponent {}
export class Setting {}
export const setIcon=():void=>{};
export function memoryApp(initial:Record<string,string>={}) {
  const contents=new Map(Object.entries(initial));const files=new Map<string,any>(Object.keys(initial).map(p=>[p,new TFile(p)]));
  const backups=new Map<string,string>();
  const app:any={
    vault:{configDir:'.obsidian',getMarkdownFiles:()=>[...files.values()],getAbstractFileByPath:(p:string)=>files.get(p),
      read:async(f:TFile)=>contents.get(f.path),cachedRead:async(f:TFile)=>contents.get(f.path),
      process:async(f:TFile,fn:(text:string)=>string)=>{const result=fn(contents.get(f.path));contents.set(f.path,result);return result;},
      adapter:{exists:async(p:string)=>p.endsWith('/backups') || backups.has(p),mkdir:async()=>{},write:async(p:string,text:string)=>backups.set(p,text),read:async(p:string)=>backups.get(p),list:async()=>({files:[...backups.keys()]})}},
    metadataCache:{getFileCache:(f:TFile)=>{try{const match=/^---\r?\n([\s\S]*?)\r?\n---/.exec(contents.get(f.path));return {frontmatter:match?parseYaml(match[1]):undefined};}catch{return {};}}},
    fileManager:{processFrontMatter:async(f:TFile,fn:(p:any)=>void)=>{const {mergeProperties,splitNote}=require('../../src/org/wanxp/dashboard/properties');const text=contents.get(f.path);const p=splitNote(text).properties;fn(p);contents.set(f.path,mergeProperties(text,p));}}
  };
  return {app,contents,files,backups};
}
