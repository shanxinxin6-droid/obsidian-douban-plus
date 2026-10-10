import type DoubanPlugin from '../main';
import {importableConfig} from './migration';
import {Properties} from './properties';
import {DEFAULT_SETTINGS} from '../constant/DefaultSettings';

export function parseConfigImport(text:string):Properties {
  let raw:unknown;
  try {raw=JSON.parse(text.replace(/^\uFEFF/,''));}catch {throw new Error('JSON 格式无效，请检查内容或选择原插件的 data.json 文件');}
  const patch=importableConfig(raw);
  if(!Object.keys(patch).length)throw new Error('没有可导入的豆瓣设置，请选择原插件的 data.json 文件');
  for(const key of Object.keys(patch)) {
    const expected=(DEFAULT_SETTINGS as unknown as Properties)[key];const value=patch[key];
    const valid=Array.isArray(expected)?Array.isArray(value):expected && typeof expected==='object'?value && typeof value==='object' && !Array.isArray(value):typeof value===typeof expected;
    if(!valid)throw new Error(`配置项 ${key} 的格式无效，请检查原插件配置文件`);
  }
  return patch;
}

export async function applyConfigImport(plugin:DoubanPlugin,patch:Properties):Promise<void> {
  // Reapply the whitelist at the write boundary; dashboard and credentials stay separate.
  const safe=parseConfigImport(JSON.stringify(patch));const target=plugin.settings as unknown as Properties;const before:Properties={...target};
  Object.assign(target,safe);
  try {await plugin.saveSettings();}catch(e){
    for(const key of Object.keys(safe))Object.prototype.hasOwnProperty.call(before,key)?target[key]=before[key]:delete target[key];
    throw e;
  }
  await plugin.dashboardIndex.rebuild();
}
