import type { BodyProps } from "./body.js";
import { ArticleBody } from "./body-article.js";
import { AudioBody } from "./body-audio.js";
import { ImagesBody } from "./body-images.js";
import { ResearchBody } from "./body-research.js";
import { ThumbnailBody } from "./body-thumbnail.js";
import { VideoBody } from "./body-video.js";

// Which body a row opens into. One switch, so a stage kind cannot be added without a body
// and the six files stay unaware of each other.
export function StageBodyFor(props: BodyProps) {
  switch (props.stage.kind) {
    case "research":
      return <ResearchBody {...props} />;
    case "article":
      return <ArticleBody {...props} />;
    case "audio":
      return <AudioBody {...props} />;
    case "images":
      return <ImagesBody {...props} />;
    case "thumbnail":
      return <ThumbnailBody {...props} />;
    case "video":
      return <VideoBody {...props} />;
  }
}
