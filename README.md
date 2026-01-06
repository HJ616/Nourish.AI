# EatOrNot AI: An AI-Native Food "Reasoning" Engine

**Winner of the 'Best AI-Native Experience' Track (Target)**

## 🛑 The Problem
Traditional food apps are **Data-First**: They dump nutritional tables and chemical names on you, forcing you to be a scientist in the grocery aisle.
**EatOrNot is Intent-First**: It asks *who* you are (Diabetic, Allergic, etc.) and makes the decision for you.

## 🧠 Why This is "AI-Native" (Not just a wrapper)
Unlike standard OCR apps that just read text, EatOrNot uses a reasoning engine to:
1.  **Infer Intent:** You don't filter for "Sugar < 5g". You toggle "Type 2 Diabetes," and the AI understands that *Rice Meal* (high GI) is dangerous, even if sugar content looks low.
2.  **Handle Uncertainty:** If a label says "Natural Flavors" (ambiguous), the AI flags it as an **Ambiguity Risk** rather than ignoring it.
3.  **Reduce Cognitive Load:** The **Audio Mode** tells you "Put it back" instantly, so you don't even have to read the screen.

## ✨ Key Features
* **Context-Aware Scanning:** Analysis changes based on user persona (e.g., "Muscle Gain" vs. "Lactose Intolerant").
* **Ambiguity Detection:** Visually flags vague ingredients that brands use to hide additives.
* **Interactive "Villains":** Click on any ingredient (e.g., "Maltodextrin") to learn *why* it's bad for *your* specific condition.
* **Audio Co-Pilot:** Text-to-Speech decision support for hands-free shopping.

## 🛠️ Tech Stack
* **Frontend:** React / Next.js
* **AI Engine:** Gemini 1.5 Flash (via API)
* **Voice:** Web Speech API (Native Browser TTS)

  
## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`
