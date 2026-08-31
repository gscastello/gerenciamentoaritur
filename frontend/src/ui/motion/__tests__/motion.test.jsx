import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Presence } from "../Presence.jsx";
import { Skeleton } from "../Skeleton.jsx";
import { useReducedMotion } from "../useReducedMotion.js";

function setReducedMotion(matches) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

afterEach(() => {
  vi.restoreAllMocks();
  setReducedMotion(false);
});

describe("useReducedMotion", () => {
  it("reflete a media query", () => {
    setReducedMotion(true);
    let value;
    function Probe() {
      value = useReducedMotion();
      return null;
    }
    render(<Probe />);
    expect(value).toBe(true);
  });
});

describe("Skeleton", () => {
  it("não renderiza o shimmer quando o usuário pede menos movimento", () => {
    setReducedMotion(true);
    const { container } = render(<Skeleton height={20} />);
    // com reduced-motion o wrapper existe mas não há span interno animado
    expect(container.querySelector("span > span")).toBeNull();
  });

  it("renderiza o shimmer normalmente", () => {
    setReducedMotion(false);
    const { container } = render(<Skeleton height={20} />);
    expect(container.querySelector("span > span")).not.toBeNull();
  });
});

describe("Presence", () => {
  it("mantém o filho montado durante a saída e depois desmonta", async () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <Presence when={true} duration={200}>
        <div>conteudo</div>
      </Presence>,
    );
    expect(screen.getByText("conteudo")).toBeInTheDocument();

    rerender(
      <Presence when={false} duration={200}>
        <div>conteudo</div>
      </Presence>,
    );
    // ainda montado (animando a saída)
    expect(screen.queryByText("conteudo")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(250);
    });
    expect(screen.queryByText("conteudo")).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it("com reduced-motion desmonta imediatamente", async () => {
    setReducedMotion(true);
    vi.useFakeTimers();
    const { rerender } = render(
      <Presence when={true} duration={200}>
        <div>x</div>
      </Presence>,
    );
    rerender(
      <Presence when={false} duration={200}>
        <div>x</div>
      </Presence>,
    );
    await act(async () => {
      vi.advanceTimersByTime(5);
    });
    expect(screen.queryByText("x")).not.toBeInTheDocument();
    vi.useRealTimers();
  });
});
