import React from 'react';
import { motion } from 'motion/react';

interface SplashLoaderProps {
  visible?: boolean;
}

// Fade the overlay out ~2.5s after the app signals it is ready.
const MINIMUM_DISPLAY_TIME = 2500;
const EXIT_DURATION = 500;

type CharSpec = { letter: string; color: string; className: string };

// Three playful mascot letters that together spell "ZID".
const CHARACTERS: CharSpec[] = [
  { letter: 'Z', color: '#FBBF24', className: 'zid-char--z' }, // gold
  { letter: 'I', color: '#38BDF8', className: 'zid-char--i' }, // sky
  { letter: 'D', color: '#A78BFA', className: 'zid-char--d' }, // violet
];

// Rising glow sparks scattered across the stage (left %, delay, size).
const SPARKS = [
  { left: '16%', delay: 0.9, size: 6 },
  { left: '28%', delay: 1.25, size: 4 },
  { left: '44%', delay: 1.0, size: 7 },
  { left: '58%', delay: 1.4, size: 5 },
  { left: '72%', delay: 1.12, size: 6 },
  { left: '84%', delay: 1.55, size: 4 },
];

interface CartoonCharacterProps {
  spec: CharSpec;
  index: number;
  reducedMotion: boolean;
}

/**
 * A single cartoon letter mascot. The OUTER motion.div owns the physics-based
 * spring drop-in (so Framer Motion fully controls its transform). The INNER
 * `.zid-char` div owns the CSS celebration wiggle, and the eyes/hands/feet run
 * their own looping keyframes — keeping every animated transform on its own
 * element so nothing fights for the same `transform` (smooth 60fps).
 */
const CartoonCharacter: React.FC<CartoonCharacterProps> = ({ spec, index, reducedMotion }) => (
  <motion.div
    className="zid-char-slot"
    initial={reducedMotion ? { y: 0, opacity: 1, scale: 1, rotate: 0 } : { y: -360, opacity: 0, scale: 0.55, rotate: -12 }}
    animate={{ y: 0, opacity: 1, scale: 1, rotate: 0 }}
    transition={
      reducedMotion
        ? { duration: 0 }
        : { type: 'spring', stiffness: 320, damping: 15, mass: 0.9, delay: index * 0.18 }
    }
  >
    <div
      className={`zid-char ${spec.className}`}
      style={{ '--char-color': spec.color } as React.CSSProperties}
    >
      {/* Face — blinking eyes + a smiling mouth, floating above the letter body */}
      <div className="zid-char__face">
        <span className="zid-char__eye zid-char__eye--l" />
        <span className="zid-char__eye zid-char__eye--r" />
        <span className="zid-char__smile" />
      </div>

      {/* Body — the letterform itself */}
      <div className="zid-char__body">{spec.letter}</div>

      {/* Wiggling cartoon hands attached to the sides */}
      <span className="zid-char__hand zid-char__hand--l" />
      <span className="zid-char__hand zid-char__hand--r" />

      {/* Wiggling cartoon feet at the bottom */}
      <div className="zid-char__feet">
        <span className="zid-char__foot zid-char__foot--l" />
        <span className="zid-char__foot zid-char__foot--r" />
      </div>
    </div>
  </motion.div>
);

export const SplashLoader: React.FC<SplashLoaderProps> = ({ visible = true }) => {
  const [mounted, setMounted] = React.useState(visible);
  const [ready, setReady] = React.useState(false);
  const [exiting, setExiting] = React.useState(false);
  const startedAt = React.useRef(Date.now());

  const reducedMotion = React.useMemo(
    () =>
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    []
  );

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

        <div className="zid-splash__sparks" aria-hidden="true">
          {SPARKS.map((s, i) => (
            <span
              key={i}
              className="zid-splash__spark"
              style={{ left: s.left, width: s.size, height: s.size, animationDelay: `${s.delay}s` }}
            />
          ))}
        </div>

        <div className="zid-splash__cast" aria-hidden="true">
          {CHARACTERS.map((spec, i) => (
            <CartoonCharacter key={spec.letter} spec={spec} index={i} reducedMotion={reducedMotion} />
          ))}
        </div>

        <div className="zid-splash__brand">ZID <span>SAAS BD</span></div>
      </div>
    </div>
  );
};

