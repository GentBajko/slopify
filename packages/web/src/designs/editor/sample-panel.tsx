import { frames } from "@app/slices/designs/frames.js";
import type { DesignFormat } from "@app/slices/designs/model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useState } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { Callout } from "@/components/kit/callout";
import { Select } from "@/components/kit/field";
import { TextLink } from "@/components/kit/link";
import { MediaFrame } from "@/components/kit/media";
import { SectionHead } from "@/components/kit/section-head";
import { providerUnavailableLabel } from "@/lib/provider-status";
import { keys, providersQuery } from "@/queries";
import { designFileUrl, makeSample, pieceQuoteQuery, priceWords, type TemplateView } from "../api";
import { formatName } from "../document";

// The live sample beside the settings: the template drawn with its sample values. A Save that
// changes only the text or formats redraws it at once for free; new artwork is paid, so it
// waits here for Make sample, at the price on the button.

export function formatAspect(format: DesignFormat): "landscape" | "portrait" | "square" {
  const { width, height } = frames[format];
  return width > height * 1.15 ? "landscape" : height > width * 1.15 ? "portrait" : "square";
}

// Kept to half the window's height, so the settings stay in reach when the sample sits above
// them on a narrow window.
const sampleWidth = {
  landscape: "max-w-[calc(50vh*1.7778)]",
  portrait: "max-w-[calc(50vh*0.5625)]",
  square: "max-w-[50vh]",
} as const;

export function SamplePanel({ template }: { readonly template: TemplateView }): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const sample = template.sample;
  const formats = template.document.formats.map((one) => one.format);
  const [picked, setPicked] = useState<DesignFormat | undefined>(undefined);
  const format = picked !== undefined && formats.includes(picked) ? picked : (formats[0] ?? "a4");
  const [problem, setProblem] = useState<string | null>(null);
  const quote = useQuery(pieceQuoteQuery(api, template.id, template.headVersion));
  const providers = useQuery(providersQuery(api));
  // Artwork drawn by a service this computer can't use yet: Make sample would only fail, so the
  // way to its key stands in its place.
  const { picture: art } = template.document;
  const service =
    art.source === "generate"
      ? providers.data?.providers.find((one) => one.id === art.provider)
      : undefined;
  const unusable =
    service === undefined ? undefined : providerUnavailableLabel(service.readiness) !== undefined;
  const make = useMutation({
    // The button says when the price is unknown: pressing it accepts that.
    mutationFn: () =>
      makeSample(
        api,
        template.id,
        template.headVersion,
        quote.data?.high ?? 0,
        (quote.data?.unknown ?? 0) > 0,
      ),
    onSuccess: async (result) => {
      setProblem(result.ok ? null : result.message);
      await client.invalidateQueries({ queryKey: [...keys.designTemplates, template.id] });
    },
  });
  const picture = format === "brochure" ? "a4" : format;
  const making = sample?.state === "making" || sample?.state === "queued";
  // Only a drawn sample, or one being drawn, takes the frame: the line under it says when
  // there is none, without a lamp that would read as work going on.
  const shown = sample?.designId != null && sample.state === "done";
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
      {shown || making ? (
        <MediaFrame
          aspect={formatAspect(picture)}
          alt={`Sample of ${template.name}, ${formatName(format)}`}
          {...(shown && sample?.designId != null
            ? {
                src: designFileUrl(
                  api,
                  sample.designId,
                  picture,
                  "png",
                  `${String(sample.version)}`,
                ),
              }
            : { generating: "Making the sample's artwork…" })}
          className={`mx-auto w-full [&_img]:object-contain ${sampleWidth[formatAspect(picture)]}`}
        />
      ) : null}
      {sample?.state === "held" ||
      sample?.state === "failed" ||
      sample === null ||
      (sample.state === "done" && sample.version !== template.headVersion) ? (
        <Callout
          tone={sample?.state === "failed" ? "danger" : "waiting"}
          title={
            sample === null
              ? "No sample yet."
              : sample.state === "failed"
                ? "The sample wasn't made."
                : sample.state === "held"
                  ? "The sample is waiting for you."
                  : `The sample shows version ${String(sample.version)}.`
          }
          actions={
            unusable === true ? (
              <TextLink to="/settings" search={{ section: "providers", family: "image" }}>
                {`Add a ${service?.displayName ?? "image service"} key first ↗`}
              </TextLink>
            ) : (
              <Button
                disabled={make.isPending || quote.data === undefined}
                onClick={() => make.mutate()}
              >
                {`Make sample · ${priceWords(quote.data)}`}
              </Button>
            )
          }
        >
          {problem ?? sample?.heldReason ?? undefined}
        </Callout>
      ) : null}
    </section>
  );
}
