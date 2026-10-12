jest.mock('obsidian',()=>require('./mocks/obsidian'),{virtual:true});
import {defaultDashboardSettings} from '../src/org/wanxp/dashboard/model';
import {mergeProperties,propertiesFromSubject,splitNote} from '../src/org/wanxp/dashboard/properties';
import {markDuplicatePreviews,migrationChanges,migrationStatus,prepareMigration} from '../src/org/wanxp/dashboard/migration';
const settings=defaultDashboardSettings();
const properties=()=>propertiesFromSubject({id:'12345',type:'book',title:'示例',url:'https://book.douban.com/subject/12345/',score:8.5,userState:{state:'collect',tags:['阅读']}} as any,new Date('2026-10-12T00:00:00Z'));

it('shows only missing fields, leaving unchanged ratings and identity out of the diff',()=>{
  const p=properties();delete p.douban_cover;delete p.douban_type;
  const text=mergeProperties('用户正文',p);const preview=prepareMigration('Douban/book.md',text,settings);
  expect(migrationStatus(preview)).toBe('pending');expect(migrationChanges(preview)).toEqual([
    {key:'douban_type',before:undefined,after:'book',added:true}
  ]);expect(splitNote(preview.after).body).toBe('用户正文');
});
it('does not propose writes merely to reformat complete YAML or strip comments',()=>{
  const text=mergeProperties('正文\n---\n结尾',properties()).replace('douban_source: douban','douban_source: "douban" # 手写注释');
  const preview=prepareMigration('a.md',text,settings);
  expect(migrationStatus(preview)).toBe('complete');expect(migrationChanges(preview)).toEqual([]);expect(preview.after).toBe(text);
});
it('treats existing unknown and empty properties as complete rather than inventing data',()=>{
  const text=mergeProperties('正文',properties());const preview=prepareMigration('a.md',text,settings);
  expect(migrationChanges(preview)).toEqual([]);expect(migrationStatus(preview)).toBe('complete');
  expect(preview.patch.douban_rating).toBeNull();expect(preview.patch.douban_collection_date).toBeNull();
});
it('does not flag already linked notes solely to add missing empty optional properties',()=>{
  const p=properties();delete p.douban_rating;const preview=prepareMigration('a.md',mergeProperties('正文',p),settings);
  expect(migrationChanges(preview)).toEqual([]);expect(migrationStatus(preview)).toBe('complete');
  expect(preview.patch).not.toHaveProperty('douban_rating');
});
it('shows missing empty properties during legacy migration without pretending to know their values',()=>{
  const preview=prepareMigration('old.md','---\ndoubanId: "12345"\nurl: https://book.douban.com/subject/12345/\n---\n正文',settings);
  expect(migrationChanges(preview)).toContainEqual({key:'douban_rating',before:undefined,after:null,added:true});expect(migrationStatus(preview)).toBe('pending');
});
it.each(['普通笔记','---\ninvalid: [\n---\n正文','https://book.douban.com/subject/1/ https://book.douban.com/subject/2/'])('keeps ambiguous or invalid notes in the blocked category: %s',text=>{
  const preview=prepareMigration('a.md',text,settings);expect(migrationStatus(preview)).toBe('blocked');expect(preview.issue).toBeTruthy();expect(migrationChanges(preview)).toEqual([]);
});
it('compares parsed YAML dates by calendar day without forcing a formatting write',()=>{
  const p=properties();p.douban_published_date='2024-02-03';
  const text=mergeProperties('正文',p).replace("douban_published_date: '2024-02-03'",'douban_published_date: 2024-02-03');
  const preview=prepareMigration('a.md',text,settings);expect(migrationStatus(preview)).toBe('complete');expect(preview.after).toBe(text);
});
it('clears derived duplicate warnings after association is fixed, preserving unrelated errors',()=>{
  const a=prepareMigration('a.md',mergeProperties('正文',properties()),settings);const b={...a,path:'b.md'};const broken={path:'bad.md',before:'正文',issue:'YAML 无效'};
  markDuplicatePreviews([a,b,broken]);expect(migrationStatus(a)).toBe('blocked');b.key='book:999';markDuplicatePreviews([a,b,broken]);
  expect(a.issue).toBeUndefined();expect(b.issue).toBeUndefined();expect(broken.issue).toBe('YAML 无效');expect(migrationStatus(a)).toBe('complete');
});
