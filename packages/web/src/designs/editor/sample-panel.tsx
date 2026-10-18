import { frames } from "@app/slices/designs/frames.js";
import type { DesignFormat } from "@app/slices/designs/model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useState } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { Callout } from "@/components/kit/callout";
import { Select } from "@/components/kit/field";
import { MediaFrame } from "@/components/kit/media";
import { SectionHead } from "@/components/kit/section-head";
import { keys } from "@/queries";
import { designFileUrl, makeSample, pieceQuoteQuery, priceWords, type TemplateView } from "../api";
import { formatName } from "../document";

// The live sample beside the settings: the template drawn with its sample values. A Save that
// changes only the text or formats redraws it at once for free; a new picture is paid, and a
// sample that would cost more than shown or go over the day's budget waits here for Make sample.

function aspectOf(format: DesignFormat): "landscape" | "portrait" | "square" {
  const { width, height } = frames[format];
  return width > height * 1.15 ? "landscape" : height > width * 1.15 ? "portrait" : "square";
}

export function SamplePanel({ template }: { readonly template: TemplateView }): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const sample = template.sample;
  const formats = template.document.formats.map((one) => one.format);
  const [picked, setPicked] = useState<DesignFormat | undefined>(undefined);
  const format = picked !== undefined && formats.includes(picked) ? picked : (formats[0] ?? "a4");
  const [problem, setProblem] = useState<string | null>(null);
  const quote = useQuery(pieceQuoteQuery(api, template.id, template.headVersion));
  const make = useMutation({
    mutationFn: () => makeSample(api, template.id, template.headVersion, quote.data?.high ?? 0),
    onSuccess: async (result) => {
      setProblem(result.ok ? null : result.message);
      await client.invalidateQueries({ queryKey: [...keys.designTemplates, template.id] });
    },
  });
  const picture = format === "brochure" ? "a4" : format;
  const drawn =
    sample?.designId != null &&
    (sample.state === "done" || sample.state === "making" || sample.state === "queued");
  return (
    <section aria-label="Sample" className="flex min-w-0 flex-col gap-3">
      <SectionHead
        as="h2"
        size="small"
        title="Sample"
        meta={
          sample === null
            ? "Drawn with the sample values after you save."
            : `Version ${String(sample.version)} · ${formatName(format)}`
        }
      />
      {formats.length > 1 ? (
        <Select
          aria-label="Sample format"
          value={format}
          onChange={(event) => setPicked(event.target.value as DesignFormat)}
          options={formats.map((one) => ({ value: one, label: formatName(one) }))}
        />
      ) : null}
      <MediaFrame
        aspect={aspectOf(picture)}
        alt={`Sample of ${template.name}, ${formatName(format)}`}
        {...(drawn && sample?.designId != null && sample.state === "done"
          ? {
              src: designFileUrl(api, sample.designId, picture, "png", `${String(sample.version)}`),
            }
          : {
              generating:
                sample === null
                  ? "No sample yet"
                  : sample.state === "making" || sample.state === "queued"
                    ? "Making the sample's artwork…"
                    : "No sample for this version",
            })}
        className="[&_img]:object-contain"
      />
      {sample?.state === "held" || sample?.state === "failed" || sample === null ? (
        <Callout
          tone={sample?.state === "failed" ? "danger" : "waiting"}
          title={
            sample === null
              ? "Save to see a sample, or make one now."
              : sample.state === "failed"
                ? "The sample wasn't made."
                : "The sample is waiting for you."
          }
          actions={
            <Button
              disabled={make.isPending || quote.data === undefined}
              onClick={() => make.mutate()}
            >
              {`Make sample · ${priceWords(quote.data)}`}
            </Button>
          }
        >
          {problem ?? sample?.heldReason ?? undefined}
        </Callout>
      ) : null}
    </section>
  );
}
