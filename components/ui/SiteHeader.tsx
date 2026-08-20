import ThemeToggle from '@/components/ui/ThemeToggle';

export default function SiteHeader() {
  return (
    <header className="topbar">
      <a className="brand" href="/" aria-label="echo home">
        <span className="brand-dot" aria-hidden="true" />
        <span className="brand-name">echo</span>
        <span className="brand-tag">what the internet sees when you connect</span>
      </a>
      <ThemeToggle />
    </header>
  );
}
