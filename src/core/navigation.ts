import {
  BookOpen,
  ClipboardList,
  LayoutGrid,
  Megaphone,
  Map as MapIcon,
  MoreHorizontal,
  Package,
  Settings2,
  Scale,
  ShieldCheck,
  Store,
  ShoppingCart,
  UserCircle2,
  Users,
  Building2,
  Film,
  type LucideIcon,
} from 'lucide-react';
import type { Locale } from '@/core/i18n';

/**
 * The navigation map, in one place — and as a tree.
 *
 * The 2026 redesign gave the platform seven branches, and every destination
 * now says which branch it grows on. That is the whole point of the change:
 * before it, items were sorted under three headings someone had to memorise
 * («العمل اليومي», «المنشأة والفريق», «إدارة المنصة»), and *today's work* sat
 * beside *my devices* under the same weight. A branch is a place a person can
 * name — السوق, المخزون, الصفقات, الدفاتر, المنشأة, حسابي, المنصة — and each
 * feature belongs to exactly one of them, with everything related to it on the
 * same branch.
 *
 * Every destination also carries its own `path`, and those paths are the same
 * strings the Flutter client routes on (`lib/core/paths.dart`). Two vocabularies
 * would mean a link written by one platform and read by the other, and the
 * address a person saves or sends is the one thing both must agree on.
 *
 * The old flat addresses are kept as [LEGACY_PATHS]: notices, mail and bookmarks
 * from before the tree still arrive, and the browser resolves each one to the
 * branch it now grows on rather than showing a page that answers nothing.
 *
 * `App.canOpenView` stays the single answer to "may this session open it" —
 * this file deliberately does not duplicate that rule, because a nav table that
 * carried its own copy of the permission logic would drift from the server's
 * again.
 */

export type NavBranch =
  | 'market'
  | 'inventory'
  | 'deals'
  | 'ledger'
  | 'org'
  | 'account'
  | 'platform';

/** The order the tree is walked: work outward from the market to the platform. */
export const BRANCH_ORDER: NavBranch[] = [
  'market',
  'inventory',
  'deals',
  'ledger',
  'org',
  'account',
  'platform',
];

export const BRANCH_LABELS: Record<NavBranch, Record<Locale, string>> = {
  market: { ar: 'السوق', en: 'Market' },
  inventory: { ar: 'المخزون', en: 'Inventory' },
  deals: { ar: 'الصفقات', en: 'Deals' },
  ledger: { ar: 'الدفاتر', en: 'Ledger' },
  org: { ar: 'المنشأة', en: 'Business' },
  account: { ar: 'حسابي', en: 'My account' },
  platform: { ar: 'المنصة', en: 'Platform' },
};

export interface NavItem {
  id: string;
  Icon: LucideIcon;
  label: Record<Locale, string>;
  /** Fits a bottom bar where the full name is a sentence. */
  short: Record<Locale, string>;
  /**
   * The address this destination is read from and written to, in the tree.
   *
   * A path, not a name generated from the id: `/deals/demands` says that the
   * demand board belongs to الصفقات, and a person who types the branch gets a
   * guess that lands somewhere sensible.
   */
  path: string;
  branch: NavBranch;
  /**
   * Whether the destination is worth a thumb on a phone. The strip under the
   * header shows everything; the bottom bar shows these, in this order, and
   * whatever the account is allowed to open.
   */
  mobilePriority?: number;
  /**
   * A destination that already has a place of its own in the chrome, and is
   * therefore not repeated as a tab.
   *
   * `profile` is the account, and on a wide screen the account is the chip
   * beside the brand: the same screen in the tab strip as well made three doors
   * to one room, and a person standing in front of three doors reasonably
   * assumes they open onto three different places. `org` and `members` belong
   * to that sheet for the same reason — they are about *whose* business this
   * session is, which is exactly what that sheet is for.
   */
  viaAccount?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  // —– السوق —––———————————————————————————————————————————————————————
  {
    id: 'marketplace',
    Icon: ShoppingCart,
    label: { ar: 'سوق الفرص والمخزون', en: 'Marketplace' },
    short: { ar: 'السوق', en: 'Market' },
    path: '/market',
    branch: 'market',
    mobilePriority: 1,
  },
  {
    id: 'maps',
    Icon: MapIcon,
    label: { ar: 'خريطة المستودعات واللوجستيات', en: 'Warehouse logistics map' },
    short: { ar: 'الخريطة', en: 'Map' },
    path: '/market/maps',
    branch: 'market',
    // Fourth rather than last: a guest can open the marketplace and the map and
    // nothing else, and a bottom bar with one destination is a decoration.
    mobilePriority: 4,
  },
  {
    id: 'commercial',
    Icon: Film,
    label: { ar: 'الفيديو الإعلاني (دقيقتان)', en: 'Commercial Ad (2 min)' },
    short: { ar: 'الإعلان', en: 'Commercial' },
    path: '/commercial',
    branch: 'market',
  },

