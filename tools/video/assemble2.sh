#!/bin/zsh
# Usage: assemble2.sh raw1.mp4 raw2.mp4 raw3.mp4 out.mp4
# Phone recordings are fitted into 1080x1920 and get their narration (s1..s3.aiff); each segment lasts
# max(trim, narration + 1 s). Cards (card0..card6.mp4) already carry theirs.
set -e
cd "$(dirname "$0")"
TRIM=(78 30 70)
i=1
for s in "$1" "$2" "$3"; do
  nlen=$(ffprobe -v error -show_entries format=duration -of csv=p=0 s$i.aiff)
  dur=$(python3 -c "print(max(${TRIM[$i]}, round($nlen+1.0,2)))")
  ffmpeg -y -loglevel error -i "$s" -i s$i.aiff -t $dur \
    -vf "scale=-2:1920,pad=1080:1920:(ow-iw)/2:0:color=0x16213A,setsar=1,fps=30,tpad=stop_mode=clone:stop_duration=60" \
    -af "apad,aresample=48000" -ac 2 -c:v libx264 -preset fast -pix_fmt yuv420p -c:a aac seg$i.mp4
  echo "seg$i $dur s"
  i=$((i+1))
done
printf "file 'card0.mp4'\nfile 'card1.mp4'\nfile 'card2.mp4'\nfile 'seg1.mp4'\nfile 'card3.mp4'\nfile 'seg2.mp4'\nfile 'card4.mp4'\nfile 'seg3.mp4'\nfile 'card6.mp4'\nfile 'card5.mp4'\n" > list.txt
ffmpeg -y -loglevel error -f concat -safe 0 -i list.txt -c:v libx264 -preset medium -crf 22 -pix_fmt yuv420p -c:a aac -movflags +faststart "$4"
ffprobe -v error -show_entries format=duration -of csv=p=0 "$4"
