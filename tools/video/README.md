# Demo video pipeline

`docs/demo-video.mp4` (1080x1920, 30 fps, ~3:10) is produced from three phone recordings and seven
title cards, with no manual editing:

```bash
python3 cards.py && python3 e2e_card.py          # title cards (Ghostscript; ffmpeg here has no drawtext)
for i in 0 1 2 3 4 5 6; do ffmpeg -loop 1 -i c$i.png -f lavfi -i anullsrc -t 6 -r 30 -pix_fmt yuv420p card$i.mp4; done
# Phone segments: scrcpy records while tools/demo_driver.js performs the steps.
scrcpy -s <serial> --record raw1.mp4 --no-playback --no-audio --time-limit=100 &  node ../demo_driver.js wallet-login wallet-show
scrcpy -s <serial> --record raw2.mp4 --no-playback --no-audio --time-limit=40  &  node ../demo_driver.js health-signin health-show
scrcpy -s <serial> --record raw3.mp4 --no-playback --no-audio --time-limit=45  &  node ../demo_driver.js health-reconsent
./assemble.sh raw1.mp4 raw2.mp4 raw3.mp4 ../../docs/demo-video.mp4
```

Reset consent before recording (`delete from esignet.consent_detail; delete from esignet.consent_history;`)
so the consent screen appears. The consent "Allow" is tapped through the accessibility tree: the
redirect to the app's custom scheme needs a real user gesture, a synthetic DOM click is ignored.
`--time-limit` makes scrcpy finalise the MP4 itself (an interrupted recording has no moov atom).
