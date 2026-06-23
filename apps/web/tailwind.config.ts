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
        lightCard: "#FFFDF7"
      },
      borderRadius: {
        ui: "12px",
        card: "20px",
        "card-lg": "28px",
        panel: "36px"
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"]
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
        }
      },
      animation: {
        float: "float 3s ease-in-out infinite",
        "float-delayed": "float 3s ease-in-out infinite 0.6s",
        "float-delayed-2": "float 3s ease-in-out infinite 1.2s",
        "fade-in": "fade-in 0.4s ease-out both",
        "slide-in": "slide-in 0.3s ease-out both",
        shimmer: "shimmer 1.5s linear infinite"
      }
    }
  },
  plugins: []
};

export default config;
