"""Render Peep's original launch sound using only Python's standard library."""
import json
import math
from pathlib import Path
import random
import struct
import wave

RATE = 44100
DURATION = 2.25
samples = [[0.0, 0.0] for _ in range(int(RATE * DURATION))]
rng = random.Random(20261021)


def mix(start, duration, render, pan=0):
    for i in range(int(duration * RATE)):
        t = i / RATE
        value = render(t, duration)
        index = round(start * RATE) + i
        if index >= len(samples):
            break
        samples[index][0] += value * math.sqrt((1 - pan) / 2)
        samples[index][1] += value * math.sqrt((1 + pan) / 2)


def pop(t, duration):
    envelope = (1 - math.exp(-t / 0.002)) * math.exp(-t / 0.026)
    phase = 2 * math.pi * (260 * t + 470 * 0.018 * (1 - math.exp(-t / 0.018)))
    return 0.55 * envelope * math.sin(phase)


mix(0.06, 0.15, pop, -0.22)
mix(0.22, 0.15, pop, 0.22)

# A quiet filtered-noise sweep under the letter arrivals.
filtered = 0.0

def swoosh(t, duration):
    global filtered
    filtered += 0.09 * (rng.uniform(-1, 1) - filtered)
    envelope = math.sin(math.pi * t / duration) ** 2
    return 0.22 * filtered * envelope


mix(0.40, 0.64, swoosh)


def chime(frequency):
    def render(t, duration):
        attack = 1 - math.exp(-t / 0.012)
        release = min(1, max(0, (duration - t) / 0.14))
        fundamental = math.sin(2 * math.pi * frequency * t) * math.exp(-t / 0.23)
        overtone = 0.15 * math.sin(2 * math.pi * frequency * 2 * t) * math.exp(-t / 0.09)
        return 0.3 * attack * release * (fundamental + overtone)
    return render


mix(1.08, 0.85, chime(523.251), -0.10)
mix(1.30, 0.90, chime(783.991), 0.10)
peak = max(abs(value) for frame in samples for value in frame)
gain = 0.60 / peak
pcm = b''.join(struct.pack('<hh', *(round(value * gain * 32767) for value in frame)) for frame in samples)
asset = Path(__file__).resolve().parents[1] / 'PeepTV/Assets.xcassets/PeepLaunchSound.dataset'
asset.mkdir(parents=True, exist_ok=True)
with wave.open(str(asset / 'peep-launch.wav'), 'wb') as output:
    output.setnchannels(2)
    output.setsampwidth(2)
    output.setframerate(RATE)
    output.writeframes(pcm)
(asset / 'Contents.json').write_text(json.dumps({
    'data': [{'filename': 'peep-launch.wav', 'idiom': 'universal'}],
    'info': {'author': 'xcode', 'version': 1}
}, indent=2) + '\n')
rms = math.sqrt(sum((value * gain) ** 2 for frame in samples for value in frame) / (len(samples) * 2))
print(f'Created {DURATION}s stereo WAV; peak -4.4 dBFS; RMS {20 * math.log10(rms):.1f} dBFS; {len(pcm)} PCM bytes')
