import { useLayoutEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import gsap from 'gsap';

const prefersReduced =
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Shared reduced-motion flag (e.g. for chart components). */
export const prefersReducedMotion = prefersReduced;

/**
 * Wraps page content and re-animates its top-level blocks on every route change:
 * each block eases in with a gentle fade + rise and a light stagger, so the page
 * "arrives" instead of snapping in. Uses transform/opacity only (composited, no
 * reflow) and clears the inline styles afterwards. gsap.context() is StrictMode-safe.
 */
export function PageTransition({ children }) {
  const ref = useRef(null);
  const loc = useLocation();
  useLayoutEffect(() => {
    if (prefersReduced || !ref.current) return undefined;
    const ctx = gsap.context(() => {
      gsap.from(ref.current.children, {
        opacity: 0,
        y: 16,
        duration: 0.44,
        stagger: 0.06,
        ease: 'power2.out',
        clearProps: 'transform,opacity',
      });
    }, ref);
    return () => ctx.revert();
  }, [loc.pathname]);
  return (
    <div ref={ref} className="page-anim">
      {children}
    </div>
  );
}

/** Returns a ref; staggers its direct children in on mount (use for nav lists, grids). */
export function useStaggerIn(deps = [], { x = 0, y = 12, gap = 0.05, from = 0 } = {}) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    if (prefersReduced || !ref.current) return undefined;
    const ctx = gsap.context(() => {
      gsap.from(ref.current.children, {
        opacity: 0,
        x,
        y,
        duration: 0.45,
        stagger: gap,
        delay: from,
        ease: 'power2.out',
        clearProps: 'all',
      });
    }, ref);
    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}

/** Animated number that counts up from 0 to `value`. Non-numeric values render as-is. */
export function CountUp({ value, duration = 1.1, format }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const target = Number(value);
    if (!Number.isFinite(target)) {
      el.textContent = value ?? '—';
      return undefined;
    }
    if (prefersReduced) {
      el.textContent = format ? format(target) : String(target);
      return undefined;
    }
    const obj = { n: 0 };
    const tween = gsap.to(obj, {
      n: target,
      duration,
      ease: 'power2.out',
      onUpdate: () => {
        const v = Math.round(obj.n);
        el.textContent = format ? format(v) : String(v);
      },
    });
    return () => tween.kill();
  }, [value, duration, format]);
  return <span ref={ref}>0</span>;
}

/**
 * Sidebar "magic indicator": one shared shade element that glides to the active
 * nav link whenever the route changes. Returns refs for the <nav> and the
 * indicator. Also staggers the links in on first mount.
 */
export function useSidebarMotion(activeKey) {
  const navRef = useRef(null);
  const indicatorRef = useRef(null);
  const firstRun = useRef(true);

  // Entrance stagger (once).
  useLayoutEffect(() => {
    if (prefersReduced || !navRef.current) return undefined;
    const ctx = gsap.context(() => {
      gsap.from(navRef.current.querySelectorAll('.sidebar__link'), {
        opacity: 0,
        x: -16,
        duration: 0.45,
        stagger: 0.045,
        ease: 'power2.out',
        clearProps: 'all',
      });
    }, navRef);
    return () => ctx.revert();
  }, []);

  // Glide the indicator to the active link. Tracks x/y/width/height so it works
  // in both the vertical sidebar and the horizontal mobile row, and repositions
  // on resize.
  useLayoutEffect(() => {
    const nav = navRef.current;
    const ind = indicatorRef.current;
    if (!nav || !ind) return undefined;

    const place = (animate) => {
      const active = nav.querySelector('.sidebar__link.active');
      if (!active) {
        gsap.set(ind, { autoAlpha: 0 });
        return;
      }
      const dest = {
        x: active.offsetLeft,
        y: active.offsetTop,
        width: active.offsetWidth,
        height: active.offsetHeight,
        autoAlpha: 1,
      };
      if (animate && !prefersReduced) {
        gsap.to(ind, { ...dest, duration: 0.55, ease: 'expo.out', overwrite: true });
      } else {
        gsap.set(ind, dest);
      }
    };

    place(!firstRun.current);
    firstRun.current = false;

    const onResize = () => place(false);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [activeKey]);

  return { navRef, indicatorRef };
}

/** Fade + scale an element in on mount (e.g., the login card). */
export function useEntrance({ y = 24, scale = 0.98, duration = 0.6, delay = 0 } = {}) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    if (prefersReduced || !ref.current) return undefined;
    const ctx = gsap.context(() => {
      gsap.from(ref.current, { opacity: 0, y, scale, duration, delay, ease: 'power3.out', clearProps: 'all' });
    }, ref);
    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return ref;
}
