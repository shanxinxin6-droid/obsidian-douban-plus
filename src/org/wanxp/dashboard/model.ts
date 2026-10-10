export const TYPES = ['movie', 'teleplay', 'book', 'music', 'game', 'theater', 'note', 'unknown'] as const;
export type ItemType = typeof TYPES[number];
export type ItemState = 'wish' | 'do' | 'collect' | 'not' | 'unknown';
export const TYPE_NAMES: Record<ItemType, string> = {movie:'电影', teleplay:'电视剧', book:'书籍', music:'音乐', game:'游戏', theater:'舞台剧', note:'豆瓣日记', unknown:'未分类'};
export const STATE_NAMES: Record<ItemState, string> = {wish:'想看 / 想读 / 想听 / 想玩', do:'在看 / 在读 / 在听 / 在玩', collect:'看过 / 读过 / 听过 / 玩过', not:'未收藏', unknown:'状态未知'};
export function stateLabel(type:ItemType,state:ItemState):string {
  if(state==='unknown'||state==='not')return STATE_NAMES[state];
  const verb=type==='book'||type==='note'?'读':type==='music'?'听':type==='game'?'玩':'看';
  return state==='wish'?`想${verb}`:state==='do'?`在${verb}`:`${verb}过`;
}
export interface DashboardItem {
  key: string; id: string; type: ItemType; title: string; url?: string; cover?: string;
  score?: number; rating?: number; state: ItemState; publishedDate?: string; collectionDate?: string;
  tags: string[]; syncedAt?: string; files: string[]; managed: boolean; modifiedAt: number;
}
export interface DashboardOptions {
  query: string; type: string; state: string; minScore: string; maxScore: string; rating: string; scoreState: 'all' | 'scored' | 'unknown';
  year: string; yearDimension: 'published' | 'collection'; view: 'grid' | 'list';
  group: 'none' | 'type' | 'state' | 'published' | 'collection'; sort: 'recent' | 'title' | 'score' | 'rating' | 'year';
}
export interface DashboardSettings {
  options: DashboardOptions; folders: string[]; fields: Record<string, string>;
}
export const DEFAULT_OPTIONS: DashboardOptions = {query:'', type:'all', state:'all', minScore:'', maxScore:'', rating:'all', scoreState:'all', year:'all', yearDimension:'published', view:'grid', group:'collection', sort:'recent'};
export const DEFAULT_FIELDS: Record<string, string> = {id:'doubanId', type:'type', url:'url', title:'title', cover:'image', score:'score', rating:'myRating', state:'myState', publishedDate:'datePublished', collectionDate:'myCollectionDate', tags:'myTags'};
export const defaultDashboardSettings = (): DashboardSettings => ({options:{...DEFAULT_OPTIONS}, folders:[], fields:{...DEFAULT_FIELDS}});

