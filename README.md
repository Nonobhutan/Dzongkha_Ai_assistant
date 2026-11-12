# Dzongkha AI Assistant 🇧🇹

A locally hosted, web-based AI chatbot that accepts questions in **English or Dzongkha** and returns answers in **Dzongkha**. It combines a locally running Qwen 2.5 language model through Ollama with a local NLLB sequence-to-sequence translation model.

> **Project status:** Development prototype. The repository contains the Flask application and web interface, but does **not** currently contain the translation model weights. The committed `requirements.txt` is also empty, so additional setup is necessary.

## Features

- **Dzongkha responses:** Chat responses are translated into Dzongkha before reaching the user.
- **English and Dzongkha input:** English questions go directly to the language model; input containing Tibetan-script characters is routed through Dzongkha-to-English translation first.
- **Local AI processing:** Uses Ollama with `qwen2.5:3b` and a locally stored NLLB translation model.
- **Browser-based interface:** Responsive chat layout with suggested prompts, loading indicator, new-chat control, and sidebar.
- **Conversation history:** Saves up to 20 recent conversations in the current browser's `localStorage`, with an option to clear them.
- **CPU-conscious execution:** Processes one chat request at a time and unloads the translation model between stages to reduce concurrent memory use.

## How it works

```text
User enters a question (English or Dzongkha)
                     |
                     v
              Flask /chat API
                     |
           Contains Tibetan script?
              /              \
            Yes               No
             |                 |
    NLLB Dzongkha -> English   |
              \               /
               English question
                     |
                     v
          Ollama: qwen2.5:3b
            (English answer)
                     |
                     v
       NLLB English -> Dzongkha
                     |
                     v
         Dzongkha response in UI
```

**Note:** Input detection uses the Unicode Tibetan-script range (`U+0F00`–`U+0FFF`), not a separate language-identification model. This means other text using the same script might be treated as Dzongkha. Output quality depends on the local translation model and the underlying language model; a Dzongkha response is not guaranteed to be linguistically perfect.

## Tech stack

| Component | Technology | Purpose |
| --- | --- | --- |
| Backend | Python, Flask | Serves the website and `/chat` endpoint |
| Language model | Qwen 2.5 3B via Ollama | Produces an intermediate English answer |
| Translation | Hugging Face Transformers / NLLB, PyTorch | Translates Dzongkha ↔ English |
| HTTP client | Requests | Connects Flask to the local Ollama API |
| Frontend | HTML, CSS, JavaScript | Interactive chat interface |
| Browser storage | `localStorage` | Remembers recent chats on the same browser |

## Repository structure

```text
Dzongkha_Ai_Assistant/
├── app.py                   # Flask server, translation, and Ollama integration
├── requirements.txt         # Currently empty; see dependencies below
├── static/
│   ├── script.js            # Chat UI behavior and browser chat history
│   └── style.css            # Interface styling
└── templates/
    └── index.html           # Main Flask HTML template
```

The application also expects the following **local directory**, which is **not included in the repository**:

```text
models/
└── dz-en-translation/
    └── final_model/
        ├── config.json
        ├── ... model weight files ...
        └── ... tokenizer files ...
```

## Getting started

### Prerequisites

