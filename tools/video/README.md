# Demo video pipeline

`docs/demo-video.mp4` (1080x1920, 30 fps, 4:56, narrated with macOS text-to-speech, Ava Premium) is produced from
three phone recordings and seven title cards, with no manual editing:

```bash
python3 cards.py && python3 e2e_card.py          # title cards c0..c6.png (Ghostscript)
python3 narration.py && python3 narration_phone.py   # n0..n6.aiff (cards) and s1..s3.aiff (phone segments); macOS `say`
./cards_encode.sh                                # card0..card6.mp4, each as long as its narration
# Phone segments: scrcpy records while tools/demo_driver.js performs the steps.
scrcpy -s <serial> --record raw1.mp4 --no-playback --no-audio --time-limit=100 &  node ../demo_driver.js wallet-login wallet-show
scrcpy -s <serial> --record raw2.mp4 --no-playback --no-audio --time-limit=40  &  node ../demo_driver.js health-signin health-show
scrcpy -s <serial> --record raw3.mp4 --no-playback --no-audio --time-limit=45  &  node ../demo_driver.js health-reconsent
./assemble2.sh raw1.mp4 raw2.mp4 raw3.mp4 ../../docs/demo-video.mp4   # fits, narrates and concatenates
```

Reset consent before recording (`delete from esignet.consent_detail; delete from esignet.consent_history;`)
so the consent screen appears. The consent "Allow" is tapped through the accessibility tree: the
redirect to the app's custom scheme needs a real user gesture, a synthetic DOM click is ignored.
`--time-limit` makes scrcpy finalise the MP4 itself (an interrupted recording has no moov atom).
