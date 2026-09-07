import React from 'react';

interface SplashLoaderProps {
  visible?: boolean;
}

const MINIMUM_DISPLAY_TIME = 5500;
const EXIT_DURATION = 500;

export const SplashLoader: React.FC<SplashLoaderProps> = ({ visible = true }) => {
  const [mounted, setMounted] = React.useState(visible);
  const [ready, setReady] = React.useState(false);
  const [exiting, setExiting] = React.useState(false);
  const startedAt = React.useRef(Date.now());

  React.useEffect(() => {
    const handleAppReady = () => setReady(true);
    window.addEventListener('zid-app-ready', handleAppReady);
    return () => window.removeEventListener('zid-app-ready', handleAppReady);
  }, []);

  React.useEffect(() => {
    if (!visible) setReady(true);
  }, [visible]);

  React.useEffect(() => {
    if (!ready) return;
    const remaining = Math.max(0, MINIMUM_DISPLAY_TIME - (Date.now() - startedAt.current));
    const timer = window.setTimeout(() => setExiting(true), remaining);
    return () => window.clearTimeout(timer);
  }, [ready]);

  React.useEffect(() => {
    if (!exiting) return;
    const timer = window.setTimeout(() => setMounted(false), EXIT_DURATION);
    return () => window.clearTimeout(timer);
  }, [exiting]);

  if (!mounted) return null;

  return (
    <div className={`zid-splash${exiting ? ' zid-splash--exiting' : ''}`} role="status" aria-label="Loading ZID SaaS BD" data-testid="zid-splash-loader">
      <div className="zid-splash__frame">
        <div className="zid-splash__ambient" aria-hidden="true" />
        <div className="zid-splash__mark" aria-hidden="true">
          <span className="zid-splash__orbit zid-splash__orbit--i">I</span>
          <span className="zid-splash__core">Z</span>
          <span className="zid-splash__orbit zid-splash__orbit--d">D</span>
        </div>
        <div className="zid-splash__brand">ZID <span>SAAS BD</span></div>
        <div className="zid-splash__bar" aria-hidden="true"><span /></div>
      </div>
    </div>
  );
};
