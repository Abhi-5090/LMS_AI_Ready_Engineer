import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Building2, ChevronRight, GraduationCap, LogOut, Menu, X } from 'lucide-react';
import { UserRole } from '@/shared';
import { Button } from '@/components/ui';
import { ThemeSwitcher } from '@/components/ThemeSwitcher';
import { NotificationsBell } from '@/components/NotificationsBell';
import { fileSrc } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PageTransition, useSidebarMotion } from '@/lib/anim';
import { useNavBadges } from '@/lib/navBadges';
import { NAV_BY_ROLE, ROLE_LABEL } from './navConfig';
import './layout.css';

function initials(name) {
  const result = (name ?? '')
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return result || '?';
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
  const orgView = useAuth((s) => s.orgView);
  const templateMissing = useAuth((s) => s.templateMissing);
  const clearOrgView = useAuth((s) => s.clearOrgView);
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  // A super admin managing tenants (not drilled in) works against the master
  // template — it has no announcements/certs/projects/notifications, so skip those
  // queries entirely (avoids marking the template's notifications read, etc.).
  const superManaging = user?.role === UserRole.SUPER_ADMIN && !orgView;
  const badges = useNavBadges({ superManaging });
  const [navOpen, setNavOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState(loadOpen);

  // A super admin managing tenants gets the (flat) org nav; drilled into an org they
  // act as its admin (grouped admin nav).
  const navRole = superManaging ? UserRole.SUPER_ADMIN : UserRole.ADMIN;
  const nav = NAV_BY_ROLE[navRole] ?? [];
  // The group holding the current page is always open (keeps the active item visible).
  const activeGroup = nav.find((e) => e.group && e.items.some((it) => matchTo(location.pathname, it.to)))?.group ?? null;
  const effectiveOpen = new Set(openGroups);
  if (activeGroup) effectiveOpen.add(activeGroup);
  const openSig = [...effectiveOpen].sort().join(',');
  // Re-glide the indicator on route change AND whenever groups open/close.
  const { navRef, indicatorRef } = useSidebarMotion(`${location.pathname}|${openSig}`);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => setNavOpen(false), [location.pathname]);

  if (!user) return null;

  function exitOrg() {
    clearOrgView();
    qc.clear();
    navigate('/app/organizations', { replace: true });
  }

  // Sign out, then send them to /login. Without the explicit navigate we'd stay on
  // the current URL — and super-admin-only routes (e.g. /app/organizations) don't
  // exist once logged out, so the router would fall through to a 404.
  async function handleSignOut() {
    await logout();
    qc.clear();
    navigate('/login', { replace: true });
  }
  function toggleGroup(name) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      saveOpen(next);
      return next;
    });
  }
  // Longest-prefix match so detail routes (/app/users/:id, etc.) resolve to their
  // section title instead of falling back to the first ("Dashboard") entry.
  const allItems = flattenNav(nav);
  const current =
    allItems
      .filter((n) => location.pathname === n.to || location.pathname.startsWith(`${n.to}/`))
      .sort((a, b) => a.to.length - b.to.length)
      .pop() ?? allItems[0] ?? { label: '' };

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
                  <span className="sidebar__group-name">{entry.group}</span>
                  {!open && groupCount > 0 && (
                    <span className="sidebar__badge" aria-label={`${groupCount} new`}>{groupCount > 9 ? '9+' : groupCount}</span>
                  )}
                  <ChevronRight size={15} strokeWidth={2.2} className="sidebar__group-chev" aria-hidden />
                </button>
                {open && (
                  <div className="sidebar__group-items">
                    {entry.items.map((it) => (
                      <SidebarLink key={it.to} item={it} badge={badges[it.to] ?? 0} onNavigate={() => setNavOpen(false)} nested />
                    ))}
                  </div>
                )}
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
            {/* Notifications are keyed per-user, so they work in every context — incl.
                a managing super admin's global syllabus-request alerts. */}
            <NotificationsBell />
            <ThemeSwitcher />
            <div className="user-chip">
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
            </div>
            <Button variant="outline" size="sm" className="topbar__signout" onClick={handleSignOut}>
              <LogOut size={15} strokeWidth={2} />
              <span className="topbar__signout-label">Sign out</span>
            </Button>
          </div>
        </header>

        <main className="content">
          {orgView && (
            <div className="org-banner">
              <Building2 size={16} />
              <span>Viewing organization <strong>{orgView.name}</strong> — you're acting as its admin.</span>
              <button type="button" className="org-banner__exit" onClick={exitOrg}>Exit to organizations</button>
            </div>
          )}
          {superManaging && templateMissing && (
            <div className="org-banner org-banner--warn">
              <Building2 size={16} />
              <span>The master template isn't set up, so <strong>Master Curriculum</strong> and{' '}
              <strong>Question Bank</strong> can't be edited. Run the seed to create it.</span>
            </div>
          )}
          <PageTransition>
            <Outlet />
          </PageTransition>
        </main>
      </div>
    </div>
  );
}
