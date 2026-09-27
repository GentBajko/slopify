import { paceSteps } from "@app/slices/voices/model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { type ReactElement, useRef, useState } from "react";
import { useApp } from "@/app-context";
import { StatusSlot } from "@/components/kit/action-bar";
import { Button } from "@/components/kit/button";
import { Field, Input, Select, Textarea } from "@/components/kit/field";
import { helpScope, InfoTip } from "@/components/kit/info-tip";
import { Rule } from "@/components/kit/layout";
import { MediaFrame } from "@/components/kit/media";
import { SectionHead } from "@/components/kit/section-head";
import { Badge, Chip } from "@/components/kit/status";
import { useVoicesForLanguage, VoiceLanguageNote } from "@/language/voice-language";
import { ModelPicker, OptionPicker, ProviderPicker } from "@/play/pickers";
import { providersQuery, voicesQuery } from "@/queries";
import {
  type CastKind,
  type CastMember,
  type CastVoice,
  castKindLabels,
  castKinds,
  channelKey,
  channelQuery,
  channelsKey,
  createCastMember,
  deleteCastImage,
  generateCastImage,
  pictureUrl,
  saveCastMember,
  uploadCastImage,
} from "./api";

// The editor beside the cast that adds or edits one member: its kind, name, aliases and
// description, and once it is saved, its reference pictures - uploaded, or made from a prompt.
export function CastEditor({
  channelId,
  member,
  open,
  onClose,
  onCreated,
}: {
  readonly channelId: string;
  // Undefined while adding a new member.
  readonly member: CastMember | undefined;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onCreated: (id: string) => void;
}): ReactElement | null {
  const { api } = useApp();
  const client = useQueryClient();
  const [kind, setKind] = useState<CastKind>(member?.kind ?? "character");
  const [name, setName] = useState(member?.name ?? "");
  const [aliases, setAliases] = useState<readonly string[]>(member?.aliases ?? []);
  const [alias, setAlias] = useState("");
  const [description, setDescription] = useState(member?.description ?? "");
  const [voice, setVoice] = useState<CastVoice | undefined>(member?.voice);
  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: channelKey(channelId) }),
      client.invalidateQueries({ queryKey: channelsKey }),
    ]);
  const save = useMutation({
    mutationFn: async () => {
      const input = {
        kind,
        name: name.trim(),
        aliases,
        description,
        // Only a complete voice is saved; clearing the provider removes it.
        voice:
          voice !== undefined && voice.provider !== "" && voice.model !== "" && voice.voice !== ""
            ? voice
            : null,
      };
      return member === undefined
        ? createCastMember(api, channelId, crypto.randomUUID(), input)
        : saveCastMember(api, member.id, { ...input, baseVersion: member.version });
    },
    onSuccess: async (saved) => {
      await refresh();
      if (member === undefined) onCreated(saved.id);
    },
  });
  const addAlias = () => {
    const value = alias.trim();
    if (value === "" || aliases.some((one) => one.toLowerCase() === value.toLowerCase())) return;
    setAliases([...aliases, value]);
    setAlias("");
  };
  if (!open) return null;
  return (
    <section aria-label={member === undefined ? "Add to cast" : `Edit ${member.name}`}>
      <SectionHead
        kicker={member === undefined ? "New cast member" : castKindLabels[member.kind]}
        title={member === undefined ? "Add to cast" : member.name}
        meta={
          member === undefined
            ? "Name it first, then give it reference pictures."
            : "Used whenever a title or an image brief names it or one of its aliases."
        }
      >
        <Button variant="quiet" size="small" onClick={onClose}>
          Close
        </Button>
      </SectionHead>
      {member !== undefined && !member.images.some((image) => image.state === "ready") ? (
        <p className="m-0 mt-2 text-small text-waiting">
          No picture yet, so it is not sent with any image. Upload or generate one below.
        </p>
      ) : null}
      <form
        id="cast-member-form"
        aria-label="Cast member"
        className="mt-4 flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim() !== "") save.mutate();
        }}
      >
        <div className="grid grid-cols-1 gap-4 min-[600px]:grid-cols-[160px_minmax(0,1fr)]">
          <Field label="Kind" tip="planning.cast.kind">
            <Select
              value={kind}
              onChange={(event) =>
                setKind(castKinds.find((one) => one === event.target.value) ?? "character")
              }
              options={castKinds.map((one) => ({ value: one, label: castKindLabels[one] }))}
            />
          </Field>
          <Field label="Name" tip="planning.cast.name">
            <Input
              value={name}
              maxLength={200}
              required
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
        </div>
        <Field label="Aliases" tip="planning.cast.aliases" help="Press Enter to add each one.">
          <div className="flex gap-2">
            <Input
              value={alias}
              maxLength={200}
              placeholder="Another name, such as the Dragon Queen"
              onChange={(event) => setAlias(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addAlias();
                }
              }}
            />
            <Button onClick={addAlias} disabled={alias.trim() === ""}>
              <PlusIcon aria-hidden="true" className="size-4" strokeWidth={1.75} />
              Add alias
            </Button>
          </div>
        </Field>
        {aliases.length > 0 ? (
          <ul aria-label="Aliases added" className="m-0 flex list-none flex-wrap gap-2 p-0">
            {aliases.map((one) => (
              <li key={one}>
                <Chip
                  removeLabel={`Remove alias ${one}`}
                  onRemove={() => setAliases(aliases.filter((value) => value !== one))}
                >
                  {one}
                </Chip>
              </li>
            ))}
          </ul>
        ) : null}
        <Field label="Description for the image model" tip="planning.cast.description">
          <Textarea
            rows={3}
            value={description}
            maxLength={2000}
            placeholder="What they look like, in a sentence."
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>
        <CastVoiceFields channelId={channelId} value={voice} onChange={setVoice} />
        <div className="flex flex-wrap items-center gap-3">
          <StatusSlot tone={save.error ? "error" : "info"}>
            {save.error?.message ??
              (save.isPending ? "Saving…" : save.isSuccess ? "Saved." : undefined)}
          </StatusSlot>
          <Button
            type="submit"
            form="cast-member-form"
            variant={member === undefined ? "primary" : "secondary"}
            disabled={save.isPending || name.trim() === ""}
          >
            {member === undefined ? "Add to cast" : "Save"}
          </Button>
        </div>
      </form>
      {member === undefined ? null : <Pictures channelId={channelId} member={member} />}
    </section>
  );
}

