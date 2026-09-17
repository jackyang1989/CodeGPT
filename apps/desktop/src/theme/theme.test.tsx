import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  THEME_STORAGE_KEY,
  ThemeProvider,
  useTheme,
} from "./theme";

function ThemeProbe() {
  const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme-value">{theme}</span>
      <span data-testid="resolved-theme-value">{resolvedTheme}</span>
      <button data-testid="toggle-btn" onClick={toggleTheme}>Toggle</button>
      <button data-testid="set-dark-btn" onClick={() => setTheme("dark")}>Set Dark</button>
      <button data-testid="set-light-btn" onClick={() => setTheme("light")}>Set Light</button>
      <button data-testid="set-system-btn" onClick={() => setTheme("system")}>Set System</button>
    </div>
  );
}

describe("ThemeProvider", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("defaults to system and applies data-theme on document", async () => {
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>
    );

    expect(screen.getByTestId("theme-value")).toHaveTextContent("system");
    await waitFor(() => {
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    });
  });

  it("allows setting dark and light themes, persisting to localStorage", async () => {
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByTestId("set-light-btn"));
    expect(screen.getByTestId("theme-value")).toHaveTextContent("light");
    expect(screen.getByTestId("resolved-theme-value")).toHaveTextContent("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");

    fireEvent.click(screen.getByTestId("set-dark-btn"));
    expect(screen.getByTestId("theme-value")).toHaveTextContent("dark");
    expect(screen.getByTestId("resolved-theme-value")).toHaveTextContent("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });

  it("toggles between dark and light themes", async () => {
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>
    );

    // Initial is dark (system default in test env)
    fireEvent.click(screen.getByTestId("toggle-btn"));
    expect(screen.getByTestId("theme-value")).toHaveTextContent("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");

    fireEvent.click(screen.getByTestId("toggle-btn"));
    expect(screen.getByTestId("theme-value")).toHaveTextContent("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("restores previously stored theme on mount", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "light");

    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>
    );

    expect(screen.getByTestId("theme-value")).toHaveTextContent("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });
});
