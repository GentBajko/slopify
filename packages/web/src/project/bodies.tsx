import type { BodyProps } from "./body.js";
import { ArticleBody } from "./body-article.js";
import { AudioBody } from "./body-audio.js";
import { DocumentBody } from "./body-document.js";
import { ImagesBody } from "./body-images.js";
import { VideoBody } from "./body-video.js";

// Which body a section opens into. One switch, so a stage kind cannot be added without a body
// and the body files stay unaware of each other. Research and the thumbnail have no section of
// their own: they arrive as the Article and Images bodies' companion.
export function StageBodyFor(props: BodyProps) {
  switch (props.stage.kind) {
    case "article":
      return <ArticleBody {...props} />;
    case "audio":
      return <AudioBody {...props} />;
    case "images":
      return <ImagesBody {...props} />;
    case "video":
      return <VideoBody {...props} />;
    case "document":
      return <DocumentBody {...props} />;
    case "research":
    case "thumbnail":
      return null;
  }
}
