import { useEffect, useRef, useState } from "react";

/**
 * Atrasa a montagem do conteúdo até ele estar perto da viewport (ou até o
 * navegador ficar ocioso). Para seções pesadas abaixo da dobra — gráficos,
 * listas grandes — sem tirá-las do fluxo. Enquanto isso mostra `fallback`
 * (um skeleton no formato certo).
 */
export function LazyMount({ children, fallback = null, rootMargin = "200px", minHeight }) {
  const ref = useRef(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (show) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setShow(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShow(true);
          io.disconnect();
        }
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [show, rootMargin]);

  return (
    <div ref={ref} style={{ minHeight }}>
      {show ? children : fallback}
    </div>
  );
}
