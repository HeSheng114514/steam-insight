// 全项目共享的常量表

/** Steam 商店接受 cc 参数，返回该区域的价格。ar/tr 自 2023-11 起已改为美元计价。 */
export const REGION_PRESETS = [
  { cc: 'cn', label: '国区' },
  { cc: 'us', label: '美区' },
  { cc: 'ar', label: '阿根廷' },
  { cc: 'tr', label: '土耳其' },
  { cc: 'ru', label: '俄区' },
  { cc: 'in', label: '印度' },
  { cc: 'br', label: '巴西' },
  { cc: 'hk', label: '港区' },
  { cc: 'jp', label: '日区' },
  { cc: 'gb', label: '英区' },
  { cc: 'de', label: '德区' },
];

export const DEFAULT_REGIONS = ['cn', 'us', 'ar', 'tr', 'ru', 'in', 'br'];

/** appdetails.categories 里代表"家庭共享"的 id（等价于商店页侧栏 category2=62） */
export const FAMILY_SHARING_CATEGORY_ID = 62;

/** ajaxgetdeckappcompatibilityreport 的 resolved_category 取值 */
export const DECK_CATEGORY_LABEL = {
  0: '未知',
  1: '不支持',
  2: '可玩',
  3: '已验证',
};

/** Deck 检查项的 loc_token → 中文 */
export const DECK_TOKEN_LABEL = {
  '#SteamDeckVerified_TestResult_DefaultControllerConfigFullyFunctional': '默认控制器配置完全可用',
  '#SteamDeckVerified_TestResult_ControllerGlyphsMatchDeckDevice': '控制器图标与 Deck 一致',
  '#SteamDeckVerified_TestResult_InterfaceTextIsLegible': '界面文字清晰可读',
  '#SteamDeckVerified_TestResult_DefaultConfigurationIsPerformant': '默认配置性能达标',
  '#SteamDeckVerified_TestResult_ExternalControllersNotSupportedPrimaryPlayer': '主玩家不支持外接控制器',
  '#SteamDeckPlayable_TestResult_InterfaceTextIsNotLegible': '界面文字偏小',
  '#SteamDeckPlayable_TestResult_DefaultControllerConfigNotFullyFunctional': '默认控制器配置未完全可用',
  '#SteamDeckPlayable_TestResult_ControllerGlyphsDoNotMatchDeckDevice': '控制器图标与 Deck 不一致',
  '#SteamDeckPlayable_TestResult_DefaultConfigurationIsNotPerformant': '默认配置性能不足',
  '#SteamDeckUnsupported_TestResult_GameStartupNotFunctional': '无法正常启动',
  '#SteamDeckUnsupported_TestResult_GameStartupFunctional': '可以启动',
  '#SteamOS_TestResult_GameStartupFunctional': 'SteamOS 下可启动',
  '#SteamOS_TestResult_GameStartupNotFunctional': 'SteamOS 下无法启动',
  '#SteamMachine_TestResult_DefaultControllerConfigFullyFunctional': '默认控制器配置完全可用',
  '#SteamMachine_TestResult_ControllerGlyphsMatchDevice': '控制器图标一致',
  '#SteamMachine_TestResult_DefaultConfigurationIsPerformant': '默认配置性能达标',
};

/** ProtonDB tier → 中文 */
export const PROTON_TIER_LABEL = {
  platinum: '白金',
  gold: '黄金',
  silver: '白银',
  bronze: '青铜',
  borked: '无法运行',
  pending: '待定',
};

/**
 * 在 Windows 上会加载内核驱动、或与内核级组件绑定的反作弊。
 * 只收录公开资料里能确认属于内核级/驱动级的，避免误标。
 */
export const KERNEL_LEVEL_ANTICHEATS = [
  'Easy Anti-Cheat',
  'BattlEye',
  'Vanguard',
  'Riot Vanguard',
  'Ricochet',
  'Denuvo Anti-Cheat',
  'EA anticheat',
  'XIGNCODE3',
  'nProtect GameGuard',
  'Anti-Cheat Expert',
  'NEAC Protect',
  'Uncheater',
  'X-Trap',
  'R6 ShieldGuard',
];

/** AreWeAntiCheatYet 的 status → 中文 */
export const AWACY_STATUS_LABEL = {
  Supported: '官方支持',
  Running: '可运行',
  Broken: '不可用',
  Denied: '开发者拒绝',
  Planned: '计划支持',
  Unknown: '未知',
};

/** 需要在启动时打开第三方启动器/平台的关键词（按 Steam 商店页 DRM/EULA 文案匹配） */
export const LAUNCHER_KEYWORDS = [
  { match: /ubisoft\s*connect|uplay/i, label: 'Ubisoft Connect' },
  { match: /\bea\s*app\b|\borigin\b/i, label: 'EA app' },
  { match: /rockstar|social\s*club/i, label: 'Rockstar Games Launcher' },
  { match: /2k\s*launcher/i, label: '2K Launcher' },
  { match: /bethesda\.net/i, label: 'Bethesda.net Launcher' },
  { match: /paradox\s*launcher/i, label: 'Paradox Launcher' },
  { match: /epic\s*online\s*services/i, label: 'Epic Online Services' },
  { match: /xbox\s*live|microsoft\s*account|xbox\s*network/i, label: 'Xbox / Microsoft 账户' },
  { match: /kalypso/i, label: 'Kalypso Launcher' },
  { match: /gamersgate|iGames/i, label: '第三方启动器' },
  { match: /third[- ]party\s*account|第三方账户|第三方帐号/i, label: '第三方账户' },
];

/** Denuvo（D 加密）识别 */
export const DENUVO_PATTERN = /denuvo/i;

/** 缓存 TTL（毫秒） */
export const TTL = {
  /** 抓取失败时的短 TTL——避免一次网络抖动被当成"没有这个数据"缓存很久 */
  fail: 10 * 60 * 1000,
  appDetails: 12 * 60 * 60 * 1000,
  deck: 7 * 24 * 60 * 60 * 1000,
  storePageHtml: 24 * 60 * 60 * 1000,
  proton: 24 * 60 * 60 * 1000,
  hltb: 7 * 24 * 60 * 60 * 1000,
  awacyIndex: 24 * 60 * 60 * 1000,
  xgpIndex: 12 * 60 * 60 * 1000,
  familyLibrary: 15 * 60 * 1000,
  priceRegions: 6 * 60 * 60 * 1000,
};

/** 默认设置 */
export const DEFAULT_SETTINGS = {
  enabled: true,
  showOnDetailPage: true,
  showOnListPages: true,
  listDenuvoLookup: true,
  regions: DEFAULT_REGIONS,
  fetchXgp: true,
  fetchProton: true,
  fetchAnticheat: true,
  fetchHltb: true,
  fetchFamilyGroup: true,
  storeLanguage: 'schinese',
  panelCollapsed: false,
};
