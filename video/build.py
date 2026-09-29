#!/usr/bin/env python3
"""Edits the recorded demo and assembles the final video.

Reads WORK/plan.json, WORK/timeline.json (from record.mjs), the voice clips in WORK/audio and the
slide images in WORK/slides, and writes WORK/out/puente-demo.mp4 (1920x1080, 30 fps, H.264/AAC).
The waits while the model thinks are cut down to about a second, and every voice clip is placed
on the edited timeline where it belongs.
"""
import json
import os
import subprocess
import sys

WORK = sys.argv[1] if len(sys.argv) > 1 else "/opt/video/work"
AUDIO = f"{WORK}/audio"
OUT = f"{WORK}/out"
os.makedirs(OUT, exist_ok=True)
ENC = ["-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-r", "30",
       "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2"]


def run(args):
    subprocess.run(args, check=True)


def length(path):
    out = subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path])
    return float(out.decode().strip())


def mix(clips, total, target):
    """Writes a stereo WAV of `total` seconds with each (path, start, tempo) clip placed at `start`."""
    args = ["ffmpeg", "-v", "error", "-y"]
    for path, _, _ in clips:
        args += ["-i", path]
    parts = []
    for i, (_, start, tempo) in enumerate(clips):
        speed = f",atempo={tempo:.3f}" if tempo > 1.001 else ""
        ms = int(start * 1000)
        parts.append(f"[{i}:a]aresample=48000,aformat=channel_layouts=stereo{speed},adelay={ms}|{ms}[a{i}]")
    inputs = "".join(f"[a{i}]" for i in range(len(clips)))
    parts.append(f"{inputs}amix=inputs={len(clips)}:normalize=0,apad,atrim=0:{total:.3f}[out]")
    run(args + ["-filter_complex", ";".join(parts), "-map", "[out]", target])


def slide_segment(image, voice_clips, total, target):
    audio = f"{target}.wav"
    mix(voice_clips, total, audio)
    fade = f"fade=t=in:st=0:d=0.4,fade=t=out:st={total - 0.4:.3f}:d=0.4"
    run(["ffmpeg", "-v", "error", "-y", "-loop", "1", "-framerate", "30", "-i", image, "-i", audio,
         "-vf", fade, "-t", f"{total:.3f}", *ENC, target])


plan = json.load(open(f"{WORK}/plan.json", encoding="utf-8"))
timeline = json.load(open(f"{WORK}/timeline.json", encoding="utf-8"))
events = timeline["events"]
raw_video = timeline["video"].replace("/work", WORK, 1)
clip_len = lambda name: length(f"{AUDIO}/{name}.mp3")

# 1. Keep the recording from "ready" to "end", minus most of each wait for the model.
ready = next(e["t"] for e in events if e["type"] == "ready")
end = next(e["t"] for e in events if e["type"] == "end")
cuts = []
for sent in (e for e in events if e["type"] == "sent"):
    answer = next(e for e in events if e["type"] == "alexa" and e["id"] == sent["id"])
    if answer["t"] - sent["t"] > 1.6:
        cuts.append((sent["t"] + 0.6, answer["t"] - 0.5))
keep, cursor = [], ready - 0.2
for cut_start, cut_end in cuts:
    keep.append((cursor, cut_start))
    cursor = cut_end
keep.append((cursor, end))


def remap(t):
    """Where an instant of the raw recording lands in the edited demo."""
    edited = 0.0
    for start, stop in keep:
        if t < start:
            return edited
        if t <= stop:
            return edited + (t - start)
        edited += stop - start
    return edited


demo_length = sum(stop - start for start, stop in keep)
# Each piece is cut in its own ffmpeg run: several trims of one input in a single filter graph keep
# every decoded frame in memory (6 GB for this recording, and the VPS killed ffmpeg).
pieces = []
for i, (a, b) in enumerate(keep):
    fades = ["fade=t=in:st=0:d=0.4"] if i == 0 else []
    if i == len(keep) - 1:
        fades.append(f"fade=t=out:st={b - a - 0.4:.3f}:d=0.4")
    piece = f"{OUT}/piece-{i}.mp4"
    run(["ffmpeg", "-v", "error", "-y", "-ss", f"{a:.3f}", "-i", raw_video, "-t", f"{b - a:.3f}",
         "-vf", ",".join(["fps=30", "format=yuv420p", *fades]), "-an",
         "-c:v", "libx264", "-preset", "medium", "-crf", "20", piece])
    pieces.append(piece)
with open(f"{OUT}/pieces.txt", "w") as listing:
    listing.writelines(f"file '{piece}'\n" for piece in pieces)
demo_video = f"{OUT}/demo-video.mp4"
run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", f"{OUT}/pieces.txt", "-c", "copy", demo_video])

# 2. Voices on the edited timeline. Alexa's line is sped up slightly if it would run into what follows.
voices = []
for e in events:
    if e["type"] == "narration":
        voices.append([f"{AUDIO}/{e['id']}.mp3", remap(e["t"]) + 0.15])
    elif e["type"] == "parent":
        voices.append([f"{AUDIO}/{e['id']}.mp3", remap(e["t"])])
    elif e["type"] == "alexa":
        voices.append([f"{AUDIO}/alexa-{e['id']}.mp3", remap(e["t"]) + 0.1])
voices.sort(key=lambda v: v[1])
placed = []
for i, (path, start) in enumerate(voices):
    room = (voices[i + 1][1] if i + 1 < len(voices) else demo_length) - start - 0.1
    tempo = max(1.0, length(path) / room) if room > 0 else 1.0
    if tempo > 1.0:
        print(f"note: {os.path.basename(path)} sped up x{tempo:.2f} to fit")
    placed.append((path, start, min(tempo, 1.3)))
demo_audio = f"{OUT}/demo-audio.wav"
mix(placed, demo_length, demo_audio)
demo = f"{OUT}/2-demo.mp4"
run(["ffmpeg", "-v", "error", "-y", "-i", demo_video, "-i", demo_audio, "-map", "0:v", "-map", "1:a", *ENC,
     "-shortest", demo])

# 3. Slides with the narrator.
n1, n2, n8, n9 = (clip_len(k) for k in ("n1", "n2", "n8", "n9"))
intro_len = 0.6 + n1 + 0.5 + n2 + 0.9
slide_segment(f"{WORK}/slides/s1.png",
              [(f"{AUDIO}/n1.mp3", 0.6, 1.0), (f"{AUDIO}/n2.mp3", 0.6 + n1 + 0.5, 1.0)], intro_len, f"{OUT}/1-intro.mp4")
slide_segment(f"{WORK}/slides/s2.png", [(f"{AUDIO}/n8.mp3", 0.5, 1.0)], 0.5 + n8 + 1.0, f"{OUT}/3-architecture.mp4")
slide_segment(f"{WORK}/slides/s3.png", [(f"{AUDIO}/n9.mp3", 0.4, 1.0)], 0.4 + n9 + 2.2, f"{OUT}/4-outro.mp4")

# 4. One file, loudness evened out.
listing = f"{OUT}/parts.txt"
with open(listing, "w") as parts:
    for name in ("1-intro", "2-demo", "3-architecture", "4-outro"):
        parts.write(f"file '{OUT}/{name}.mp4'\n")
final = f"{OUT}/puente-demo.mp4"
run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", listing, "-c:v", "copy",
     "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", final])
print(f"final video: {final} ({length(final):.1f} s)")
