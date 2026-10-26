# Tiny Agents hub

One background app on the computer that runs Claude Code. It:

- receives Claude Code hook events from this computer (and others that can reach it),
- keeps the office: sessions, chat history, stats, the day replay, saved people and names, away-mode approvals
  (saved in `~/.tinyagents/office.json`),
- pushes live updates to every open office page,
- runs the NPC minds: the fine-tuned model in its own Ollama instance on port 11435.

The office page talks to it at `http://127.0.0.1:7777` on this computer, and through the office code from anywhere else (see below).

## Setup

1. Node.js 22 or newer, and [Ollama](https://ollama.com) installed.
2. Model: register the converted model with Ollama once (see below).
3. `npm run hub` (in this folder's project root) to run it in a terminal, or `npm run hub:autostart` to start it hidden
   whenever you sign in to Windows (`-- --remove` undoes that; output goes to `~/.tinyagents/hub.log`).
4. Connect this computer's Claude Code: `npm run install-hooks -- <computer key>` (the key is `ingestKey` in
   `~/.tinyagents/office.json`). Open the office here; it connects on its own.

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

## Reaching the hub from anywhere

Nothing to set up: no router settings, nothing to install. On any other device open Tiny Agents → **Connect** and
enter the **office code** shown under Connect on this computer (the hub also prints it when it starts). The hub and
the page both connect out to Supabase Realtime and meet on a channel named after the code (`hub/link.mjs`,
`src/cloud/link.ts`); nothing is stored there. The page then asks for a direct WebRTC connection, and once it's open
everything goes straight between them. Where a network blocks direct connections, it all passes through the channel
instead (Realtime's free plan: 2 million messages a month; the hub only sends while a device elsewhere is watching).

The code is the key: anyone with it sees the office. **New code** under Connect disconnects every other device.
