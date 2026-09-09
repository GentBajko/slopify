import { Example, External } from "./content-parts";
import type { TutorialStepId } from "./model";
import { SetupContent } from "./setup-content";

const articleExample =
  "Write a 150-word narration about {{topic}} for {{audience}}. Open with an interesting fact, explain three highlights, and end with one memorable takeaway. Use natural spoken English. Return only the narration, without headings or stage directions.";
const imageExample =
  "A cinematic editorial photograph of {{topic}}, with natural light, a clear focal point, rich detail, and no text or logos. Compose it for a travel video.";

export function StepContent({
  step,
  output = "video",
}: {
  readonly step: TutorialStepId;
  readonly output?: "video" | "audio" | "article";
}) {
  switch (step) {
    case "text-key":
    case "audio-key":
    case "image-key":
    case "voice":
      return <SetupContent step={step} />;
    case "article-name":
      return (
        <>
          <p>
            A prompt is a reusable set of instructions. This one will write the narration for each
            video.
          </p>
          <p>
            Give it a recognizable name, such as <strong>Short travel narration</strong>. This is
            the prompt’s library name, not your video’s title.
          </p>
          <p>The next steps will add its instructions and reusable keywords.</p>
        </>
      );
    case "article-body":
      return (
        <>
          <p>
            Tell the model what to write, who it is for, the length, and the style. Put anything you
            want to change between runs inside double braces.
          </p>
          <Example text={articleExample} />
          <p>
            Paste or write the instructions in <strong>Body</strong>. <strong>{"{{topic}}"}</strong>{" "}
            and <strong>{"{{audience}}"}</strong> will become fields on Play.
          </p>
        </>
      );
    case "article-keywords":
      return (
        <>
          <p>
            This panel detects your keywords as you type. With the example, it should list{" "}
            <strong>topic</strong> and <strong>audience</strong>.
          </p>
          <p>
            <strong>{"{{topic}}"}</strong> is a field name, not the value. You will enter “Albania”
            on Play later. Repeated names use the same value; names are case-sensitive, so{" "}
            <strong>topic</strong> and <strong>Topic</strong> are different.
          </p>
          <p>
            There are no automatic keywords: <strong>{"{{title}}"}</strong> would also ask you for a
            value. Fix any keyword warnings in Body before saving.
          </p>
        </>
      );
    case "article-save":
      return (
        <>
          <p>
            Press the highlighted <strong>Save</strong> button in the editor. The prompt will appear
            in your Article library.
          </p>
          <p>
            The tour continues when the save succeeds and the editor returns to the prompt list. If
            a name is already taken, go Back and choose another.
          </p>
        </>
      );
    case "image-prompt":
      return (
        <>
          <p>
            Keep <strong>Kind</strong> on <strong>Image</strong>. Name this prompt{" "}
            <strong>Travel imagery</strong>, then enter this example or your own visual
            instructions.
          </p>
          <Example text={imageExample} />
          <p>
            Using <strong>{"{{topic}}"}</strong> in both prompts creates one shared field on Play.
            Image prompts describe the picture directly; they do not automatically receive your
            article.
          </p>
        </>
      );
    case "image-save":
      return (
        <>
          <p>
            Press <strong>Save</strong> to add this to your Image library. Next you will combine
            both prompts on Play.
          </p>
          <p>
            You can create more prompts later for different subjects, styles, lengths, or languages.
          </p>
        </>
      );
    case "play-article":
      return (
        <>
          <p>
            Play is where you configure one project. Leave <strong>Article</strong> on{" "}
            <strong>Generate</strong>, then select the article prompt you saved.
          </p>
          <p>
            <strong>Provide</strong> is for an article you already have. For this first run, use
            Generate and keep the script short. Article is required; every other stage can be Off.
          </p>
          <p>
            Research starts Off. You can turn it on in a later run for web-grounded notes that are
            automatically passed to the article writer.
          </p>
        </>
      );
    case "play-audio":
      return (
        <>
          <p>
            Leave <strong>Audio</strong> on <strong>Generate</strong>. Pick your voice{" "}
            <strong>TTS</strong> provider, then the saved <strong>Voice</strong>.
          </p>
          <p>
            Keep chunking on <strong>Whole</strong> for the short example: the narration is sent as
            one request. Other chunking modes split longer text into pieces.
          </p>
          <p>
            Use Provide to upload existing narration, including any intro and outro in that file, or
            Off to skip narration. Video can still run silently, with each image shown for 5
            seconds.
          </p>
        </>
      );
    case "play-images":
      return (
        <>
          <p>
            Leave <strong>Images</strong> on <strong>Generate</strong>. Choose the image{" "}
            <strong>Provider</strong> and <strong>Model</strong>, select your image prompt, and set{" "}
            <strong>Number</strong> to 2 for a small first run.
          </p>
          <p>
            Number means separate images made from that same prompt. It does not make one scene per
            article paragraph. Add more image prompts when you want different scenes.
          </p>
          <p>
            Use Provide for your own images or Off to skip them. Turning Images Off also turns Video
            Off. Thumbnail remains independent; keep it Off for this first run.
          </p>
        </>
      );
    case "play-video":
      return (
        <>
          <p>
            Choose <strong>Generate</strong> for an MP4 slideshow. It needs generated or provided
            images. With Audio Off, the video is silent and each image lasts 5 seconds.
          </p>
          <p>
            Choose <strong>Off</strong> to skip video. If Audio is active, Slopify exports one
            combined <strong>WAV</strong> with the intro, body, outro and configured gaps.
          </p>
          <p>
            If both Audio and Video are Off, download the article and any other enabled outputs
            individually.
          </p>
        </>
      );
    case "play-subtitles":
      return (
        <>
          <p>
            Subtitles are optional and start <strong>Off</strong>. Choose{" "}
            <strong>Subtitle files</strong> for SRT and VTT downloads, or{" "}
            <strong>Burn into video + files</strong> to keep captions visible in an MP4.
          </p>
          <p>
            English captions are timed locally from your narration with no paid API. First use
            downloads an approximately <strong>95 MB</strong> speech model. Audio must be active;
            WAV exports support separate subtitle files.
          </p>
          <p>
            Pick a font or upload a TTF/OTF file, then adjust its size in the preview. Styling
            applies to burned captions. You can also add or change subtitles on a completed project
            later without regenerating its narration.
          </p>
        </>
      );
    case "play-options":
      return (
        <>
          <p>
            Enter a <strong>Video title</strong>, such as “A quick trip to Albania.” Choose{" "}
            <strong>16:9</strong> for landscape or <strong>9:16</strong> for portrait.
          </p>
          <p>
            Select the text <strong>LLM</strong> and <strong>Model</strong>. OpenRouter uses a typed
            model ID from its <External href="https://openrouter.ai/models">model catalog</External>
            ; the other providers have a dropdown.
          </p>
          <p>
            Leave <strong>Intro</strong> and <strong>Outro</strong> Off for this first run. They are
            available only when Audio is Generate. The LLM controls appear only when an enabled
            stage needs text generation.
          </p>
        </>
      );
    case "play-keywords":
      return (
        <>
          <p>
            The prompts you picked created these fields. For the examples, enter{" "}
            <strong>Albania</strong> for <strong>topic</strong> and{" "}
            <strong>first-time travelers</strong> for <strong>audience</strong>.
          </p>
          <p>
            A field under <strong>Common</strong> feeds both the article and images. Changing it
            changes both prompts for this run.
          </p>
          <p>
            Fill every visible field. Each value must fit on one line and be no more than 200
            characters. Your saved prompt keeps its braces so you can reuse it next time.
          </p>
        </>
      );
    case "play-start":
      return (
        <>
          <p>
            Check the hint above PLAY. If anything is missing, use Back to fix the highlighted
            section.
          </p>
          <p>
            When ready, press the real <strong>PLAY</strong> button. This creates a project and
            sends generation requests to your chosen providers, which may charge your account.
          </p>
          <p>
            The tour will follow you to the project. You can also finish the tutorial without
            generating anything.
          </p>
        </>
      );
    case "project":
      return (
        <>
          <p>
            This page shows each stage’s progress and results. Press <strong>Pause</strong> to stop
            active requests safely and keep finished work.
          </p>
          <p>
            While paused or failed, open <strong>Run providers</strong> to change providers, models
            or voice. Press <strong>Save providers</strong>, then <strong>Resume</strong>{" "}
            separately. Changing TTS choices restarts unfinished narration to avoid mixing voices;
            completed outputs stay unchanged.
          </p>
          <p>
            A failed stage also offers <strong>Retry stage</strong> after you fix its cause. Editing
            or rerunning earlier work updates only the enabled dependent outputs.
          </p>
        </>
      );
    case "download":
      return (
        <>
          <p>
            {output === "audio" ? (
              <>
                When Audio export finishes, press <strong>Download .wav</strong> for the combined
                narration.
              </>
            ) : output === "article" ? (
              <>
                Use <strong>Download</strong> here to save the article. Audio and Video are Off for
                this project.
              </>
            ) : (
              <>
                When Video finishes, press <strong>Download .mp4</strong>.
              </>
            )}{" "}
            The completed project stays in <strong>Projects</strong> so you can return to it.
          </p>
          <p>
            You can also download the article, audio and images from their own stages.{" "}
            <strong>Download all</strong> under Images gives an image ZIP, not the video.
          </p>
          <p>
            If subtitles are enabled, download the <strong>.srt</strong> or <strong>.vtt</strong>{" "}
            files beside the final export. File-mode captions are also available in the video
            player.
          </p>
          <p>
            You have reached the end. Open <strong>Tutorial</strong> in the navigation anytime to
            walk through these steps again.
          </p>
        </>
      );
  }
}
