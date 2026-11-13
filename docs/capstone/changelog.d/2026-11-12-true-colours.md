# Videos keep the colours of their pictures

- **Every video is now BT.709 and says so.** Pictures were turned into video with the older BT.601 formula and the file carried no colour labels, while players and YouTube read an unlabelled HD video as BT.709. The result was a slight warm cast on every video: reds a few steps too strong, blues a few too weak.
- **This covers every still that goes into a video:** plain, zooming and panning pictures, the four colour grades, portraits beside captions and the atmosphere layers. A clip that is already video keeps its own colours and only gets the label.
- **Coloured captions and chapter cards match as well,** with the NVIDIA encoder too. White text never changed.
- **Videos already made stay as they are;** make one again to get the corrected colours. The first render after updating encodes every clip afresh rather than reusing saved ones, since their colours differ.
