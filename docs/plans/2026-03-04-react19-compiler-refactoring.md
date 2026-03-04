# React 19 + React Compiler Refactoring Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove manual memoization (forwardRef, memo, useCallback, useMemo) from the UI project so the React Compiler can fully manage optimization automatically.

**Architecture:** React Compiler (`babel-plugin-react-compiler 1.0.0`) is already active in `vite.config.ts`. All manual memoization wrappers (forwardRef, memo, useCallback, useMemo) are redundant and add code noise. React 19 supports `ref` as a regular prop, making `forwardRef` unnecessary.

**Tech Stack:** React 19.2.4, babel-plugin-react-compiler 1.0.0, Vite 7, TypeScript, shadcn/ui (Radix UI)

---

### Task 1: Refactor shadcn/ui button.tsx — remove forwardRef

**Files:**
- Modify: `apps/ui/src/components/ui/button.tsx`

**Step 1: Replace forwardRef with ref prop pattern**

```tsx
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow hover:bg-primary/90',
        destructive:
          'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
        outline:
          'border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground',
        secondary:
          'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-10 rounded-md px-8',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  ref?: React.Ref<HTMLButtonElement>;
}

function Button({
  className,
  variant,
  size,
  asChild = false,
  ref,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props}
    />
  );
}

export { Button, buttonVariants };
```

**Step 2: Verify build**

Run: `cd apps/ui && npx tsc --noEmit`
Expected: No type errors

**Step 3: Commit**

```bash
git add apps/ui/src/components/ui/button.tsx
git commit -m "refactor(ui): remove forwardRef from Button component

React 19 supports ref as a regular prop. Remove forwardRef wrapper
and displayName (named function makes it unnecessary)."
```

---

### Task 2: Refactor shadcn/ui input.tsx — remove forwardRef

**Files:**
- Modify: `apps/ui/src/components/ui/input.tsx`

**Step 1: Replace forwardRef with ref prop pattern**

```tsx
import * as React from 'react';

import { cn } from '@/lib/utils';

function Input({
  className,
  type,
  ref,
  ...props
}: React.ComponentProps<'input'> & { ref?: React.Ref<HTMLInputElement> }) {
  return (
    <input
      type={type}
      className={cn(
        'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        className,
      )}
      ref={ref}
      {...props}
    />
  );
}

export { Input };
```

**Step 2: Verify build**

Run: `cd apps/ui && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add apps/ui/src/components/ui/input.tsx
git commit -m "refactor(ui): remove forwardRef from Input component"
```

---

### Task 3: Refactor shadcn/ui card.tsx — remove forwardRef from all 6 components

**Files:**
- Modify: `apps/ui/src/components/ui/card.tsx`

**Step 1: Rewrite all card components**

```tsx
import * as React from 'react';

import { cn } from '@/lib/utils';

function Card({
  className,
  ref,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { ref?: React.Ref<HTMLDivElement> }) {
  return (
    <div
      ref={ref}
      className={cn(
        'rounded-xl border border-border bg-card text-card-foreground shadow',
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({
  className,
  ref,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { ref?: React.Ref<HTMLDivElement> }) {
  return (
    <div
      ref={ref}
      className={cn('flex flex-col space-y-1.5 p-6', className)}
      {...props}
    />
  );
}

function CardTitle({
  className,
  ref,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { ref?: React.Ref<HTMLDivElement> }) {
  return (
    <div
      ref={ref}
      className={cn('font-semibold leading-none tracking-tight', className)}
      {...props}
    />
  );
}

function CardDescription({
  className,
  ref,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { ref?: React.Ref<HTMLDivElement> }) {
  return (
    <div
      ref={ref}
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

function CardContent({
  className,
  ref,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { ref?: React.Ref<HTMLDivElement> }) {
  return <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />;
}

function CardFooter({
  className,
  ref,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { ref?: React.Ref<HTMLDivElement> }) {
  return (
    <div
      ref={ref}
      className={cn('flex items-center p-6 pt-0', className)}
      {...props}
    />
  );
}

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
```

**Step 2: Verify build**

Run: `cd apps/ui && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add apps/ui/src/components/ui/card.tsx
git commit -m "refactor(ui): remove forwardRef from Card components"
```

---

### Task 4: Refactor shadcn/ui label.tsx — remove forwardRef

**Files:**
- Modify: `apps/ui/src/components/ui/label.tsx`

**Step 1: Replace forwardRef with ref prop pattern**

```tsx
import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const labelVariants = cva(
  'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
);

function Label({
  className,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> &
  VariantProps<typeof labelVariants> & {
    ref?: React.Ref<React.ComponentRef<typeof LabelPrimitive.Root>>;
  }) {
  return (
    <LabelPrimitive.Root
      ref={ref}
      className={cn(labelVariants(), className)}
      {...props}
    />
  );
}

export { Label };
```

**Step 2: Verify build**

Run: `cd apps/ui && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add apps/ui/src/components/ui/label.tsx
git commit -m "refactor(ui): remove forwardRef from Label component"
```

