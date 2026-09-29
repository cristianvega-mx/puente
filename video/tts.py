"""Synthesizes the demo voices with edge-tts.

Usage: python tts.py plan.json out_dir [alexa_lines.json]
Writes <id>.mp3 for every narration line and parent utterance in the plan, and for Alexa's
lines when a JSON list of {"id", "text"} captured during the recording is given.
Existing files are kept, so the script can be re-run cheaply.
"""
import asyncio
import json
import os
import re
import sys

import edge_tts


def speakable(text: str) -> str:
    """What a Mexican Spanish voice should read: "$12" is dollars here, not pesos, and "Ms." is "miss"."""
    text = re.sub(r"\$(\d+(?:\.\d+)?)", r"\1 dólares", text)
    return re.sub(r"\bMs\.\s*", "miss ", text)


async def synth(text: str, voice: str, path: str, rate: str) -> None:
    if os.path.exists(path):
        return
    await edge_tts.Communicate(speakable(text), voice, rate=rate).save(path)
    print("wrote", path)


async def main() -> None:
    plan = json.load(open(sys.argv[1], encoding="utf-8"))
    out = sys.argv[2]
    os.makedirs(out, exist_ok=True)
    voices = plan["voices"]
    jobs = [synth(text, voices["narrator"], f"{out}/{key}.mp3", "+10%") for key, text in plan["narration"].items()]
    jobs += [synth(step["say"], voices["parent"], f"{out}/{step['id']}.mp3", "+0%") for step in plan["demo"] if "say" in step]
    if len(sys.argv) > 3:
        for line in json.load(open(sys.argv[3], encoding="utf-8")):
            jobs.append(synth(line["text"], voices["alexa"], f"{out}/alexa-{line['id']}.mp3", "+4%"))
    for job in jobs:  # one at a time: the service rate-limits bursts
        await job


asyncio.run(main())
