import { AnimatePresence, motion, useIsPresent, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';

function PanelContent({ children }: { children: ReactNode }) {
  const present = useIsPresent();
  return <div inert={!present} aria-hidden={!present || undefined}>{children}</div>;
}

// Adapted from Skecher UI Sliding Panel; let content determine panel height.
export function SlidingPanel({ activeKey, direction, children }: { activeKey: string; direction: -1 | 1; children: ReactNode }) {
  const reduceMotion = useReducedMotion();
  return <div className="skecher-sliding-panel" data-slot="sliding-panel">
    <AnimatePresence initial={false} custom={direction} mode="popLayout">
      <motion.div key={activeKey} custom={direction} initial="initial" animate="animate" exit="exit"
        variants={{
          initial: (next: number) => ({ opacity: reduceMotion ? 1 : 0, x: reduceMotion ? 0 : next * 24 }),
          animate: { opacity: 1, x: 0 },
          exit: (next: number) => ({ opacity: 0, x: reduceMotion ? 0 : next * -24, pointerEvents: 'none' }),
        }} transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.23, 1, 0.32, 1] }}>
        <PanelContent>{children}</PanelContent>
      </motion.div>
    </AnimatePresence>
  </div>;
}