---

### Task 5: Refactor shadcn/ui select.tsx — remove forwardRef from all 7 components

**Files:**
- Modify: `apps/ui/src/components/ui/select.tsx`

**Step 1: Rewrite all select components**

```tsx
import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';

import { cn } from '@/lib/utils';

const Select = SelectPrimitive.Root;

const SelectGroup = SelectPrimitive.Group;

const SelectValue = SelectPrimitive.Value;

function SelectTrigger({
  className,
  children,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger> & {
  ref?: React.Ref<React.ComponentRef<typeof SelectPrimitive.Trigger>>;
}) {
  return (
    <SelectPrimitive.Trigger
      ref={ref}
      className={cn(
        'flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1',
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown className="h-4 w-4 opacity-50" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

function SelectScrollUpButton({
  className,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton> & {
  ref?: React.Ref<React.ComponentRef<typeof SelectPrimitive.ScrollUpButton>>;
}) {
  return (
    <SelectPrimitive.ScrollUpButton
      ref={ref}
      className={cn(
        'flex cursor-default items-center justify-center py-1',
        className,
      )}
      {...props}
    >
      <ChevronUp className="h-4 w-4" />
    </SelectPrimitive.ScrollUpButton>
  );
}

function SelectScrollDownButton({
  className,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton> & {
  ref?: React.Ref<
    React.ComponentRef<typeof SelectPrimitive.ScrollDownButton>
  >;
}) {
  return (
    <SelectPrimitive.ScrollDownButton
      ref={ref}
      className={cn(
        'flex cursor-default items-center justify-center py-1',
        className,
      )}
      {...props}
    >
      <ChevronDown className="h-4 w-4" />
    </SelectPrimitive.ScrollDownButton>
  );
}

function SelectContent({
  className,
  children,
  position = 'popper',
  ref,
  ...props
}: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content> & {
  ref?: React.Ref<React.ComponentRef<typeof SelectPrimitive.Content>>;
}) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        ref={ref}
        className={cn(
          'relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-md border border-border bg-card text-card-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
          position === 'popper' &&
            'data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1',
          className,
        )}
        position={position}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport
          className={cn(
            'p-1',
            position === 'popper' &&
              'h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]',
          )}
        >
          {children}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

function SelectLabel({
  className,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label> & {
  ref?: React.Ref<React.ComponentRef<typeof SelectPrimitive.Label>>;
}) {
  return (
    <SelectPrimitive.Label
      ref={ref}
      className={cn('px-2 py-1.5 text-sm font-semibold', className)}
      {...props}
    />
  );
}

function SelectItem({
  className,
  children,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item> & {
  ref?: React.Ref<React.ComponentRef<typeof SelectPrimitive.Item>>;
}) {
  return (
    <SelectPrimitive.Item
      ref={ref}
      className={cn(
        'relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    >
      <span className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="h-4 w-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

function SelectSeparator({
  className,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator> & {
  ref?: React.Ref<React.ComponentRef<typeof SelectPrimitive.Separator>>;
}) {
  return (
    <SelectPrimitive.Separator
      ref={ref}
      className={cn('-mx-1 my-1 h-px bg-muted', className)}
      {...props}
    />
  );
}

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
};
```

**Step 2: Verify build**

Run: `cd apps/ui && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add apps/ui/src/components/ui/select.tsx
git commit -m "refactor(ui): remove forwardRef from Select components"
```

---

### Task 6: Refactor shadcn/ui sheet.tsx — remove forwardRef from 4 components

**Files:**
- Modify: `apps/ui/src/components/ui/sheet.tsx`

**Step 1: Rewrite sheet components**

```tsx
import * as React from 'react';
import * as SheetPrimitive from '@radix-ui/react-dialog';
import { cva, type VariantProps } from 'class-variance-authority';
import { X } from 'lucide-react';

import { cn } from '@/lib/utils';

const Sheet = SheetPrimitive.Root;

const SheetTrigger = SheetPrimitive.Trigger;

const SheetClose = SheetPrimitive.Close;

const SheetPortal = SheetPrimitive.Portal;

function SheetOverlay({
  className,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay> & {
  ref?: React.Ref<React.ComponentRef<typeof SheetPrimitive.Overlay>>;
}) {
  return (
    <SheetPrimitive.Overlay
      className={cn(
        'fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        className,
      )}
      {...props}
      ref={ref}
    />
  );
}

const sheetVariants = cva(
  'fixed z-50 gap-4 bg-background shadow-lg transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:duration-500',
  {
    variants: {
      side: {
        top: 'inset-x-0 top-0 border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top',
        bottom:
          'inset-x-0 bottom-0 border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
        left: 'inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm',
        right:
          'inset-y-0 right-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm',
      },
    },
    defaultVariants: {
      side: 'right',
    },
  },
);

interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {
  ref?: React.Ref<React.ComponentRef<typeof SheetPrimitive.Content>>;
}

function SheetContent({
  side = 'right',
  className,
  children,
  ref,
  ...props
}: SheetContentProps) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        ref={ref}
        className={cn(sheetVariants({ side }), className)}
        {...props}
      >
        <SheetPrimitive.Close className="absolute right-3 top-2.5 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-secondary">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </SheetPrimitive.Close>
        {children}
      </SheetPrimitive.Content>
    </SheetPortal>
  );
}

function SheetHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex flex-col space-y-2 text-center sm:text-left',
        className,
      )}
      {...props}
    />
  );
}

function SheetFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2',
        className,
      )}
      {...props}
    />
  );
}

function SheetTitle({
  className,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title> & {
  ref?: React.Ref<React.ComponentRef<typeof SheetPrimitive.Title>>;
}) {
  return (
    <SheetPrimitive.Title
      ref={ref}
      className={cn('text-lg font-semibold text-foreground', className)}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description> & {
  ref?: React.Ref<React.ComponentRef<typeof SheetPrimitive.Description>>;
}) {
  return (
    <SheetPrimitive.Description
      ref={ref}
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
```