  // —– المخزون —––—————————————————————————————————————————————————————
  {
    id: 'seller',
    Icon: Store,
    label: { ar: 'إدارة العروض والمستودعات', en: 'Offers & warehouses' },
    short: { ar: 'عروضي', en: 'Offers' },
    path: '/inventory',
    branch: 'inventory',
    mobilePriority: 2,
  },
  {
    id: 'catalog',
    Icon: Package,
    label: { ar: 'كتالوج الأصناف', en: 'Product catalog' },
    short: { ar: 'الكتالوج', en: 'Catalog' },
    path: '/inventory/catalog',
    branch: 'inventory',
  },

  // —– الصفقات —––—————————————————————————————————————————————————————
  {
    id: 'deals',
    Icon: ClipboardList,
    label: { ar: 'الصفقات وطلبات الشراء', en: 'Deals & purchase requests' },
    short: { ar: 'الصفقات', en: 'Deals' },
    path: '/deals',
    branch: 'deals',
    mobilePriority: 3,
  },
  {
    id: 'demands',
    Icon: Megaphone,
    label: { ar: 'طلبات الاحتياج (RFQ)', en: 'Demand board (RFQ)' },
    short: { ar: 'الاحتياج', en: 'Demands' },
    path: '/deals/demands',
    branch: 'deals',
  },
  {
    id: 'disputes',
    Icon: Scale,
    label: { ar: 'النزاعات والتحكيم', en: 'Disputes & arbitration' },
    short: { ar: 'النزاعات', en: 'Disputes' },
    path: '/deals/disputes',
    branch: 'deals',
  },

  // —– الدفاتر —––—————————————————————————————————————————————————————
  {
    id: 'ledger',
    Icon: BookOpen,
    label: { ar: 'دفتر الأستاذ والقيود', en: 'Ledger & journal entries' },
    short: { ar: 'الدفتر', en: 'Ledger' },
    path: '/ledger',
    branch: 'ledger',
  },

  // —– المنشأة —––—————————————————————————————————————————————————————
  {
    id: 'org',
    Icon: Building2,
    label: { ar: 'ملف المنشأة والسجل', en: 'Organization & legal record' },
    short: { ar: 'المنشأة', en: 'Business' },
    path: '/org',
    branch: 'org',
    viaAccount: true,
  },
  {
    id: 'members',
    Icon: Users,
    label: { ar: 'عضوية المنشأة', en: 'Organization members' },
    short: { ar: 'الأعضاء', en: 'Members' },
    path: '/org/members',
    branch: 'org',
    viaAccount: true,
  },

