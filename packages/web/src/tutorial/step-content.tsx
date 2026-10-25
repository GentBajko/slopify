import { Example } from "./content-parts";
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
            the prompt’s own name in Prompts, not your video’s title.
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
            Paste or write them in <strong>Instructions</strong>. <strong>{"{{topic}}"}</strong> and{" "}
            <strong>{"{{audience}}"}</strong> will become questions on Create.
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
            <strong>{"{{topic}}"}</strong> is a keyword, not the value. You will enter “Albania” on
            Create later. Repeated names use the same value; names are case-sensitive, so{" "}
            <strong>topic</strong> and <strong>Topic</strong> are different.
          </p>
          <p>
            There are no automatic keywords: <strong>{"{{title}}"}</strong> would also ask you for a
            value. Fix any keyword warnings in Instructions before saving.
          </p>
        </>
      );
    case "article-save":
      return (
        <>
          <p>
            Press the highlighted <strong>Save</strong> button in the editor. The prompt will appear
            under <strong>Article</strong> in Prompts.
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
            The kind already says <strong>Image prompt</strong>. Name this prompt{" "}
            <strong>Travel imagery</strong>, then enter this example or your own visual
            instructions.
          </p>
          <Example text={imageExample} />
          <p>
            Using <strong>{"{{topic}}"}</strong> in both prompts asks you for it once on Create.
            Image prompts describe the picture directly; they do not automatically receive your
            article.
          </p>
        </>
      );
    case "image-save":
      return (
        <>
          <p>
            Press <strong>Save</strong> to add it under <strong>Image</strong> in Prompts. Next you
            will combine both prompts on Create.
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
            Create sets up one video. Leave <strong>Article</strong> on{" "}
            <strong>Write it for me</strong>, then pick the article prompt you saved under{" "}
            <strong>Article prompt</strong>.
          </p>
          <p>
            <strong>Use my text as written</strong> is for an article you already have, and{" "}
            <strong>Adapt my text</strong> rewrites your notes with the prompt. For this first
            video, use Write it for me and keep the text short.
          </p>
          <p>
            <strong>Research</strong> starts Off. In a later video,{" "}
            <strong>Let the AI research</strong> gathers notes from the web, and the article is
            written from them.
          </p>
        </>
      );
    case "play-audio":
      return (
        <>
          <p>
            Leave <strong>Narration</strong> on <strong>AI voice</strong>. Under{" "}
            <strong>Read by</strong>, pick the <strong>Service</strong>, its <strong>Model</strong>,
            then the saved <strong>Voice</strong>.
          </p>
          <p>
            Keep <strong>Split the narration by</strong> (under{" "}
            <strong>More narration settings</strong>) on <strong>Nothing (one piece)</strong> for
            the short example: the narration is sent as one request. The other choices split longer
            text into pieces. <strong>Speakers</strong> is where an audiobook or podcast gets more
            than one voice; leave it on one voice for now.
          </p>
          <p>
            Use <strong>My own audio file</strong> to upload narration you already have, including
            any intro and outro in that file, or <strong>Off</strong> to skip narration. The video
            can still be made silent, with each image shown for 5 seconds.
          </p>
        </>
      );
    case "play-images":
      return (
        <>
          <p>
            Leave <strong>Images</strong> on <strong>Made by AI (paid)</strong>. Under{" "}
            <strong>Images by</strong>, pick the <strong>Service</strong> and <strong>Model</strong>
            , tick your image prompt under <strong>Which image style?</strong>, and type{" "}
            <strong>2</strong> in its <strong>How many images</strong> box for a small first run.
          </p>
          <p>
            The number means separate images made from that same prompt. It does not make one scene
            per article paragraph. Tick more image prompts when you want different scenes.
          </p>
          <p>
            Use <strong>My own images</strong> for your own pictures or <strong>None</strong> to
            skip them. Images None also turns the video off. The thumbnail is separate, in the{" "}
            <strong>Extras</strong> row; leave it off for this first video.
          </p>
        </>
      );
    case "play-video":
      return (
        <>
          <p>
            Under <strong>Video and style</strong>, leave <strong>Video</strong> on{" "}
            <strong>Make the video</strong> for an MP4 slideshow, put together on this computer. It
            needs images. With Narration Off, the video is silent and each image lasts 5 seconds.
          </p>
          <p>
            Choose <strong>Off (sound only)</strong> to skip the video. With narration on, Slopify
            then exports one combined <strong>WAV</strong> with the intro, body, outro and the gaps
            between them.
          </p>
          <p>
            If both Narration and Video are Off, download the article and anything else the run made
            one by one.
          </p>
        </>
      );
    case "play-subtitles":
      return (
        <>
          <p>
            <strong>Captions</strong> are optional and start <strong>Off</strong>. Choose{" "}
            <strong>Caption files only (.srt + .vtt)</strong> for files to upload beside the video,
            or <strong>Show captions in the video</strong> to draw them into the MP4 (the files come
            too).
          </p>
          <p>
            English captions are timed locally from your narration with no paid API. First use
            downloads an approximately <strong>378 MB</strong> speech model (a smaller one can be
            chosen in Settings → Production defaults). Narration must be on; a sound-only run gets
            the caption files.
          </p>
          <p>
            Pick a <strong>Caption font</strong> or upload a .ttf or .otf file, then set its{" "}
            <strong>Caption size</strong> and <strong>Caption position</strong>. The style applies
            to captions shown in the video. You can also add or change captions on a finished
            project later without making its narration again.
          </p>
        </>
      );
    case "play-options":
      return (
        <>
          <p>
            Type what the video is about under <strong>What’s the video about?</strong>, such as “A
            quick trip to Albania.” Leave <strong>Start from</strong> on{" "}
            <strong>A blank video</strong>: this tour builds the video from your own prompts.
          </p>
          <p>
            Under <strong>Written by</strong> in the Article row, pick the <strong>Service</strong>{" "}
            and <strong>Model</strong> that write the article. The list shows the models that work
            for your key; <strong>Type a model ID…</strong> is at its end, and{" "}
            <strong>Manage models ↗</strong> (Settings → Models) checks them.
          </p>
          <p>
            Intro and Outro are under Narration’s <strong>More narration settings</strong> while
            Narration is AI voice. Written by appears only when a stage needs the AI to write.
          </p>
        </>
      );
    case "play-keywords":
      return (
        <>
          <p>
            The prompts you picked ask for these keywords. For the examples, enter{" "}
            <strong>Albania</strong> for <strong>topic</strong> and{" "}
            <strong>first-time travelers</strong> for <strong>audience</strong>.
          </p>
          <p>
            Each keyword is asked once, with the prompts that use it named underneath. A keyword
            both prompts use feeds the article and the images, so changing it changes both for this
            run.
          </p>
          <p>
            Fill every keyword. Each value must fit on one line and be no more than 200 characters.
            Your saved prompt keeps its braces so you can reuse it next time.
          </p>
        </>
      );
    case "play-start":
      return (
        <>
          <p>
            <strong>See everything this run will do</strong> lists what the run makes, what it costs
            and anything still missing. The line under the button names the first thing to fix;
            press it to open that row.
          </p>
          <p>
            When ready, press the real <strong>Make the video</strong> button (
            <strong>Queue 3 videos</strong> with more topics). This creates a project and sends
            requests to the services you picked, which may charge your account.
          </p>
          <p>
            The tour will follow you to the project. You can also skip generating and go on to the
            screens you run a channel from.
          </p>
        </>
      );
    case "project":
      return (
        <>
          <p>
            The list on the right shows each part the project makes, such as Article, Narration,
            Images and Video, with its state in words; press one to open it. The title row’s first
            button is the one thing to do next, named for its result: <strong>Pause</strong> while
            it runs, <strong>Continue the run</strong> when it is paused,{" "}
            <strong>Try images again</strong> when a step fails.
          </p>
          <p>
            Press <strong>Edit settings</strong> to change the services, models, voice, prompts or
            extras. <strong>Save changes</strong> keeps a new version without making anything; what
            the change made outdated is then offered as the next thing to do, with what it makes
            again and what that costs. Earlier versions stay under Edit settings,{" "}
            <strong>Versions</strong>.
          </p>
          <p>
            A failed step says why beside it; open <strong>Error details</strong> for the service’s
            own message. Each part’s heading has the button that makes it all again, with its cost,
            such as <strong>Make the video again (free)</strong>. Everything else is under{" "}
            <strong>More</strong> and in the command palette (Ctrl+K).
          </p>
        </>
      );
    case "download":
      return (
        <>
          <p>
            {output === "audio" ? (
              <>
                When Audio export finishes, press <strong>Download audio (.wav)</strong> for the
                combined narration.
              </>
            ) : output === "article" ? (
              <>
                Use <strong>Download</strong> here to save the article. Narration and Video are Off
                for this project.
              </>
            ) : (
              <>
                When Video finishes, press <strong>Download video (.mp4)</strong>.
              </>
            )}{" "}
            The completed project stays in <strong>Projects</strong> so you can return to it.
          </p>
          <p>
            Each part has its own downloads: press Article, Narration or Images in the list on the
            right. <strong>All files</strong> lists every file in one place. In Images,{" "}
            <strong>Download all</strong> saves the pictures as one .zip, not the video.
          </p>
          <p>
            With captions on, the <strong>.srt</strong> and <strong>.vtt</strong> caption files
            download beside the video, and the player can show them.
          </p>
        </>
      );
    case "run-cost":
      return (
        <p>
          The cost line under the list says what this run really cost, and{" "}
          <strong>See the breakdown</strong> shows it per stage and model. Totals for every project
          are in Settings, <strong>Usage</strong>.
        </p>
      );
    case "studio-prep":
      return (
        <>
          <p>
            Slopify never uploads for you. When the video is made,{" "}
            <strong>Copy for YouTube Studio</strong>, in the Video part’s heading beside the player,
            lists everything YouTube Studio asks for, in the order it asks, from the file and title
            to the thumbnail, tags and the AI disclosure. The project’s <strong>YouTube</strong>{" "}
            part keeps each upload’s release date and link.
          </p>
          <p>
            The browser extension in Settings, <strong>YouTube Studio and posting</strong>, can fill
            those in for you.
          </p>
        </>
      );
    case "home":
      return (
        <p>
          <strong>Home</strong> is the day at a glance: what needs you, what is running and at which
          step, what is coming up this week and what is finished.
        </p>
      );
    case "channels":
      return (
        <p>
          A <strong>channel</strong> keeps its brand kit, series brief, templates, schedules and a
          cast that looks the same in every video. It also remembers each finished video on its{" "}
          <strong>Memory</strong> tab, and the titles you made before on{" "}
          <strong>Titles to avoid</strong>, so new topics do not repeat them.
        </p>
      );
    case "calendar":
      return (
        <>
          <p>
            The <strong>Calendar</strong> shows the coming weeks of uploads: what is ready, what
            needs you, and the topics a schedule suggested, waiting for your approval. Its{" "}
            <strong>Schedules</strong> tab is where you create, pause and resume the schedules that
            fill it.
          </p>
          <p>
            You have reached the end. Press <strong>Help</strong> at the foot of the rail anytime:
            <strong> Start the tour</strong> walks through these steps again, and{" "}
            <strong>Tutorials</strong> has the guides to every screen.
          </p>
        </>
      );
  }
}
