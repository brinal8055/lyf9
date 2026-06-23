import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#050505",
        charcoal: "#101010",
        card: "#171717",
        elevated: "#202020",
        ivory: "#F7F4ED",
        muted: "#A7A29A",
        dim: "#6F6A63",
        orange: "#FF6A3D",
        green: "#45D6A2",
        blue: "#5B7CFA",
        yellow: "#F5B65A",
        violet: "#C084FC",
        danger: "#FF4D4D",
        success: "#6FE7B1",
        cream: "#F6F1E8",
        lightCard: "#FFFDF7",
        // Landing page light-theme tokens
        "forest-deep": "#0C332C",
        forest: "#0E3B33",
        "forest-mid": "#1F8472",
        "forest-leaf": "#15695B",
        "forest-pulse": "#2E9E7B",
        "forest-glow": "#7FD8B4",
        sage: "#3D514A",
        fern: "#46584F",
        moss: "#5C6E68",
        fog: "#9FB8AF",
        "fog-deep": "#7E8C84",
        bark: "#9A8A6F",
        sand: "#F4EEE2",
        "sand-card": "#F8F4EB",
        "sand-border": "#EBE2D2",
        terracotta: "#E8915B",
        "terracotta-deep": "#D9774B",
        "terracotta-warm": "#E8B07A",
        "trust-green": "#E5EFE9",
        "trust-green-border": "#CADED4",
        "trust-green-pill": "#DCEBE3",
        "trust-orange": "#FBEFE6",
        "trust-orange-border": "#F0D6C2",
        "amber-warm": "#D8A33C",
        "rust-mid": "#C25A33",
      },
      borderRadius: {
        ui: "12px",
        card: "20px",
        "card-lg": "28px",
        panel: "36px"
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
        hanken: ["var(--font-hanken)", "sans-serif"],
        newsreader: ["var(--font-newsreader)", "serif"],
      },
      maxWidth: {
        shell: "1280px"
      },
      transitionTimingFunction: {
        lyf9: "cubic-bezier(0.22, 1, 0.36, 1)"
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-8px)" }
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" }
        },
        "slide-in": {
          from: { opacity: "0", transform: "translateX(-12px)" },
          to: { opacity: "1", transform: "translateX(0)" }
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" }
        },
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" }
        },
        floaty: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-13px)" },
        },
        floaty2: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-20px)" },
        },
        floaty3: {
          "0%, 100%": { transform: "translateY(0) rotate(-3deg)" },
          "50%": { transform: "translateY(-15px) rotate(-3deg)" },
        },
        blob: {
          "0%, 100%": { transform: "translate(0,0) scale(1)" },
          "33%": { transform: "translate(30px,-25px) scale(1.08)" },
          "66%": { transform: "translate(-22px,18px) scale(.94)" },
        },
        blob2: {
          "0%, 100%": { transform: "translate(0,0) scale(1)" },
          "50%": { transform: "translate(-34px,28px) scale(1.12)" },
        },
        pulsedot: {
          "0%": { boxShadow: "0 0 0 0 rgba(46,158,123,.5)" },
          "70%": { boxShadow: "0 0 0 10px rgba(46,158,123,0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(46,158,123,0)" },
        },
      },
      animation: {
        float: "float 3s ease-in-out infinite",
        "float-delayed": "float 3s ease-in-out infinite 0.6s",
        "float-delayed-2": "float 3s ease-in-out infinite 1.2s",
        "fade-in": "fade-in 0.4s ease-out both",
        "slide-in": "slide-in 0.3s ease-out both",
        shimmer: "shimmer 1.5s linear infinite",
        marquee: "marquee 35s linear infinite",
        "marquee-fast": "marquee 32s linear infinite",
        floaty: "floaty 7s ease-in-out infinite",
        "floaty-slow": "floaty 9s ease-in-out infinite",
        floaty2: "floaty2 6s ease-in-out infinite",
        floaty3: "floaty3 7.5s ease-in-out infinite",
        blob: "blob 22s ease-in-out infinite",
        blob2: "blob2 26s ease-in-out infinite",
        pulsedot: "pulsedot 2.2s ease-in-out infinite",
      }
    }
  },
  plugins: []
};

export default config;
