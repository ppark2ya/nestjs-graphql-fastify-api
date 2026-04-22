import { useEffect, useRef, useState } from 'react';
import type { Virtualizer } from '@tanstack/react-virtual';

interface UseAutoScrollOptions {
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  itemCount: number;
  enabled?: boolean;
}

export function useAutoScroll({
  virtualizer,
  itemCount,
  enabled = true,
}: UseAutoScrollOptions) {
  const [isFollowing, setIsFollowing] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isPaused) return;
    if (isFollowing && enabled && itemCount > 0) {
      virtualizer.scrollToIndex(itemCount - 1, { align: 'end' });
    }
  }, [itemCount, isFollowing, enabled, isPaused, virtualizer]);

  const handleScroll = () => {
    if (isPaused) return;
    const el = scrollRef.current;
    if (!el) return;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    setIsFollowing((prev) => (prev === isAtBottom ? prev : isAtBottom));
  };

  const togglePause = () => {
    setIsPaused((prev) => !prev);
  };

  const scrollToBottom = () => {
    setIsPaused(false);
    setIsFollowing(true);
    virtualizer.scrollToIndex(itemCount - 1, { align: 'end' });
  };

  return { scrollRef, isFollowing, isPaused, handleScroll, togglePause, scrollToBottom };
}