  // —– حسابي —––———————————————————————————————————————————————————————
  {
    id: 'profile',
    Icon: UserCircle2,
    label: { ar: 'حسابي: ملفي وأجهزتي ودعمي', en: 'Account: profile, devices, support' },
    short: { ar: 'حسابي', en: 'Account' },
    path: '/account',
    branch: 'account',
    // Fifth on a phone: with no brand chip in reach of a thumb, the account
    // needs its own cell — and every session may open its own profile, so this
    // cell is never a door the server would shut.
    mobilePriority: 5,
  },
  // —– المنصة —––——————————————————————————————————————————————————————
  {
    id: 'admin',
    Icon: ShieldCheck,
    label: { ar: 'لوحة قرارات المنصة', en: 'Platform decisions' },
    short: { ar: 'القرارات', en: 'Decisions' },
    path: '/platform',
    branch: 'platform',
  },
  {
    id: 'config',
    Icon: Settings2,
    label: { ar: 'إعدادات المنصة والقدرات', en: 'Platform settings' },
    short: { ar: 'الإعدادات', en: 'Settings' },
    path: '/platform/config',
    branch: 'platform',
  },
];

/**
 * The flat addresses of the previous build, each to its branch.
 *
 * The tree renamed ten of them, and a renamed address is a broken link for
 * everyone who saved one. `resolveLocation` answers these before anything else
 * reads the URL, so an old bookmark opens the same screen it always did rather
 * than the market with a shrug.
 */
export const LEGACY_PATHS: Record<string, string> = {
  '/marketplace': '/market',
  '/seller': '/inventory',
  '/catalog': '/inventory/catalog',
  '/demands': '/deals/demands',
  '/disputes': '/deals/disputes',
  '/maps': '/market/maps',
  '/members': '/org/members',
  '/profile': '/account',
  // The support desk on the web is a panel inside the account screen, not a
  // screen of its own yet — so the old address lands where the desk actually
  // lives rather than on a page this build does not have.
  '/support': '/account',
  '/admin': '/platform',
  '/config': '/platform/config',
  // `/nearby` was folded into the market's own search; nothing else answers it.
  '/nearby': '/market',
  '/promo': '/commercial',
};

/** The market is the front door: the site root and an unknown address both go there. */
export const DEFAULT_VIEW = 'marketplace';

export function navItem(id: string): NavItem | undefined {
  return NAV_ITEMS.find((item) => item.id === id);
}

export function navLabel(id: string, locale: Locale, fallback: string): string {
  return navItem(id)?.label[locale] ?? fallback;
}

/** The address a view id is read from and written to. */
export function pathForView(id: string): string {
  return navItem(id)?.path ?? '/';
}

/** The view an address names, or `null` when it names nothing in the tree. */
export function viewForPath(location: string): string | null {
  const pathname = stripQuery(location);
  const match = NAV_ITEMS.find((item) => item.path === pathname);
  if (match) return match.id;
  const rerouted = LEGACY_PATHS[pathname];
  return rerouted ? viewForPath(rerouted) : null;
}

/**
 * The canonical address for a location the browser was handed.
 *
 * Returns the path *without* its query, so a caller can re-attach whatever it
 * was carrying: `/demands?deal=4` from an old notice becomes
 * `/deals/demands?deal=4`, and the parameter a screen reads survives the rename
 * that moved the screen.
 */
export function resolveLocation(location: string): { path: string; query: string } {
  const pathname = stripQuery(location);
  const query = location.slice(pathname.length);
  const known = NAV_ITEMS.some((item) => item.path === pathname);
  return {
    path: known ? pathname : (LEGACY_PATHS[pathname] ?? '/'),
    query,
  };
}

