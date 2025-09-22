import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "app/**/*.{ts,tsx}",
    "components/**/*.{ts,tsx}",
    "*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "#3D2F5A", // Card Divider - lighter purple for borders
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "#1E1733", // Dark Luxury Purple - Main Background
        foreground: "#FFFFFF", // White text
        
        // Premium Golden Casino Color Palette
        richGold: "#FFC700", // Primary golden color for buttons, highlights, icons
        deepRoyalPurple: "#7D3FCF", // Secondary highlight color
        darkLuxuryPurple: "#1E1733", // Primary background
        midnightAmethyst: "#2D2149", // Secondary background for cards/sections
        
        // Commonly used semantic colors - Updated for new theme
        cardDark: "#1E1733", // Dark card background (same as main background)
        cardMedium: "#2D2149", // Medium card background (Midnight Amethyst)
        cardDarkAlt: "#2A1F3D", // Alternative dark background (between the two purples)
        cardDivider: "#3D2F5A", // Divider color (lighter purple)
        secondaryHover: "#9B4FE8", // Secondary hover state (lighter royal purple)
        
        primary: {
          DEFAULT: "#FFC700", // Rich Gold for primary buttons and main actions
          foreground: "#1E1733", // Dark text on gold background
        },
        secondary: {
          DEFAULT: "#7D3FCF", // Deep Royal Purple for secondary elements
          foreground: "#FFFFFF", // White text on purple background
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "#64748b",
          foreground: "#94a3b8",
        },
        accent: {
          DEFAULT: "#FFC700", // Rich Gold for accents/bonuses (same as primary)
          foreground: "#1E1733", // Dark text on gold
        },
        popover: {
          DEFAULT: "#2D2149", // Midnight Amethyst for popovers
          foreground: "#FFFFFF",
        },
        card: {
          DEFAULT: "#2D2149", // Midnight Amethyst for cards
          foreground: "#FFFFFF",
        },
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },
      },
      fontFamily: {
        sans: ["Satoshi", "system-ui", "sans-serif"],
        heading: ["Changa One", "Satoshi", "system-ui", "sans-serif"],
        mono: ["Satoshi", "monospace"],
      },
      borderRadius: {
        lg: "12px",
        md: "8px",
        sm: "6px",
        xl: "16px",
        "2xl": "20px",
      },
      boxShadow: {
        "neon": "0 0 20px rgba(255, 199, 0, 0.3)", // Rich Gold glow
        "neon-lg": "0 0 40px rgba(255, 199, 0, 0.4)", // Rich Gold glow large
        "neon-cyan": "0 0 20px rgba(255, 199, 0, 0.3)", // Rich Gold glow (updated from cyan)
        "neon-cyan-lg": "0 0 30px rgba(255, 199, 0, 0.5)", // Large Rich Gold glow
        "neon-pink": "0 0 20px rgba(125, 63, 207, 0.3)", // Deep Royal Purple glow
        "neon-teal": "0 0 20px rgba(125, 63, 207, 0.3)", // Deep Royal Purple glow (updated from teal)
        "neon-purple": "0 0 20px rgba(125, 63, 207, 0.3)", // Deep Royal Purple glow
        "neon-purple-lg": "0 0 30px rgba(125, 63, 207, 0.5)", // Large Deep Royal Purple glow
        "card": "0 4px 12px rgba(0, 0, 0, 0.4)",
        "card-hover": "0 8px 24px rgba(0, 0, 0, 0.6)",
        "dropdown": "0 8px 32px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(61, 47, 90, 0.5)", // Enhanced dropdown shadow with subtle border glow
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":
          "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
        "primary-gradient": "linear-gradient(135deg, #FFC700 0%, #E6B300 100%)", // Rich Gold gradient
        "secondary-gradient": "linear-gradient(135deg, #7D3FCF 0%, #6A35B8 100%)", // Deep Royal Purple gradient
        "accent-gradient": "linear-gradient(135deg, #FFC700 0%, #FFD633 100%)", // Rich Gold accent gradient
        "card-gradient": "linear-gradient(135deg, #2D2149 0%, #241B3A 100%)", // Midnight Amethyst gradient
        "card-dark-gradient": "linear-gradient(135deg, #1E1733 0%, #2D2149 100%)", // Dark to medium purple gradient
      },
      keyframes: {
        tileAnimation: {
          "0%": {
            backgroundPosition: "-100px 100px",
          },
          "100%": {
            backgroundPosition: "100px -100px",
          },
        },
        "fade-in": {
          "0%": {
            opacity: "0",
          },
          "100%": {
            opacity: "1",
          },
        },
        "scale-up": {
          "0%": {
            transform: "scale(0.9)",
          },
          "100%": {
            transform: "scale(1)",
          },
        },
        "neon-pulse": {
          "0%, 100%": {
            boxShadow: "0 0 20px rgba(255, 199, 0, 0.3)",
          },
          "50%": {
            boxShadow: "0 0 40px rgba(255, 199, 0, 0.6)",
          },
        },
        "purple-pulse": {
          "0%, 100%": {
            boxShadow: "0 0 20px rgba(125, 63, 207, 0.3)",
          },
          "50%": {
            boxShadow: "0 0 40px rgba(125, 63, 207, 0.6)",
          },
        },
        "card-hover": {
          "0%": {
            transform: "translateY(0) scale(1)",
          },
          "100%": {
            transform: "translateY(-4px) scale(1.02)",
          },
        },
        "slide-up": {
          "0%": {
            transform: "translateY(20px)",
            opacity: "0",
          },
          "100%": {
            transform: "translateY(0)",
            opacity: "1",
          },
        },
        marquee: {
          "0%": {
            transform: "translateX(100%)",
          },
          "100%": {
            transform: "translateX(-100%)",
          },
        },
        "slide-in-right": {
          "0%": {
            transform: "translateX(100%)",
            opacity: "0",
          },
          "100%": {
            transform: "translateX(0)",
            opacity: "1",
          },
        },
        "slide-in-left": {
          "0%": {
            transform: "translateX(-100%)",
            opacity: "0",
          },
          "100%": {
            transform: "translateX(0)",
            opacity: "1",
          },
        },
        "bounce-in": {
          "0%": {
            transform: "scale(0.3)",
            opacity: "0",
          },
          "50%": {
            transform: "scale(1.05)",
          },
          "70%": {
            transform: "scale(0.9)",
          },
          "100%": {
            transform: "scale(1)",
            opacity: "1",
          },
        },
        "sparkle": {
          "0%, 100%": {
            transform: "scale(1) rotate(0deg)",
            opacity: "1",
          },
          "50%": {
            transform: "scale(1.2) rotate(180deg)",
            opacity: "0.8",
          },
        },
        "glow": {
          "0%": {
            filter: "drop-shadow(0 0 5px rgba(255, 199, 0, 0.3))",
          },
          "100%": {
            filter: "drop-shadow(0 0 20px rgba(255, 199, 0, 0.8))",
          },
        },
        "purple-glow": {
          "0%": {
            filter: "drop-shadow(0 0 5px rgba(125, 63, 207, 0.3))",
          },
          "100%": {
            filter: "drop-shadow(0 0 20px rgba(125, 63, 207, 0.8))",
          },
        },
        "shake": {
          "0%, 100%": {
            transform: "translateX(0)",
          },
          "10%, 30%, 50%, 70%, 90%": {
            transform: "translateX(-2px)",
          },
          "20%, 40%, 60%, 80%": {
            transform: "translateX(2px)",
          },
        },
        "modal-in": {
          "0%": {
            transform: "scale(0.9) translateY(-10px)",
            opacity: "0",
          },
          "100%": {
            transform: "scale(1) translateY(0)",
            opacity: "1",
          },
        },
        "backdrop-in": {
          "0%": {
            backdropFilter: "blur(0px)",
            backgroundColor: "rgba(0, 0, 0, 0)",
          },
          "100%": {
            backdropFilter: "blur(8px)",
            backgroundColor: "rgba(0, 0, 0, 0.5)",
          },
        },
      },
      animation: {
        tileAnimation: "tileAnimation 5s linear infinite",
        "fade-in": "fade-in 0.3s ease-out",
        "scale-up": "scale-up 0.3s ease-out",
        "neon-pulse": "neon-pulse 2s ease-in-out infinite",
        "purple-pulse": "purple-pulse 2s ease-in-out infinite",
        "card-hover": "card-hover 0.2s ease-out",
        "slide-up": "slide-up 0.3s ease-out",
        marquee: "marquee 20s linear infinite",
        "slide-in-right": "slide-in-right 0.3s ease-out",
        "slide-in-left": "slide-in-left 0.3s ease-out",
        "bounce-in": "bounce-in 0.6s ease-out",
        "sparkle": "sparkle 1.5s ease-in-out infinite",
        "glow": "glow 2s ease-in-out infinite alternate",
        "purple-glow": "purple-glow 2s ease-in-out infinite alternate",
        "shake": "shake 0.5s ease-in-out",
        "spin-slow": "spin 3s linear infinite",
        "ping-slow": "ping 2s cubic-bezier(0, 0, 0.2, 1) infinite",
        "modal-in": "modal-in 0.3s ease-out",
        "backdrop-in": "backdrop-in 0.3s ease-out",
      },
      aspectRatio: {
        "2/1": "2 / 1",
        "3/2": "3 / 2",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
