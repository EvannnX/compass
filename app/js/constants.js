export const STORAGE_KEY = 'compass.v1';
export const SCHEMA_VERSION = 1;
export const STALE_AFTER_DAYS = 30;
export const MIN_PLATFORMS = 2;
export const CUSTOM_NAME_MAX = 30;
export const CUSTOM_ID = /^custom-[a-z0-9]{1,12}$/;
export const TOAST_MS = 2400;

// Common AIs to pick from. Anything else can be added by hand and is kept in the saved state.
export const PLATFORMS = [
  { id: 'claude', name: 'Claude', url: 'https://claude.ai/new' },
  { id: 'chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com/' },
  { id: 'gemini', name: 'Gemini', url: 'https://gemini.google.com/app' },
  { id: 'deepseek', name: 'DeepSeek', url: 'https://chat.deepseek.com/' },
  { id: 'kimi', name: 'Kimi', url: 'https://www.kimi.com/' },
  { id: 'qwen', name: 'Qwen', url: 'https://chat.qwen.ai/' },
  { id: 'grok', name: 'Grok', url: 'https://grok.com/' },
  { id: 'perplexity', name: 'Perplexity', url: 'https://www.perplexity.ai/' },
  { id: 'copilot', name: 'Copilot', url: 'https://copilot.microsoft.com/' },
  { id: 'mistral', name: 'Le Chat', url: 'https://chat.mistral.ai/chat' },
  { id: 'chatglm', name: 'ChatGLM', url: 'https://chatglm.cn/' },
  { id: 'yuanbao', name: 'Yuanbao', url: 'https://yuanbao.tencent.com/' },
];
export const PLATFORM_IDS = PLATFORMS.map((p) => p.id);

// One onboarding screen per question. Each answer becomes one map entry.
export const QUESTIONS = [
  { task: 'Plan a big piece of work', stage: 'plan', text: 'When you plan or structure a big piece of work, which AI do you open?' },
  { task: 'Write or rewrite text', stage: 'draft', text: 'When you write or rewrite text?' },
  { task: 'Carry out a set plan', stage: 'execute', text: 'When the plan is set and just needs doing, cheaply or quickly?' },
  { task: 'Images and visuals', domain: 'image', text: 'For images or visuals?' },
  { task: 'Code', domain: 'coding', text: 'For code?' },
  { task: 'Look things up', domain: 'research', text: 'For looking things up or research?' },
];
export const FAVORITE_QUESTION = 'Which AI feels best to you overall?';

export const REASONS = ['Quality', 'Cost', 'Speed', 'Style', 'Habit', 'Chinese language'];
export const CONFIDENCE = ['high', 'medium', 'low'];

// title labels a single card; group heads the list of cards; hint says in plain words what the AI does with it.
export const MEMORY_KINDS = [
  { id: 'decision', title: 'Decided', group: 'Already decided', hint: 'Settled. Every AI builds on these and won’t reopen them.', placeholder: 'e.g. Chapter 3 compares the two field sites.' },
  { id: 'constraint', title: 'Rule', group: 'Rules', hint: 'Every AI must follow these, every time.', placeholder: 'e.g. Do not change the chapter order.' },
  { id: 'open_item', title: 'Not decided yet', group: 'Not decided yet', hint: 'Questions you are still thinking about. An AI can suggest options, but you choose.', placeholder: 'e.g. Which theory anchors the discussion.' },
  { id: 'fact', title: 'Background', group: 'Background', hint: 'Facts about the project, like names, dates and sources.', placeholder: 'e.g. The advisor is Prof. Lin.' },
];

// AIs the user added by hand. main.js refreshes this from the saved state before each render.
let customPlatforms = [];
export const useCustomPlatforms = (list) => {
  customPlatforms = list;
};
const findPlatform = (id) => PLATFORMS.find((p) => p.id === id) ?? customPlatforms.find((p) => p.id === id);

export const platformName = (id) => findPlatform(id)?.name ?? id;
export const platformUrl = (id) => findPlatform(id)?.url || null;
