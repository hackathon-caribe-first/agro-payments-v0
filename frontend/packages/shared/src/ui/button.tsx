import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@agro/shared/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-brand font-bold transition-all duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-sidebar",
        secondary: "bg-secondary text-secondary-foreground hover:bg-lime-deep",
        outline: "border-2 border-primary bg-card text-primary hover:bg-accent",
        destructive: "bg-destructive text-white hover:bg-destructive/90",
        ghost: "text-primary hover:bg-accent",
        link: "text-primary underline-offset-4 hover:underline",
      },
      // ponytail: default/lg/icon meet the 44px touch target from DESIGN.md; sm only for dense desktop tables
      size: {
        default: "h-11 px-5 text-base",
        sm: "h-9 px-3 text-sm",
        lg: "h-12 px-6 text-base",
        icon: "size-11",
        // Compact density for dense app screens (apps/web); landing and example keep the sizes above.
        compact: "h-[33px] px-3 text-sm [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
        "icon-compact": "size-[33px] [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}
