import {changeDashboardOption,dashboardYearDimension,dashboardYears,DashboardItem,DEFAULT_OPTIONS,queryItems,resetDashboardFilters} from '../src/org/wanxp/dashboard/model';
const items:DashboardItem[]=[
  {key:'book:1',id:'1',type:'book',title:'一',state:'collect',tags:[],files:['1.md'],managed:true,modifiedAt:1,publishedDate:'2020-01-01',collectionDate:'2026-01-01'},
  {key:'book:2',id:'2',type:'book',title:'二',state:'collect',tags:[],files:['2.md'],managed:true,modifiedAt:2,publishedDate:'2026-01-01',collectionDate:'2020-01-01'},
  {key:'book:3',id:'3',type:'book',title:'三',state:'collect',tags:[],files:['3.md'],managed:true,modifiedAt:3,publishedDate:'2019-01-01'}
];

it('uses collection years by default, matching the initial collection-year grouping',()=>{
  expect(DEFAULT_OPTIONS.yearDimension).toBe('collection');expect(dashboardYearDimension(DEFAULT_OPTIONS)).toBe(DEFAULT_OPTIONS.group);
});
it.each(['grid','cover'] as const)('filters and sorts by the group date despite an old conflicting setting in %s',view=>{
  const options={...DEFAULT_OPTIONS,view,yearDimension:'published' as const,year:'2026'};const before={...options};
  expect(queryItems(items,options).map(i=>i.key)).toEqual(['book:1']);expect(options).toEqual(before);
  expect(queryItems(items,{...options,group:'published',yearDimension:'collection'}).map(i=>i.key)).toEqual(['book:2']);
  expect(queryItems(items,{...options,year:'all',sort:'year'}).map(i=>i.key)).toEqual(['book:1','book:2','book:3']);
});
it('lists only years from the effective date source and interprets unknown years consistently',()=>{
  expect(dashboardYears(items,DEFAULT_OPTIONS)).toEqual(['2026','2020']);
  expect(dashboardYears(items,{...DEFAULT_OPTIONS,group:'published'})).toEqual(['2026','2020','2019']);
  expect(queryItems(items,{...DEFAULT_OPTIONS,year:'unknown'}).map(i=>i.key)).toEqual(['book:3']);
  expect(queryItems(items,{...DEFAULT_OPTIONS,group:'published',year:'unknown'})).toEqual([]);
});
it.each(['type','state','none'] as const)('allows an independent year basis with %s grouping',group=>{
  expect(queryItems(items,{...DEFAULT_OPTIONS,group,yearDimension:'published',year:'2026'}).map(i=>i.key)).toEqual(['book:2']);
});
it('resets the year when switching year groups and retains the previous basis when leaving them',()=>{
  const original={...DEFAULT_OPTIONS,year:'2026',minScore:'8'};
  const published=changeDashboardOption(original,'group','published');expect(published).toMatchObject({group:'published',yearDimension:'published',year:'all',minScore:'8'});
  expect(original.year).toBe('2026');expect(changeDashboardOption(published,'group','type')).toMatchObject({group:'type',yearDimension:'published'});
});
it('keeps grouping coherent when a year basis is changed and preserves unrelated or inactive filters',()=>{
  const saved={...DEFAULT_OPTIONS,year:'2026',timelineYear:'2024',query:'阅读'};
  const next=changeDashboardOption(saved,'yearDimension','published');expect(next).toMatchObject({group:'published',yearDimension:'published',year:'all',timelineYear:'2024',query:'阅读'});
  expect(changeDashboardOption(saved,'type','book').year).toBe('2026');
  const ungrouped={...saved,group:'none' as const};expect(changeDashboardOption(ungrouped,'yearDimension','published')).toMatchObject({group:'none',year:'all'});
});
it('keeps timeline years independent of ordinary-layout grouping and year filters',()=>{
  const timeline={...DEFAULT_OPTIONS,view:'timeline' as const,group:'published' as const,yearDimension:'published' as const,year:'2019',timelineYear:'2026'};
  expect(dashboardYearDimension(timeline)).toBe('collection');expect(dashboardYears(items,timeline)).toEqual(['2026','2020']);expect(queryItems(items,timeline).map(i=>i.key)).toEqual(['book:1']);
  expect(changeDashboardOption(timeline,'rating','5')).toMatchObject({year:'2019',timelineYear:'2026',yearDimension:'published'});
});
it('resets conditions while retaining the active year source and inactive timeline filter',()=>{
  const saved={...DEFAULT_OPTIONS,group:'published' as const,yearDimension:'collection' as const,year:'2026',timelineYear:'2024'};
  expect(resetDashboardFilters(saved)).toMatchObject({group:'published',yearDimension:'published',year:'all',timelineYear:'2024'});
});
