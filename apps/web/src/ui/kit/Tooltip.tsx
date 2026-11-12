import * as RT from '@radix-ui/react-tooltip';
import type { ReactNode } from 'react';
import { Kbd } from './Kbd';

export const TooltipProvider = ({ children }: { children: ReactNode }) => (
  <RT.Provider delayDuration={450} skipDelayDuration={200}>{children}</RT.Provider>
);

interface Props {
  content: ReactNode;
  shortcut?: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  children: ReactNode;
}

/** Wraps a single focusable child. Shows on hover and keyboard focus. */
export function Tooltip({ content, shortcut, side = 'top', children }: Props) {
  return (
    <RT.Root>
      <RT.Trigger asChild>{children}</RT.Trigger>
      <RT.Portal>
        <RT.Content className="tooltip" side={side} sideOffset={6} collisionPadding={8}>
          {content}
          {shortcut && <Kbd>{shortcut}</Kbd>}
        </RT.Content>
      </RT.Portal>
    </RT.Root>
  );
}