**Step 2: Verify build**

Run: `cd apps/ui && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add apps/ui/src/components/ui/sheet.tsx
git commit -m "refactor(ui): remove forwardRef from Sheet components"
```

---

### Task 7: Refactor shadcn/ui table.tsx — remove forwardRef from all 8 components

**Files:**
- Modify: `apps/ui/src/components/ui/table.tsx`

**Step 1: Rewrite all table components**

```tsx
import * as React from 'react';

import { cn } from '@/lib/utils';

function Table({
  className,
  ref,
  ...props
}: React.HTMLAttributes<HTMLTableElement> & {
  ref?: React.Ref<HTMLTableElement>;
}) {
  return (
    <div className="relative w-full overflow-auto">
      <table
        ref={ref}
        className={cn('w-full caption-bottom text-sm', className)}
        {...props}
      />
    </div>
  );
}

function TableHeader({
  className,
  ref,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement> & {
  ref?: React.Ref<HTMLTableSectionElement>;
}) {
  return (
    <thead ref={ref} className={cn('[&_tr]:border-b', className)} {...props} />
  );
}

function TableBody({
  className,
  ref,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement> & {
  ref?: React.Ref<HTMLTableSectionElement>;
}) {
  return (
    <tbody
      ref={ref}
      className={cn('[&_tr:last-child]:border-0', className)}
      {...props}
    />
  );
}

function TableFooter({
  className,
  ref,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement> & {
  ref?: React.Ref<HTMLTableSectionElement>;
}) {
  return (
    <tfoot
      ref={ref}
      className={cn(
        'border-t bg-muted/50 font-medium [&>tr]:last:border-b-0',
        className,
      )}
      {...props}
    />
  );
}

function TableRow({
  className,
  ref,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement> & {
  ref?: React.Ref<HTMLTableRowElement>;
}) {
  return (
    <tr
      ref={ref}
      className={cn(
        'border-b border-border transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted',
        className,
      )}
      {...props}
    />
  );
}

function TableHead({
  className,
  ref,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement> & {
  ref?: React.Ref<HTMLTableCellElement>;
}) {
  return (
    <th
      ref={ref}
      className={cn(
        'h-10 px-2 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
        className,
      )}
      {...props}
    />
  );
}

function TableCell({
  className,
  ref,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement> & {
  ref?: React.Ref<HTMLTableCellElement>;
}) {
  return (
    <td
      ref={ref}
      className={cn(
        'p-2 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
        className,
      )}
      {...props}
    />
  );
}

function TableCaption({
  className,
  ref,
  ...props
}: React.HTMLAttributes<HTMLTableCaptionElement> & {
  ref?: React.Ref<HTMLTableCaptionElement>;
}) {
  return (
    <caption
      ref={ref}
      className={cn('mt-4 text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
};
```

**Step 2: Verify build**

Run: `cd apps/ui && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add apps/ui/src/components/ui/table.tsx
git commit -m "refactor(ui): remove forwardRef from Table components"
```

---

### Task 8: Refactor shadcn/ui scroll-area.tsx — remove forwardRef from 2 components

**Files:**
- Modify: `apps/ui/src/components/ui/scroll-area.tsx`

**Step 1: Rewrite scroll area components**

```tsx
import * as React from 'react';
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area';

import { cn } from '@/lib/utils';

function ScrollArea({
  className,
  children,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root> & {
  ref?: React.Ref<React.ComponentRef<typeof ScrollAreaPrimitive.Root>>;
}) {
  return (
    <ScrollAreaPrimitive.Root
      ref={ref}
      className={cn('relative overflow-hidden', className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport className="h-full w-full rounded-[inherit]">
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}

function ScrollBar({
  className,
  orientation = 'vertical',
  ref,
  ...props
}: React.ComponentPropsWithoutRef<
  typeof ScrollAreaPrimitive.ScrollAreaScrollbar
> & {
  ref?: React.Ref<
    React.ComponentRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
  >;
}) {
  return (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
      ref={ref}
      orientation={orientation}
      className={cn(
        'flex touch-none select-none transition-colors',
        orientation === 'vertical' &&
          'h-full w-2.5 border-l border-l-transparent p-[1px]',
        orientation === 'horizontal' &&
          'h-2.5 flex-col border-t border-t-transparent p-[1px]',
        className,
      )}
      {...props}
    >
      <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-border" />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  );
}

export { ScrollArea, ScrollBar };
```