function stripQuery(location: string): string {
  const cut = location.search(/[?#]/);
  return cut === -1 ? location : location.slice(0, cut);
}

/**
 * Whether a location names a screen at all.
 *
 * The browser writes the URL before the view renders, so a stray address bar
 * entry (`/market/today`) has to be recognised as *not* a destination rather
 * than rendered as a blank main panel.
 */
export function isKnownLocation(location: string): boolean {
  return viewForPath(location) !== null;
}

export interface BranchNav {
  branch: NavBranch;
  /** The screen a branch opens onto — what its button names. */
  landing: NavItem;
  /** The rest of the branch, shown only while the person is standing in it. */
  children: NavItem[];
}

/**
 * The tree, as the chrome reads it.
 *
 * The wide strip used to print every destination at the same weight — ten
 * buttons in a row, with «الاحتياج» beside «الصفقات» and «الإعدادات» beside
 * «حسابي» — which asked a person to learn ten names before they could use four.
 * This walks the seven branches instead, and each branch offers one door: the
 * screen it opens onto. Its other destinations appear under it, and only while
 * the branch is the one on screen, because a sub-item is a question about the
 * room you are in, not a room of its own.
 *
 * A branch nobody in this session may open is not printed at all — the same
 * rule that kept a refused tab off the old strip, applied one level up.
 */
export function branchNav(canOpen: (view: string) => boolean): BranchNav[] {
  const sections: BranchNav[] = [];

  for (const branch of BRANCH_ORDER) {
    const openable = NAV_ITEMS.filter(
      (item) => item.branch === branch && canOpen(item.id)
    );
    if (openable.length === 0) continue;

    const ordered = [...openable].sort((a, b) => {
      const byPriority =
        (a.mobilePriority ?? 99) - (b.mobilePriority ?? 99);
      return byPriority !== 0 ? byPriority : NAV_ITEMS.indexOf(a) - NAV_ITEMS.indexOf(b);
    });

    const [landing, ...children] = ordered;
    sections.push({ branch, landing, children });
  }

  return sections;
}

/** Tabs a screen chrome may offer: everything that is not the account's own. */
export const TAB_ITEMS: NavItem[] = NAV_ITEMS.filter((item) => !item.viaAccount);

/** The account-sheet destinations, in the order the sheet shows them. */
export const ACCOUNT_DESTINATIONS: NavItem[] = NAV_ITEMS.filter(
  (item) => item.viaAccount
);

/** The overflow control's own icon, exported so both bars share it. */
export const MORE_ICON: LucideIcon = MoreHorizontal;

export const MORE_LABEL: Record<Locale, string> = {
  ar: 'المزيد',
  en: 'More',
};

/**
 * The cells of a phone's bottom bar: the market always, the account always,
 * then the highest-priority destinations this account may actually open — five
 * at most.
 *
 * The same rule the Flutter client applies (`core/nav.dart`), including the
 * number, because a bar that means four cells on one platform and five on the
 * other is two products again. `profile` bypasses the permission check: every
 * signed-in session may open its own account, so the cell is never a door the
 * server would shut, and a thumb that has to hunt through a sheet for «حسابي»
 * is the reason the sheet exists being asked to be a drawer.
 */
export function mobilePrimaryNav(canOpen: (view: string) => boolean): NavItem[] {
  const ordered = NAV_ITEMS.filter(
    (item) => !item.viaAccount && item.mobilePriority !== undefined
  ).sort((a, b) => (a.mobilePriority ?? 99) - (b.mobilePriority ?? 99));

  const picked: NavItem[] = [];
  for (const item of ordered) {
    if (item.id === 'marketplace') {
      picked.push(item);
      continue;
    }
    if (picked.length >= 5) break;
    if (item.id === 'profile' || canOpen(item.id)) picked.push(item);
  }

  return picked;
}

/**
 * Everything the account may open that is not already in the bar, grouped under
 * the branch headings the sheet prints.
 */
export function mobileOverflowNav(
  canOpen: (view: string) => boolean,
  exceptIds: string[]
): NavItem[] {
  return TAB_ITEMS.filter((item) => !exceptIds.includes(item.id) && canOpen(item.id));
}

export interface BranchSection {
  branch: NavBranch;
  items: NavItem[];
}

/** Table order, then the order the headings are printed in. */
export function groupNav(items: NavItem[]): BranchSection[] {
  return BRANCH_ORDER.map((branch) => ({ branch, items: items.filter((item) => item.branch === branch) })).filter(
    (section) => section.items.length > 0
  );
}

/** Rendered as a small grid icon when a destination has no entry of its own. */
export const NAV_GRID_ICON: LucideIcon = LayoutGrid;
