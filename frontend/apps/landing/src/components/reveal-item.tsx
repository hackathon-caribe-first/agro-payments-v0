import { type ElementType, type ReactNode, useEffect, useRef, useState } from "react";

type RevealProps = {
  as?: ElementType;
  children?: ReactNode;
  delay?: number;
  className?: string;
  [prop: string]: unknown;
};

// Hidden while out of view (CSS hides it only when scripting is on); fades in after `delay` ms and out again when it leaves.
export function Reveal({ as: Tag = "div", children, delay = 0, className = "", ...rest }: RevealProps) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // toggles both ways: scrolling back past an element plays the reveal in reverse
    const io = new IntersectionObserver(([entry]) => setShown(entry.isIntersecting), {
      threshold: 0.2,
      rootMargin: "0px 0px -8% 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag ref={ref} data-shown={shown} className={`reveal-item ${className}`} style={{ transitionDelay: shown ? `${delay}ms` : "0ms" }} {...rest}>
      {children}
    </Tag>
  );
}

export function RevealItem(props: Omit<RevealProps, "as">) {
  return <Reveal as="li" {...props} />;
}
