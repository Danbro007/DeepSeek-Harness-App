/** Locale bundles for the Usage settings section. */

/** Locale keys this surface renders. */
export type UsageKey =
  | 'nav' | 'title' | 'intro' | 'refresh' | 'loading'
  | 'tokenSection' | 'tokenIntro' | 'tokenPlaceholder' | 'tokenConfigured' | 'tokenNotConfigured'
  | 'saveToken' | 'clearToken'
  | 'balanceTitle' | 'toppedUp' | 'granted' | 'unavailable' | 'noBalance'
  | 'usageTitle' | 'today' | 'month' | 'cost' | 'requests' | 'topModel'
  | 'categoriesTitle' | 'cacheHit' | 'cacheMiss' | 'output' | 'request'
  | 'dailyTitle' | 'noticesTitle' | 'noUsage'

/** Simplified Chinese copy. */
export const zh: Record<UsageKey, string> = {
  nav: '用量',
  title: 'DeepSeek 用量',
  intro: '余额来自 API key；用量来自平台会话 token。数据每页打开时刷新。',
  refresh: '刷新',
  loading: '加载中…',
  tokenSection: '平台会话 token',
  tokenIntro: '在 platform.deepseek.com 登录后，打开浏览器开发者工具，从 localStorage 复制 userToken 并粘贴到此处（用于读取用量，不会离开本机）。',
  tokenPlaceholder: '粘贴 userToken…',
  tokenConfigured: '已配置',
  tokenNotConfigured: '未配置',
  saveToken: '保存',
  clearToken: '清除',
  balanceTitle: '余额',
  toppedUp: '充值',
  granted: '赠送',
  unavailable: '账户不可用于 API 调用',
  noBalance: '未配置余额',
  usageTitle: '本月用量',
  today: '今日',
  month: '本月',
  cost: '费用',
  requests: '请求',
  topModel: '用量最高模型',
  categoriesTitle: '分类明细',
  cacheHit: '缓存命中输入',
  cacheMiss: '缓存未命中输入',
  output: '输出',
  request: '请求',
  dailyTitle: '每日 tokens',
  noticesTitle: '提示',
  noUsage: '未配置用量',
}

/** English copy. */
export const en: Record<UsageKey, string> = {
  nav: 'Usage',
  title: 'DeepSeek usage',
  intro: 'Balance comes from the API key; usage from the platform session token. Data refreshes when the page opens.',
  refresh: 'Refresh',
  loading: 'Loading…',
  tokenSection: 'Platform session token',
  tokenIntro: 'After signing in at platform.deepseek.com, copy the userToken from localStorage in the browser dev tools and paste it here (used only to read usage, never leaves this machine).',
  tokenPlaceholder: 'Paste userToken…',
  tokenConfigured: 'Configured',
  tokenNotConfigured: 'Not configured',
  saveToken: 'Save',
  clearToken: 'Clear',
  balanceTitle: 'Balance',
  toppedUp: 'Paid',
  granted: 'Granted',
  unavailable: 'Account unavailable for API calls',
  noBalance: 'No balance configured',
  usageTitle: 'This month',
  today: 'Today',
  month: 'This month',
  cost: 'Cost',
  requests: 'Requests',
  topModel: 'Top model',
  categoriesTitle: 'Breakdown',
  cacheHit: 'Cache-hit input',
  cacheMiss: 'Cache-miss input',
  output: 'Output',
  request: 'Requests',
  dailyTitle: 'Daily tokens',
  noticesTitle: 'Notices',
  noUsage: 'No usage configured',
}
