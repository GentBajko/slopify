import { keyGuides } from "@app/slices/settings/key-guides.js";
import { type ProviderFamily, type ProviderId, providers } from "@app/slices/settings/model.js";
import { External } from "./content-parts";

// The key steps link to the same pages Settings → Providers shows (`settings/key-guides.ts`),
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
          <p>First, choose what will write your scripts. You only need one text provider.</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              Sign in to{" "}
              <External href={keyGuides.openrouter?.keyPage.url ?? "https://openrouter.ai"}>
                OpenRouter
              </External>
              , create an API key, and make sure the account can use your chosen model.
            </li>
            <li>
              Paste it into OpenRouter’s <strong>API key</strong> field here, press{" "}
              <strong>Test</strong> to check it, then <strong>Save</strong>.
            </li>
          </ol>
          <p>
            Already using Claude Code, Codex or Gemini CLI? You can use its existing CLI login
            instead. “Installed” means Slopify found the CLI; sign in through that CLI before
            generating. If it is missing, enter its executable path and save to check again.
          </p>
          <p className="text-ink3">
            These are the real Settings controls. The tutorial never reads your key. Skip any step
            you have already handled.
          </p>
        </>
      );
    case "audio-key":
      return (
        <>
          <p>
            The voice provider turns the finished article into audio. Choose {listed("tts")}; you
            only need one.
          </p>
          <p>
            Create a key in your provider’s account, enable the API access or credits it requires,
            then paste the key into its row, press <strong>Test</strong> to check it, and press{" "}
            <strong>Save</strong>.
          </p>
          <KeyLinks family="tts" />
          <p>
            Next, you’ll add the exact voice that this provider should use. Skip voice setup if you
            plan to provide your own narration or turn Audio Off.
          </p>
        </>
      );
    case "image-key":
      return (
        <>
          <p>
            Choose one image provider ({listed("image")}), create a key in its dashboard, paste it
            into the matching row, press <strong>Test</strong> to check it, and press{" "}
            <strong>Save</strong>.
          </p>
          <KeyLinks family="image" />
          <p>
            A saved key is not a billing check. The selected image model needs available quota. If
            Google reports <strong>limit: 0</strong>, check the key’s project, billing and
            image-model quota before retrying.
          </p>
          <p>
            OpenAI’s voice and image rows are saved separately, even when you use the same API key.
            Skip this step if you plan to provide your own images or turn Images and Thumbnail Off.
          </p>
        </>
      );
    case "voice":
      return (
        <>
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              Enter a <strong>Voice name</strong> you will recognize, such as “Travel narrator.”
            </li>
            <li>
              Select the <strong>Provider</strong> whose voice key you saved.
            </li>
            <li>
              Copy the exact <strong>Voice ID</strong> from that provider’s voice library or
              documentation.
            </li>
            <li>
              Press <strong>Add voice</strong>.
            </li>
          </ol>
          <p>
            The name is your label; the ID tells the provider which voice to use. Slopify checks the
            ID with the provider when narration runs. A voice is only required when Audio is set to
            Generate.
          </p>
        </>
      );
  }
}
