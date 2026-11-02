import { AnimatePresence, motion, useIsPresent, useReducedMotion } from 'motion/react';
import { type ReactNode, useEffect, useRef } from 'react';

function PanelContent({ children }: { children: ReactNode }) {
  const present = useIsPresent();
  return (
    <div inert={!present} aria-hidden={!present || undefined}>
      {children}
    </div>
  );
}

// Adapted from Skecher UI Sliding Panel; let content determine panel height.
export function SlidingPanel({
  activeKey,
  direction,
  children,
}: {
  activeKey: string;
  direction: -1 | 1;
  children: ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  const keyboard = useRef(false);
  useEffect(() => {
    const onKey = () => {
      keyboard.current = true;
    };
    const onPointer = () => {
      keyboard.current = false;
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onPointer, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onPointer, true);
    };
  }, []);
  return (
    <div className="skecher-sliding-panel" data-slot="sliding-panel">
      <AnimatePresence initial={false} custom={direction} mode="popLayout">
        <motion.div
          key={activeKey}
          custom={direction}
          initial="initial"
          animate="animate"
          exit="exit"
          variants={{
            initial: (next: number) => ({
              opacity: 0,
              transform: reduceMotion ? 'none' : `translateX(${next * 12}px)`,
            }),
            animate: { opacity: 1, transform: 'translateX(0px)' },
            exit: (next: number) => ({
              opacity: 0,
              transform: reduceMotion ? 'none' : `translateX(${next * -12}px)`,
              pointerEvents: 'none',
            }),
          }}
          transition={{
            duration: keyboard.current ? 0 : reduceMotion ? 0.12 : 0.18,
            ease: [0.23, 1, 0.32, 1],
          }}
        >
          <PanelContent>{children}</PanelContent>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
