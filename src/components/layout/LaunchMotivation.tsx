import { loadPracticeProfile } from "@/lib/profile";
import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";

let dismissed = false;
let imageRequest: Promise<string | null> | undefined;
function launchImage() {
  if (!imageRequest) {
    const url = new URL(window.location.href);
    const actionLink = loadPracticeProfile()?.randomQuotesEnabled === false || url.search.length > 0 || url.hash.length > 0 ||
      /^\/(quick-recall|question-view|question-bank|test|history)(\/|$)/.test(url.pathname);
    imageRequest = actionLink ? Promise.resolve(null) : fetch("/avatars/manifest.json", { cache: "no-store" })
      .then(response => response.ok ? response.json() : [])
      .then((files: unknown) => {
        const images = Array.isArray(files) ? files.filter((file): file is string => typeof file === "string" && /\.(avif|gif|jpe?g|png|webp)$/i.test(file) && !/[\\/]/.test(file)) : [];
        const image = images[Math.floor(Math.random() * images.length)];
        return image ? `/avatars/${encodeURIComponent(image)}` : null;
      }).catch(() => null);
  }
  return imageRequest;
}

export function LaunchMotivation({ enabled }: { enabled: boolean }) {
  const [image, setImage] = useState<string | null>(null);
  const close = () => { dismissed = true; setImage(null); };
  useEffect(() => {
    let active = true;
    void launchImage().then(source => { if (active && !dismissed) setImage(source); });
    window.addEventListener("ssc-buddy-external-launch", close);
    return () => { active = false; window.removeEventListener("ssc-buddy-external-launch", close); };
  }, []);
  return <Dialog.Root open={enabled && !!image} onOpenChange={open => { if (!open) close(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[90] bg-black" />
      <Dialog.Content aria-describedby={undefined} className="fixed left-1/2 top-1/2 z-[91] w-fit max-w-[calc(100vw-48px)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl bg-[#0e0e0e] outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95">
        <Dialog.Title className="sr-only">Motivational image</Dialog.Title>
        {image && <img src={image} alt="Motivational image" onError={close} className="block h-auto max-h-[68dvh] w-auto max-w-[min(360px,calc(100vw-48px))] object-contain" />}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