**Step 2: Verify build**

Run: `cd apps/ui && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add apps/ui/src/components/ui/scroll-area.tsx
git commit -m "refactor(ui): remove forwardRef from ScrollArea components"
```

---

### Task 9: Remove memo() from AnsiText and LogRow components

**Files:**
- Modify: `apps/ui/src/components/AnsiText.tsx`
- Modify: `apps/ui/src/pages/live-stream/LogRow.tsx`

**Step 1: Refactor AnsiText — remove memo wrapper**

```tsx
import Convert from 'ansi-to-html';

const convert = new Convert({ escapeXML: true });

interface Props {
  text: string;
  className?: string;
}

export function AnsiText({ text, className }: Props) {
  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: convert.toHtml(text) }}
    />
  );
}
```

**Step 2: Refactor LogRow — remove memo wrappers**

```tsx
import { AnsiText } from '@/components/AnsiText';
import { formatTime } from '@/lib/utils';
import type { LogEntry } from './graphql';

interface LogRowProps {
  log: LogEntry;
  measureRef: (node: HTMLElement | null) => void;
}

export function LogRow({ log, measureRef }: LogRowProps) {
  return (
    <div
      ref={measureRef}
      className={`flex gap-2 py-0.5 px-2 hover:bg-secondary/50 ${
        log.stream === 'stderr' ? 'text-red-400' : 'text-gray-300'
      }`}
    >
      <span className="text-muted-foreground shrink-0">
        {formatTime(log.timestamp)}
      </span>
      <span
        className={`shrink-0 w-12 ${
          log.stream === 'stderr' ? 'text-red-500' : 'text-blue-500'
        }`}
      >
        {log.stream}
      </span>
      <AnsiText text={log.message} className="whitespace-pre-wrap break-all" />
    </div>
  );
}

interface ServiceLogRowProps {
  log: LogEntry;
  replicaColor: string;
  nodeName: string;
  measureRef: (node: HTMLElement | null) => void;
}

export function ServiceLogRow({
  log,
  replicaColor,
  nodeName,
  measureRef,
}: ServiceLogRowProps) {
  return (
    <div
      ref={measureRef}
      className={`flex gap-2 py-0.5 px-2 hover:bg-secondary/50 ${
        log.stream === 'stderr' ? 'text-red-400' : 'text-gray-300'
      }`}
    >
      <span className="text-muted-foreground shrink-0">
        {formatTime(log.timestamp)}
      </span>
      <span className={`shrink-0 truncate ${replicaColor}`}>
        {log.containerId.slice(0, 8)}
        {nodeName && (
          <span className="text-muted-foreground">@{nodeName}</span>
        )}
      </span>
      <span
        className={`shrink-0 w-12 ${
          log.stream === 'stderr' ? 'text-red-500' : 'text-blue-500'
        }`}
      >
        {log.stream}
      </span>
      <AnsiText text={log.message} className="whitespace-pre-wrap break-all" />
    </div>
  );
}
```

**Step 3: Verify build**

Run: `cd apps/ui && npx tsc --noEmit`

**Step 4: Commit**

```bash
git add apps/ui/src/components/AnsiText.tsx apps/ui/src/pages/live-stream/LogRow.tsx
git commit -m "refactor(ui): remove memo() from AnsiText and LogRow

React Compiler handles component memoization automatically."
```

---

### Task 10: Remove useCallback/useMemo from LogViewer.tsx

**Files:**
- Modify: `apps/ui/src/pages/live-stream/LogViewer.tsx`

**Step 1: Remove useCallback from flushBatch and useMemo from filteredLogs**

