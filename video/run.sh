#!/bin/sh
# Produces the demo video on the VPS (Docker + ffmpeg + python3). Run it from /opt/video/work
# after copying this folder there. Output: out/puente-demo.mp4
set -eu
cd /opt/video/work
PW_IMAGE=mcr.microsoft.com/playwright:v1.55.0-noble

echo "1/5 narrator and parent voices"
rm -rf audio
docker run --rm -v /opt/video/work:/work --entrypoint python tts:latest tts.py plan.json audio
python3 - <<'PY'
import glob, json, os, subprocess
lengths = {}
for path in glob.glob("audio/*.mp3"):
    out = subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path])
    lengths[os.path.basename(path)[:-4]] = float(out.decode())
json.dump(lengths, open("durations.json", "w"), indent=1)
PY

echo "2/5 a fresh Puente server and simulator just for the recording"
docker rm -f puente-rec-mcp puente-rec-sim >/dev/null 2>&1 || true
docker run -d --name puente-rec-mcp --network easypanel --env-file /opt/puente/puente.env \
  -e PUENTE_PUBLIC_HOSTS=puente-rec-mcp puente-server:latest >/dev/null
docker run -d --name puente-rec-sim --network easypanel --env-file /opt/puente/sim.env \
  -e SIM_BASIC_AUTH= -e MCP_SERVER_URL=http://puente-rec-mcp:3000/mcp alexa-plus-sim:latest >/dev/null
sleep 8

echo "3/5 slides and screen recording"
rm -rf rec slides
docker run --rm --network easypanel -v /opt/video/work:/work -w /work "$PW_IMAGE" sh -c \
  "npm i --no-save --silent --no-audit --no-fund playwright@1.55.0 >/dev/null && node render_slides.mjs && node record.mjs"

echo "4/5 Alexa's voice"
python3 -c "import json; t = json.load(open('timeline.json')); json.dump([{'id': e['id'], 'text': e['text']} for e in t['events'] if e['type'] == 'alexa'], open('alexa_lines.json', 'w'), ensure_ascii=False)"
docker run --rm -v /opt/video/work:/work --entrypoint python tts:latest tts.py plan.json audio alexa_lines.json

echo "5/5 editing"
python3 build.py /opt/video/work
docker rm -f puente-rec-mcp puente-rec-sim >/dev/null
