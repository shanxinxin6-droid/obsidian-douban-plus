import {parseYaml, stringifyYaml} from 'obsidian';
import DoubanSubject from '../douban/data/model/DoubanSubject';
import {boundedNumber, dateString, identityKey, normalizeState, normalizeType} from './model';
export type Properties = Record<string, any>;
export interface SplitNote { properties: Properties; body: string; bom: string; eol: string; }
export function splitNote(text: string): SplitNote {
  const bom = text.startsWith('\uFEFF') ? '\uFEFF' : '';
  const raw = bom ? text.slice(1) : text;
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  if (!/^---[ \t]*(?:\r?\n|$)/.test(raw)) return {properties:{}, body:raw, bom, eol};
  const match = /^---[ \t]*\r?\n([\s\S]*?)^---[ \t]*(?:\r?\n|$)/m.exec(raw);
  if (!match) throw new Error('笔记头部 YAML 没有结束标记');
  const properties = parseYaml(match[1]) ?? {};
  if (typeof properties !== 'object' || Array.isArray(properties)) throw new Error('笔记头部 YAML 必须是属性对象');
  return {properties,body:raw.slice(match[0].length),bom,eol};
}
export function mergeProperties(text: string, patch: Properties): string {
  const {properties,body,bom,eol} = splitNote(text);
  return `${bom}---${eol}${stringifyYaml({...properties,...patch}).replace(/\r?\n/g,eol).trimEnd()}${eol}---${eol}${body}`;
}
export function propertiesFromSubject(subject: DoubanSubject, now = new Date()): Properties {
  const type = normalizeType(subject.type);
  const id = String(subject.id ?? '');
  if (!identityKey(id,type,subject.url)) throw new Error('条目缺少可靠的豆瓣标识');
  const state = subject.userState;
  return {douban_source:'douban',douban_schema:1,douban_id:id,douban_url:subject.url || null,
    douban_type:type,douban_title:subject.title,douban_cover:subject.image || subject.imageUrl || null,
    douban_score:boundedNumber(subject.score,10) ?? null,douban_rating:boundedNumber(state?.rate,5) ?? null,
    douban_state:normalizeState(state?.state),douban_published_date:dateString(subject.datePublished) ?? null,
    douban_collection_date:dateString(state?.collectionDate) ?? null,douban_tags:state?.tags?.filter(Boolean) || [],douban_synced_at:now.toISOString()};
}
