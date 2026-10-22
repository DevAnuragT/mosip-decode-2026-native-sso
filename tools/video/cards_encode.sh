#!/bin/zsh
# Card clips sized to their narration (narration length + 1.2 s of air), narration muxed in.
set -e
cd "$(dirname "$0")"
for i in 0 1 2 3 4 5 6; do
  len=$(ffprobe -v error -show_entries format=duration -of csv=p=0 n$i.aiff)
  dur=$(python3 -c "print(round($len+1.2,2))")
  ffmpeg -y -loglevel error -loop 1 -i c$i.png -i n$i.aiff -t $dur -r 30 -pix_fmt yuv420p -c:v libx264 -preset fast \
    -af "apad,aresample=48000" -ac 2 -c:a aac -shortest card$i.mp4
  echo "card$i $dur s"
done
