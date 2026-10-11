import { createFileRoute } from "@tanstack/react-router";
import { Profile } from "./profile";

const title = "Profile";
const description = "Your yearly practice activity and progress.";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title }, { name: "description", content: description }] }),
  component: Profile,
});
