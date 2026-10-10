import {readFile,mkdir,copyFile,writeFile,access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const manifest=JSON.parse(await readFile(join(root,'manifest.json'),'utf8'));
const vault=join(root,'.dev-vault');const config=join(vault,'.obsidian');const plugin=join(config,'plugins',manifest.id);
await mkdir(plugin,{recursive:true});await mkdir(join(vault,'Douban'),{recursive:true});await mkdir(join(vault,'Templates'),{recursive:true});
for(const name of ['main.js','manifest.json','styles.css'])await copyFile(join(root,name),join(plugin,name));
const writeNew=async(path,text)=>{try{await access(path);}catch{await writeFile(path,text);}};
await writeNew(join(config,'community-plugins.json'),JSON.stringify([manifest.id]));
await writeNew(join(plugin,'data.json'),JSON.stringify({dataFilePath:'Douban',cacheImage:false,dashboard:{folders:['Douban']}}));
await writeNew(join(vault,'Templates','正文模板.md'),'# {{title}}\n\n这里写自己的感想。\n\n---\n正文中的分隔线。\n');
const types=['movie','teleplay','book','music','game','theater','note'];
const hosts={movie:'https://movie.douban.com/subject/',teleplay:'https://movie.douban.com/subject/',book:'https://book.douban.com/subject/',music:'https://music.douban.com/subject/',game:'https://www.douban.com/game/',theater:'https://www.douban.com/location/drama/',note:'https://www.douban.com/note/'};
for(let n=0;n<types.length;n++){const type=types[n];await writeNew(join(vault,'Douban',`示例-${type}.md`),`---\ndouban_source: douban\ndouban_schema: 1\ndouban_id: "${90000000+n}"\ndouban_type: ${type}\ndouban_title: "示例${type}"\ndouban_url: ${hosts[type]}${90000000+n}/\ndouban_state: ${['wish','do','collect'][n%3]}\ndouban_score: ${n===6?'null':8+n/10}\ndouban_rating: ${n%5+1}\ndouban_collection_date: 2026-09-0${n+1}\ndouban_published_date: 202${n%6}-01-01\ndouban_tags: [示例, 测试]\n---\n\n这些是虚构测试数据，不代表真实豆瓣条目。\n\n自己的正文必须保留。\n`);}
await writeNew(join(vault,'Douban','旧模板缺类型.md'),'---\ndoubanId: "1292720"\ntitle: 旧笔记示例\nurl: https://movie.douban.com/subject/1292720/\ncustom: 保留我\n---\n\n这是用户写的感想。\n');
console.log(`Development vault: ${vault}\nOpen this folder as a vault in Obsidian, then enable Douban Plus.`);