- Python 3.10 or newer (recommended; not a tested compatibility guarantee)
- [Ollama](https://ollama.com/) installed on your machine
- Enough free RAM and disk space for `qwen2.5:3b` and the local translation model. Actual requirements depend on the translation model's size.
- A **compatible, locally available NLLB translation model** with tokenizer and weights that support `eng_Latn` and `dzo_Tibt`. The repository does not currently provide a model download URL or training/export instructions.

### 1. Clone the repository

```bash
git clone https://github.com/TsheringDorji573/Dzongkha_Ai_Assistant.git
cd Dzongkha_Ai_Assistant
```

### 2. Create and activate a virtual environment

**Windows (PowerShell):**

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

**macOS / Linux:**

```bash
python3 -m venv .venv
source .venv/bin/activate
```

### 3. Install Python dependencies

Because the current `requirements.txt` is empty, install the packages imported by `app.py` directly:

```bash
python -m pip install flask requests torch transformers sentencepiece
```

> `sentencepiece` is commonly required by NLLB tokenizers. Depending on your platform and model files, additional tokenizer dependencies may be required. For a reproducible installation, populate and pin `requirements.txt` after verifying the environment.

### 4. Install and prepare Ollama

Pull the model specified in `app.py`:

```bash
ollama pull qwen2.5:3b
```

Make sure the Ollama service is running. If it is not already started by your Ollama installation, run:

```bash
ollama serve
```

The Flask backend expects the Ollama generation API at `http://localhost:11434/api/generate`.

### 5. Add your local translation model

Place the compatible NLLB model files in:

```text
models/dz-en-translation/final_model/
```

The directory must contain `config.json`, the model weights, and the tokenizer files that Hugging Face `AutoTokenizer.from_pretrained()` and `AutoModelForSeq2SeqLM.from_pretrained()` need. The application loads these files using `local_files_only=True`, so it will **not** download a model automatically.

**Important:** Do not substitute a random NLLB checkpoint without verifying that it supports the exact language codes `eng_Latn` and `dzo_Tibt`. The app explicitly checks the output language token; an unsupported language will cause a request error.

### 6. Start the Flask application

```bash
python app.py
```

Open **http://127.0.0.1:5000** in your browser.

## Using the chatbot

1. Enter a question in English or Dzongkha, or select a suggested question.
2. Press **Enter** to send; use **Shift + Enter** for a new line.
3. Wait while the local model generates an English answer and the translator converts it into Dzongkha.
4. Use **New chat** to begin another conversation, or select an earlier chat in the sidebar.
5. Use **Clear chat history** to remove saved conversations from this browser.

### Example prompts

- `What is artificial intelligence?`
- `Explain machine learning in simple terms.`
- `Tell me about Bhutan's Gross National Happiness.`

The assistant is designed to return Dzongkha text for these prompts. Exact generated answers vary by model and should be checked for accuracy and natural Dzongkha usage.

## API

### `POST /chat`

Request body:

```json
{
  "message": "What is artificial intelligence?"
}
```

Successful response structure:

```json
{
  "answer": "<Dzongkha translation of the answer>",
  "response": "<Dzongkha translation of the answer>"
}
```

The `answer` and `response` fields contain the same generated Dzongkha text. The frontend reads `answer`.

Possible errors include:

| HTTP status | Meaning |
| --- | --- |
| `400` | The submitted message is empty |
| `503` | Flask cannot connect to Ollama |
| `504` | The Ollama request timed out |
| `500` | Another error occurred during chat processing (for example, missing model files) |

## Troubleshooting

**`Translation model not found`**  
Confirm that `models/dz-en-translation/final_model/config.json` exists and that the model weights and tokenizer files are in the same directory.

**`Cannot connect to Ollama`**  
Start Ollama and confirm it is accessible on `localhost:11434`. Check that `qwen2.5:3b` has been downloaded with `ollama list`.

**`Unsupported NLLB target language code`**  
Check that your tokenizer recognizes both `dzo_Tibt` and `eng_Latn`. The translation model must support the language directions used in `app.py`.

**Responses are slow**  
The application executes translation and text generation sequentially on local hardware. It also loads and releases the translation model for each translation step to help manage memory. Performance depends on your CPU, RAM, and local model size.

**Chat history disappears in another browser**  
History is stored in the browser's `localStorage`, not a server-side database. It is local to the browser/profile and may be cleared with browser data.

## Current limitations

- Translation model weights and model provenance are not provided in this repository.
- `requirements.txt` is empty, and dependencies have not been pinned.
- Input language detection is based on script characters rather than verified Dzongkha-only detection.
- Answer quality and language accuracy have not been independently benchmarked in this repository.
- Requests run one at a time under a process-local lock; this implementation is intended for local use rather than production-scale deployment.
- Chat history is browser-local, with no cross-device synchronization or user accounts.

## Future improvements

- Document and distribute a properly licensed Dzongkha translation model, or provide reproducible model-training instructions.
- Pin and test the Python dependency versions.
- Evaluate responses with native Dzongkha speakers and maintain a Dzongkha-specific test set.
- Improve language identification and model error reporting.
- Add automated tests and deployment guidance.

