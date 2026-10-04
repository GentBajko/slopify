import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { useToast } from "@/components/kit/toast";
import { copyName } from "@/voices/row-order";
import { type CastMember, channelKey, channelQuery, channelsKey, createCastMember } from "./api";

const castNameMax = 200;

// Duplicate in a cast member's editor: a new member with the same kind, description and voice,
// named "… copy", opened in the editor. Aliases stay with the original (two members answering
// to one name would both be sent), and pictures are not copied.
export function DuplicateCastButton({
  channelId,
  member,
  onCreated,
}: {
  readonly channelId: string;
  readonly member: CastMember;
  readonly onCreated: (id: string) => void;
}): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const notify = useToast();
  const channel = useQuery(channelQuery(api, channelId));
  const duplicate = useMutation({
    mutationFn: () =>
      createCastMember(api, channelId, crypto.randomUUID(), {
        kind: member.kind,
        name: copyName(
          member.name,
          (channel.data?.cast ?? []).map((one) => one.name),
          castNameMax,
        ),
        aliases: [],
        description: member.description,
        voice: member.voice ?? null,
        host: false,
      }),
    onSuccess: async (created) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: channelKey(channelId) }),
        client.invalidateQueries({ queryKey: channelsKey }),
      ]);
      notify(
        `Made “${created.name}”. Its pictures are not copied: upload or generate them under Reference pictures.`,
        "success",
      );
      onCreated(created.id);
    },
    onError: (error) =>
      notify(
        `Couldn't duplicate ${member.name}: ${error.message} Press Duplicate in its editor to try again.`,
        "error",
      ),
  });
  return (
    <Button
      variant="quiet"
      size="small"
      // The copy's name must not repeat one in the cast, so it waits for the cast to load.
      disabled={duplicate.isPending || channel.data === undefined}
      disabledReason={duplicate.isPending ? "Making the copy" : "Loading the cast"}
      onClick={() => duplicate.mutate()}
    >
      Duplicate
    </Button>
  );
}
