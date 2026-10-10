import {DashboardItem,DEFAULT_OPTIONS,queryItems,resetDashboardFilters,timelineGroups} from '../src/org/wanxp/dashboard/model';

const item=(key:string,date?:string,patch:Partial<DashboardItem>={}):DashboardItem=>({
  key,id:key,type:'movie',title:key,state:'collect',tags:[],files:[`${key}.md`],managed:true,modifiedAt:Date.now(),collectionDate:date,...patch
});
const options={...DEFAULT_OPTIONS,view:'timeline' as const};

describe('collection timeline',()=>{
  it('orders across years and months, keeps unknown dates last regardless of modification time or saved sort',()=>{
    const items=[item('unknown',undefined,{modifiedAt:9999999999999}),item('old','2024-12-31'),item('new','2026-01-01'),item('middle','2025-10-10')];
    expect(queryItems(items,{...options,sort:'title'}).map(i=>i.key)).toEqual(['new','middle','old','unknown']);
    expect(items.map(i=>i.key)).toEqual(['unknown','old','new','middle']);
    expect(timelineGroups(items).map(m=>m.month)).toEqual(['2026-01','2025-10','2024-12',undefined]);
  });
  it('groups same-day entries with deterministic identity ordering and preserves leap dates',()=>{
    const groups=timelineGroups([item('b','2024-02-29'),item('a','2024-02-29'),item('c','2024-02-28')]);
    expect(groups[0].count).toBe(3);expect(groups[0].days.map(d=>d.date)).toEqual(['2024-02-29','2024-02-28']);
    expect(groups[0].days[0].items.map(i=>i.key)).toEqual(['a','b']);
  });
  it('applies shared filters and collection years without changing saved normal-layout filters',()=>{
    const entries=[item('one','2026-10-10',{title:'科幻电影',score:9,rating:5,publishedDate:'2024-01-01'}),item('two','2024-01-01',{score:9,rating:5,publishedDate:'2026-01-01'})];
    const saved={...options,group:'type' as const,sort:'score' as const,year:'2024',yearDimension:'published' as const,timelineYear:'2026',minScore:'8',rating:'5'};
    const before={...saved};expect(queryItems(entries,saved).map(i=>i.key)).toEqual(['one']);expect(saved).toEqual(before);
    expect(queryItems(entries,{...saved,view:'grid'}).map(i=>i.key)).toEqual(['one']);
    expect(queryItems(entries,{...saved,timelineYear:'all',query:'科幻'}).map(i=>i.key)).toEqual(['one']);
    expect(queryItems(entries,{...saved,timelineYear:'2024'}).map(i=>i.key)).toEqual(['two']);
  });
  it('selects unknown collection dates rather than unknown release dates',()=>{
    const entries=[item('a',undefined,{publishedDate:'2025-01-01'}),item('b','2025-01-01')];
    expect(queryItems(entries,{...options,timelineYear:'unknown'}).map(i=>i.key)).toEqual(['a']);
  });
  it('limits a large same-day group to 100 entries while keeping total counts and restores it on expansion',()=>{
    const entries=Array.from({length:101},(_,n)=>item(String(n).padStart(3,'0'),'2026-10-10'));
    entries.push(item('next','2026-10-09'),item('unknown'));
    const first=timelineGroups(entries);expect(first).toHaveLength(1);expect(first[0].count).toBe(102);
    expect(first[0].days).toHaveLength(1);expect(first[0].days[0].count).toBe(101);expect(first[0].days[0].items).toHaveLength(100);
    const expanded=timelineGroups(entries,200);expect(expanded.flatMap(m=>m.days.flatMap(d=>d.items))).toHaveLength(103);
    expect(new Set(expanded.flatMap(m=>m.days.flatMap(d=>d.items.map(i=>i.key)))).size).toBe(103);
  });
  it('resets only the active layout year filter and preserves inactive layout choices',()=>{
    const saved={...options,year:'2024',yearDimension:'collection' as const,timelineYear:'2026',group:'type' as const,sort:'rating' as const,query:'test'};
    const reset=resetDashboardFilters(saved);expect(reset.year).toBe('2024');expect(reset.yearDimension).toBe('collection');expect(reset.timelineYear).toBe('all');expect(reset.query).toBe('');expect(reset.group).toBe('type');expect(reset.sort).toBe('rating');
    const normal=resetDashboardFilters({...saved,view:'list'});expect(normal.year).toBe('all');expect(normal.timelineYear).toBe('2026');
  });
  it('has no groups for empty filtered results',()=>expect(timelineGroups([])).toEqual([]));
});
