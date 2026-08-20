import ThemeToggle from '@/components/ui/ThemeToggle';

export default function SiteHeader() {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-dot" aria-hidden="true" />
        <span className="brand-name">echo</span>
        <span className="brand-tag">what the internet sees when you connect</span>
      </div>
      <ThemeToggle />
    </header>
  );
}