function Pictures({
  channelId,
  member,
}: {
  readonly channelId: string;
  readonly member: CastMember;
}): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const providers = useQuery(providersQuery(api));
  const file = useRef<HTMLInputElement>(null);
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [prompt, setPrompt] = useState(
    `${member.name}${member.description.trim() ? `, ${member.description.trim()}` : ""}. A clear reference picture on a plain background, the whole ${member.kind === "place" ? "place" : member.kind === "object" ? "object" : "figure"} in view.`,
  );
  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: channelKey(channelId) }),
      client.invalidateQueries({ queryKey: channelsKey }),
    ]);
  const upload = useMutation({
    mutationFn: (picked: File) => uploadCastImage(api, member.id, picked),
    onSettled: refresh,
  });
  const generate = useMutation({
    mutationFn: () => generateCastImage(api, member.id, { prompt, provider, model }),
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: (imageId: string) => deleteCastImage(api, member.id, imageId),
    onSettled: refresh,
  });
  const error = upload.error ?? generate.error ?? remove.error;
  return (
    <section aria-label="Reference pictures" className="mt-6">
      <Rule className="mb-6" />
      <SectionHead
        as="h3"
        title="Reference pictures"
        meta={`Sent with every image whose brief, or the video's title, names ${member.name}.`}
        info="planning.cast.pictures"
      />
      {member.images.length > 0 ? (
        <ul
          aria-label={`Pictures of ${member.name}`}
          className="m-0 mt-3 grid list-none grid-cols-2 gap-3 p-0 min-[600px]:grid-cols-3"
        >
          {member.images.map((image, index) => (
            <li key={image.id} className="min-w-0">
              <MediaFrame
                aspect="square"
                alt={`${member.name}, reference ${String(index + 1)}`}
                {...(image.state === "ready" && image.sha256 !== null
                  ? { src: pictureUrl(api, image.sha256) }
                  : {})}
                {...(image.state === "generating" ? { generating: "Making the picture…" } : {})}
                {...(image.state === "failed"
                  ? { badge: <Badge tone="failed">Failed</Badge> }
                  : {})}
                actionsShown
                actions={
                  <Button
                    variant="secondary"
                    size="small"
                    aria-label={`Delete picture ${String(index + 1)} of ${member.name}`}
                    disabled={remove.isPending || image.state === "generating"}
                    disabledReason="Wait until the picture is made"
                    onClick={() => remove.mutate(image.id)}
                  >
                    Delete
                  </Button>
                }
              />
              {image.state === "failed" && image.error ? (
                <p className="m-0 mt-1 text-small text-danger">{image.error}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 mt-3 text-small text-ink-3">No pictures yet.</p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          ref={file}
          type="file"
          accept="image/png,image/jpeg"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            const picked = event.target.files?.[0];
            event.target.value = "";
            if (picked) upload.mutate(picked);
          }}
        />
        <Button disabled={upload.isPending} onClick={() => file.current?.click()}>
          Upload a picture
        </Button>
        <span className="text-small text-ink-3">PNG or JPEG, up to 10 MB.</span>
      </div>
      <div className="mt-4 flex flex-col gap-4">
        <div className="flex flex-col gap-2" {...helpScope}>
          <p className="sl-kicker m-0 flex items-center gap-1">
            Make a picture
            <InfoTip id="planning.cast.generate" className="-my-1" />
          </p>
          <div className="grid grid-cols-1 gap-4 min-[600px]:grid-cols-2">
            <ProviderPicker
              label="Image provider"
              family="image"
              providers={providers.data?.providers ?? []}
              value={provider}
              problem={undefined}
              onPick={(next) => {
                setProvider(next);
                setModel("");
              }}
            />
            <ModelPicker
              label="Image model"
              provider={provider}
              value={model}
              problem={undefined}
              onPick={setModel}
            />
          </div>
        </div>
        <Field label="Picture to make" tip="planning.cast.picture-prompt">
          <Textarea
            rows={3}
            value={prompt}
            maxLength={4000}
            onChange={(event) => setPrompt(event.target.value)}
          />
        </Field>
        <div>
          <Button
            disabled={generate.isPending || provider === "" || model === "" || prompt.trim() === ""}
            disabledReason="Pick an image provider and model, and describe the picture"
            onClick={() => generate.mutate()}
          >
            Generate a picture
          </Button>
        </div>
      </div>
      <StatusSlot tone={error ? "error" : "info"} className="mt-2">
        {error?.message ??
          (upload.isPending
            ? "Uploading…"
            : generate.isSuccess
              ? "The picture is being made; it appears here when it is ready."
              : undefined)}
      </StatusSlot>
    </section>
  );
}

// How this member speaks when a multi-voice run casts them: the Speakers panel on Play offers
// every member with a voice, and a run takes the voice as it is when the run starts.
// The voices listed are the ones that speak the channel's language, with Show all voices for
// the rest, as on Play.
function CastVoiceFields({
  channelId,
  value,
  onChange,
}: {
  readonly channelId: string;
  readonly value: CastVoice | undefined;
  readonly onChange: (next: CastVoice | undefined) => void;
}): ReactElement {
  const { api } = useApp();
  const providers = useQuery(providersQuery(api));
  const voices = useQuery(voicesQuery(api));
  const channel = useQuery(channelQuery(api, channelId));
  const language = channel.data?.channel.brand.language ?? "en";
  const voice = value ?? { provider: "", model: "", voice: "" };
  const ofProvider = (voices.data?.voices ?? []).filter((one) => one.provider === voice.provider);
  const byLanguage = useVoicesForLanguage(ofProvider, language, voice.voice || undefined);
  const mine = byLanguage.listed;
  return (
    <fieldset
      className="m-0 flex flex-col gap-3 border-0 border-t border-line p-0 pt-4"
      {...helpScope}
    >
      <legend className="sl-kicker flex items-center gap-1">
        Voice
        <InfoTip id="planning.cast.voice" label="Cast voice" className="-my-1" />
      </legend>
      <p className="text-small text-ink-2">
        For multi-voice runs: pick this member under Speakers on Play.
      </p>
      <div className="grid grid-cols-1 gap-3 min-[600px]:grid-cols-2">
        <ProviderPicker
          label="Voice provider"
          family="tts"
          providers={providers.data?.providers ?? []}
          value={voice.provider}
          problem={undefined}
          onPick={(provider) =>
            onChange(provider === "" ? undefined : { provider, model: "", voice: "" })
          }
        />
        <ModelPicker
          label="Voice model"
          provider={voice.provider}
          value={voice.model}
          problem={undefined}
          onPick={(model) => onChange({ ...voice, model })}
        />
        <OptionPicker
          label="Voice"
          value={voice.voice}
          placeholder={mine.length === 0 ? "No voices. Add one in Settings." : "Pick a voice"}
          options={mine.map((one) => ({ value: one.voiceId, label: one.name }))}
          problem={undefined}
          onPick={(picked) => onChange({ ...voice, voice: picked })}
        />
        <VoiceLanguageNote
          language={language}
          voice={ofProvider.find((one) => one.voiceId === voice.voice)}
          hidden={byLanguage.hidden}
          showAll={byLanguage.showAll}
          onShowAll={byLanguage.setShowAll}
        />
        <OptionPicker
          label="Pace"
          value={String(voice.pace ?? 1)}
          placeholder="Pick a pace"
          options={paceSteps.map((step) => ({
            value: String(step),
            label: step === 1 ? "Normal" : `${String(step)}×`,
          }))}
          problem={undefined}
          onPick={(pace) => {
            const { pace: _old, ...rest } = voice;
            onChange(Number(pace) === 1 ? rest : { ...rest, pace: Number(pace) });
          }}
        />
      </div>
      {value === undefined ? null : (
        <Button variant="quiet" onClick={() => onChange(undefined)}>
          Remove the voice
        </Button>
      )}
    </fieldset>
  );
}
