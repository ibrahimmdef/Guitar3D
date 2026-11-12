import type { ReactNode } from 'react';

interface Props {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  tone?: 'neutral' | 'danger';
  compact?: boolean;
}

export function EmptyState({ icon, title, description, action, tone = 'neutral', compact }: Props) {
  return (
    <div className={`empty empty-${tone}${compact ? ' empty-compact' : ''}`} role={tone === 'danger' ? 'alert' : undefined}>
      {icon && <div className="empty-ic" aria-hidden>{icon}</div>}
      <p className="empty-title">{title}</p>
      {description && <p className="empty-desc">{description}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}
