/**
 * SedBank design tokens — "Wine Reserve".
 *
 * The single source of truth for the glassmorphism system. Every screen
 * (login, Admin, Credit, Ops, Collections, Customer) pulls colour, type,
 * radius, blur, shadow and motion from here; nothing is hardcoded per page.
 *
 * ---------------------------------------------------------------------------
 * How the neutral ramp works
 * ---------------------------------------------------------------------------
 * `slate` is a DARK-FIRST INVERTED ramp: low numbers are surfaces, high
 * numbers are text. That is the opposite of stock Tailwind and it is
 * deliberate — the app was written light-first (`bg-slate-50` for surfaces,
 * `text-slate-900` for headings), so inverting the ramp re-themes every
 * screen from this one file instead of rewriting hundreds of class names.
 * The neutrals are warm (rose-grey), not cold, so they sit correctly on the
 * wine base.
 *
 *   bg-slate-50/100   -> warm glass surface tints, composited over the base
 *   border-slate-200  -> warm hairline                (rgba(255,255,255,0.08))
 *   text-slate-400    -> icons and placeholders
 *   text-slate-500    -> secondary text               (#B8A9AC, per spec)
 *   text-slate-700    -> field labels
 *   text-slate-900    -> primary text                 (#F8FAFC, per spec)
 *
 * Status ramps are inverted the same way: `-50` is a deep tint for fills,
 * `-600`/`-700` are bright pastels for text on top of that tint.
 *
 * ---------------------------------------------------------------------------
 * Where gold is allowed
 * ---------------------------------------------------------------------------
 * `gold` is rationed to exactly three roles, so it keeps its meaning:
 *   1. the single primary CTA on a screen   (Button variant="cta")
 *   2. the active / selected nav item       (AppShell NavItems)
 *   3. one hairline accent on a featured card (`featured` prop / .accent-line)
 * Anywhere else, use wine (`brand`) or a warm neutral. Gold always carries
 * near-black text (`text-ink`): gold + white is 2.1:1.
 */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        /**
         * Page background — deep wine-black, never pure black.
         *
         * Named `canvas`, not `base`: a colour called `base` would make
         * `text-base` emit BOTH a font-size and a colour rule, so any
         * `text-base` used for sizing would silently pick up a colour too.
         */
        canvas: {
          DEFAULT: '#180B10', // <- spec
          raised: '#1F0F16',
          deep: '#100609',
        },
        // The same near-black, for TEXT on a light fill (gold CTA, status buttons).
        ink: '#180B10',

        // Warm inverted neutral ramp. See the header note above.
        slate: {
          50: '#221016', // subtle warm surface   (~white 4% over canvas)
          100: '#2A141B', // stronger surface      (~white 6% over canvas)
          200: '#341C24', // warm hairline         (~white 8% over canvas)
          300: '#4A2A33', // strong divider / disabled
          400: '#9C8A8E', // icons, placeholders
          500: '#B8A9AC', // secondary text  <- spec
          600: '#D0C4C6', // secondary-strong
          700: '#E3DADC', // labels
          800: '#F0EAEB',
          900: '#F8FAFC', // primary text    <- spec
          950: '#FFFFFF',
        },

        /**
         * Primary accent — burgundy through rose.
         * `600` is the burgundy anchor, `500` the rose; together they form
         * the brand gradient. White text clears AA on both (8.0:1 / 6.0:1).
         */
        brand: {
          50: '#3B0D1C',
          100: '#4A1122',
          200: '#5E162C',
          300: '#F5B3C8', // light rose — for text/links on dark
          400: '#EC7BA4',
          500: '#BE185D', // rose      <- spec (secondary accent)
          600: '#9F1239', // burgundy  <- spec (primary accent)
          700: '#881337',
          800: '#6B0F2B',
          900: '#500B20',
          950: '#2E0613',
        },

        /**
         * Rationed gold. See "Where gold is allowed" above.
         * Pairs with `text-ink`, never white.
         */
        gold: {
          200: '#F0E1B0',
          300: '#E6CF84',
          400: '#DFC15C',
          500: '#D4AF37', // <- spec
          600: '#B8952C',
          700: '#8F7220',
        },

        // --- Status ramps (inverted: -50 fills, -600/700 text) -------------
        success: {
          50: '#0D2A22',
          100: '#10362B',
          200: '#17513E',
          300: '#2F9C78',
          400: '#34D399',
          500: '#34D399', // <- spec
          600: '#4ADE9F',
          700: '#6EE7B7',
          800: '#A7F3D0',
        },
        warning: {
          50: '#2E2410',
          100: '#3D2F13',
          200: '#5A441A',
          300: '#B98A1E',
          400: '#FBBF24',
          500: '#FBBF24', // <- spec
          600: '#FCD34D',
          700: '#FDE68A',
          800: '#FEF3C7',
        },
        /**
         * Deliberately orange-red, NOT wine-toned, so overdue and rejected
         * states can never be mistaken for the brand accent.
         */
        danger: {
          50: '#33161A',
          100: '#421C21',
          200: '#5F2A30',
          300: '#D05C5C',
          400: '#F87171',
          500: '#F87171', // <- spec
          600: '#F98A8A',
          700: '#FCA5A5',
          800: '#FECACA',
        },
        info: {
          50: '#3B0D1C',
          100: '#4A1122',
          500: '#BE185D',
          600: '#EC7BA4',
        },
      },

      fontFamily: {
        // Body, labels, tables — clean sans with tabular figures available.
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        /**
         * High-contrast display serif for headings and hero numbers
         * (balances, EMI amounts). This pairing is what separates the look
         * from a plain dark theme.
         */
        display: ['"Playfair Display"', 'ui-serif', 'Georgia', 'Cambria', 'serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },

      borderRadius: {
        card: '1rem', // 16px — glass panels
        panel: '1.25rem', // 20px — large surfaces
      },

      backdropBlur: {
        glass: '16px',
        heavy: '24px',
      },

      boxShadow: {
        // Glass depth: a soft, wide drop plus a 1px inner top highlight.
        card: '0 8px 32px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
        raised: '0 12px 40px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.07)',
        panel: '0 24px 64px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.07)',
        // Hover glow on interactive glass — brighter hairline, warm bloom.
        glow: '0 0 0 1px rgba(255, 255, 255, 0.18), 0 8px 32px rgba(190, 24, 93, 0.20)',
        'glow-brand': '0 6px 24px -4px rgba(159, 18, 57, 0.50)',
        'glow-gold': '0 6px 24px -4px rgba(212, 175, 55, 0.40)',
      },

      /**
       * Motion. Everything is opacity / scale / glow based, 200-400ms,
       * ease-out only — no bounce or elastic easing anywhere.
       */
      transitionTimingFunction: {
        'ease-out-soft': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },

      keyframes: {
        'fade-in': { from: { opacity: 0 }, to: { opacity: 1 } },
        'slide-up': {
          from: { opacity: 0, transform: 'translateY(8px)' },
          to: { opacity: 1, transform: 'translateY(0)' },
        },
        'slide-in-right': {
          from: { opacity: 0, transform: 'translateX(16px)' },
          to: { opacity: 1, transform: 'translateX(0)' },
        },
        /** Glass panel entrance: fade + gentle scale. */
        'panel-in': {
          from: { opacity: 0, transform: 'translateY(6px) scale(0.985)' },
          to: { opacity: 1, transform: 'translateY(0) scale(1)' },
        },
        /**
         * Entrance for a dialog that is centred via `translate(-50%, -50%)`.
         * The centring is baked into both keyframes, because a `both`
         * fill-mode animation's transform would otherwise override it and
         * leave the dialog half a viewport off-centre.
         */
        'modal-in': {
          from: { opacity: 0, transform: 'translate(-50%, -50%) scale(0.97)' },
          to: { opacity: 1, transform: 'translate(-50%, -50%) scale(1)' },
        },

        /** A glass detail panel flying in from its originating node. */
        'fly-in': {
          from: { opacity: 0, transform: 'translateY(10px) scale(0.96)' },
          to: { opacity: 1, transform: 'translateY(0) scale(1)' },
        },
        /** Ambient background blobs — GPU transforms only, very slow. */
        drift: {
          '0%, 100%': { transform: 'translate3d(0, 0, 0) scale(1)' },
          '33%': { transform: 'translate3d(2.5rem, -1.75rem, 0) scale(1.07)' },
          '66%': { transform: 'translate3d(-1.75rem, 1.25rem, 0) scale(0.96)' },
        },
        /** Loader core: a soft breathing glow. */
        'pulse-glow': {
          '0%, 100%': { opacity: 0.45, transform: 'scale(0.88)' },
          '50%': { opacity: 1, transform: 'scale(1.04)' },
        },
        /** Loader ring. */
        'spin-slow': { from: { transform: 'rotate(0deg)' }, to: { transform: 'rotate(360deg)' } },
        /** Flowing dash along a connector, to suggest live data. */
        'dash-flow': { to: { strokeDashoffset: '-24' } },
        'flow-x': { from: { backgroundPositionX: '0px' }, to: { backgroundPositionX: '14px' } },
        'flow-y': { from: { backgroundPositionY: '0px' }, to: { backgroundPositionY: '14px' } },
        /** A lifecycle node that is currently active. */
        'node-pulse': {
          '0%, 100%': { opacity: 0.35, transform: 'scale(1)' },
          '50%': { opacity: 0.75, transform: 'scale(1.35)' },
        },
      },

      animation: {
        'fade-in': 'fade-in 200ms ease-out',
        'slide-up': 'slide-up 220ms ease-out',
        'slide-in-right': 'slide-in-right 240ms ease-out',
        'panel-in': 'panel-in 300ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'modal-in': 'modal-in 300ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'fly-in': 'fly-in 300ms cubic-bezier(0.16, 1, 0.3, 1) both',
        drift: 'drift 34s ease-in-out infinite',
        'drift-slow': 'drift 52s ease-in-out infinite',
        'pulse-glow': 'pulse-glow 1.8s ease-in-out infinite',
        'spin-slow': 'spin-slow 2.4s linear infinite',
        'dash-flow': 'dash-flow 1.1s linear infinite',
        'flow-x': 'flow-x 1.1s linear infinite',
        'flow-y': 'flow-y 1.1s linear infinite',
        'node-pulse': 'node-pulse 2.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
