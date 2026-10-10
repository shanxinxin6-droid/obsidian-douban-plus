jest.mock('obsidian',()=>require('./mocks/obsidian'),{virtual:true});
import {performance} from 'perf_hooks';
import DashboardIndex from '../src/org/wanxp/dashboard/index';
import {DEFAULT_OPTIONS,defaultDashboardSettings,queryItems} from '../src/org/wanxp/dashboard/model';
import {memoryApp} from './mocks/obsidian';
it('indexes and filters 5,000 synthetic notes within the agreed budgets',async()=>{
  const notes:Record<string,string>={};
  for(let n=0;n<5000;n++)notes[`Douban/${n}.md`]=`---\ndouban_source: douban\ndouban_id: "${n+1}"\ndouban_type: ${n%2?'book':'movie'}\ndouban_title: "测试条目 ${n}"\ndouban_score: 8\ndouban_tags: [测试]\n---\n正文`;
  const {app}=memoryApp(notes);const index=new DashboardIndex(app,defaultDashboardSettings,()=> 'Douban');
  const start=performance.now();await index.rebuild();const indexed=performance.now();const items=index.items();const results=queryItems(items,{...DEFAULT_OPTIONS,type:'book',query:'测试'});const end=performance.now();
  const measurements={count:items.length,indexMs:Math.round(indexed-start),filterMs:Math.round(end-indexed),node:process.version,platform:process.platform};
  console.info('Dashboard performance',JSON.stringify(measurements));expect(items).toHaveLength(5000);expect(results).toHaveLength(2500);expect(indexed-start).toBeLessThan(5000);expect(end-indexed).toBeLessThan(300);index.dispose();
});
