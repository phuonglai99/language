/**
 * Site branding — the only place to change the site's name, tagline, description or logo.
 * Used by the root layout (tab title, SEO), the home header and the sidebar.
 */
export const siteConfig = {
  /** Full name: tab title and headers. */
  name: 'ice-bear is learning',
  /** Short name: logo alt text. */
  shortName: 'ice-bear',
  /** Small line under the name in the home header. */
  tagline: 'Học tiếng Trung',
  /** Meta description (search engines, link previews). */
  description: 'Học tiếng Trung cùng ice-bear 🐻',
  /** Logo and favicon, served from /public. */
  logo: '/icon.png',
} as const;

/**
 * The sidebar shows the name on two lines, split at the last space
 * ("ice-bear is" / "learning"); a one-word name stays on one line.
 */
export function siteNameLines(name: string = siteConfig.name): [string, string] {
  const i = name.lastIndexOf(' ');
  return i > 0 ? [name.slice(0, i), name.slice(i + 1)] : [name, ''];
}
