// frontend/src/theme/financeTheme.js
import { createTheme } from "@mui/material/styles";

const round = 16; // consistent radiuses

export const financeTheme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#1f7aec" },     // calm blue
    success: { main: "#08a88a" },     // green like your mock
    warning: { main: "#ff9800" },
    error:   { main: "#eb5757" },
    grey:    { 100: "#f7f8fa", 200: "#eef1f5", 300: "#dfe5ee", 700: "#2c3a4b" },
    divider: "#eef1f5",
    background: { default: "#f7f8fa", paper: "#ffffff" },
  },
  typography: {
    fontFamily: `'Inter', system-ui, -apple-system, Segoe UI, Roboto, Arial`,
    h5: { fontWeight: 700, letterSpacing: 0.2 },
    subtitle2: { color: "#6b778c" },
    button: { textTransform: "none", fontWeight: 600 }
  },
  shape: { borderRadius: round },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: round,
          boxShadow: "0 1px 2px rgba(16,24,40,0.08), 0 6px 20px rgba(16,24,40,0.06)",
        },
      },
    },
    MuiChip: {
      styleOverrides: { root: { borderRadius: 999 } },
    },
    MuiTableHead: {
      styleOverrides: { root: { position: "sticky", top: 0, background: "#fff", zIndex: 1 } },
    },
    MuiSkeleton: {
      styleOverrides: { root: { transform: "scale(1)", borderRadius: 8 } },
    },
  },
});
