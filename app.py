from pathlib import Path
from threading import Lock
import gc

import requests
import torch
from flask import Flask, jsonify, render_template, request
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer


# ============================================================
# 1. APPLICATION SETTINGS
# ============================================================

app = Flask(__name__)
BASE_DIR = Path(__file__).resolve().parent
TRANSLATION_MODEL_PATH = (
    BASE_DIR / "models" / "dz-en-translation" / "final_model"
)

OLLAMA_URL = "http://localhost:11434/api/generate"
OLLAMA_MODEL = "qwen2.5:3b"

# Keep CPU usage modest on an 8 GB RAM computer.
torch.set_num_threads(2)

# Process one chat at a time to avoid loading both models concurrently.
CHAT_LOCK = Lock()


# ============================================================
# 2. LANGUAGE DETECTION
# ============================================================

def is_dzongkha(text: str) -> bool:
    """Detect Dzongkha/Tibetan-script input by Unicode block."""
    return any("\u0F00" <= char <= "\u0FFF" for char in text)


# ============================================================
# 3. LOCAL NLLB TRANSLATION
# ============================================================

def translate_text(text: str, source_language: str, target_language: str) -> str:
    """Translate with the downloaded local NLLB model, then free its memory."""
    if not text.strip():
        raise ValueError("There is no text to translate.")

    if not (TRANSLATION_MODEL_PATH / "config.json").is_file():
        raise FileNotFoundError(
            "Translation model not found at: "
            f"{TRANSLATION_MODEL_PATH}"
        )

    tokenizer = None
    model = None

    try:
        print(f"\n[TRANSLATION] Loading local model: {source_language} -> {target_language}")

        tokenizer = AutoTokenizer.from_pretrained(
            str(TRANSLATION_MODEL_PATH),
            local_files_only=True,
        )
        model = AutoModelForSeq2SeqLM.from_pretrained(
            str(TRANSLATION_MODEL_PATH),
            local_files_only=True,
        )
        model.to("cpu")
        model.eval()

        tokenizer.src_lang = source_language
        inputs = tokenizer(
            text,
            return_tensors="pt",
            truncation=True,
            max_length=256,
        )

        target_id = tokenizer.convert_tokens_to_ids(target_language)
        if target_id is None or target_id == tokenizer.unk_token_id:
            raise ValueError(f"Unsupported NLLB target language code: {target_language}")

        with torch.inference_mode():
            generated = model.generate(
                **inputs,
                forced_bos_token_id=target_id,
                max_new_tokens=160,
                num_beams=2,
            )

        translated = tokenizer.batch_decode(generated, skip_special_tokens=True)[0].strip()

        if not translated:
            raise RuntimeError("The translation model returned an empty result.")

        print("[TRANSLATION] Completed.")
        return translated

    finally:
        # Remove model references before the next AI stage loads.
        if model is not None:
            del model
        if tokenizer is not None:
            del tokenizer
        gc.collect()
        print("[TRANSLATION] Cleanup complete.")


# ============================================================
# 4. QWEN THROUGH LOCAL OLLAMA
# ============================================================

def ask_qwen_in_english(question: str) -> str:
    """Ask Qwen for an English answer; translation happens separately."""
    payload = {
        "model": OLLAMA_MODEL,
        "system": (
            "You are a helpful assistant. Answer the user's question accurately "
            "and clearly in English only. Keep the answer concise and suitable "
            "for translation. Do not use Dzongkha."
        ),
        "prompt": question,
        "stream": False,
        # Ask Ollama to unload Qwen after it has answered.
        "keep_alive": 0,
        "options": {
            "temperature": 0.2,
            "num_predict": 160,
            "num_ctx": 2048,
        },
    }

    print("\n[QWEN] Sending English question to Ollama...")
    response = requests.post(OLLAMA_URL, json=payload, timeout=(10, 300))
    response.raise_for_status()

    answer = response.json().get("response", "").strip()
    if not answer:
        raise RuntimeError("Qwen returned an empty answer.")

    print("[QWEN] English answer:", answer)
    return answer


# ============================================================
# 5. WEBSITE ROUTES
# ============================================================

@app.route("/")
def home():
    return render_template("index.html")


@app.route("/chat", methods=["POST"])
def chat():
    data = request.get_json(silent=True) or {}
    user_message = (data.get("message") or "").strip()

    if not user_message:
        return jsonify({"error": "Please enter a question."}), 400

    try:
        with CHAT_LOCK:
            print("\n" + "=" * 55)
            print("[CHAT] New request")

            # Stage 1: Convert a Dzongkha question into English if necessary.
            if is_dzongkha(user_message):
                print("[CHAT] Detected input: Dzongkha")
                english_question = translate_text(
                    user_message,
                    source_language="dzo_Tibt",
                    target_language="eng_Latn",
                )
            else:
                print("[CHAT] Detected input: English")
                english_question = user_message

            print("[CHAT] English question for Qwen:", english_question)

            # Stage 2: Ask Qwen in English.
            english_answer = ask_qwen_in_english(english_question)

            # Stage 3: Translate Qwen's answer into Dzongkha.
            dzongkha_answer = translate_text(
                english_answer,
                source_language="eng_Latn",
                target_language="dzo_Tibt",
            )

            print("[CHAT] Final Dzongkha answer:", dzongkha_answer)
            print("=" * 55)

            # Keep both keys because the existing frontend reads data.answer.
            return jsonify({
                "answer": dzongkha_answer,
                "response": dzongkha_answer,
            })

    except requests.exceptions.ConnectionError:
        app.logger.exception("Cannot connect to Ollama")
        return jsonify({
            "error": "Cannot connect to Ollama. Make sure Ollama is running."
        }), 503

    except requests.exceptions.Timeout:
        app.logger.exception("Ollama request timed out")
        return jsonify({
            "error": "The AI request timed out. Please try again."
        }), 504

    except Exception:
        app.logger.exception("Chat processing failed")
        return jsonify({
            "error": "The assistant encountered an error. Check the VS Code terminal for details."
        }), 500


# ============================================================
# 6. START FLASK
# ============================================================

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=False)
