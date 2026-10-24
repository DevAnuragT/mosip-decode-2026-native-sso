#!/bin/zsh
# Card clips sized to their narration (narration length + 1.2 s of air), narration muxed in.
set -e
cd "$(dirname "$0")"
pick() { for ext in m4a wav mp3 aiff; do [ -f "$1.$ext" ] && { echo "$1.$ext"; return; }; done; echo "$1.aiff"; }
for i in 0 1 2 3 4 5 6; do
  a=$(pick n$i)
  len=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$a")
  dur=$(python3 -c "print(round($len+1.2,2))")
  ffmpeg -y -loglevel error -loop 1 -i c$i.png -i "$a" -t $dur -r 30 -pix_fmt yuv420p -c:v libx264 -preset fast \
    -af "apad,aresample=48000" -ac 2 -c:a aac -shortest card$i.mp4
  echo "card$i $dur s ($a)"
done
