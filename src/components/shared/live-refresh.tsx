"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Mantém a tela atualizada com os pedidos em "tempo real" sem WebSocket (compatível com a Vercel).
 *
 * A cada `intervalMs` consulta uma rota leve que devolve só a versão atual dos pedidos e chama
 * `router.refresh()` apenas quando a versão muda. Pausa enquanto a aba está em segundo plano e
 * verifica de imediato quando ela volta a ficar visível. `maxStaleMs` força um refresh periódico
 * mesmo sem mudanças (por exemplo, para atualizar os minutos decorridos exibidos na tela).
 *
 * Para trocar por push (Neon Realtime, Pusher...) basta substituir este componente.
 */
export function LiveRefresh({
  intervalMs = 3000,
  maxStaleMs = 60_000,
  endpoint = "/api/painel/pedidos/versao",
}: {
  intervalMs?: number;
  maxStaleMs?: number;
  endpoint?: string;
}) {
  const router = useRouter();
  const lastVersion = useRef<string | null>(null);
  const lastRefresh = useRef(0);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    let stopped = false;
    lastRefresh.current = Date.now();

    async function check() {
      if (stopped) return;
      // Em segundo plano não consulta, mas continua agendando: não dependemos só do evento
      // `visibilitychange`, que alguns navegadores/webviews nem sempre disparam.
      if (document.visibilityState !== "visible") {
        schedule();
        return;
      }

      controller?.abort();
      controller = new AbortController();
      // Uma requisição presa nunca pode travar o ciclo: desiste após alguns segundos.
      const timeout = setTimeout(() => controller?.abort(), Math.max(intervalMs * 2, 8000));
      try {
        const response = await fetch(endpoint, { cache: "no-store", signal: controller.signal });
        if (response.ok) {
          const { version } = (await response.json()) as { version?: string };
          const changed = lastVersion.current !== null && version !== lastVersion.current;
          const stale = Date.now() - lastRefresh.current >= maxStaleMs;
          lastVersion.current = version ?? null;
          if (changed || stale) {
            lastRefresh.current = Date.now();
            router.refresh();
          }
        }
      } catch {
        // Falha de rede, tempo esgotado ou requisição cancelada: tenta de novo no próximo ciclo.
      } finally {
        clearTimeout(timeout);
      }
      schedule();
    }

    function schedule() {
      if (stopped) return;
      clearTimeout(timer);
      timer = setTimeout(check, intervalMs);
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        clearTimeout(timer);
        void check();
      }
    }

    void check();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      stopped = true;
      clearTimeout(timer);
      controller?.abort();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [endpoint, intervalMs, maxStaleMs, router]);

  return null;
}
