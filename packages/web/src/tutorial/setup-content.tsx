import { External } from "./content-parts";

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
              Sign in to <External href="https://openrouter.ai/settings/keys">OpenRouter</External>,
              create an API key, and make sure the account can use your chosen model.
            </li>
            <li>
              Paste it into OpenRouter’s <strong>API key</strong> field here and press{" "}
              <strong>Save</strong>.
            </li>
          </ol>
          <p>
            Already using Claude Code or Codex? You can use its existing CLI login instead.
            “Installed” means Slopify found the CLI; sign in through that CLI before generating.
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
            The voice provider turns the finished article into audio. Choose{" "}
            <strong>ElevenLabs</strong>, <strong>OpenAI</strong>, or <strong>Cartesia</strong>; you
            do not need all three.
          </p>
          <p>
            Create a key in your provider’s account, enable the API access or credits it requires,
            then paste the key into its row and press <strong>Save</strong>.
          </p>
          <p>
            <External href="https://elevenlabs.io/app/developers/api-keys">
              ElevenLabs keys
            </External>{" "}
            · <External href="https://platform.openai.com/api-keys">OpenAI keys</External> ·{" "}
            <External href="https://play.cartesia.ai/keys">Cartesia keys</External>
          </p>
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
            Choose one image provider, create a key in its dashboard, paste it into the matching
            row, and press <strong>Save</strong>.
          </p>
          <p>
            <External href="https://fal.ai/dashboard/keys">fal.ai</External> ·{" "}
            <External href="https://replicate.com/account/api-tokens">Replicate</External> ·{" "}
            <External href="https://aistudio.google.com/apikey">Google AI Studio</External> ·{" "}
            <External href="https://platform.openai.com/api-keys">OpenAI</External>
          </p>
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
