import { keyGuides } from "@app/slices/settings/key-guides.js";
import { type ProviderFamily, type ProviderId, providers } from "@app/slices/settings/model.js";
import { External } from "./content-parts";

// The key steps link to the same pages Settings → Keys & services shows (`settings/key-guides.ts`),
// so the tutorial and the key guides can't drift apart.
export function keyLinks(
  family: ProviderFamily,
): readonly { readonly id: ProviderId; readonly name: string; readonly url: string }[] {
  return providers.flatMap((provider) => {
    const guide = provider.auth === "key" ? keyGuides[provider.id] : undefined;
    return provider.family === family && guide !== undefined
      ? [{ id: provider.id, name: provider.displayName, url: guide.keyPage.url }]
      : [];
  });
}

function KeyLinks({ family }: { readonly family: ProviderFamily }) {
  return (
    <p>
      {keyLinks(family).map((link, index) => (
        <span key={link.id}>
          {index === 0 ? null : " · "}
          <External href={link.url}>{`${link.name} keys`}</External>
        </span>
      ))}
    </p>
  );
}

function listed(family: ProviderFamily): string {
  const names = keyLinks(family).map((link) => link.name);
  return names.length < 2
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} or ${names.at(-1) ?? ""}`;
}

export function SetupContent({
  step,
}: {
  readonly step: "text-key" | "audio-key" | "image-key" | "voice";
}) {
  switch (step) {
    case "text-key":
      return (
        <>
          <p>First, choose what writes your articles. You only need one writing service.</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              Sign in to{" "}
              <External href={keyGuides.openrouter?.keyPage.url ?? "https://openrouter.ai"}>
                OpenRouter
              </External>
              , create an API key, and make sure the account can use your chosen model.
            </li>
            <li>
              Pick <strong>OpenRouter</strong> in the list, paste the key into{" "}
              <strong>OpenRouter API key</strong> and press <strong>Save</strong>.{" "}
              <strong>Test the key (free)</strong> then checks it.
            </li>
          </ol>
          <p>
            Already using Claude Code, Codex or Antigravity CLI? Slopify uses its sign-in instead of
            a key. <strong>Ready</strong> means Slopify found it and it is signed in; if it says{" "}
            <strong>Signed out</strong>, sign in through that tool. If it says{" "}
            <strong>Not found</strong>, press <strong>Change path</strong> and enter where it is
            installed.
          </p>
          <p className="text-ink-3">
            These are the real Settings controls. The tutorial never reads your key. Skip any step
            you have already handled.
          </p>
        </>
      );
    case "audio-key":
      return (
        <>
          <p>
            The voice service reads the finished article aloud. Choose {listed("tts")}; you only
            need one.
          </p>
          <p>
            Create a key in the service’s account and add the credit it needs. Then pick the service
            here, paste the key into its <strong>API key</strong> box and press{" "}
            <strong>Save</strong>. <strong>Test the key (free)</strong> checks it.
          </p>
          <KeyLinks family="tts" />
          <p>
            Next, you’ll add the voice this service should use. Skip voice setup if you plan to use
            your own recording or set Narration to Off.
          </p>
        </>
      );
    case "image-key":
      return (
        <>
          <p>
            Choose one image service ({listed("image")}), create a key in its dashboard, paste it
            into its <strong>API key</strong> box here and press <strong>Save</strong>.{" "}
            <strong>Test the key (free)</strong> checks it.
          </p>
          <KeyLinks family="image" />
          <p>
            A saved key is not a billing check. The selected image model needs available quota. If
            Google reports <strong>limit: 0</strong>, check the key’s project, billing and
            image-model quota before retrying.
          </p>
          <p>
            OpenAI is listed as a voice service and as an image service, and each keeps its own key,
            even when you paste the same one. Skip this step if you plan to use your own images, or
            set Images to None and leave the thumbnail off.
          </p>
        </>
      );
    case "voice":
      return (
        <>
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              Under <strong>Add a voice</strong>, pick the <strong>Voice service</strong> whose key
              you saved.
            </li>
            <li>
              Pick a <strong>Voice</strong> from its list, or{" "}
              <strong>A voice of my own (paste its ID)</strong> and paste the ID from the service’s
              voice library.
            </li>
            <li>
              Type a <strong>Name</strong> you will recognize, such as “Travel narrator.”
            </li>
            <li>
              Press <strong>Add voice</strong>.
            </li>
          </ol>
          <p>
            The name is how you pick the voice on Create; the voice itself tells the service who
            reads. A voice is needed only when Narration is set to AI voice.
          </p>
        </>
      );
  }
}
