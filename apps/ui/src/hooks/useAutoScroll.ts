import { useEffect, useRef, useState } from 'react';
import type { Virtualizer } from '@tanstack/react-virtual';

interface UseAutoScrollOptions {
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  itemCount: number;
  enabled?: boolean;
  isPaused?: boolean;
}

export function useAutoScroll({
  virtualizer,
  itemCount,
  enabled = true,
  isPaused = false,
}: UseAutoScrollOptions) {
  const [isFollowing, setIsFollowing] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const programmaticScrollRef = useRef(false);

  useEffect(() => {
    if (isPaused) return;
    if (isFollowing && enabled && itemCount > 0) {
      programmaticScrollRef.current = true;
      virtualizer.scrollToIndex(itemCount - 1, { align: 'end' });
      requestAnimationFrame(() => {
        programmaticScrollRef.current = false;
      });
    }
  }, [itemCount, isFollowing, enabled, isPaused, virtualizer]);

  const handleScroll = () => {
    if (isPaused || programmaticScrollRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    setIsFollowing((prev) => (prev === isAtBottom ? prev : isAtBottom));
  };

  const scrollToBottom = () => {
    setIsFollowing(true);
    virtualizer.scrollToIndex(itemCount - 1, { align: 'end' });
  };

  return { scrollRef, isFollowing, handleScroll, scrollToBottom };
}
