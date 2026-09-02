/** Accessible tabs (Radix), styled as an underlined tab bar. */
import * as RadixTabs from '@radix-ui/react-tabs';
import { cn } from '../../lib/utils.js';

/**
 * @param {Array<{value:string,label:string,testId?:string,count?:number}>} tabs
 */
export function Tabs({ tabs, value, onValueChange, children, className, listClassName }) {
  return (
    <RadixTabs.Root value={value} onValueChange={onValueChange} className={className}>
      <RadixTabs.List
        className={cn(
          // Scrolls rather than wrapping on narrow screens.
          'flex gap-1 overflow-x-auto border-b border-slate-200 scrollbar-thin',
          listClassName
        )}
      >
        {tabs.map((tab) => (
          <RadixTabs.Trigger
            key={tab.value}
            value={tab.value}
            data-testid={tab.testId}
            className={cn(
              'relative whitespace-nowrap border-b-2 border-transparent px-3 py-2.5 text-sm font-medium text-slate-500 transition',
              'hover:text-slate-800',
              'data-[state=active]:border-brand-400 data-[state=active]:text-brand-300'
            )}
          >
            {tab.label}
            {typeof tab.count === 'number' ? (
              <span className="ml-1.5 rounded-full bg-white/10 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">
                {tab.count}
              </span>
            ) : null}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      {children}
    </RadixTabs.Root>
  );
}

export const TabPanel = ({ value, children, className }) => (
  <RadixTabs.Content value={value} className={cn('pt-4 focus:outline-none', className)}>
    {children}
  </RadixTabs.Content>
);

export default Tabs;
