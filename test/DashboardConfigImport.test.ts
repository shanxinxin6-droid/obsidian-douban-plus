jest.mock('obsidian',()=>require('./mocks/obsidian'),{virtual:true});
import {applyConfigImport,parseConfigImport} from '../src/org/wanxp/dashboard/config-import';

const fixture=()=>({settings:{dataFilePath:'Original',loginCookiesContent:'keep-session',dashboard:{options:{view:'cover'}}},saveSettings:jest.fn(async()=>{}),dashboardIndex:{rebuild:jest.fn(async()=>{})}} as any);

it('previews BOM-prefixed JSON using only supported settings and no credentials',()=>{
  const patch=parseConfigImport('\uFEFF'+JSON.stringify({dataFilePath:'豆瓣 空格',movieTemplateFile:'Templates/电影.md',customProperties:[],loginCookiesContent:'excluded',loginHeadersContent:'excluded',dashboard:{},other:'excluded'}));
  expect(patch).toEqual({dataFilePath:'豆瓣 空格',movieTemplateFile:'Templates/电影.md',customProperties:[]});
});
it.each(['{broken','[]','null','{}','{"unrelated":true}'])('rejects malformed or unrelated configuration: %s',text=>{
  expect(()=>parseConfigImport(text)).toThrow();
});
it.each([{dataFilePath:17},{cacheImage:'yes'},{customProperties:{}},{scoreSetting:null}])('rejects incompatible setting types before applying: %o',raw=>{
  expect(()=>parseConfigImport(JSON.stringify(raw))).toThrow('格式无效');
});
it('parsing a preview does not save settings or rebuild the index',()=>{
  const plugin=fixture();parseConfigImport('{"dataFilePath":"Preview"}');
  expect(plugin.settings.dataFilePath).toBe('Original');expect(plugin.saveSettings).not.toHaveBeenCalled();expect(plugin.dashboardIndex.rebuild).not.toHaveBeenCalled();
});
it('applies only approved fields, preserves session and layout, then rebuilds once',async()=>{
  const plugin=fixture();await applyConfigImport(plugin,{dataFilePath:'Douban',movieTemplateFile:'Templates/movie.md',loginCookiesContent:'excluded',dashboard:{}});
  expect(plugin.settings).toEqual({dataFilePath:'Douban',movieTemplateFile:'Templates/movie.md',loginCookiesContent:'keep-session',dashboard:{options:{view:'cover'}}});
  expect(plugin.saveSettings).toHaveBeenCalledTimes(1);expect(plugin.dashboardIndex.rebuild).toHaveBeenCalledTimes(1);
});
it('restores in-memory settings if saving fails and leaves the index unchanged',async()=>{
  const plugin=fixture();plugin.saveSettings.mockRejectedValueOnce(new Error('write failed'));
  await expect(applyConfigImport(plugin,{dataFilePath:'Douban',movieTemplateFile:'Templates/movie.md'})).rejects.toThrow('write failed');
  expect(plugin.settings.dataFilePath).toBe('Original');expect(plugin.settings).not.toHaveProperty('movieTemplateFile');expect(plugin.dashboardIndex.rebuild).not.toHaveBeenCalled();
});
