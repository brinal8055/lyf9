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
        sans: ["Inter", "Satoshi", "Geist Sans", "system-ui", "sans-serif"]
      },
      maxWidth: {
        shell: "1280px"
      },
      transitionTimingFunction: {
        lyf9: "cubic-bezier(0.22, 1, 0.36, 1)"
      }
    }
  },
  plugins: []
};

export default config;
