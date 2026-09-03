import "@fontsource/barlow/400.css";
import "@fontsource/barlow/500.css";
import "@fontsource/barlow/600.css";
import "@fontsource/barlow/700.css";
import "@fontsource/barlow/800.css";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "@/styles/index.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createApi } from "@/api";
import type { AppDeps } from "@/app-context";
import { AppProvider } from "@/app-context";
import { createAppRouter } from "@/router";
import { createVersionWatch, watchingFetch } from "@/version";

// The composition root. Everything with a lifetime is built here, once, and handed down
// through providers; nothing below reaches for a client of its own (03-conventions,
// Dependency injection).
function start(container: HTMLElement): void {
  const version = createVersionWatch();
  const deps: AppDeps = {
    api: createApi(window.location.origin, watchingFetch(window.fetch.bind(window), version)),
    openEvents: (url) => new EventSource(url),
    version,
  };

  createRoot(container).render(
    <StrictMode>
      <QueryClientProvider client={new QueryClient()}>
        <AppProvider deps={deps}>
          <RouterProvider router={createAppRouter()} />
        </AppProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
}

const root = document.getElementById("root");
if (root === null) {
  throw new Error("index.html carries no #root element for the app to mount on");
}
start(root);
