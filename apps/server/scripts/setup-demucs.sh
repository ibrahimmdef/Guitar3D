#!/usr/bin/env bash
# Creates the Python environment used for stem separation (Demucs, CPU-only PyTorch) and
# transcription (Spotify Basic Pitch with the ONNX backend — no TensorFlow — plus librosa), and
# yt-dlp for adding songs from a link.
#   Linux/macOS: ~/.local/share/guitar3d/demucs-venv   (override with G3D_DEMUCS_VENV)
# The server finds it via G3D_DEMUCS_PYTHON or that default path.
# Needs `uv` (https://docs.astral.sh/uv/) — it downloads Python 3.12 itself if missing.
set -euo pipefail

VENV="${G3D_DEMUCS_VENV:-${XDG_DATA_HOME:-$HOME/.local/share}/guitar3d/demucs-venv}"
TORCH_INDEX="https://download.pytorch.org/whl/cpu"

if ! command -v uv >/dev/null 2>&1; then
  echo "uv bulunamadı. Kur: https://docs.astral.sh/uv/getting-started/installation/" >&2
  exit 1
fi
command -v ffmpeg >/dev/null 2>&1 || echo "Uyarı: ffmpeg bulunamadı; kök sesler sıkıştırılamaz." >&2

# Keep big downloads/builds out of a small tmpfs /tmp.
export TMPDIR="${TMPDIR_OVERRIDE:-$HOME/.cache/g3d-tmp}"
mkdir -p "$TMPDIR" "$(dirname "$VENV")"

echo "==> venv: $VENV (Python 3.12)"
uv venv --python 3.12 --allow-existing "$VENV"
PY="$VENV/bin/python"

echo "==> CPU-only torch + torchaudio"
uv pip install --python "$PY" --index-url "$TORCH_INDEX" torch torchaudio

echo "==> demucs"
# soundfile: lets torchaudio/demucs write wav without extra backends.
uv pip install --python "$PY" --extra-index-url "$TORCH_INDEX" --index-strategy unsafe-best-match demucs soundfile

echo "==> transcription: Basic Pitch (ONNX) + librosa"
# basic-pitch's own requirements pull TensorFlow on Linux; install it without deps and add only
# what the ONNX path needs. Pin the installed numpy/torch so Demucs keeps working.
PINS="$TMPDIR/g3d-venv-pins.txt"
uv pip freeze --python "$PY" | grep -i -E '^(numpy|torch|torchaudio)==' > "$PINS" || true
uv pip install --python "$PY" -c "$PINS" librosa onnxruntime pretty_midi resampy mir_eval
uv pip install --python "$PY" --no-deps basic-pitch
"$PY" -c "from basic_pitch import build_icassp_2022_model_path, FilenameSuffix; import onnxruntime, librosa; print('basic-pitch ok:', build_icassp_2022_model_path(FilenameSuffix.onnx))"

echo "==> yt-dlp (\"Add a song from a link\"; yt-dlp-ejs solves YouTube's JS challenges with Node)"
uv pip install --python "$PY" -U "yt-dlp[default]"
"$VENV/bin/yt-dlp" --version

echo "==> model htdemucs_6s (downloaded once into the torch hub cache)"
"$PY" - <<'PY'
from demucs.pretrained import get_model
get_model("htdemucs_6s")
print("ok")
PY

echo "Hazır. Sunucu bu Python'u kullanır: $PY"
