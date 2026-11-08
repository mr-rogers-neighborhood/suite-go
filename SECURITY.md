# Security

Suite Start is the hub. It discovers installed apps, launches one, and routes `suite://` links and
files. It holds no document and proxies no bytes, so the surface is the launcher itself:

- A manifest (`suite.app.json`) is data, and it may not name an executable. The only place an executable
  path lives is `installs.json`, which Start writes and re-validates on read; a tampered manifest cannot
  redirect a launch.
- A deep link arrives from the operating system and is untrusted. The parser refuses credentials, a
  port, a fragment, an encoded `..`, control characters and an app it does not know.
- The renderer is sandboxed (`contextIsolation`, `sandbox`, no `nodeIntegration`), served from
  `start://launcher` rather than `file://`, and every IPC channel checks the sender.
- The packaged binary sets the Electron fuses: no `runAsNode`, no `NODE_OPTIONS`, no CLI inspect
  arguments, ASAR integrity on, and app code loadable only from the ASAR.

## Reporting a vulnerability

Use GitHub's private security advisory for
[mr-rogers-neighborhood/suite-start](https://github.com/mr-rogers-neighborhood/suite-start/security/advisories/new).
Do not open a public issue for a vulnerability. Include the version, the platform, and the smallest
reproduction you can.