```tsx
import { useSubscription } from '@apollo/client/react';
import { useEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { CONTAINER_LOG_SUBSCRIPTION, LogEntry, MAX_LOG_LINES } from './graphql';
import { LogRow } from './LogRow';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, X } from 'lucide-react';

interface Props {
  containerId: string;
  containerName: string;
}

export default function LogViewer({ containerId, containerName }: Props) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [grepQuery, setGrepQuery] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const batchRef = useRef<LogEntry[]>([]);
  const rafRef = useRef(0);

  const debouncedGrep = useDebouncedValue(grepQuery, 300);
  const isGrepping = debouncedGrep.trim().length > 0;

  const filteredLogs = isGrepping
    ? logs.filter((log) =>
        log.message.toLowerCase().includes(debouncedGrep.trim().toLowerCase()),
      )
    : logs;

  const virtualizer = useVirtualizer({
    count: filteredLogs.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 24,
    overscan: 20,
    measureElement: (el) => el.getBoundingClientRect().height,
  });

  const flushBatch = () => {
    rafRef.current = 0;
    const batch = batchRef.current;
    if (batch.length === 0) return;
    batchRef.current = [];
    setLogs((prev) => {
      const next = prev.concat(batch);
      return next.length > MAX_LOG_LINES ? next.slice(-MAX_LOG_LINES) : next;
    });
  };

  const { error } = useSubscription<{ containerLog: LogEntry }>(
    CONTAINER_LOG_SUBSCRIPTION,
    {
      variables: { containerId },
      onData: ({ data }) => {
        if (data.data?.containerLog) {
          batchRef.current.push(data.data.containerLog);
          if (rafRef.current === 0) {
            rafRef.current = requestAnimationFrame(flushBatch);
          }
        }
      },
    },
  );

  useEffect(
    () => () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  useEffect(() => {
    if (autoScroll && !isGrepping && filteredLogs.length > 0) {
      virtualizer.scrollToIndex(filteredLogs.length - 1, { align: 'end' });
    }
  }, [filteredLogs.length, autoScroll, isGrepping, virtualizer]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    setAutoScroll((prev) => (prev === isAtBottom ? prev : isAtBottom));
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium text-secondary-foreground">
            {containerName}
          </h2>
          <span className="text-xs text-muted-foreground">
            {containerId.slice(0, 12)}
          </span>
        </div>
        <div className="relative flex items-center">
          <Search className="absolute left-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={grepQuery}
            onChange={(e) => setGrepQuery(e.target.value)}
            placeholder="grep..."
            className="h-7 w-40 pl-7 pr-7 text-xs font-mono"
          />
          {grepQuery && (
            <button
              onClick={() => setGrepQuery('')}
              className="absolute right-2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {isGrepping
              ? `${filteredLogs.length}/${logs.length} lines`
              : `${logs.length} lines`}
          </span>
          {!autoScroll && (
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0"
              onClick={() => {
                setAutoScroll(true);
                virtualizer.scrollToIndex(filteredLogs.length - 1, {
                  align: 'end',
                });
              }}
            >
              Follow
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-auto p-0"
            onClick={() => setLogs([])}
          >
            Clear
          </Button>
        </div>
      </div>

      {error && (
        <div className="px-4 py-2 bg-red-900/30 text-red-400 text-xs">
          Subscription error: {error.message}
        </div>
      )}

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-2 font-mono text-xs"
      >
        {filteredLogs.length === 0 ? (
          <p className="text-muted-foreground p-2">
            {isGrepping ? 'No matching logs' : 'Waiting for logs...'}
          </p>
        ) : (
          <div
            style={{
              height: virtualizer.getTotalSize(),
              position: 'relative',
              width: '100%',
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <LogRow
                  log={filteredLogs[virtualRow.index]}
                  measureRef={virtualizer.measureElement}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Verify build**

Run: `cd apps/ui && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add apps/ui/src/pages/live-stream/LogViewer.tsx
git commit -m "refactor(ui): remove useCallback/useMemo from LogViewer

React Compiler auto-memoizes derived values and callbacks."
```

---

### Task 11: Remove useCallback/useMemo from ServiceLogViewer.tsx

**Files:**
- Modify: `apps/ui/src/pages/live-stream/ServiceLogViewer.tsx`

**Step 1: Remove useCallback and useMemo**

```tsx
import { useSubscription } from '@apollo/client/react';
import { useEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  CONTAINER_LOG_SUBSCRIPTION,
  LogEntry,
  MAX_LOG_LINES,
  ServiceGroup,
} from './graphql';
import { ServiceLogRow } from './LogRow';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, X } from 'lucide-react';

interface Props {
  service: ServiceGroup;
}

function ContainerSubscription({
  containerId,
  onLog,
}: {
  containerId: string;
  onLog: (entry: LogEntry) => void;
}) {
  useSubscription<{ containerLog: LogEntry }>(CONTAINER_LOG_SUBSCRIPTION, {
    variables: { containerId },
    onData: ({ data }) => {
      if (data.data?.containerLog) {
        onLog(data.data.containerLog);
      }
    },
  });
  return null;
}

// Short container ID → color mapping for visual distinction
const REPLICA_COLORS = [
  'text-cyan-400',
  'text-yellow-400',
  'text-green-400',
  'text-pink-400',
  'text-orange-400',
  'text-indigo-400',
];

