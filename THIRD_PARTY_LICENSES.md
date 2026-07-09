# Third-Party Notices & Licenses — Doe (Desktop)

Doe bundles and/or downloads third-party software and model weights. Each
component remains under its own license; the notices below are provided in
fulfilment of those licenses. Nothing here grants rights beyond the respective
upstream licenses.

Last reviewed: 2026-07.

---

## AI model

### Google Gemma 4
- Repositories: `google/gemma-4-E2B-it-qat-q4_0-gguf`,
  `google/gemma-4-E4B-it-qat-q4_0-gguf`, `google/gemma-4-12b-it-qat-q4_0-gguf`,
  `google/gemma-4-26b-a4b-it-qat-q4_0-gguf` (downloaded at runtime from
  Hugging Face; not redistributed inside this app).
- License: **Apache License 2.0**.
- Attribution: *Gemma is provided by Google LLC. Gemma 4 model weights are
  licensed under the Apache License, Version 2.0.*
- Use of the model is additionally subject to applicable law and Google's
  published usage guidance. See <https://ai.google.dev/gemma>.

Because the weights are Apache-2.0, this project is free to run and ship them in
a commercial product; the obligation is to preserve this attribution and the
Apache-2.0 license text (reproduced at the bottom of this file).

---

## Inference & model download

| Component | Purpose | License |
|---|---|---|
| llama.cpp | GGUF inference engine | MIT |
| llama-cpp-python | Python bindings for llama.cpp | MIT |
| huggingface-hub | Model download client | Apache-2.0 |
| NumPy | Numerical support (via llama-cpp) | BSD-3-Clause |

## Application backend (Python)

| Component | Purpose | License |
|---|---|---|
| FastAPI | HTTP API framework | MIT |
| Starlette | ASGI toolkit (via FastAPI) | BSD-3-Clause |
| Uvicorn | ASGI server | BSD-3-Clause |
| Pydantic | Data validation | MIT |
| SQLAlchemy | ORM / SQL toolkit | MIT |
| Alembic | Database migrations | MIT |
| aiosqlite | Async SQLite driver | MIT |
| greenlet | Lightweight coroutines | MIT |
| pywebview | Native window / webview host | BSD-3-Clause |
| watchdog | Filesystem watching | Apache-2.0 |
| websockets | WebSocket transport | BSD-3-Clause |
| python-multipart | Multipart form parsing | Apache-2.0 |
| pyperclip | Clipboard access | BSD-3-Clause |
| cryptography | Encryption primitives | Apache-2.0 OR BSD-3-Clause |
| PyInstaller | Build/packaging tool (build-time only) | GPL-2.0-with-exception* |

\* PyInstaller is used only to build the app; its runtime bootloader carries an
exception that permits shipping proprietary/closed applications. It does not
impose GPL obligations on Doe's own code.

## Frontend (web assets)

| Component | Purpose | License |
|---|---|---|
| marked | Markdown rendering | MIT |
| Prism.js | Syntax highlighting | MIT |
| CodeMirror | Code editor | MIT |
| KaTeX | Math rendering (vendored locally in `frontend/`, incl. `fonts/`) | MIT |

---

## License texts

Full license texts of the components above are available from their respective
projects. For convenience, the two licenses that require reproduction of their
text are included here.

### Apache License 2.0 (applies to Gemma 4, huggingface-hub, watchdog,
python-multipart, cryptography)

```
                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
```

The complete Apache 2.0 text is available at
<http://www.apache.org/licenses/LICENSE-2.0>.

### MIT License (applies to llama.cpp, llama-cpp-python, FastAPI, Pydantic,
SQLAlchemy, Alembic, aiosqlite, greenlet, marked, Prism.js, CodeMirror, KaTeX)

```
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

BSD-3-Clause components (Uvicorn, Starlette, pywebview, websockets, pyperclip,
NumPy) are distributed under the standard 3-clause BSD license; see each
project for its copyright line and full text.
