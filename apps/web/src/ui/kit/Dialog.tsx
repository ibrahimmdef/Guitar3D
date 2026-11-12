import * as RD from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { IconButton } from './Button';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** dialog: centred card. sheet: tall panel from the right (bottom on phones). */
  variant?: 'dialog' | 'sheet';
  size?: 'sm' | 'md' | 'lg';
}

export function Dialog({ open, onOpenChange, title, description, children, footer, variant = 'dialog', size = 'md' }: Props) {
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal>
        <RD.Overlay className="overlay" />
        <RD.Content className={`dialog dialog-${variant} dialog-${size}`}>
          <header className="dialog-head">
            <div>
              <RD.Title className="dialog-title">{title}</RD.Title>
              {description ? <RD.Description className="dialog-desc">{description}</RD.Description> : <RD.Description className="sr-only">{title}</RD.Description>}
            </div>
            <RD.Close asChild>
              <IconButton label="Kapat" icon={<X size={18} />} tooltip={false} />
            </RD.Close>
          </header>
          <div className="dialog-body">{children}</div>
          {footer && <footer className="dialog-foot">{footer}</footer>}
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}

export const Sheet = (p: Omit<Props, 'variant'>) => <Dialog {...p} variant="sheet" />;
