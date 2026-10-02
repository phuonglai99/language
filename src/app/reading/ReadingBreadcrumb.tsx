import Link from 'next/link';

export type Crumb = {
  href?: string;
  label: string;
};

export function ReadingBreadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav className="reading-crumb" aria-label="Đường dẫn">
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
