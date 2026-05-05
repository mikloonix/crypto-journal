/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/features/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        nansen: {
          bg: "#0B0F1F",
          surface: "#1A1F2E",
          elevated: "#262C3F",
          border: "#2A3040",
          muted: "#8E98B3",
          green: "#00D395",
          red: "#FF4D6D",
          blue: "#2B7FFF",
          warning: "#FFB443",
        },
      },
    },
  },
  plugins: [],
}