export function normalizeType(value: unknown): ItemType {
  const raw = String(value ?? '').trim();
  const aliases: Record<string, ItemType> = {'电影':'movie', '电视剧':'teleplay', '书籍':'book', '图书':'book', '音乐':'music', '游戏':'game', '舞台剧':'theater', '日记':'note', '豆瓣日记':'note', 'TVSeries':'teleplay', 'Movie':'movie', 'Book':'book', 'MusicAlbum':'music', 'Note':'note', 'Article':'note'};
  return aliases[raw] || (TYPES.includes(raw.toLowerCase() as ItemType) ? raw.toLowerCase() as ItemType : 'unknown');
}
export function normalizeState(value: unknown): ItemState {
  const raw = String(value ?? '').trim();
  if (['wish','do','collect','not','unknown'].includes(raw)) return raw as ItemState;
  if (/^想[看读听玩]/.test(raw)) return 'wish';
  if (/^在[看读听玩]/.test(raw)) return 'do';
  if (/^[看读听玩]过$/.test(raw)) return 'collect';
  if (raw === '未收藏' || raw === '未标记') return 'not';
  return 'unknown';
}
export function boundedNumber(value: unknown, max: number): number | undefined {
  if (value === '' || value === null || value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && n <= max ? n : undefined;
}
export function dateString(value: unknown): string | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`;
  const raw = String(value).slice(0,10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return undefined;
  const d = new Date(`${raw}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0,10) === raw ? raw : undefined;
}
export function parseIdentity(value: unknown): {id: string; namespace: string; url: string; type: ItemType} | null {
  try {
    const u = new URL(String(value));
    if (!['https:', 'http:'].includes(u.protocol)) return null;
    const host = u.hostname.toLowerCase();
    const rules: [boolean, RegExp, string, ItemType][] = [
      [host === 'movie.douban.com', /^\/subject\/(\d+)\/?$/, 'movie', 'unknown'],
      [host === 'book.douban.com', /^\/subject\/(\d+)\/?$/, 'book', 'book'],
      [host === 'music.douban.com', /^\/subject\/(\d+)\/?$/, 'music', 'music'],
      [host === 'www.douban.com' || host === 'douban.com', /^\/game\/(\d+)\/?$/, 'game', 'game'],
      [host === 'www.douban.com' || host === 'douban.com', /^\/location\/drama\/(\d+)\/?$/, 'theater', 'theater'],
      [host === 'www.douban.com' || host === 'douban.com', /^\/note\/(\d+)\/?$/, 'note', 'note']
    ];
    for (const [valid, pattern, namespace, type] of rules) {
      const m = valid && pattern.exec(u.pathname);
      if (m) return {id:m[1], namespace, type, url:`https://${host === 'douban.com' ? 'www.douban.com' : host}${u.pathname.replace(/\/$/,'')}/`};
    }
  } catch (_) { /* A malformed URL has no identity. */ }
  return null;
}
export function identityKey(id: string, type: ItemType, url?: string): string | null {
  const identity = parseIdentity(url);
  if (identity && identity.id !== id) throw new Error('豆瓣 ID 与链接不一致');
  const namespace = identity?.namespace || (type === 'teleplay' ? 'movie' : type);
  if (identity && type !== 'unknown' && namespace !== (type === 'teleplay' ? 'movie' : type)) throw new Error('豆瓣类型与链接不一致');
  return /^\d+$/.test(id) && namespace !== 'unknown' ? `${namespace}:${id}` : null;
}
export function queryItems(items: DashboardItem[], o: DashboardOptions): DashboardItem[] {
  const q = o.query.trim().toLocaleLowerCase();
  const yearOf = (i: DashboardItem) => (o.yearDimension === 'published' ? i.publishedDate : i.collectionDate)?.slice(0,4);
  return items.filter(i => (!q || `${i.title} ${i.tags.join(' ')}`.toLocaleLowerCase().includes(q))
    && (o.type === 'all' || i.type === o.type) && (o.state === 'all' || i.state === o.state)
    && (o.scoreState === 'all' || (o.scoreState === 'unknown' ? i.score === undefined : i.score !== undefined))
    && (!o.minScore || (i.score !== undefined && i.score >= Number(o.minScore)))
    && (!o.maxScore || (i.score !== undefined && i.score <= Number(o.maxScore)))
    && (o.rating === 'all' || (o.rating === 'unknown' ? i.rating === undefined : i.rating === Number(o.rating)))
    && (o.year === 'all' || (o.year === 'unknown' ? !yearOf(i) : yearOf(i) === o.year)))
    .sort((a,b) => {
      let diff = 0;
      if (o.sort === 'title') diff = a.title.localeCompare(b.title,'zh-CN');
      else if (o.sort === 'score' || o.sort === 'rating') diff = (b[o.sort] ?? -1) - (a[o.sort] ?? -1);
      else if (o.sort === 'year') diff = (yearOf(b) || '').localeCompare(yearOf(a) || '');
      else diff = (b.collectionDate ? Date.parse(b.collectionDate) : b.modifiedAt) - (a.collectionDate ? Date.parse(a.collectionDate) : a.modifiedAt);
      return diff || a.key.localeCompare(b.key);
    });
}
export function summarize(items: DashboardItem[]): {types: Record<string,number>; states: Record<string,number>; unknown: Record<string,number>} {
  const types: Record<string,number> = {}; const states: Record<string,number> = {};
  const unknown={'豆瓣未评分':0,'个人未评分':0,'发布年份未知':0,'收藏年份未知':0};
  for (const i of items) { types[i.type] = (types[i.type] || 0)+1; states[i.state] = (states[i.state] || 0)+1;
    if(i.score===undefined)unknown['豆瓣未评分']++;if(i.rating===undefined)unknown['个人未评分']++;
    if(!i.publishedDate)unknown['发布年份未知']++;if(!i.collectionDate)unknown['收藏年份未知']++;
  }
  return {types,states,unknown};
}
