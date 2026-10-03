import type { ReactNode } from 'react';

export interface ClayCardProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  raised?: boolean;
  id?: string;
  className?: string;
  children: ReactNode;
}

/** The single clay surface. Hierarchy comes from type scale and spacing; the surface only groups. */
export function ClayCard({
  title,
  subtitle,
  action,
  raised = false,
  id,
  className,
  children,
}: ClayCardProps) {
  const hasHead = title !== undefined || action !== undefined;
  return (
    <section
      id={id}
      className={['pn-clay-card', raised === true ? 'pn-clay-card-raised' : '', className ?? '']
        .filter((part) => part.length > 0)
        .join(' ')}
    >
      {hasHead ? (
        <div className="pn-card-head">
          <div>
            {title === undefined ? null : <h2 className="pn-card-title">{title}</h2>}
            {subtitle === undefined ? null : <p className="pn-card-sub">{subtitle}</p>}
          </div>
          {action ?? null}
        </div>
      ) : null}
      {children}
    </section>
  );
}