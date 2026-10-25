import { designFields } from "@app/slices/designs/fields.js";
import type { CostEstimate } from "@app/slices/estimate/index.js";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type ReactElement, useState } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { Callout } from "@/components/kit/callout";
import { Drawer } from "@/components/kit/drawer";
import { Switch } from "@/components/kit/switch";
import { makePiece, pieceQuoteQuery, priceWords, type TemplateView } from "../api";
import { ValueFields } from "../text-fields";

// A one-off piece from the saved template: one input per field, prefilled from the sample
// values, then the same paid artwork a schedule makes. The server makes it from the newest
// saved version whether or not that version is marked ready (only schedules wait for ready),
// so the drawer says so instead of blocking.

export function MakePieceDrawer({
  template,
  open,
  onClose,
}: {
  readonly template: TemplateView;
  readonly open: boolean;
  readonly onClose: () => void;
}): ReactElement | null {
  const { api } = useApp();
  const navigate = useNavigate();
  const doc = template.document;
  const [values, setValues] = useState<Readonly<Record<string, string>>>(doc.samples);
  const [accepted, setAccepted] = useState(false);
  const [moved, setMoved] = useState<CostEstimate | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const fetched = useQuery({
    ...pieceQuoteQuery(api, template.id, template.headVersion),
    enabled: open,
  });
  const quote = moved ?? fetched.data;
  const unknown = (quote?.unknown ?? 0) > 0;
  const make = useMutation({
    mutationFn: () =>
      makePiece(api, template.id, {
        mutationId: crypto.randomUUID(),
        version: template.headVersion,
        values,
        acknowledgedHigh: quote?.high ?? 0,
        acknowledgedUnknown: unknown && accepted,
      }),
    onSuccess: async (result) => {
      if (result.ok) {
        await navigate({ to: "/designs/$designId", params: { designId: result.value.id } });
        return;
      }
      setProblem(result.message);
      if (result.reason === "cost-changed" && result.quote !== undefined) {
        setMoved(result.quote);
        setAccepted(false);
      }
    },
    onError: (error) => setProblem(error.message),
  });
  const fields = designFields(doc);
  const waiting =
    quote === undefined
      ? "Working out the price…"
      : unknown && !accepted
        ? "Accept that the price is unknown first."
        : make.isPending
          ? "Making the piece…"
          : undefined;
  return (
    <Drawer
      open={open}
      title="Make a piece"
      onClose={onClose}
      footer={
        <Button
          variant="primary"
          disabled={waiting !== undefined}
          disabledReason={waiting}
          focusableWhenDisabled
          onClick={() => {
            setProblem(null);
            make.mutate();
          }}
        >
          {`Make · ${priceWords(quote)}`}
        </Button>
      }
    >
      <div className="flex min-w-0 flex-col gap-4">
        <p className="m-0 text-ink-2">
          {`One piece from version ${String(template.headVersion)}, with the words below. You can change them on its page afterwards.`}
        </p>
        {template.readyVersion === template.headVersion ? null : (
          <Callout
            tone="info"
            title={`Version ${String(template.headVersion)} isn't approved for schedules`}
          >
            You can still make a piece from it by hand. Only schedules wait for an approved version.
          </Callout>
        )}
        <ValueFields
          fields={fields}
          values={values}
          dateField={doc.schedule?.dateField}
          onChange={setValues}
          label="Keywords"
          tip="library.design.make-values"
        />
        {unknown ? (
          <Switch
            label="I accept that the price is unknown"
            checked={accepted}
            onChange={setAccepted}
            tip="library.design.accept-unknown"
          />
        ) : null}
        {problem === null ? null : (
          <Callout tone="danger" title="The piece wasn't made">
            {problem}
          </Callout>
        )}
      </div>
    </Drawer>
  );
}
