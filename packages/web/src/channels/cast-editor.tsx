import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusIcon, XIcon } from "lucide-react";
import { type ReactElement, useId, useRef, useState } from "react";
import { useApp } from "@/app-context";
import { StatusSlot } from "@/components/kit/action-bar";
import { Drawer } from "@/components/kit/drawer";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Picker } from "@/components/ui/picker";
import { ModelPicker, ProviderPicker } from "@/play/pickers";
import { providersQuery } from "@/queries";
import {
  type CastKind,
  type CastMember,
  castKindLabels,
  castKinds,
  channelKey,
  channelsKey,
  createCastMember,
  deleteCastImage,
  generateCastImage,
  pictureUrl,
  saveCastMember,
  uploadCastImage,
} from "./api";

// The drawer that adds or edits one cast member: its kind, name, aliases and description, and
// once it is saved, its reference pictures - uploaded, or made from a prompt.
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
}): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const [kind, setKind] = useState<CastKind>(member?.kind ?? "character");
  const [name, setName] = useState(member?.name ?? "");
  const [aliases, setAliases] = useState<readonly string[]>(member?.aliases ?? []);
  const [alias, setAlias] = useState("");
  const [description, setDescription] = useState(member?.description ?? "");
  const ids = { kind: useId(), name: useId(), alias: useId(), description: useId() };
  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: channelKey(channelId) }),
      client.invalidateQueries({ queryKey: channelsKey }),
    ]);
  const save = useMutation({
    mutationFn: async () => {
      const input = { kind, name: name.trim(), aliases, description };
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
  return (
    <Drawer
      open={open}
      title={member === undefined ? "Add to the cast" : `Edit ${member.name}`}
      onClose={onClose}
      footer={
        <>
          <StatusSlot tone={save.error ? "error" : "info"}>
            {save.error?.message ??
              (save.isPending ? "Saving…" : save.isSuccess ? "Saved." : undefined)}
          </StatusSlot>
          <Button
            type="submit"
            form="cast-member-form"
            variant="primary"
            disabled={save.isPending || name.trim() === ""}
          >
            {member === undefined ? "Add to the cast" : "Save"}
          </Button>
        </>
      }
    >
      <form
        id="cast-member-form"
        aria-label="Cast member"
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim() !== "") save.mutate();
        }}
      >
        <div className="grid grid-cols-1 gap-4 min-[600px]:grid-cols-[160px_1fr]">
          <div className="[&>span]:w-full">
            <Label htmlFor={ids.kind} className="mb-[5px]">
              Kind
            </Label>
            <Picker
              id={ids.kind}
              value={kind}
              onChange={(event) =>
                setKind(castKinds.find((one) => one === event.target.value) ?? "character")
              }
            >
              {castKinds.map((one) => (
                <option key={one} value={one}>
                  {castKindLabels[one]}
                </option>
              ))}
            </Picker>
          </div>
          <div>
            <Label htmlFor={ids.name} className="mb-[5px]">
              Name
            </Label>
            <Input
              id={ids.name}
              value={name}
              maxLength={200}
              required
              onChange={(event) => setName(event.target.value)}
            />
          </div>
        </div>
        <div>
          <Label htmlFor={ids.alias} className="mb-[5px]">
            Aliases
          </Label>
          <div className="flex gap-2">
            <Input
              id={ids.alias}
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
            <Button type="button" onClick={addAlias} disabled={alias.trim() === ""}>
              <PlusIcon aria-hidden="true" className="size-[14px]" />
              Add alias
            </Button>
          </div>
          <p className="mt-1 text-small text-ink3">
            Matched as whole words, ignoring case: “Tiamat” is found in “Tiamat's lair” but not in
            “Tiamatic”. Add plurals as aliases.
          </p>
          {aliases.length > 0 ? (
            <ul aria-label="Aliases" className="mt-2 flex flex-wrap gap-2">
              {aliases.map((one) => (
                <li
                  key={one}
                  className="flex items-center gap-1 rounded-control border border-line2 bg-panel2 py-[2px] pr-1 pl-2 text-small"
                >
                  {one}
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-6 px-1"
                    aria-label={`Remove alias ${one}`}
                    onClick={() => setAliases(aliases.filter((value) => value !== one))}
                  >
                    <XIcon aria-hidden="true" className="size-[12px]" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div>
          <Label htmlFor={ids.description} className="mb-[5px]">
            Description
          </Label>
          <Textarea
            id={ids.description}
            rows={3}
            value={description}
            maxLength={2000}
            placeholder="What they look like, in a sentence."
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
      </form>
      {member === undefined ? (
        <p className="mt-6 text-small text-ink2">
          Add the member first, then give it reference pictures.
        </p>
      ) : (
        <Pictures channelId={channelId} member={member} />
      )}
    </Drawer>
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
  const promptId = useId();
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
    <section aria-label="Reference pictures" className="mt-6 border-t border-line pt-4">
      <h3 className="text-row font-semibold">Reference pictures</h3>
      <p className="mt-1 text-small text-ink2">
        Sent with every image whose brief, or the video's title, names {member.name}.
      </p>
      {member.images.length > 0 ? (
        <ul aria-label={`Pictures of ${member.name}`} className="mt-3 flex flex-wrap gap-3">
          {member.images.map((image, index) => (
            <li key={image.id} className="flex w-[140px] flex-col gap-1">
              {image.state === "ready" && image.sha256 !== null ? (
                <img
                  src={pictureUrl(api, image.sha256)}
                  alt={`${member.name}, reference ${String(index + 1)}`}
                  className="h-[140px] w-[140px] rounded-control border border-line object-cover"
                />
              ) : (
                <div className="flex h-[140px] w-[140px] items-center justify-center rounded-control border border-line p-2 text-center text-small text-ink2">
                  {image.state === "generating" ? "Making the picture…" : "Not made"}
                </div>
              )}
              {image.state === "failed" && image.error ? (
                <p className="text-label text-red">{image.error}</p>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                aria-label={`Delete picture ${String(index + 1)} of ${member.name}`}
                disabled={remove.isPending || image.state === "generating"}
                onClick={() => remove.mutate(image.id)}
              >
                Delete
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-small text-ink3">No pictures yet.</p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
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
        <Button type="button" disabled={upload.isPending} onClick={() => file.current?.click()}>
          Upload a picture
        </Button>
        <span className="text-small text-ink3">PNG or JPEG, up to 10 MB.</span>
      </div>
      <div className="mt-4 space-y-3">
        <div className="grid grid-cols-1 gap-3 min-[600px]:grid-cols-2">
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
        <div>
          <Label htmlFor={promptId} className="mb-[5px]">
            Picture to make
          </Label>
          <Textarea
            id={promptId}
            rows={3}
            value={prompt}
            maxLength={4000}
            onChange={(event) => setPrompt(event.target.value)}
          />
        </div>
        <Button
          type="button"
          disabled={generate.isPending || provider === "" || model === "" || prompt.trim() === ""}
          onClick={() => generate.mutate()}
        >
          Generate a picture
        </Button>
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
