# Tiny Agents hub

One background app on the computer that runs Claude Code. It:

- receives Claude Code hook events from this computer (and others that can reach it),
- keeps the office: sessions, chat history, stats, the day replay, saved people and names, away-mode approvals
  (saved in `~/.tinyagents/office.json`),
- pushes live updates to every open office page,
- runs the NPC minds: the fine-tuned model in its own Ollama instance on port 11435.

The office page talks to it at `http://127.0.0.1:7777` on this computer, and at `https://<home IP>:4888` from anywhere else (see below).

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

## Reaching the hub from anywhere

Other devices reach the hub at `https://<this home's IP>:4888`: enter that address (e.g. `89.11.166.148:4888`) with
the pairing code under Connect → I have a code. Connect → Add a device shows both. The hub starts Caddy
(`hub/front.mjs`), which answers on 4888 with a Let's Encrypt certificate for the IP and passes everything to the hub
on 127.0.0.1:7777 (browsers only let the https office page reach an https address). Once, on the hub's computer:

1. `winget install CaddyServer.Caddy`, then restart the hub.
2. Router, to this computer (here `192.168.68.60`; reserve that address in the router): forward **TCP 4888** to its
   4888 (the hub), and **TCP 80** to its 4880 (Let's Encrypt checks on port 80 when it issues the certificate).
3. Windows firewall, in an admin terminal:
   `netsh advfirewall firewall add rule name="Tiny Agents hub (Caddy)" dir=in action=allow protocol=TCP localport=4888,4880`

If the home IP changes, the hub gets a certificate for the new one; enter the new address on each device. Caddy logs to
`~/.tinyagents/caddy.log`. Every request still needs a device token or the computer key, and an address that fails to
authenticate 20 times is shut out for 15 minutes.

## Game mode

On NVIDIA cards the hub checks the GPU every 3 s while it isn't answering. When something else keeps it over 70%
busy for about 12 s (a game), the minds pause and the model unloads; staff use their built-in lines. They resume
after about 30 s under 35%.
