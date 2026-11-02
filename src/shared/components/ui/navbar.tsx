import * as React from 'react'
import { cn } from '@/shared/lib/index'

type NavbarProps = React.HTMLAttributes<HTMLElement>

function Navbar({ className, children, ...props }: NavbarProps) {
  return (
    <div className="h-16 w-full border-b border-border/40 bg-background/80 backdrop-blur-xl transition-all">
      <nav
        className={cn(
          'mx-auto flex h-full max-w-[1920px] items-center justify-between px-3 sm:px-6 lg:px-8',
          className,
        )}
        {...props}
      >
        {children}
      </nav>
    </div>
  )
}

type NavbarBrandProps = React.HTMLAttributes<HTMLDivElement>

function NavbarBrand({ className, children, ...props }: NavbarBrandProps) {
  return (
    <div className={cn('flex items-center gap-2', className)} {...props}>
      {children}
    </div>
  )
}

interface NavbarContentProps extends React.HTMLAttributes<HTMLDivElement> {
  justify?: 'start' | 'center' | 'end'
}

function NavbarContent({ className, justify = 'start', children, ...props }: NavbarContentProps) {
  const justifyClass = {
    start: 'justify-start',
    center: 'justify-center',
    end: 'justify-end',
  }

  return (
    <div
      className={cn('flex flex-1 items-center gap-4', justifyClass[justify], className)}
      {...props}
    >
      {children}
    </div>
  )
}

export { Navbar, NavbarBrand, NavbarContent }
