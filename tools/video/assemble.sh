#!/bin/zsh
# Usage: assemble.sh seg1.mp4 seg2.mp4 seg3.mp4 out.mp4
# Phone recordings (1080x2412) are fitted into a 1080x1920 frame; cards are already 1080x1920.
set -e
cd "$(dirname "$0")"
i=1
DUR=(78 30 32)
for s in "$1" "$2" "$3"; do
  ffmpeg -y -loglevel error -i "$s" -f lavfi -i anullsrc=r=48000:cl=stereo -t ${DUR[$i]} \
    -vf "scale=-2:1920,pad=1080:1920:(ow-iw)/2:0:color=0x16213A,setsar=1,fps=30" \
    -c:v libx264 -preset fast -pix_fmt yuv420p -c:a aac -shortest seg$i.mp4
  i=$((i+1))
done
printf "file 'card0.mp4'\nfile 'card1.mp4'\nfile 'card2.mp4'\nfile 'seg1.mp4'\nfile 'card3.mp4'\nfile 'seg2.mp4'\nfile 'card4.mp4'\nfile 'seg3.mp4'\nfile 'card6.mp4'\nfile 'card5.mp4'\n" > list.txt
ffmpeg -y -loglevel error -f concat -safe 0 -i list.txt -c:v libx264 -preset medium -crf 22 -pix_fmt yuv420p -c:a aac -movflags +faststart "$4"
ffprobe -v error -show_entries format=duration -of csv=p=0 "$4"
