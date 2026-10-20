import React from "react";
import { createRoot } from "react-dom/client";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { Route } from "../../../src/routes/habits";
import "../../../src/styles.css";
const rootRoute = createRootRoute({ component: Outlet });
const page = createRoute({
  getParentRoute: () => rootRoute,
  path: "/habits",
  component: Route.options.component,
});
const router = createRouter({
  routeTree: rootRoute.addChildren([page]),
  history: createMemoryHistory({ initialEntries: ["/habits"] }),
});
createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
