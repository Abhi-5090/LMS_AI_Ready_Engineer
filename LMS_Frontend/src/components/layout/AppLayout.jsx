import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { ChevronRight, GraduationCap, LogOut, Menu, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { ThemeSwitcher } from '@/components/ThemeSwitcher';
import { NotificationsBell } from '@/components/NotificationsBell';
import { useAuth } from '@/lib/auth';
import { PageTransition, useSidebarMotion } from '@/lib/anim';
import { fileSrc } from '@/lib/api';
import { useNavBadges } from '@/lib/navBadges';
import { NAV_BY_ROLE, ROLE_LABEL } from './navConfig';
import './layout.css';

function initials(name) {
  return name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

// ── Collapsible sidebar groups ────────────────────────────────────────────────
const OPEN_KEY = 'lms.navGroups'; // remembered open groups (per browser)
const loadOpen = () => { try { return new Set(JSON.parse(localStorage.getItem(OPEN_KEY)) || []); } catch { return new Set(); } };
const saveOpen = (set) => { try { localStorage.setItem(OPEN_KEY, JSON.stringify([...set])); } catch { /* ignore */ } };
/** Does `pathname` belong to this nav item? Exact for the dashboard, prefix otherwise. */
const matchTo = (pathname, to) => (to === '/app' ? pathname === '/app' : pathname === to || pathname.startsWith(`${to}/`));
/** All leaf links, flattening groups — for the topbar title + active lookup. */
const flattenNav = (nav) => nav.flatMap((e) => (e.group ? e.items : [e]));

/** One sidebar link (top-level or nested inside a group). */
function SidebarLink({ item, badge, onNavigate, nested }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === '/app'}
      onClick={onNavigate}
      className={({ isActive }) => `sidebar__link${nested ? ' sidebar__link--nested' : ''}${isActive ? ' active' : ''}`}
    >
      <span className="sidebar__link-icon" aria-hidden>
        <item.Icon size={18} strokeWidth={2} />
      </span>
      <span className="sidebar__link-label">{item.label}</span>
      {badge > 0 && (
        <span className="sidebar__badge" aria-label={`${badge} new`}>{badge > 9 ? '9+' : badge}</span>
      )}
    </NavLink>
  );
}

export function AppLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const badges = useNavBadges();
  const [navOpen, setNavOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState(loadOpen);

  const nav = NAV_BY_ROLE[user?.role] ?? [];
  // The group that holds the current page is always open (so the active item shows).
  const activeGroup = nav.find((e) => e.group && e.items.some((it) => matchTo(location.pathname, it.to)))?.group ?? null;
  const effectiveOpen = new Set(openGroups);
  if (activeGroup) effectiveOpen.add(activeGroup);
  const openSig = [...effectiveOpen].sort().join(',');
  // Re-glide the indicator on route change AND whenever groups open/close (layout shifts).
  const { navRef, indicatorRef } = useSidebarMotion(`${location.pathname}|${openSig}`);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => setNavOpen(false), [location.pathname]);

  if (!user) return null;

  function toggleGroup(name) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      saveOpen(next);
      return next;
    });
    // After the slide settles, re-place the active-indicator (its own resize hook).
    setTimeout(() => window.dispatchEvent(new Event('resize')), 240);
  }

  const allItems = flattenNav(nav);
  const current = allItems.find((n) => matchTo(location.pathname, n.to)) ?? allItems[0] ?? { label: '' };

  return (
    <div className="layout">
      {navOpen && <div className="sidebar__overlay" onClick={() => setNavOpen(false)} />}

      <aside className={`sidebar${navOpen ? ' sidebar--open' : ''}`}>
        <div className="sidebar__brand">
          <span className="sidebar__logo" aria-hidden>
            <GraduationCap size={20} strokeWidth={2.2} />
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <div className="sidebar__brand-text">AI Ready Engineer</div>
            <div className="sidebar__brand-sub">{ROLE_LABEL[user.role]} Portal</div>
          </span>
          <button type="button" className="sidebar__close" aria-label="Close menu" onClick={() => setNavOpen(false)}>
            <X size={20} />
          </button>
        </div>

        <nav className="sidebar__nav" ref={navRef}>
          <span className="sidebar__indicator" ref={indicatorRef} aria-hidden />
          {nav.map((entry) => {
            if (!entry.group) {
              return <SidebarLink key={entry.to} item={entry} badge={badges[entry.to] ?? 0} onNavigate={() => setNavOpen(false)} />;
            }
            const open = effectiveOpen.has(entry.group);
            const groupCount = entry.items.reduce((n, it) => n + (badges[it.to] ?? 0), 0);
            return (
              <div key={entry.group} className="sidebar__group">
                <button
                  type="button"
                  className={`sidebar__group-head${open ? ' is-open' : ''}`}
                  onClick={() => toggleGroup(entry.group)}
                  aria-expanded={open}
                >
                  {entry.Icon && (
                    <span className="sidebar__link-icon" aria-hidden><entry.Icon size={18} strokeWidth={2} /></span>
                  )}
                  <span className="sidebar__group-name">{entry.group}</span>
                  {!open && groupCount > 0 && (
                    <span className="sidebar__badge" aria-label={`${groupCount} new`}>{groupCount > 9 ? '9+' : groupCount}</span>
                  )}
                  <ChevronRight size={15} strokeWidth={2.2} className="sidebar__group-chev" aria-hidden />
                </button>
                {/* Always rendered; the grid 0fr→1fr transition slides it open/closed. */}
                <div className={`sidebar__group-panel${open ? ' is-open' : ''}`}>
                  <div className="sidebar__group-items">
                    {entry.items.map((it) => (
                      <SidebarLink key={it.to} item={it} badge={badges[it.to] ?? 0} onNavigate={() => setNavOpen(false)} nested />
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </nav>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar__left">
            <button type="button" className="topbar__menu" aria-label="Open menu" onClick={() => setNavOpen(true)}>
              <Menu size={22} strokeWidth={2} />
            </button>
            <div className="topbar__title">{current.label}</div>
          </div>
          <div className="topbar__right">
            <NotificationsBell />
            <ThemeSwitcher />
            <Link to="/app/profile" className="user-chip" title="View your profile" aria-label="View your profile">
              <div className="user-chip__avatar">
                {user.avatarUrl ? (
                  <img src={fileSrc(user.avatarUrl)} alt={user.name} className="user-chip__avatar-img" />
                ) : (
                  initials(user.name)
                )}
              </div>
              <div className="user-chip__text">
                <div className="user-chip__name">{user.name}</div>
                <div className="user-chip__role">{ROLE_LABEL[user.role]}</div>
              </div>
            </Link>
            <Button variant="outline" size="sm" className="topbar__signout" onClick={logout}>
              <LogOut size={15} strokeWidth={2} />
              <span className="topbar__signout-label">Sign out</span>
            </Button>
          </div>
        </header>

        <main className="content">
          <PageTransition>
            <Outlet />
          </PageTransition>
        </main>
      </div>
    </div>
  );
}
