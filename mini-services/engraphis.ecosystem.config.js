module.exports = {
  apps: [{
    name: "engraphis",
    script: "/usr/local/lib/hermes-agent/venv/bin/engraphis-dashboard",
    interpreter: "none",
    args: "--host 127.0.0.1 --port 8700 --no-open",
    env: {
      // DB stays at the Engraphis default: /root/.local/share/engraphis/engraphis.db
      ENGRAPHIS_CORS_ORIGINS: "https://m.rizen.space,http://127.0.0.1:8700,http://localhost:8700",
      // Internal LLM (OpenAI-compatible) — powers dashboard grounded Q&A,
      // proactive-context summaries, and (optionally) LLM entity extraction.
      // Uses the existing Neuralwatt endpoint + key; no new vendor.
      ENGRAPHIS_LLM_PROVIDER: "openai",
      ENGRAPHIS_LLM_BASE_URL: "https://api.neuralwatt.com/v1",
      ENGRAPHIS_LLM_MODEL: "qwen3.6-35b-fast",
      ENGRAPHIS_LLM_API_KEY: (() => {
        try {
          const fs = require('fs');
          for (const line of fs.readFileSync('/root/.hermes/.env', 'utf8').split('\n')) {
            if (line.startsWith('NEURALWATT_API_KEY=')) {
              return line.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
            }
          }
        } catch (e) {}
        return '';
      })(),
      // LLM-powered memory intake: distill + extract structured entities/relations
      // into the knowledge graph on every write. "llm_structured" = schema-validated.
      ENGRAPHIS_EXTRACTOR: "llm_structured",
      ENGRAPHIS_GRAPH_EXTRACTOR: "llm_structured"
    }
  }]
};