export default function ServiceLogViewer({ service }: Props) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [grepQuery, setGrepQuery] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const containerIds = service.containers.map((c) => c.id);

  const containerColorMap = new Map(
    service.containers.map((c, i) => [
      c.id,
      REPLICA_COLORS[i % REPLICA_COLORS.length],
    ]),
  );

  const containerNodeMap = new Map(
    service.containers.map((c) => [c.id, c.nodeName ?? '']),
  );

  const batchRef = useRef<LogEntry[]>([]);
  const rafRef = useRef(0);

  const debouncedGrep = useDebouncedValue(grepQuery, 300);
  const isGrepping = debouncedGrep.trim().length > 0;

  const filteredLogs = isGrepping
    ? logs.filter((log) =>
        log.message.toLowerCase().includes(debouncedGrep.trim().toLowerCase()),
      )
    : logs;

  const virtualizer = useVirtualizer({
    count: filteredLogs.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 24,
    overscan: 20,
    measureElement: (el) => el.getBoundingClientRect().height,
  });

  const flushBatch = () => {
    rafRef.current = 0;
    const batch = batchRef.current;
    if (batch.length === 0) return;
    batchRef.current = [];
    setLogs((prev) => {
      const next = prev.concat(batch);
      if (
        prev.length > 0 &&
        batch.some((e) => e.timestamp < prev[prev.length - 1].timestamp)
      ) {
        next.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      }
      return next.length > MAX_LOG_LINES ? next.slice(-MAX_LOG_LINES) : next;
    });
  };

  const handleLog = (entry: LogEntry) => {
    batchRef.current.push(entry);
    if (rafRef.current === 0) {
      rafRef.current = requestAnimationFrame(flushBatch);
    }
  };

  useEffect(
    () => () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  useEffect(() => {
    if (autoScroll && !isGrepping && filteredLogs.length > 0) {
      virtualizer.scrollToIndex(filteredLogs.length - 1, { align: 'end' });
    }
  }, [filteredLogs.length, autoScroll, isGrepping, virtualizer]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    setAutoScroll((prev) => (prev === isAtBottom ? prev : isAtBottom));
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-sm bg-purple-500" />
          <h2 className="text-sm font-medium text-secondary-foreground">
            {service.serviceName}
          </h2>
          <Badge variant="secondary" className="text-purple-400">
            {containerIds.length} replicas
          </Badge>
        </div>
        <div className="relative flex items-center">
          <Search className="absolute left-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={grepQuery}
            onChange={(e) => setGrepQuery(e.target.value)}
            placeholder="grep..."
            className="h-7 w-40 pl-7 pr-7 text-xs font-mono"
          />
          {grepQuery && (
            <button
              onClick={() => setGrepQuery('')}
              className="absolute right-2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {isGrepping
              ? `${filteredLogs.length}/${logs.length} lines`
              : `${logs.length} lines`}
          </span>
          {!autoScroll && (
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0"
              onClick={() => {
                setAutoScroll(true);
                virtualizer.scrollToIndex(filteredLogs.length - 1, {
                  align: 'end',
                });
              }}
            >
              Follow
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-auto p-0"
            onClick={() => setLogs([])}
          >
            Clear
          </Button>
        </div>
      </div>

      {/* Replica legend */}
      <div className="flex items-center gap-3 px-4 py-1.5 border-b border-border bg-card/50 flex-wrap">
        {service.containers.map((c) => (
          <span key={c.id} className={`text-xs ${containerColorMap.get(c.id)}`}>
            {c.id.slice(0, 8)}
            {c.nodeName && (
              <span className="text-muted-foreground ml-1">@{c.nodeName}</span>
            )}
          </span>
        ))}
      </div>

      {/* Hidden subscription components */}
      {containerIds.map((id) => (
        <ContainerSubscription key={id} containerId={id} onLog={handleLog} />
      ))}

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-2 font-mono text-xs"
      >
        {filteredLogs.length === 0 ? (
          <p className="text-muted-foreground p-2">
            {isGrepping
              ? 'No matching logs'
              : `Waiting for logs from ${containerIds.length} replicas...`}
          </p>
        ) : (
          <div
            style={{
              height: virtualizer.getTotalSize(),
              position: 'relative',
              width: '100%',
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const log = filteredLogs[virtualRow.index];
              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <ServiceLogRow
                    log={log}
                    replicaColor={
                      containerColorMap.get(log.containerId) ??
                      'text-muted-foreground'
                    }
                    nodeName={containerNodeMap.get(log.containerId) ?? ''}
                    measureRef={virtualizer.measureElement}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Verify build**

Run: `cd apps/ui && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add apps/ui/src/pages/live-stream/ServiceLogViewer.tsx
git commit -m "refactor(ui): remove useCallback/useMemo from ServiceLogViewer

React Compiler auto-memoizes derived values and callbacks."
```

---

### Task 12: Remove useCallback from LiveStreamPage.tsx

**Files:**
- Modify: `apps/ui/src/pages/live-stream/LiveStreamPage.tsx`

**Step 1: Replace useCallback with plain functions**

Change the import line:

```tsx
import { useEffect, useState } from 'react';
```

Replace `openTab` (lines 68-88):

```tsx
  const openTab = (tab: Tab) => {
    setTabs((prev) => {
      const existing = prev.find((t) => t.id === tab.id);
      if (existing) {
        setActiveTabId(tab.id);
        return prev;
      }
      let next = [...prev, tab];
      if (next.length > MAX_TABS) {
        const oldestInactive = next.find((t) => t.id !== activeTabId);
        if (oldestInactive) {
          next = next.filter((t) => t.id !== oldestInactive.id);
        }
      }
      setActiveTabId(tab.id);
      return next;
    });
  };
```

Replace `closeTab` (lines 90-105):

```tsx
  const closeTab = (tabId: string) => {
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === tabId);
      const next = prev.filter((t) => t.id !== tabId);
      if (tabId === activeTabId && next.length > 0) {
        const newIdx = Math.min(idx, next.length - 1);
        setActiveTabId(next[newIdx].id);
      } else if (next.length === 0) {
        setActiveTabId(null);
      }
      return next;
    });
  };
```

**Step 2: Verify build**

Run: `cd apps/ui && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add apps/ui/src/pages/live-stream/LiveStreamPage.tsx
git commit -m "refactor(ui): remove useCallback from LiveStreamPage"
```

---

### Task 13: Remove useCallback from HistoryPage.tsx

**Files:**
- Modify: `apps/ui/src/pages/history/HistoryPage.tsx`

**Step 1: Replace useCallback with plain functions**

```tsx
import { useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { Search, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LOG_APPS_QUERY, LogApp, SearchTab, MAX_SEARCH_TABS } from './graphql';
import HistoryTabBar from './HistoryTabBar';
import SearchPanel from './SearchPanel';

function createTab(): SearchTab {
  return {
    id: `search-${Date.now()}`,
    label: 'New Search',
  };
}

const initialTab = createTab();

export default function HistoryPage() {
  const [tabs, setTabs] = useState<SearchTab[]>([initialTab]);
  const [activeTabId, setActiveTabId] = useState<string>(initialTab.id);

  const { data: appsData } = useQuery<{ logApps: LogApp[] }>(LOG_APPS_QUERY);
  const apps = appsData?.logApps ?? [];

  const addTab = () => {
    const newTab = createTab();
    setTabs((prev) => {
      if (prev.length >= MAX_SEARCH_TABS) {
        const oldest = prev.find((t) => t.id !== activeTabId);
        if (oldest) {
          return [...prev.filter((t) => t.id !== oldest.id), newTab];
        }
        return prev;
      }
      return [...prev, newTab];
    });
    setActiveTabId(newTab.id);
  };

  const closeTab = (tabId: string) => {
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === tabId);
      const next = prev.filter((t) => t.id !== tabId);

      if (tabId === activeTabId && next.length > 0) {
        // Activate adjacent tab
        const newIdx = Math.min(idx, next.length - 1);
        setActiveTabId(next[newIdx].id);
      }

      return next;
    });
  };

  const updateTabLabel = (tabId: string, label: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === tabId ? { ...t, label } : t)),
    );
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <HistoryTabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={setActiveTabId}
        onCloseTab={closeTab}
        onNewTab={addTab}
      />

      {tabs.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-muted-foreground">
          <Search className="h-10 w-10 opacity-30" />
          <p>No search tabs open</p>
          <Button variant="secondary" size="sm" onClick={addTab}>
            <Plus className="h-4 w-4 mr-1" />
            New Search
          </Button>
        </div>
      ) : (
        <div className="flex-1 relative overflow-hidden">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className="absolute inset-0 flex-col"
              style={{ display: tab.id === activeTabId ? 'flex' : 'none' }}
            >
              <SearchPanel
                appsData={apps}
                onLabelChange={(label) => updateTabLabel(tab.id, label)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Verify build**

Run: `cd apps/ui && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add apps/ui/src/pages/history/HistoryPage.tsx
git commit -m "refactor(ui): remove useCallback from HistoryPage"
```

---

### Task 14: Remove useMemo from ContainerList.tsx and SearchPanel.tsx

**Files:**
- Modify: `apps/ui/src/pages/live-stream/ContainerList.tsx`
- Modify: `apps/ui/src/pages/history/SearchPanel.tsx`

**Step 1: ContainerList — change import and replace useMemo**

Change import:

```tsx
import { useState } from 'react';
```

Replace `filtered` useMemo (lines 54-62) with plain computation:

```tsx
  const filtered = (() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return containers;
    return containers.filter((c) => {
      if (c.name.toLowerCase().includes(q)) return true;
      if (c.serviceName?.toLowerCase().includes(q)) return true;
      return false;
    });
  })();
```

**Step 2: SearchPanel — change import and replace useMemo**

Change import (line 1):

```tsx
import { useState } from 'react';
```

Replace `parsedMetadata` useMemo in LogRow (lines 297-304) with plain computation:

```tsx
  const parsedMetadata = (() => {
    if (!line.metadata) return null;
    try {
      return JSON.parse(line.metadata) as Record<string, unknown>;
    } catch {
      return null;
    }
  })();
```

**Step 3: Verify build**

Run: `cd apps/ui && npx tsc --noEmit`

**Step 4: Commit**

```bash
git add apps/ui/src/pages/live-stream/ContainerList.tsx apps/ui/src/pages/history/SearchPanel.tsx
git commit -m "refactor(ui): remove useMemo from ContainerList and SearchPanel"
```

---

### Task 15: Remove useCallback and eslint-disable from AuthContext.tsx

**Files:**
- Modify: `apps/ui/src/auth/AuthContext.tsx`

**Step 1: Replace useCallback with plain functions and remove eslint-disable**

```tsx
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import { useMutation } from '@apollo/client/react';
import { useNavigate } from 'react-router-dom';
import { client } from '@/lib/apollo';
import {
  REFRESH_TOKEN_MUTATION,
  type AuthTokenResponse,
  type RefreshTokenResponse,
} from './graphql';
import {
  getAccessToken,
  getRefreshToken,
  saveTokens,
  clearTokens,
  isAccessTokenExpired,
  startRefreshTimer,
  stopRefreshTimer,
  parseJwtPayload,
} from './token';

interface User {
  loginId: string;
  name: string;
  userType: string;
  roleType: string;
}

interface AuthContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
  login: (tokens: AuthTokenResponse) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const navigate = useNavigate();

  const [refreshMutation] = useMutation<RefreshTokenResponse>(
    REFRESH_TOKEN_MUTATION,
  );

  const handleLogout = async () => {
    clearTokens();
    stopRefreshTimer();
    setIsAuthenticated(false);
    setUser(null);
    await client.clearStore();
    navigate('/admin/login', { replace: true });
  };

  const doRefreshRef = useRef<(() => Promise<void>) | undefined>(undefined);

  const doRefresh = async () => {
    const rt = getRefreshToken();
    if (!rt) {
      handleLogout();
      return;
    }
    try {
      const { data } = await refreshMutation({
        variables: { input: { refreshToken: rt } },
      });
      if (data?.refreshToken) {
        const { accessToken, refreshToken, expiresIn } = data.refreshToken;
        saveTokens(accessToken, refreshToken, expiresIn);
        startRefreshTimer(async () => { await doRefreshRef.current?.(); });
      } else {
        handleLogout();
      }
    } catch {
      handleLogout();
    }
  };

  doRefreshRef.current = doRefresh;

  const handleLogin = (tokens: AuthTokenResponse) => {
    saveTokens(tokens.accessToken, tokens.refreshToken, tokens.expiresIn);
    const payload = parseJwtPayload(tokens.accessToken);
    setUser(
      payload
        ? {
            loginId: payload.loginId,
            name: payload.name,
            userType: payload.userType,
            roleType: payload.roleType,
          }
        : null,
    );
    setIsAuthenticated(true);
    startRefreshTimer(async () => { await doRefreshRef.current?.(); });
  };

  useEffect(() => {
    const init = async () => {
      const at = getAccessToken();
      if (!at) {
        setIsLoading(false);
        return;
      }

      if (isAccessTokenExpired()) {
        const rt = getRefreshToken();
        if (!rt) {
          clearTokens();
          setIsLoading(false);
          return;
        }
        try {
          const { data } = await refreshMutation({
            variables: { input: { refreshToken: rt } },
          });
          if (data?.refreshToken) {
            const { accessToken, refreshToken, expiresIn } = data.refreshToken;
            saveTokens(accessToken, refreshToken, expiresIn);
            const payload = parseJwtPayload(accessToken);
            setUser(
              payload
                ? {
                    loginId: payload.loginId,
                    name: payload.name,
                    userType: payload.userType,
                    roleType: payload.roleType,
                  }
                : null,
            );
            setIsAuthenticated(true);
            startRefreshTimer(async () => { await doRefreshRef.current?.(); });
          } else {
            clearTokens();
          }
        } catch {
          clearTokens();
        }
      } else {
        const payload = parseJwtPayload(at);
        setUser(
          payload
            ? {
                loginId: payload.loginId,
                name: payload.name,
                userType: payload.userType,
                roleType: payload.roleType,
              }
            : null,
        );
        setIsAuthenticated(true);
        startRefreshTimer(doRefresh);
      }
      setIsLoading(false);
    };
    init();
    return () => stopRefreshTimer();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        user,
        login: handleLogin,
        logout: handleLogout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
```

**Step 2: Verify build**

Run: `cd apps/ui && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add apps/ui/src/auth/AuthContext.tsx
git commit -m "refactor(ui): remove useCallback and eslint-disable from AuthContext

React Compiler manages function reference stability automatically.
Removed eslint-disable-line react-hooks/exhaustive-deps comment."
```

---

### Task 16: Final verification — lint and build

**Step 1: Run lint**

Run: `pnpm run lint`
Expected: No new lint errors

**Step 2: Run full UI build**

Run: `nx build ui`
Expected: Build succeeds, output in `dist/apps/ui/`

**Step 3: Verify no regressions (type check)**

Run: `cd apps/ui && npx tsc --noEmit`
Expected: No type errors

**Step 4: Final commit (if any fixups needed)**

If lint/build reveals issues, fix and commit.
