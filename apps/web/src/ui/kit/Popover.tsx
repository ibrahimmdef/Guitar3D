import * as RP from '@radix-ui/react-popover';
import type { ReactNode } from 'react';

interface Props {
  trigger: ReactNode;
  children: ReactNode;
  label: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
}

export function Popover({ trigger, children, label, side = 'top', align = 'center', open, onOpenChange }: Props) {
  return (
    <RP.Root open={open} onOpenChange={onOpenChange}>
      <RP.Trigger asChild>{trigger}</RP.Trigger>
      <RP.Portal>
        <RP.Content className="popover" side={side} align={align} sideOffset={10} collisionPadding={12} aria-label={label}>
          {children}
        </RP.Content>
      </RP.Portal>
    </RP.Root>
  );
}
