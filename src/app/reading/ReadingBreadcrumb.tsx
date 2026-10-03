import Link from 'next/link';
import { t } from '@/i18n';

export type Crumb = {
  href?: string;
  label: string;
};

export function ReadingBreadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav className="reading-crumb" aria-label={t.reading.breadcrumb.ariaLabel}>
      {items.map((item, i) => (
        <span key={`${item.label}-${i}`} className="reading-crumb-item">
          {i > 0 && <span className="reading-crumb-sep" aria-hidden="true">{'>'}</span>}
          {item.href
            ? <Link href={item.href} prefetch={false}>{item.label}</Link>
            : <span className="reading-crumb-current">{item.label}</span>}
        </span>
      ))}
    </nav>
  );
}
