/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          primary: "#0f1117",
          secondary: "#1a1d27",
          tertiary: "#242833",
          hover: "#2a2e3b",
          active: "#323744",
        },
        border: "#2e3341",
        content: {
          primary: "#e4e6ed",
          secondary: "#9399a8",
          muted: "#6b7280",
        },
        accent: {
          DEFAULT: "#6366f1",
          hover: "#818cf8",
          muted: "rgba(99, 102, 241, 0.15)",
        },
        success: {
          DEFAULT: "#22c55e",
          muted: "rgba(34, 197, 94, 0.15)",
        },
        warning: {
          DEFAULT: "#f59e0b",
          muted: "rgba(245, 158, 11, 0.15)",
        },
        danger: {
          DEFAULT: "#ef4444",
          muted: "rgba(239, 68, 68, 0.15)",
        },
        info: "#3b82f6",
      },
      fontFamily: {
        mono: [
          "SF Mono",
          "Cascadia Code",
          "Fira Code",
          "JetBrains Mono",
          "monospace",
        ],
      },
    },
  },
  plugins: [],
};
