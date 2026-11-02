import { Button, MotionButton } from './button';
import { Tabs } from '@base-ui/react/tabs';
import { motion, useReducedMotion } from 'motion/react';
import { useId } from 'react';
import type { ReactNode } from 'react';

// Adapted from Skecher UI Apple Mail Tabs; source and changes in docs/skecher-ui.md.
interface AppleMailTabsProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  children: ReactNode;
  menu: {
    label: string;
    minimal?: boolean;
    tabs: readonly { value: T; label: string; icon: ReactNode }[];
  };
}

export function AppleMailTabs<T extends string>({
  value,
  onValueChange,
  children,
  menu,
}: AppleMailTabsProps<T>) {
  const { label, tabs, minimal = false } = menu;
  const reduceMotion = useReducedMotion();
  const id = useId();
  return (
    <Tabs.Root
      value={value}
      onValueChange={(next) => {
        const tab = tabs.find((item) => item.value === next);
        if (tab) {
          onValueChange(tab.value);
        }
      }}
      className={`skecher-tabs ${minimal ? 'minimal-tabs' : ''}`}
    >
      <Tabs.List activateOnFocus aria-label={label} className="skecher-tab-list">
        {tabs.map((tab) => (
          <Tabs.Tab
            key={tab.value}
            value={tab.value}
            className="skecher-tab"
            render={
              minimal ? (
                <Button />
              ) : (
                <MotionButton
                  initial={false}
                  animate={{ flexGrow: value === tab.value ? 1.35 : 1 }}
                  transition={
                    reduceMotion ? { duration: 0 } : { damping: 36, stiffness: 420, type: 'spring' }
                  }
                />
              )
            }
          >
            {!minimal && value === tab.value && (
              <motion.span
                layoutId={id}
                className="skecher-tab-pill"
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : { damping: 36, mass: 0.8, stiffness: 420, type: 'spring' }
                }
              />
            )}
            <motion.span layout={!minimal && !reduceMotion} className="skecher-tab-content">
              <span aria-hidden="true" className="skecher-tab-icon">
                {tab.icon}
              </span>
              {tab.label}
            </motion.span>
          </Tabs.Tab>
        ))}
      </Tabs.List>
      {children}
    </Tabs.Root>
  );
}
