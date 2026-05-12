import * as React from "react"
import { cn } from "@/lib/utils"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-950 dark:focus-visible:ring-gray-300 disabled:pointer-events-none disabled:opacity-50",
          {
            // Filled dark button (looks the same in both modes — it's the
            // primary action affordance).
            'bg-gray-900 text-gray-50 hover:bg-gray-900/90 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white': variant === 'default',
            'bg-red-500 text-gray-50 hover:bg-red-500/90': variant === 'destructive',
            // Outline buttons explicitly set text color in BOTH modes.
            // Previously the variant only set `bg-white` with no text color,
            // so in dark mode the text inherited the light parent color and
            // became invisible on white background.
            'border border-gray-200 bg-white text-gray-900 hover:bg-gray-100 dark:border-slate-600 dark:bg-slate-700 dark:text-gray-100 dark:hover:bg-slate-600 dark:hover:text-white': variant === 'outline',
            'bg-gray-100 text-gray-900 hover:bg-gray-100/80 dark:bg-slate-700 dark:text-gray-100 dark:hover:bg-slate-600': variant === 'secondary',
            'text-gray-900 hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-slate-700 dark:hover:text-white': variant === 'ghost',
            'text-gray-900 underline-offset-4 hover:underline dark:text-gray-100': variant === 'link',

            'h-9 px-4 py-2': size === 'default',
            'h-8 rounded-md px-3 text-xs': size === 'sm',
            'h-10 rounded-md px-8': size === 'lg',
            'h-9 w-9': size === 'icon',
          },
          className
        )}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button }
