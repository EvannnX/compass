// Sorts what came back from a chat against what is already saved: new, already saved,
// a newer version of a saved memory, or the answer to a question that was still open.
import { activeMemories, addMemory, archiveMemory, memoryTitle, updateMemory } from './model.js';

const CJK = /[一-鿿]/;
const STOPWORDS = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'is', 'are', 'be', 'it', 'we', 'i', 'my', 'our', 'this', 'that', 'will', 'should', 'which', 'what', 'whether', 'agreed', 'agree', 'decided', 'decide', 'still', 'yet']);
const SAME = 0.85;
const RELATED = 0.5;
const MIN_WORDS = 2;

const normalize = (text) => text.trim().toLowerCase().replace(/[.。!！?？]+$/, '').replace(/\s+/g, ' ');

// Content words, or pairs of characters for Chinese.
function wordsOf(text) {
  const plain = text.toLowerCase().replace(/(\d),(\d)/g, '$1$2');
  if (CJK.test(plain)) {
    const chars = plain.replace(/[^一-鿿0-9a-z]/g, '');
    return new Set([...chars].slice(0, -1).map((c, i) => c + chars[i + 1]));
  }
  return new Set(plain.split(/[^a-z0-9]+/).filter((w) => w && !STOPWORDS.has(w)));
}

// "related": share of the shorter text's words found in the other. "same": share of all words found in both.
function overlap(a, b, isSame) {
  const wa = wordsOf(a);
  const wb = wordsOf(b);
  if (Math.min(wa.size, wb.size) < MIN_WORDS) return 0;
  const shared = [...wa].filter((w) => wb.has(w)).length;
  return shared / (isSame ? new Set([...wa, ...wb]).size : Math.min(wa.size, wb.size));
}

const bestMatch = (text, memories, isSame = false) => memories
  .map((m) => ({ memory: m, score: normalize(m.text) === normalize(text) ? 1 : overlap(text, m.text, isSame) }))
  .sort((x, y) => y.score - x.score)[0];

function classify(item, saved) {
  const pool = saved.filter((m) => (item.isMe ? m.layer === 'global' : m.layer === 'project'));
  const same = bestMatch(item.text, pool.filter((m) => m.kind === item.kind), true);
  if (same && same.score >= SAME) return { status: 'known' };
  const canAnswer = item.kind === 'decision' || item.kind === 'fact';
  const open = canAnswer && bestMatch(item.text, pool.filter((m) => m.kind === 'open_item'));
  if (open && open.score >= RELATED) return { status: 'answers', target: open.memory, kind: 'decision' };
  const sameKind = bestMatch(item.text, pool.filter((m) => m.kind === item.kind));
  if (sameKind && sameKind.score >= RELATED) return { status: 'changes', target: sameKind.memory };
  return { status: 'new' };
}

export function organizeUpdate(state, projectId, items) {
  const saved = [...activeMemories(state, { layer: 'project', projectId }), ...activeMemories(state, { layer: 'global' })];
  const seen = new Set();
  return items
    .filter((item) => {
      const key = normalize(item.text);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((item) => {
      const { status, target, kind = item.kind } = classify(item, saved);
      return { ...item, kind, status, isPicked: status !== 'known', targetId: target?.id ?? null, targetTitle: target ? memoryTitle(target) : null };
    });
}

// Saves the ticked items: replacements edit the old memory, answers close the open question.
export function applyOrganized(state, { projectId, items, platform }, at) {
  return items.filter((i) => i.isPicked).reduce((s, item) => {
    const isMe = item.kind === 'preference';
    const target = s.memories.find((m) => m.id === item.targetId && m.status === 'active');
    if (item.status === 'changes' && target && target.kind === item.kind) {
      return updateMemory(s, target.id, { text: item.text, title: item.title, ...(item.reason && { reason: item.reason }) }, at);
    }
    const added = addMemory(s, {
      layer: isMe ? 'global' : 'project',
      projectId: isMe ? undefined : projectId,
      kind: item.kind,
      text: item.text,
      title: item.title,
      reason: item.reason,
      excerpt: item.source,
      platform,
      capturedVia: 'chat_update',
    }, at);
    return item.status === 'answers' && target ? archiveMemory(added, target.id, at) : added;
  }, state);
}
