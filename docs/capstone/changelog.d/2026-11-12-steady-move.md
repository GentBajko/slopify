# Pans and zooms no longer shake

- **A slow pan now moves by the same amount every frame.** Since images are held for their share of the narration, a shot runs about half a minute and a pan advances under half a pixel a frame. The picture could only be placed on whole pixels, so it stood still for a frame and then jumped: measured on a finished video, steps between nothing and 0.73 of a pixel where 0.46 was meant. They now measure 0.39 to 0.50, and what is left is the encoder's own noise.
- **A zoom holds its centre.** It wandered by up to 0.4 of a pixel from one frame to the next; it now moves by under 0.05.
- **The picture is placed between pixels,** in one pass at the frame's own size, instead of being enlarged four times and stepped. Fine detail is as sharp as before, within three percent either way.
- **It takes no longer to make.** The same 28 minutes of a real video with burned-in captions rendered in 356 seconds, against 370 before. With Clip encoding set to Fast it took 286.
- **Files are about three percent larger at the same quality setting,** because a picture that really moves every frame gives the encoder more to describe than one that stands still every other frame.
- **A still larger than the frame keeps its detail,** as before: it is sampled from a larger copy than a still with no more pixels than the frame, and each is kept away from the one size where fine detail would flicker.
