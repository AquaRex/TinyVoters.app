# Tiny Agents hub

One background app on the computer that runs Claude Code. It:

- receives Claude Code hook events from this computer (and others that can reach it),
- keeps the office: sessions, chat history, stats, the day replay, saved people and names, away-mode approvals
  (saved in `~/.tinyagents/office.json`),
- pushes live updates to every open office page,
- runs the NPC minds: the fine-tuned model in its own Ollama instance on port 11435.

The office page talks to it at `http://127.0.0.1:7777` (open the page once with `?hub=<url>` to use another address).

## Setup

1. Node.js 22 or newer, and [Ollama](https://ollama.com) installed.
2. Model: register the converted model with Ollama once (see below).
3. `npm run hub` (in this folder's project root) to run it in a terminal, or `npm run hub:autostart` to start it hidden
   whenever you sign in to Windows (`-- --remove` undoes that; output goes to `~/.tinyagents/hub.log`).
4. Open the office, Connect → **Create my office** (the first device), then **Add a computer** to install the hooks.

## Model

The minds are `tinyagent-v7b`: the fine-tuned Qwen3.5-0.8B (training workspace `G:\LLM\Custom\TinyAgent`; v6 added
the shared state: thoughts on the mind, plans; v7b adds a reviewed round of conversation replies), converted to GGUF with llama.cpp's converter. The trained weights
carry no MTP layer, so convert with `--no-mtp`, then register it with the hub's Ollama (port 11435, so run it while
the hub is up):

```
python convert_hf_to_gguf.py runs/v7b --no-mtp --outtype q8_0 --outfile ollama/tinyagent-v7b-q8_0.gguf
set OLLAMA_HOST=127.0.0.1:11435
ollama create tinyagent-v7b -f ollama/Modelfile.v7b
```

The hub sends the exact training prompt (ChatML, no thinking block) in raw mode, so the Modelfile's template is
never used. About 1.2 GB of GPU memory and under 1 GB of RAM while loaded; it unloads after 3 idle minutes.
llama.cpp's prompt cache is switched off (`LLAMA_ARG_CACHE_RAM=0`): left on, it grows to 8 GB of RAM.

## Game mode

On NVIDIA cards the hub checks the GPU every 3 s while it isn't answering. When something else keeps it over 70%
busy for about 12 s (a game), the minds pause and the model unloads; staff use their built-in lines. They resume
after about 30 s under 35%.
