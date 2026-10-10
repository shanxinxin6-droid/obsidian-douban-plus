jest.mock('obsidian',()=>require('./mocks/obsidian'),{virtual:true});
import {addIcon,TFile} from 'obsidian';
import DoubanPlugin from '../src/org/wanxp/main';
import DashboardIndex from '../src/org/wanxp/dashboard/index';
import {localCoverFromNote,resolveLocalCover} from '../src/org/wanxp/dashboard/covers';
import {defaultDashboardSettings} from '../src/org/wanxp/dashboard/model';
import {mergeProperties,propertiesFromSubject,splitNote} from '../src/org/wanxp/dashboard/properties';
import {registerDashboardIcons} from '../src/org/wanxp/dashboard/view';
import {memoryApp,TFile as MockFile} from './mocks/obsidian';

function fixture(title='后宫·甄嬛传') {
  const subject={id:'4922787',type:'teleplay',title,url:'https://movie.douban.com/subject/4922787/',image:'https://img3.doubanio.com/poster.webp',score:9.4} as any;
  const path=`Douban/teleplay/${title}.md`,coverPath=`assets/${title}.webp`;
  const body=`\n![image](<${coverPath}>)\n\n自己的感想，保持原样。\n`;
  const text=mergeProperties(body,propertiesFromSubject(subject));
  const m=memoryApp({[path]:text});const note=m.files.get(path);
  const image=new MockFile(coverPath);image.extension='webp';m.files.set(coverPath,image);
  const getCache=m.app.metadataCache.getFileCache;
  m.app.metadataCache.getFileCache=(file:TFile)=>({...getCache(file),embeds:file.path===path?[{link:coverPath,original:`![image](<${coverPath}>)`,displayText:'image'}]:[]});
  return {...m,subject,note,image,coverPath,text};
}

it.each(['后宫·甄嬛传','三大队','泰勒·斯威夫特：时代巡回演唱会'])('uses the saved cover embed for %s even when frontmatter contains a remote URL',async title=>{
  const m=fixture(title);const index=new DashboardIndex(m.app,defaultDashboardSettings,()=> 'Douban');
  await index.rebuild();expect(index.items()[0].cover).toBe(m.coverPath);expect(m.contents.get(m.note.path)).toBe(m.text);index.dispose();
});

it('prefers an existing explicit cover and resolves wiki aliases with spaces',()=>{
  const m=fixture('中文 空格');expect(resolveLocalCover(m.app,m.note,`[[${m.coverPath}|封面]]`)).toBe(m.image);
  const other=new MockFile('assets/自选.png');other.extension='png';m.files.set(other.path,other);
  expect(localCoverFromNote(m.app,m.note,other.path)).toBe(other);
});

it('keeps remote fallback when the local attachment is missing and ignores unrelated body images',()=>{
  const m=fixture();m.files.delete(m.coverPath);expect(localCoverFromNote(m.app,m.note,m.subject.image)).toBeUndefined();
  m.files.set(m.coverPath,m.image);m.app.metadataCache.getFileCache=()=>({embeds:[{link:m.coverPath,original:`![自己的配图](<${m.coverPath}>)`,displayText:'自己的配图'}]});
  expect(localCoverFromNote(m.app,m.note,m.subject.image)).toBeUndefined();
});

it.each(['remote','local'])('refreshes scores while keeping the downloaded cover and exact body (%s property)',async mode=>{
  const m=fixture();if(mode==='local')m.contents.set(m.note.path,mergeProperties(m.text,{douban_cover:m.coverPath}));
  const before=m.contents.get(m.note.path);const index=new DashboardIndex(m.app,defaultDashboardSettings,()=> 'Douban');await index.rebuild();
  const plugin:any=Object.create(DoubanPlugin.prototype);plugin.app=m.app;plugin.settings={dashboard:defaultDashboardSettings()};plugin.dashboardIndex=index;plugin.dashboardCounts={created:0,updated:0,skipped:0,failed:0};
  await plugin.updateDashboardSubject({...m.subject,score:9.5});const after=splitNote(m.contents.get(m.note.path));
  expect(after.properties.douban_cover).toBe(m.coverPath);expect(after.properties.douban_score).toBe(9.5);expect(after.body).toBe(splitNote(before).body);index.dispose();
});

it('registers a dedicated cover-shelf icon instead of relying on a version-specific icon alias',()=>{
  registerDashboardIcons();expect(addIcon).toHaveBeenCalledWith('douban-plus-cover-view',expect.stringContaining('<rect'));
});
